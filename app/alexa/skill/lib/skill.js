'use strict';

// Alexa スキルのハンドラー。Lambda (index.js) と自サーバー (server.js) の両方がこれを使う (README の D6)

const Alexa = require('ask-sdk-core');
const { errorKind } = require('./api');
const { resolveItem } = require('./match');
const { escapeSsml, joinNames } = require('./speech');

/** 一度に払い出せる個数の上限 (API の上限と同じ) */
const MAX_QUANTITY = 99;
/** この個数以上は、払い出す前に確かめる (聞き間違いで大きく減らさないため) */
const CONFIRM_QUANTITY = 10;
/** 動的エンティティとして Alexa に渡す品名の上限 (Alexa の制限) */
const MAX_DYNAMIC_ENTITIES = 100;
const DYNAMIC_AUTHORITY = 'amzn1.er-authority.echo-sdk.dynamic';

const ASK_NEXT = 'ほかに払い出すものはありますか？';
const ASK_ITEM = '払い出す品名を言ってください。';

// ── 共通の部品 ──────────────────────────────────────────────

const isIntent = (h, ...names) =>
  Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest' &&
  names.includes(Alexa.getIntentName(h.requestEnvelope));

const sessionOf = (h) => h.attributesManager.getSessionAttributes();

/** 話して、返事を待つ (セッションを続ける) */
const ask = (h, speech, reprompt = ASK_NEXT) => h.responseBuilder.speak(speech).reprompt(reprompt);

/** 話して、閉じる */
const finish = (h, speech) => h.responseBuilder.speak(speech).withShouldEndSession(true).getResponse();

/** スロットが動的エンティティ (登録済みの品目) に解決できたときの品目 ID */
function resolvedItemId(h, slotName) {
  const slot = Alexa.getSlot(h.requestEnvelope, slotName);
  for (const authority of slot?.resolutions?.resolutionsPerAuthority ?? []) {
    if (
      String(authority.authority ?? '').startsWith(DYNAMIC_AUTHORITY) &&
      authority.status?.code === 'ER_SUCCESS_MATCH'
    ) {
      return authority.values?.[0]?.value?.id ?? null;
    }
  }
  return null;
}

/** 個数のスロット。言われなければ 1 */
function readQuantity(h) {
  const raw = Alexa.getSlotValue(h.requestEnvelope, 'Quantity');
  if (raw == null || raw === '' || raw === '?') {
    return 1;
  }
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/**
 * 登録済みの品名を、このセッションの品名の候補として Alexa に渡す (聞き取りの精度を上げる)。
 * セッションを続ける応答にだけ付ける
 */
function addItemEntities(h, builder, items) {
  const session = sessionOf(h);
  if (session.entitiesLoaded || !Array.isArray(items) || items.length === 0) {
    return builder;
  }
  session.entitiesLoaded = true;
  return builder.addDirective({
    type: 'Dialog.UpdateDynamicEntities',
    updateBehavior: 'REPLACE',
    types: [
      {
        name: 'ITEM_NAME',
        values: items.slice(0, MAX_DYNAMIC_ENTITIES).map((item) => ({
          id: String(item.id),
          name: { value: String(item.name) },
        })),
      },
    ],
  });
}

/** 払い出しのインテントの中で、品名だけを聞き直す (言われた個数は残す) */
function elicitItem(h, speech, items) {
  const intent = h.requestEnvelope.request.intent;
  const updatedIntent = {
    name: intent.name,
    confirmationStatus: 'NONE',
    slots: {
      ...intent.slots,
      ItemName: { name: 'ItemName', confirmationStatus: 'NONE' },
    },
  };
  const builder = ask(h, speech, ASK_ITEM).addElicitSlotDirective('ItemName', updatedIntent);
  return addItemEntities(h, builder, items).getResponse();
}

/** API に届かないときの応答 */
function unavailable(h, kind) {
  if (kind === 'auth') {
    return finish(h, 'ストクルの設定に問題があり、在庫を確かめられません。管理者に連絡してください。');
  }
  return finish(h, '在庫システムに接続できませんでした。しばらくしてから、もう一度お試しください。');
}

function shortageSpeech(name, stock, quantity) {
  return stock > 0
    ? `${name}は残り${stock}個のため、${quantity}個は払い出せません。`
    : `${name}の在庫は0個のため、払い出せません。`;
}

// ── ハンドラー ──────────────────────────────────────────────

function createHandlers(api) {
  async function loadItems() {
    try {
      return { items: await api.listItems() };
    } catch (err) {
      console.error('listItems failed:', err.response?.status ?? err.message);
      return { error: errorKind(err) };
    }
  }

  /** 払い出す。item.stock が分かっていれば、足りないときは API を呼ばずに答える */
  async function performDecrement(h, item, quantity, items) {
    const session = sessionOf(h);
    delete session.pending;
    const name = escapeSsml(item.name);

    if (typeof item.stock === 'number' && item.stock < quantity) {
      return addItemEntities(h, ask(h, shortageSpeech(name, item.stock, quantity) + ASK_NEXT), items).getResponse();
    }

    let result;
    try {
      result = await api.decrement(item.id, quantity);
    } catch (err) {
      const kind = errorKind(err);
      console.error('decrement failed:', err.response?.status ?? err.message);
      if (kind === 'conflict') {
        return ask(h, `${name}の在庫が足りないため、払い出せませんでした。${ASK_NEXT}`).getResponse();
      }
      if (kind === 'notFound') {
        return ask(h, `${name}は見つかりませんでした。${ASK_NEXT}`).getResponse();
      }
      return unavailable(h, kind);
    }

    session.last = { itemId: item.id, name: item.name, quantity };
    const rest = result.stock === 0 ? '在庫がなくなりました。' : `残り${result.stock}個です。`;
    return addItemEntities(
      h,
      ask(h, `${name}を${quantity}個払い出しました。${rest}${ASK_NEXT}`),
      items
    ).getResponse();
  }

  /** 払い出す前に「はい / いいえ」で確かめる */
  function confirmDecrement(h, item, quantity, items) {
    sessionOf(h).pending = { itemId: item.id, name: item.name, quantity };
    const speech = `${escapeSsml(item.name)}を${quantity}個払い出しますか？`;
    return addItemEntities(h, ask(h, speech, speech), items).getResponse();
  }

  const LaunchRequestHandler = {
    canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'LaunchRequest',
    async handle(h) {
      const { items, error } = await loadItems();
      if (error) {
        return unavailable(h, error);
      }
      return addItemEntities(
        h,
        ask(
          h,
          'ストクルを開きました。何を払い出しますか？',
          '品名を言ってください。「マウスを2個」のように、個数も言えます。'
        ),
        items
      ).getResponse();
    },
  };

  const DecrementStockIntentHandler = {
    canHandle: (h) => isIntent(h, 'DecrementStockIntent'),
    async handle(h) {
      delete sessionOf(h).pending;

      const spoken = Alexa.getSlotValue(h.requestEnvelope, 'ItemName');
      if (!spoken) {
        return elicitItem(h, `何を払い出しますか？${ASK_ITEM}`, null);
      }
      const quantity = readQuantity(h);
      if (quantity === null) {
        return ask(h, '個数が聞き取れませんでした。もう一度、品名と個数を言ってください。', ASK_ITEM).getResponse();
      }
      if (quantity > MAX_QUANTITY) {
        return ask(h, `一度に払い出せるのは${MAX_QUANTITY}個までです。${ASK_NEXT}`).getResponse();
      }

      const { items, error } = await loadItems();
      if (error) {
        return unavailable(h, error);
      }

      const match = resolveItem(items, spoken, resolvedItemId(h, 'ItemName'));
      const said = escapeSsml(spoken);
      switch (match.kind) {
        case 'exact':
          return quantity >= CONFIRM_QUANTITY
            ? confirmDecrement(h, match.item, quantity, items)
            : performDecrement(h, match.item, quantity, items);
        case 'partial':
          // 「マウス」で「マウスウォッシュ」が見つかったときなど。別の品目を減らさないよう確かめる
          return confirmDecrement(h, match.item, quantity, items);
        case 'ambiguous':
          return elicitItem(h, `${joinNames(match.items)}のどれですか？`, items);
        case 'duplicate':
          return addItemEntities(
            h,
            ask(h, `${said}という品目が複数あるため、音声では選べません。Web かアプリで払い出してください。${ASK_NEXT}`),
            items
          ).getResponse();
        case 'tooMany':
          return elicitItem(h, `${said}に当てはまる品目がたくさんあります。品名をもう少し詳しく言ってください。`, items);
        default:
          return elicitItem(h, `${said}は見つかりませんでした。品名をもう一度言ってください。`, items);
      }
    },
  };

  const CheckStockIntentHandler = {
    canHandle: (h) => isIntent(h, 'CheckStockIntent'),
    async handle(h) {
      delete sessionOf(h).pending;
      const next = 'ほかに何かありますか？';

      const spoken = Alexa.getSlotValue(h.requestEnvelope, 'ItemName');
      if (!spoken) {
        return ask(h, 'どの品目の在庫を確かめますか？', '品名を言ってください。').getResponse();
      }

      const { items, error } = await loadItems();
      if (error) {
        return unavailable(h, error);
      }

      const match = resolveItem(items, spoken, resolvedItemId(h, 'ItemName'));
      let speech;
      switch (match.kind) {
        case 'exact':
        case 'partial':
          speech = `${escapeSsml(match.item.name)}の在庫は${match.item.stock}個です。`;
          break;
        case 'ambiguous':
        case 'duplicate':
          speech = match.items.map((item) => `${escapeSsml(item.name)}は${item.stock}個`).join('、') + 'です。';
          break;
        case 'tooMany':
          speech = `${escapeSsml(spoken)}に当てはまる品目がたくさんあります。品名をもう少し詳しく言ってください。`;
          break;
        default:
          speech = `${escapeSsml(spoken)}は見つかりませんでした。`;
      }
      return addItemEntities(h, ask(h, speech + next, next), items).getResponse();
    },
  };

  const UndoIntentHandler = {
    canHandle: (h) => isIntent(h, 'UndoIntent'),
    async handle(h) {
      const session = sessionOf(h);
      delete session.pending;
      const last = session.last;
      if (!last) {
        return ask(h, `取り消せる払い出しがありません。取り消せるのは、ストクルを開いているあいだの、直前の払い出しだけです。${ASK_NEXT}`).getResponse();
      }

      let result;
      try {
        result = await api.increment(last.itemId, last.quantity);
      } catch (err) {
        console.error('increment failed:', err.response?.status ?? err.message);
        const kind = errorKind(err);
        if (kind === 'notFound') {
          delete session.last;
          return ask(h, `${escapeSsml(last.name)}が見つからないため、取り消せませんでした。${ASK_NEXT}`).getResponse();
        }
        return unavailable(h, kind);
      }

      delete session.last;
      return ask(
        h,
        `${escapeSsml(last.name)}の払い出し${last.quantity}個を取り消しました。残り${result.stock}個です。${ASK_NEXT}`
      ).getResponse();
    },
  };

  const YesIntentHandler = {
    canHandle: (h) => isIntent(h, 'AMAZON.YesIntent'),
    async handle(h) {
      const pending = sessionOf(h).pending;
      if (!pending) {
        return ask(h, `何を払い出しますか？${ASK_ITEM}`, ASK_ITEM).getResponse();
      }
      return performDecrement(h, { id: pending.itemId, name: pending.name }, pending.quantity, null);
    },
  };

  const NoIntentHandler = {
    canHandle: (h) => isIntent(h, 'AMAZON.NoIntent'),
    handle(h) {
      const session = sessionOf(h);
      if (session.pending) {
        delete session.pending;
        return ask(h, `払い出しをやめました。${ASK_NEXT}`).getResponse();
      }
      return finish(h, 'ストクルを閉じます。');
    },
  };

  const HelpIntentHandler = {
    canHandle: (h) => isIntent(h, 'AMAZON.HelpIntent'),
    handle(h) {
      delete sessionOf(h).pending;
      return ask(
        h,
        '品名を言うと、在庫を払い出します。「マウスを3個」のように、個数も言えます。' +
          '「マウスの在庫は？」と聞くと残りの数を、「取り消して」と言うと直前の払い出しを戻します。何をしますか？',
        ASK_ITEM
      ).getResponse();
    },
  };

  const FallbackIntentHandler = {
    canHandle: (h) => isIntent(h, 'AMAZON.FallbackIntent'),
    handle(h) {
      return ask(h, `すみません、聞き取れませんでした。${ASK_ITEM}`, ASK_ITEM).getResponse();
    },
  };

  const CancelAndStopIntentHandler = {
    canHandle: (h) => isIntent(h, 'AMAZON.CancelIntent', 'AMAZON.StopIntent', 'AMAZON.NavigateHomeIntent'),
    handle: (h) => finish(h, 'ストクルを閉じます。'),
  };

  const SessionEndedRequestHandler = {
    canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'SessionEndedRequest',
    handle(h) {
      const { reason, error } = h.requestEnvelope.request;
      if (reason === 'ERROR') {
        console.error('SessionEnded with error:', JSON.stringify(error));
      }
      return h.responseBuilder.getResponse();
    },
  };

  const ErrorHandler = {
    canHandle: () => true,
    handle(h, error) {
      console.error('Unhandled error:', error.message);
      return finish(h, 'エラーが発生しました。しばらくしてから、もう一度お試しください。');
    },
  };

  return {
    requestHandlers: [
      LaunchRequestHandler,
      DecrementStockIntentHandler,
      CheckStockIntentHandler,
      UndoIntentHandler,
      YesIntentHandler,
      NoIntentHandler,
      HelpIntentHandler,
      FallbackIntentHandler,
      CancelAndStopIntentHandler,
      SessionEndedRequestHandler,
    ],
    errorHandler: ErrorHandler,
  };
}

/**
 * スキルを組み立てる。skillId は必須 (このスキル以外からの要求を断る。README の D11)
 * @returns {import('ask-sdk-core').CustomSkillBuilder}
 */
function buildSkill({ api, skillId }) {
  if (!skillId) {
    throw new Error('skillId is required');
  }
  const { requestHandlers, errorHandler } = createHandlers(api);
  return Alexa.SkillBuilders.custom()
    .withSkillId(skillId)
    .addRequestHandlers(...requestHandlers)
    .addErrorHandlers(errorHandler);
}

module.exports = { buildSkill, MAX_QUANTITY, CONFIRM_QUANTITY };

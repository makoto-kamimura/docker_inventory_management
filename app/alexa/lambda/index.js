const Alexa = require('ask-sdk-core');
const axios = require('axios');

const apiClient = axios.create({
  baseURL: process.env.API_BASE_URL,
  headers: { Authorization: `Bearer ${process.env.API_TOKEN}` },
  timeout: 8000,
});

async function getItems() {
  const { data } = await apiClient.get('/api/items');
  return data;
}

async function decrementItem(itemId) {
  const { data } = await apiClient.put(`/api/items/${itemId}/decrement`);
  return data;
}

function findItemByName(items, spokenName) {
  const normalize = (s) =>
    s
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[ぁ-ん]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60)); // ひら→カタ

  const norm = normalize(spokenName);

  return (
    items.find((item) => normalize(item.name) === norm) ||
    items.find(
      (item) =>
        normalize(item.name).includes(norm) || norm.includes(normalize(item.name))
    )
  );
}

// ── ハンドラー ─────────────────────────────────────────────

const LaunchRequestHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'LaunchRequest';
  },
  handle(h) {
    return h.responseBuilder
      .speak('在庫管理を開きました。何を払い出しますか？')
      .reprompt('何の在庫を減らしますか？')
      .getResponse();
  },
};

const DecrementStockIntentHandler = {
  canHandle(h) {
    return (
      Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(h.requestEnvelope) === 'DecrementStockIntent'
    );
  },
  async handle(h) {
    const itemName = Alexa.getSlotValue(h.requestEnvelope, 'ItemName');

    if (!itemName) {
      return h.responseBuilder
        .speak('品名が聞き取れませんでした。もう一度おっしゃってください。')
        .reprompt('何を払い出しますか？')
        .getResponse();
    }

    let items;
    try {
      items = await getItems();
    } catch {
      return h.responseBuilder
        .speak('在庫システムに接続できませんでした。しばらくしてから再度お試しください。')
        .getResponse();
    }

    const item = findItemByName(items, itemName);

    if (!item) {
      return h.responseBuilder
        .speak(`${itemName}は見つかりませんでした。`)
        .getResponse();
    }

    if (item.stock <= 0) {
      return h.responseBuilder
        .speak(`${item.name}の在庫は0個です。払い出しできません。`)
        .getResponse();
    }

    let result;
    try {
      result = await decrementItem(item.id);
    } catch (err) {
      if (err.response?.status === 409) {
        return h.responseBuilder
          .speak(`${item.name}の在庫が不足しています。`)
          .getResponse();
      }
      return h.responseBuilder
        .speak('払い出し処理中にエラーが発生しました。')
        .getResponse();
    }

    const remaining = result.stock;
    const suffix =
      remaining === 0 ? '在庫が0になりました。' : `残り${remaining}個です。`;

    return h.responseBuilder
      .speak(`${item.name}を1個払い出しました。${suffix}`)
      .getResponse();
  },
};

const HelpIntentHandler = {
  canHandle(h) {
    return (
      Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(h.requestEnvelope) === 'AMAZON.HelpIntent'
    );
  },
  handle(h) {
    return h.responseBuilder
      .speak('在庫を払い出すには「○○を減らして」や「○○を払い出して」とおっしゃってください。')
      .reprompt('何を払い出しますか？')
      .getResponse();
  },
};

const CancelAndStopIntentHandler = {
  canHandle(h) {
    return (
      Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest' &&
      ['AMAZON.CancelIntent', 'AMAZON.StopIntent'].includes(
        Alexa.getIntentName(h.requestEnvelope)
      )
    );
  },
  handle(h) {
    return h.responseBuilder.speak('終了します。').getResponse();
  },
};

const ErrorHandler = {
  canHandle: () => true,
  handle(h, error) {
    console.error('Unhandled error:', error);
    return h.responseBuilder
      .speak('エラーが発生しました。しばらくしてから再度お試しください。')
      .getResponse();
  },
};

exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    DecrementStockIntentHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler
  )
  .addErrorHandlers(ErrorHandler)
  .lambda();

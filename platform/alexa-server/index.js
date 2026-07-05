const Alexa = require('ask-sdk-core');
const { ExpressAdapter } = require('ask-sdk-express-adapter');
const express = require('express');
const axios = require('axios');

const apiClient = axios.create({
  baseURL: process.env.API_BASE_URL,
  headers: { Authorization: `Bearer ${process.env.API_TOKEN}` },
  timeout: 8000,
});

async function getItems() {
  const { data } = await apiClient.get('/api/items');
  return Array.isArray(data) ? data : (data.data || []);
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
      .replace(/[ぁ-ん]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));

  const norm = normalize(spokenName);
  return (
    items.find((item) => normalize(item.name) === norm) ||
    items.find(
      (item) =>
        normalize(item.name).includes(norm) || norm.includes(normalize(item.name))
    )
  );
}

// ── ハンドラー ────────────────────────────────────────────────────────────────

const ELICIT_ITEM_INTENT = {
  name: 'DecrementStockIntent',
  confirmationStatus: 'NONE',
  slots: { ItemName: { name: 'ItemName', confirmationStatus: 'NONE' } },
};

const LaunchRequestHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'LaunchRequest';
  },
  handle(h) {
    return h.responseBuilder
      .speak('在庫管理を開きました。何を払い出しますか？')
      .reprompt('払い出す品名を教えてください。')
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
        .reprompt('払い出す品名を教えてください。')
        .addElicitSlotDirective('ItemName')
        .getResponse();
    }

    let items;
    try {
      items = await getItems();
    } catch (e) {
      console.error('getItems error:', e.message);
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
      console.error('decrementItem error:', err.response?.status, err.message);
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
      .speak(`${item.name}を1個払い出しました。${suffix}他に払い出すものはありますか？`)
      .reprompt('他に払い出すものはありますか？')
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
      .speak('品名を言うと在庫を1個払い出します。何を払い出しますか？')
      .reprompt('払い出す品名を教えてください。')
      .addElicitSlotDirective('ItemName', ELICIT_ITEM_INTENT)
      .getResponse();
  },
};

const NoIntentHandler = {
  canHandle(h) {
    return (
      Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(h.requestEnvelope) === 'AMAZON.NoIntent'
    );
  },
  handle(h) {
    return h.responseBuilder.speak('在庫管理を閉じます。').getResponse();
  },
};

const FallbackIntentHandler = {
  canHandle(h) {
    return (
      Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(h.requestEnvelope) === 'AMAZON.FallbackIntent'
    );
  },
  handle(h) {
    return h.responseBuilder
      .speak('すみません、お役に立てません。')
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
    return h.responseBuilder.speak('在庫管理を閉じます。').getResponse();
  },
};

const SessionEndedRequestHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'SessionEndedRequest';
  },
  handle(h) {
    console.log('SessionEnded reason:', h.requestEnvelope.request.reason);
    return h.responseBuilder.getResponse();
  },
};

const ErrorHandler = {
  canHandle: () => true,
  handle(h, error) {
    console.error('Unhandled error:', error.message);
    return h.responseBuilder
      .speak('エラーが発生しました。しばらくしてから再度お試しください。')
      .getResponse();
  },
};

// ── Express サーバー ──────────────────────────────────────────────────────────

const skill = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    DecrementStockIntentHandler,
    HelpIntentHandler,
    NoIntentHandler,
    FallbackIntentHandler,
    CancelAndStopIntentHandler,
    SessionEndedRequestHandler
  )
  .addErrorHandlers(ErrorHandler)
  .create();

const adapter = new ExpressAdapter(skill, true, true);

const app = express();
app.post('/alexa', adapter.getRequestHandlers());

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Alexa skill server running on port ${PORT}`);
  console.log(`API_BASE_URL: ${process.env.API_BASE_URL}`);
});

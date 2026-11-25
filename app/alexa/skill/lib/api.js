'use strict';

const axios = require('axios');

/**
 * 在庫の API を呼ぶクライアント。トークンは Alexa 用の、用途を絞ったもの
 * (php artisan inventory:alexa-token で発行。品目の参照と増減だけができる)
 */
function createApi({ baseURL, token, timeout = 8000 }) {
  const client = axios.create({
    baseURL,
    headers: { Authorization: `Bearer ${token ?? ''}` },
    timeout,
  });

  return {
    async listItems() {
      const { data } = await client.get('/api/items');
      return Array.isArray(data) ? data : data.data || [];
    },
    async decrement(itemId, quantity) {
      const { data } = await client.put(`/api/items/${encodeURIComponent(itemId)}/decrement`, { quantity });
      return data;
    },
    async increment(itemId, quantity) {
      const { data } = await client.put(`/api/items/${encodeURIComponent(itemId)}/increment`, { quantity });
      return data;
    },
  };
}

/** API のエラーを、話す内容を選ぶための種類に分ける */
function errorKind(err) {
  const status = err?.response?.status;
  if (status === 401 || status === 403) return 'auth';
  if (status === 409) return 'conflict';
  if (status === 404) return 'notFound';
  return 'unavailable';
}

module.exports = { createApi, errorKind };

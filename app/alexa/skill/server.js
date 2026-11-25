'use strict';

// 方式 B: 自サーバーの入口 (Express)。ハンドラーは lib/skill.js (Lambda の index.js と共通)

const express = require('express');
const { ExpressAdapter } = require('ask-sdk-express-adapter');
const { buildSkill } = require('./lib/skill');
const { createApi } = require('./lib/api');

// このスキルからの要求だけを受け付ける。未設定ならすべての要求を断る (README の D11)
const SKILL_ID = (process.env.ALEXA_SKILL_ID || '').trim();

const app = express();
app.disable('x-powered-by');

// コンテナのヘルスチェック用 (リバースプロキシは /alexa だけを通す)
app.get('/healthz', (req, res) => {
  res.json({ ok: true, configured: Boolean(SKILL_ID) });
});

if (SKILL_ID) {
  const skill = buildSkill({
    api: createApi({ baseURL: process.env.API_BASE_URL, token: process.env.API_TOKEN }),
    skillId: SKILL_ID,
  }).create();
  // 第 2・3 引数: Amazon の署名とタイムスタンプを確かめる。body-parser を前に置かないこと
  const adapter = new ExpressAdapter(skill, true, true);
  app.post('/alexa', adapter.getRequestHandlers());
} else {
  console.warn('ALEXA_SKILL_ID is not set: rejecting all Alexa requests');
  app.post('/alexa', (req, res) => {
    res.status(503).json({ message: 'Alexa skill ID is not configured.' });
  });
}

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Alexa skill server running on port ${PORT}`);
  console.log(`Skill ID verification: ${SKILL_ID ? 'enabled' : 'NOT CONFIGURED (all requests rejected)'}`);
});

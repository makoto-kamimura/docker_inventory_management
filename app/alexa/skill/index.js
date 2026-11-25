'use strict';

// 方式 A: AWS Lambda の入口。ハンドラーは lib/skill.js (自サーバーの server.js と共通)

const { buildSkill } = require('./lib/skill');
const { createApi } = require('./lib/api');

// このスキルからの要求だけを受け付ける。未設定ならすべての要求を断る (README の D11)
const SKILL_ID = (process.env.ALEXA_SKILL_ID || '').trim();

let skill = null;
if (SKILL_ID) {
  skill = buildSkill({
    api: createApi({ baseURL: process.env.API_BASE_URL, token: process.env.API_TOKEN }),
    skillId: SKILL_ID,
  }).create();
} else {
  console.error('ALEXA_SKILL_ID is not set: rejecting all Alexa requests');
}

// async の関数にする (コールバック形式のハンドラーは新しい Node.js のランタイムで使えない)
exports.handler = async (event, context) => {
  if (!skill) {
    throw new Error('ALEXA_SKILL_ID is not configured');
  }
  return skill.invoke(event, context);
};

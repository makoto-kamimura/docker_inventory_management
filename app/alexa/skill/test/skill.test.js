'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSkill } = require('../lib/skill');

const SKILL_ID = 'amzn1.ask.skill.test';

function httpError(status) {
  const err = new Error(`HTTP ${status}`);
  err.response = { status };
  return err;
}

function fakeApi(initial, { failWith } = {}) {
  const items = initial.map((i) => ({ ...i }));
  const calls = [];
  return {
    calls,
    items,
    async listItems() {
      calls.push(['list']);
      if (failWith) throw httpError(failWith);
      return items.map((i) => ({ ...i }));
    },
    async decrement(id, quantity) {
      calls.push(['decrement', id, quantity]);
      const item = items.find((i) => i.id === id);
      if (!item) throw httpError(404);
      if (item.stock < quantity) throw httpError(409);
      item.stock -= quantity;
      return { ...item };
    },
    async increment(id, quantity) {
      calls.push(['increment', id, quantity]);
      const item = items.find((i) => i.id === id);
      if (!item) throw httpError(404);
      item.stock += quantity;
      return { ...item };
    },
  };
}

function envelope(request, attributes = {}, applicationId = SKILL_ID) {
  return {
    version: '1.0',
    session: {
      new: false,
      sessionId: 'session',
      application: { applicationId },
      attributes,
      user: { userId: 'user' },
    },
    context: {
      System: {
        application: { applicationId },
        user: { userId: 'user' },
        device: { deviceId: 'device', supportedInterfaces: {} },
        apiEndpoint: 'https://api.amazonalexa.com',
      },
    },
    request: { requestId: 'request', timestamp: new Date().toISOString(), locale: 'ja-JP', ...request },
  };
}

/** スロットは文字列 (値だけ) か、{ value, resolutions } */
function intent(name, slots = {}) {
  const built = {};
  for (const [key, slot] of Object.entries(slots)) {
    built[key] = { name: key, confirmationStatus: 'NONE', ...(typeof slot === 'string' ? { value: slot } : slot) };
  }
  return { type: 'IntentRequest', dialogState: 'STARTED', intent: { name, confirmationStatus: 'NONE', slots: built } };
}

const ITEMS = [
  { id: 1, name: 'マウス', stock: 5 },
  { id: 2, name: 'マウスウォッシュ', stock: 3 },
  { id: 3, name: 'ボールペン（黒）', stock: 10 },
  { id: 4, name: 'ボールペン（赤）', stock: 2 },
  { id: 5, name: 'A&B<テープ>', stock: 1 },
];

async function call(api, request, attributes = {}) {
  const skill = buildSkill({ api, skillId: SKILL_ID }).create();
  const res = await skill.invoke(envelope(request, attributes));
  return {
    speech: res.response.outputSpeech?.ssml ?? '',
    ended: res.response.shouldEndSession === true,
    reprompt: Boolean(res.response.reprompt),
    directives: res.response.directives ?? [],
    attributes: res.sessionAttributes ?? {},
  };
}

const mutations = (api) => api.calls.filter(([kind]) => kind !== 'list');

test('launch greets and registers item names as dynamic entities', async () => {
  const api = fakeApi(ITEMS);
  const res = await call(api, { type: 'LaunchRequest' });

  assert.match(res.speech, /何を払い出しますか/);
  assert.equal(res.reprompt, true);
  const entities = res.directives.find((d) => d.type === 'Dialog.UpdateDynamicEntities');
  assert.deepEqual(entities.types[0].values.map((v) => v.id), ['1', '2', '3', '4', '5']);
  assert.equal(res.attributes.entitiesLoaded, true);
});

test('exact name decrements one and remembers it for undo', async () => {
  const api = fakeApi(ITEMS);
  const res = await call(api, intent('DecrementStockIntent', { ItemName: 'まうす', Quantity: {} }), { entitiesLoaded: true });

  assert.deepEqual(mutations(api), [['decrement', 1, 1]]);
  assert.match(res.speech, /マウスを1個払い出しました。残り4個です。/);
  assert.equal(res.ended, false);
  assert.deepEqual(res.attributes.last, { itemId: 1, name: 'マウス', quantity: 1 });
  assert.equal(res.directives.length, 0);
});

test('quantity is passed to the API', async () => {
  const api = fakeApi(ITEMS);
  const res = await call(api, intent('DecrementStockIntent', { ItemName: 'マウス', Quantity: '3' }));

  assert.deepEqual(mutations(api), [['decrement', 1, 3]]);
  assert.match(res.speech, /マウスを3個払い出しました。残り2個です。/);
});

test('resolved dynamic entity id selects the item', async () => {
  const api = fakeApi(ITEMS);
  const slot = {
    value: 'マウス',
    resolutions: {
      resolutionsPerAuthority: [
        {
          authority: `amzn1.er-authority.echo-sdk.dynamic.${SKILL_ID}.ITEM_NAME`,
          status: { code: 'ER_SUCCESS_MATCH' },
          values: [{ value: { name: 'マウスウォッシュ', id: '2' } }],
        },
      ],
    },
  };
  await call(api, intent('DecrementStockIntent', { ItemName: slot }));
  assert.deepEqual(mutations(api), [['decrement', 2, 1]]);
});

test('partial match asks first, then yes decrements', async () => {
  const api = fakeApi(ITEMS);
  const asked = await call(api, intent('DecrementStockIntent', { ItemName: 'ウォッシュ' }));

  assert.deepEqual(mutations(api), []);
  assert.match(asked.speech, /マウスウォッシュを1個払い出しますか？/);
  assert.deepEqual(asked.attributes.pending, { itemId: 2, name: 'マウスウォッシュ', quantity: 1 });

  const done = await call(api, intent('AMAZON.YesIntent'), asked.attributes);
  assert.deepEqual(mutations(api), [['decrement', 2, 1]]);
  assert.match(done.speech, /マウスウォッシュを1個払い出しました。残り2個です。/);
  assert.equal(done.attributes.pending, undefined);
});

test('no cancels a pending decrement without closing', async () => {
  const api = fakeApi(ITEMS);
  const res = await call(api, intent('AMAZON.NoIntent'), { pending: { itemId: 2, name: 'マウスウォッシュ', quantity: 1 } });

  assert.deepEqual(mutations(api), []);
  assert.match(res.speech, /払い出しをやめました/);
  assert.equal(res.ended, false);
  assert.equal(res.attributes.pending, undefined);
});

test('no without pending closes the skill', async () => {
  const res = await call(fakeApi(ITEMS), intent('AMAZON.NoIntent'));
  assert.match(res.speech, /ストクルを閉じます/);
  assert.equal(res.ended, true);
});

test('large quantity asks for confirmation', async () => {
  const api = fakeApi(ITEMS);
  const res = await call(api, intent('DecrementStockIntent', { ItemName: 'ボールペン（黒）', Quantity: '10' }));

  assert.deepEqual(mutations(api), []);
  assert.match(res.speech, /ボールペン（黒）を10個払い出しますか？/);
});

test('ambiguous name asks which one and keeps the quantity', async () => {
  const api = fakeApi(ITEMS);
  const res = await call(api, intent('DecrementStockIntent', { ItemName: 'ボールペン', Quantity: '2' }));

  assert.deepEqual(mutations(api), []);
  assert.match(res.speech, /ボールペン（黒）、ボールペン（赤）のどれですか？/);
  const elicit = res.directives.find((d) => d.type === 'Dialog.ElicitSlot');
  assert.equal(elicit.slotToElicit, 'ItemName');
  assert.equal(elicit.updatedIntent.slots.Quantity.value, '2');
  assert.equal(elicit.updatedIntent.slots.ItemName.value, undefined);
});

test('unknown name asks again instead of closing', async () => {
  const res = await call(fakeApi(ITEMS), intent('DecrementStockIntent', { ItemName: '鉛筆' }));
  assert.match(res.speech, /鉛筆は見つかりませんでした。品名をもう一度言ってください。/);
  assert.equal(res.ended, false);
});

test('shortage is answered without calling the API', async () => {
  const api = fakeApi(ITEMS);
  const res = await call(api, intent('DecrementStockIntent', { ItemName: 'ボールペン（赤）', Quantity: '3' }));

  assert.deepEqual(mutations(api), []);
  assert.match(res.speech, /ボールペン（赤）は残り2個のため、3個は払い出せません。/);
});

test('quantity over the limit is refused', async () => {
  const api = fakeApi(ITEMS);
  const res = await call(api, intent('DecrementStockIntent', { ItemName: 'マウス', Quantity: '100' }));
  assert.deepEqual(api.calls, []);
  assert.match(res.speech, /99個まで/);
});

test('check stock answers counts without changing them', async () => {
  const api = fakeApi(ITEMS);
  const one = await call(api, intent('CheckStockIntent', { ItemName: 'マウス' }));
  assert.match(one.speech, /マウスの在庫は5個です。/);

  const several = await call(api, intent('CheckStockIntent', { ItemName: 'ボールペン' }));
  assert.match(several.speech, /ボールペン（黒）は10個、ボールペン（赤）は2個です。/);
  assert.deepEqual(mutations(api), []);
});

test('undo restores the last decrement once', async () => {
  const api = fakeApi(ITEMS);
  const done = await call(api, intent('DecrementStockIntent', { ItemName: 'マウス', Quantity: '2' }));
  const undone = await call(api, intent('UndoIntent'), done.attributes);

  assert.deepEqual(mutations(api), [['decrement', 1, 2], ['increment', 1, 2]]);
  assert.match(undone.speech, /マウスの払い出し2個を取り消しました。残り5個です。/);

  const again = await call(api, intent('UndoIntent'), undone.attributes);
  assert.match(again.speech, /取り消せる払い出しがありません/);
  assert.equal(mutations(api).length, 2);
});

test('item names are escaped in SSML', async () => {
  const res = await call(fakeApi(ITEMS), intent('CheckStockIntent', { ItemName: 'A&B<テープ>' }));
  assert.match(res.speech, /A&amp;B&lt;テープ&gt;の在庫は1個です。/);
  assert.doesNotMatch(res.speech, /<テープ>/);
});

test('rejected token tells the user to contact the administrator', async () => {
  const res = await call(fakeApi(ITEMS, { failWith: 401 }), { type: 'LaunchRequest' });
  assert.match(res.speech, /管理者に連絡してください/);
  assert.equal(res.ended, true);
});

test('requests from another skill are rejected', async () => {
  const skill = buildSkill({ api: fakeApi(ITEMS), skillId: SKILL_ID }).create();
  await assert.rejects(skill.invoke(envelope({ type: 'LaunchRequest' }, {}, 'amzn1.ask.skill.other')));
});

test('skill id is required', () => {
  assert.throws(() => buildSkill({ api: fakeApi(ITEMS), skillId: '' }));
});

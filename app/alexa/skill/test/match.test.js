'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalize, resolveItem } = require('../lib/match');

const items = [
  { id: 1, name: 'マウス', stock: 5 },
  { id: 2, name: 'マウスウォッシュ', stock: 3 },
  { id: 3, name: 'ボールペン（黒）', stock: 10 },
  { id: 4, name: 'ボールペン（赤）', stock: 2 },
  { id: 5, name: 'ＵＳＢメモリ', stock: 1 },
];

test('normalize unifies width, case, spaces and kana', () => {
  assert.equal(normalize('ＵＳＢ メモリ'), 'usbメモリ');
  assert.equal(normalize('はさみ'), normalize('ハサミ'));
});

test('exact match wins over partial matches', () => {
  assert.deepEqual(resolveItem(items, 'まうす'), { kind: 'exact', item: items[0] });
  assert.equal(resolveItem(items, 'usbメモリ').item.id, 5);
});

test('resolved entity id is used first', () => {
  assert.equal(resolveItem(items, 'まうす', '2').item.id, 2);
  // 一覧にない ID は無視して、名前で探す
  assert.equal(resolveItem(items, 'マウス', '999').item.id, 1);
});

test('single partial match is reported as partial', () => {
  assert.deepEqual(resolveItem(items, 'ウォッシュ'), { kind: 'partial', item: items[1] });
});

test('several partial matches are ambiguous', () => {
  const result = resolveItem(items, 'ボールペン');
  assert.equal(result.kind, 'ambiguous');
  assert.deepEqual(result.items.map((i) => i.id), [3, 4]);
});

test('same names are reported as duplicate', () => {
  const dup = [...items, { id: 6, name: 'マウス', stock: 1 }];
  assert.equal(resolveItem(dup, 'マウス').kind, 'duplicate');
});

test('too many candidates and single characters are not guessed', () => {
  const many = ['ペンA', 'ペンB', 'ペンC', 'ペンD'].map((name, i) => ({ id: i + 1, name, stock: 1 }));
  assert.equal(resolveItem(many, 'ペン').kind, 'tooMany');
  assert.equal(resolveItem(items, 'マ').kind, 'none');
  assert.equal(resolveItem(items, '鉛筆').kind, 'none');
  assert.equal(resolveItem(items, '').kind, 'none');
});

'use strict';

// 話された品名から品目を探す。間違った品目を減らさないよう、完全一致でないときは呼び出し側で確かめる

/** 比べるための形にそろえる (全角半角・大文字小文字・空白・ひらがな / カタカナ) */
function normalize(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

/** 部分一致の候補として挙げる上限。これより多いときは、もっと詳しく言ってもらう */
const MAX_CANDIDATES = 3;

/**
 * @param {Array<{id:number,name:string}>} items
 * @param {string} spokenName 話された品名
 * @param {string|null} resolvedId 動的エンティティで解決できたときの品目 ID
 * @returns {{kind:'exact',item:object}
 *   | {kind:'partial',item:object}
 *   | {kind:'ambiguous',items:object[]}
 *   | {kind:'duplicate',items:object[]}
 *   | {kind:'tooMany'}
 *   | {kind:'none'}}
 */
function resolveItem(items, spokenName, resolvedId = null) {
  if (resolvedId != null) {
    const byId = items.find((item) => String(item.id) === String(resolvedId));
    if (byId) {
      return { kind: 'exact', item: byId };
    }
  }

  const spoken = normalize(spokenName);
  if (spoken === '') {
    return { kind: 'none' };
  }

  const exact = items.filter((item) => normalize(item.name) === spoken);
  if (exact.length === 1) {
    return { kind: 'exact', item: exact[0] };
  }
  if (exact.length > 1) {
    return { kind: 'duplicate', items: exact };
  }

  // 1 文字だと多くの品名に含まれるので、部分一致は 2 文字から
  if (spoken.length < 2) {
    return { kind: 'none' };
  }
  const partial = items.filter((item) => {
    const name = normalize(item.name);
    return name !== '' && (name.includes(spoken) || spoken.includes(name));
  });
  if (partial.length === 0) {
    return { kind: 'none' };
  }
  if (partial.length === 1) {
    return { kind: 'partial', item: partial[0] };
  }
  if (partial.length > MAX_CANDIDATES) {
    return { kind: 'tooMany' };
  }
  return { kind: 'ambiguous', items: partial };
}

module.exports = { normalize, resolveItem, MAX_CANDIDATES };

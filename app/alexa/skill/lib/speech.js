'use strict';

/** SSML に入れる文字列をエスケープする (品名は利用者が入力したものなので、そのまま入れない) */
function escapeSsml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[c]);
}

/** 「マウスウォッシュ、マウスパッド、マウス」→ 候補を読み上げる形 */
function joinNames(items) {
  return items.map((item) => escapeSsml(item.name)).join('、');
}

module.exports = { escapeSsml, joinNames };

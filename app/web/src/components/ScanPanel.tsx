"use client";

import { cls } from "./ui";

/** 初期表示のスキャン画面。登録済みなら入庫/払い出しを選び、未登録なら物品追加に進む */
export function ScanPanel({ onScan }: { onScan: () => void }) {
  return (
    <section className={`${cls.card} flex flex-col items-center gap-4 px-4 py-12 text-center`}>
      <p className="text-sm text-zinc-500">
        バーコードを読み取って、入庫・払い出しや物品の追加を行います。
      </p>
      <button
        type="button"
        onClick={onScan}
        className="flex h-32 w-32 flex-col items-center justify-center gap-1 rounded-full bg-zinc-900 text-lg font-semibold text-white shadow hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        <span aria-hidden className="text-4xl leading-none">
          ⌖
        </span>
        スキャン
      </button>
    </section>
  );
}

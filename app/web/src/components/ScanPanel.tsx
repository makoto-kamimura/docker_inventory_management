"use client";

import { ArrowDownToLine, ArrowUpFromLine, PackagePlus, ScanLine } from "lucide-react";
import { Callout, cls } from "./ui";

const STEPS = [
  {
    icon: ScanLine,
    tone: "bg-primary/10 text-primary",
    title: "バーコードを読み取る",
    body: "下のボタンを押して、バーコードを入力または読み取ります。",
  },
  {
    icon: ArrowDownToLine,
    tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
    title: "登録済みなら入庫 / 払い出し",
    body: "買ってきたら「入庫 (+1)」、使ったら「払い出し (-1)」を選びます。",
  },
  {
    icon: PackagePlus,
    tone: "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
    title: "未登録なら物品追加へ",
    body: "バーコードを引き継いだまま、物品追加の画面に進みます。",
  },
];

/** 初期表示のスキャン画面。登録済みなら入庫/払い出しを選び、未登録なら物品追加に進む */
export function ScanPanel({ onScan }: { onScan: () => void }) {
  return (
    <div className="space-y-4">
      <section className={`${cls.card} flex flex-col items-center gap-3 px-4 py-10 text-center`}>
        <button
          type="button"
          onClick={onScan}
          className="flex h-36 w-36 flex-col items-center justify-center gap-1 rounded-full bg-primary text-lg font-bold text-primary-foreground shadow-lg shadow-primary/30 ring-8 ring-primary/10 transition hover:bg-primary-hover active:scale-95"
        >
          <ScanLine aria-hidden className="h-12 w-12" />
          スキャン
        </button>
        <p className="text-sm text-zinc-500">ボタンを押すと読み取りが始まります</p>
      </section>

      <ol className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step.title} className={`${cls.card} flex items-start gap-3 p-4`}>
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${step.tone}`}>
              <step.icon aria-hidden className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {i + 1}. {step.title}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <Callout>
        USB / Bluetooth のバーコードリーダーは、キーボード入力として使えます。入力欄にカーソルがある状態で読み取ってください。
      </Callout>

      <p className="flex items-center justify-center gap-1 text-xs text-zinc-400">
        <ArrowUpFromLine aria-hidden className="h-3.5 w-3.5" />
        払い出しは在庫が 1 以上のときだけ選べます
      </p>
    </div>
  );
}

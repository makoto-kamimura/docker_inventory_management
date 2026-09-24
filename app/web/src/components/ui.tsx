"use client";

import { useState, type ReactNode } from "react";
import type { Option } from "@/lib/inventory";

export const cls = {
  input:
    "w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900",
  card: "rounded-lg border border-zinc-200 dark:border-zinc-800",
  cardHeader: "border-b border-zinc-200 px-4 py-3 dark:border-zinc-800",
  muted: "px-4 py-6 text-sm text-zinc-500",
  primaryButton:
    "rounded bg-zinc-900 px-4 py-1.5 text-sm text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300",
  secondaryButton:
    "rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800",
  outlineButton:
    "rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800",
  dangerOutlineButton:
    "shrink-0 rounded border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50 disabled:opacity-40 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40",
  dangerButton:
    "rounded border border-red-300 bg-red-600 px-4 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-40",
  iconButton:
    "grid h-8 w-8 place-items-center rounded text-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
};

/** 非同期処理中フラグ付きで処理を実行する (保存ボタンの二重押し防止) */
export function useBusy() {
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };
  return [busy, run] as const;
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal
        className="w-full max-w-md space-y-4 rounded-lg bg-white p-5 shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ModalActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap justify-end gap-2">{children}</div>;
}

export function Banner({
  tone,
  children,
  onClose,
}: {
  tone: "error" | "info";
  children: ReactNode;
  onClose: () => void;
}) {
  const color =
    tone === "error"
      ? "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
      : "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300";
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded border px-4 py-3 text-sm ${color}`}>
      <div className="flex items-start justify-between gap-4">
        <span>{children}</span>
        <button type="button" onClick={onClose} aria-label="閉じる" className="opacity-70 hover:opacity-100">
          ×
        </button>
      </div>
    </div>
  );
}

export function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        "px-4 py-2 text-sm -mb-px border-b-2 transition-colors " +
        (active
          ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
          : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100")
      }
    >
      {children}
    </button>
  );
}

export function SegControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (next: T) => void;
  options: Option<T>[];
}) {
  return (
    <div
      role="tablist"
      className="inline-flex shrink-0 flex-nowrap rounded-md border border-zinc-300 p-0.5 dark:border-zinc-700"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={
              "rounded px-3 py-1 text-xs transition-colors whitespace-nowrap " +
              (active
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800")
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function ReloadButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="再読み込み"
      title="再読み込み"
      className={cls.iconButton}
    >
      ↻
    </button>
  );
}

/** 追加フォーム。送信ボタンは画面下部に固定表示する */
export function AddForm({
  title,
  disabled,
  onSubmit,
  children,
}: {
  title: string;
  disabled: boolean;
  onSubmit: () => void | Promise<void>;
  children: ReactNode;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!disabled) void onSubmit();
      }}
      className={`space-y-3 p-4 ${cls.card}`}
    >
      <h2 className="font-semibold">{title}</h2>
      {children}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/95 sm:px-10">
        <div className="mx-auto w-full max-w-5xl">
          <button
            type="submit"
            disabled={disabled}
            className="w-full rounded bg-zinc-900 px-4 py-2.5 text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            追加
          </button>
        </div>
      </div>
    </form>
  );
}

/** 見出し付きの一覧カード (読み込み中 / 空表示を含む) */
export function ListCard({
  title,
  loading,
  emptyText,
  isEmpty,
  children,
}: {
  title: string;
  loading: boolean;
  emptyText: string;
  isEmpty: boolean;
  children: ReactNode;
}) {
  return (
    <section className={cls.card}>
      <header className={cls.cardHeader}>
        <h2 className="font-semibold">{title}</h2>
      </header>
      {loading ? (
        <p className={cls.muted}>読み込み中...</p>
      ) : isEmpty ? (
        <p className={cls.muted}>{emptyText}</p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">{children}</ul>
      )}
    </section>
  );
}

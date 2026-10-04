"use client";

import { useState, type ReactNode } from "react";
import {
  Boxes,
  CircleAlert,
  CircleCheck,
  Info,
  RotateCw,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Option } from "@/lib/inventory";

export const cls = {
  input:
    "w-full rounded-lg border border-zinc-300 bg-surface px-3 py-2 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-zinc-700",
  card: "rounded-xl border border-zinc-200 bg-surface shadow-sm dark:border-zinc-800",
  cardHeader: "border-b border-zinc-100 px-4 py-3 dark:border-zinc-800",
  muted: "px-4 py-6 text-sm text-zinc-500",
  label: "text-sm font-medium text-zinc-700 dark:text-zinc-300",
  primaryButton:
    "rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-40",
  secondaryButton:
    "rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800",
  outlineButton:
    "inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800",
  dangerOutlineButton:
    "inline-flex shrink-0 items-center gap-1 rounded-lg border border-red-200 px-3 py-1 text-sm text-red-700 hover:bg-red-50 disabled:opacity-40 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40",
  dangerButton:
    "rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40",
  iconButton:
    "grid h-8 w-8 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
};

export type Tone = "info" | "success" | "warning" | "danger" | "neutral";

// 色だけに頼らず、アイコンと文言を必ず添える (しおりカレンダーと同じ方針)
const TONE_BOX: Record<Tone, string> = {
  info: "border-primary/30 bg-primary/10 text-teal-900 dark:text-teal-100",
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
  warning:
    "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  danger:
    "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200",
  neutral:
    "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300",
};

const TONE_ICON: Record<Tone, LucideIcon> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleAlert,
  neutral: Info,
};

const TONE_BADGE: Record<Tone, string> = {
  info: "bg-primary/15 text-teal-800 dark:text-teal-200",
  success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  danger: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300",
  neutral: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
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

/** アプリのロゴマーク (ティールの角丸に箱のアイコン) */
export function LogoMark({ size = "md" }: { size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-12 w-12 rounded-2xl" : "h-9 w-9 rounded-xl";
  return (
    <span className={`grid shrink-0 place-items-center bg-primary text-primary-foreground shadow-sm ${box}`}>
      <Boxes aria-hidden className={size === "lg" ? "h-7 w-7" : "h-5 w-5"} />
    </span>
  );
}

/** 画面の見出しと説明文 */
export function PageIntro({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon aria-hidden className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
      </div>
      {action}
    </div>
  );
}

/** 補足説明の囲み */
export function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: Tone;
  title?: string;
  children: ReactNode;
}) {
  const Icon = TONE_ICON[tone];
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${TONE_BOX[tone]}`}>
      <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? "opacity-90" : undefined}>{children}</div>
      </div>
    </div>
  );
}

/** データがないときの案内 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-zinc-100 text-zinc-400 dark:bg-zinc-800">
        <Icon aria-hidden className="h-6 w-6" />
      </span>
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-zinc-500">{description}</p>}
      {action}
    </div>
  );
}

/** 入力欄の下の補足 */
export function Hint({ children }: { children: ReactNode }) {
  return <p className="text-xs text-zinc-500 dark:text-zinc-400">{children}</p>;
}

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONE_BADGE[tone]}`}
    >
      {children}
    </span>
  );
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
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal
        className="w-full max-w-md space-y-4 rounded-2xl bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-bold">{title}</h3>
          <button type="button" onClick={onClose} aria-label="閉じる" className={cls.iconButton}>
            <X aria-hidden className="h-4 w-4" />
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
  const boxTone: Tone = tone === "error" ? "danger" : "success";
  const Icon = TONE_ICON[boxTone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${TONE_BOX[boxTone]}`}
    >
      <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="flex-1">{children}</span>
      <button type="button" onClick={onClose} aria-label="閉じる" className="opacity-70 hover:opacity-100">
        <X aria-hidden className="h-4 w-4" />
      </button>
    </div>
  );
}

export function TabButton({
  active,
  icon: Icon,
  onClick,
  children,
}: {
  active: boolean;
  icon: LucideIcon;
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
        "-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors " +
        (active
          ? "border-primary font-semibold text-primary"
          : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100")
      }
    >
      <Icon aria-hidden className="h-4 w-4" />
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
      className="inline-flex shrink-0 flex-nowrap rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-700 dark:bg-zinc-900"
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
              "whitespace-nowrap rounded-md px-3 py-1 text-xs transition-colors " +
              (active
                ? "bg-surface font-semibold text-primary shadow-sm"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100")
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
      <RotateCw aria-hidden className="h-4 w-4" />
    </button>
  );
}

/** 追加フォーム。送信ボタンは画面下部に固定表示する */
export function AddForm({
  title,
  description,
  disabled,
  onSubmit,
  children,
}: {
  title: string;
  description?: string;
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
      <div>
        <h3 className="font-semibold">{title}</h3>
        {description && <Hint>{description}</Hint>}
      </div>
      {children}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-200 bg-surface/95 px-4 py-3 backdrop-blur-sm dark:border-zinc-800 sm:px-10">
        <div className="mx-auto w-full max-w-5xl">
          <button
            type="submit"
            disabled={disabled}
            className="w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-40"
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
  icon,
  loading,
  emptyText,
  emptyDescription,
  isEmpty,
  children,
}: {
  title: string;
  icon: LucideIcon;
  loading: boolean;
  emptyText: string;
  emptyDescription?: string;
  isEmpty: boolean;
  children: ReactNode;
}) {
  return (
    <section className={cls.card}>
      <header className={cls.cardHeader}>
        <h3 className="font-semibold">{title}</h3>
      </header>
      {loading ? (
        <p className={cls.muted}>読み込み中...</p>
      ) : isEmpty ? (
        <EmptyState icon={icon} title={emptyText} description={emptyDescription} />
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">{children}</ul>
      )}
    </section>
  );
}

"use client";

import { useMemo } from "react";
import type { Category, Item, StorageLocation } from "@/lib/api";
import {
  EMPTY_LIST_MESSAGE,
  GROUP_BY_OPTIONS,
  LIST_FILTER_OPTIONS,
  averageAmount,
  buildSections,
  formatYen,
  isExpired,
  type GroupBy,
  type ItemSection as Section,
  type ListFilter,
} from "@/lib/inventory";
import { ReloadButton, SegControl, cls } from "./ui";

/** 品目行から開くダイアログの種類 */
export type ItemAction =
  | "name"
  | "barcode"
  | "category"
  | "group"
  | "storage"
  | "history"
  | "delete";

type RowHandlers = {
  onIncrement: (item: Item) => void;
  onDecrement: (item: Item) => void;
  onAction: (action: ItemAction, item: Item) => void;
};

export function InventoryList({
  items,
  categories,
  storageLocations,
  loading,
  filter,
  groupBy,
  onChangeFilter,
  onChangeGroupBy,
  onReload,
  ...handlers
}: {
  items: Item[];
  categories: Category[];
  storageLocations: StorageLocation[];
  loading: boolean;
  filter: ListFilter;
  groupBy: GroupBy;
  onChangeFilter: (next: ListFilter) => void;
  onChangeGroupBy: (next: GroupBy) => void;
  onReload: () => void;
} & RowHandlers) {
  const sections = useMemo(
    () => buildSections(items, filter, groupBy, categories, storageLocations),
    [items, filter, groupBy, categories, storageLocations],
  );

  return (
    <section className={cls.card}>
      <header className="flex flex-col gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-semibold">在庫一覧</h2>
        <div className="flex flex-wrap items-center gap-2">
          <SegControl value={filter} onChange={onChangeFilter} options={LIST_FILTER_OPTIONS} />
          <SegControl value={groupBy} onChange={onChangeGroupBy} options={GROUP_BY_OPTIONS} />
          <ReloadButton onClick={onReload} />
        </div>
      </header>

      {loading ? (
        <p className={cls.muted}>読み込み中...</p>
      ) : items.length === 0 || sections.length === 0 ? (
        <p className={cls.muted}>{EMPTY_LIST_MESSAGE[items.length === 0 ? "all" : filter]}</p>
      ) : (
        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {sections.map((section) => (
            <ItemSection
              key={section.key}
              section={section}
              showAvgAmount={filter === "out_of_stock"}
              showExpiresAt={filter === "expires_soon"}
              {...handlers}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ItemSection({
  section,
  ...rowProps
}: {
  section: Section;
  showAvgAmount: boolean;
  showExpiresAt: boolean;
} & RowHandlers) {
  if (section.items.length === 0) {
    return (
      <div className="flex items-center justify-between px-4 py-3">
        <h3 className="font-medium">{section.title}</h3>
        <span className="text-xs text-zinc-500">0 件</span>
      </div>
    );
  }

  return (
    <details open>
      <summary className="flex cursor-pointer items-center justify-between px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/40">
        <h3 className="font-medium">{section.title}</h3>
        <span className="text-xs text-zinc-500">{section.items.length} 件</span>
      </summary>
      <ul className="divide-y divide-zinc-100 border-t border-zinc-100 dark:divide-zinc-800 dark:border-zinc-800">
        {section.items.map((item) => (
          <ItemRow key={item.id} item={item} {...rowProps} />
        ))}
      </ul>
    </details>
  );
}

function ItemRow({
  item,
  showAvgAmount,
  showExpiresAt,
  onIncrement,
  onDecrement,
  onAction,
}: {
  item: Item;
  showAvgAmount: boolean;
  showExpiresAt: boolean;
} & RowHandlers) {
  const avgAmount = averageAmount(item);

  return (
    <li className="px-4 py-3 pl-8">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="font-medium break-words">{item.name}</span>
            <button
              type="button"
              onClick={() => onAction("name", item)}
              aria-label="名前を編集"
              title="名前を編集"
              className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            >
              ✎
            </button>
          </div>
          <AttributeButton
            icon="▮▮▮"
            title="バーコードを編集"
            value={item.barcode ? <span className="tabular-nums">{item.barcode}</span> : null}
            placeholder="未設定"
            onClick={() => onAction("barcode", item)}
          />
          <AttributeButton
            icon="⊞"
            title="グループを編集"
            value={item.group?.name ? <Badge>{item.group.name}</Badge> : null}
            placeholder="グループ未設定"
            onClick={() => onAction("group", item)}
          />
          <AttributeButton
            icon="📍"
            title="保管場所を編集"
            value={item.storage_location ? <Badge>{item.storage_location.description}</Badge> : null}
            placeholder="保管場所未設定"
            onClick={() => onAction("storage", item)}
          />
          {showAvgAmount && avgAmount != null && (
            <div className="mt-0.5 text-xs tabular-nums text-emerald-600 dark:text-emerald-400">
              平均単価 {formatYen(avgAmount)}
            </div>
          )}
          {showExpiresAt && item.nearest_expires_at != null && (
            <div
              className={
                "mt-0.5 text-xs tabular-nums " +
                (isExpired(item.nearest_expires_at)
                  ? "text-red-600 dark:text-red-400"
                  : "text-amber-600 dark:text-amber-400")
              }
            >
              期限 {item.nearest_expires_at}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => onDecrement(item)}
            disabled={item.stock <= 0}
            aria-label="在庫減 (-1)"
            title="在庫減 (-1)"
            className="grid h-8 w-8 place-items-center rounded border border-zinc-300 text-lg leading-none hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            −
          </button>
          <span
            className={
              "min-w-10 text-center tabular-nums " +
              (item.stock <= 0 ? "text-red-600" : "text-zinc-900 dark:text-zinc-100")
            }
          >
            {item.stock}
          </span>
          <button
            type="button"
            onClick={() => onIncrement(item)}
            aria-label="在庫増 (+1)"
            title="在庫増 (+1)"
            className="grid h-8 w-8 place-items-center rounded border border-zinc-300 text-lg leading-none hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            ＋
          </button>
          <button
            type="button"
            onClick={() => onAction("category", item)}
            aria-label="カテゴリを変更"
            title="カテゴリを変更"
            className={`ml-1 ${cls.outlineButton}`}
          >
            移動
          </button>
          <button type="button" onClick={() => onAction("history", item)} className={cls.outlineButton}>
            履歴
          </button>
          <button
            type="button"
            onClick={() => onAction("delete", item)}
            aria-label="削除"
            title="削除"
            className={cls.dangerOutlineButton}
          >
            削除
          </button>
        </div>
      </div>
    </li>
  );
}

function AttributeButton({
  icon,
  title,
  value,
  placeholder,
  onClick,
}: {
  icon: string;
  title: string;
  value: React.ReactNode | null;
  placeholder: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="mt-0.5 flex items-center gap-1 text-left text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
    >
      <span aria-hidden>{icon}</span>
      {value ?? <span className="italic text-zinc-400">{placeholder}</span>}
      <span aria-hidden className="text-zinc-400">✎</span>
    </button>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
      {children}
    </span>
  );
}

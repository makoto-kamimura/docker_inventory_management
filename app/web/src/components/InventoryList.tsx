"use client";

import { useMemo } from "react";
import {
  Barcode,
  ChevronRight,
  History,
  Layers,
  MapPin,
  Minus,
  PackageOpen,
  Pencil,
  Plus,
  Tags,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { Category, Item, StorageLocation } from "@/lib/api";
import {
  EMPTY_LIST_MESSAGE,
  GROUP_BY_OPTIONS,
  LIST_FILTER_OPTIONS,
  STOCK_STATUS_LABEL,
  averageAmount,
  buildSections,
  formatYen,
  isExpired,
  stockStatus,
  type GroupBy,
  type ItemSection as Section,
  type ListFilter,
  type StockStatus,
} from "@/lib/inventory";
import { Badge, EmptyState, ReloadButton, SegControl, cls, type Tone } from "./ui";

const STATUS_TONE: Record<Exclude<StockStatus, "ok">, Tone> = {
  out: "danger",
  expired: "danger",
  soon: "warning",
};

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
      <header className="space-y-2 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
        <div className="flex flex-wrap items-center gap-2">
          <SegControl value={filter} onChange={onChangeFilter} options={LIST_FILTER_OPTIONS} />
          <SegControl value={groupBy} onChange={onChangeGroupBy} options={GROUP_BY_OPTIONS} />
          <span className="ml-auto">
            <ReloadButton onClick={onReload} />
          </span>
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          <span className="inline-flex items-center gap-1">
            <Plus aria-hidden className="h-3.5 w-3.5 text-emerald-600" />
            入庫
          </span>
          <span className="inline-flex items-center gap-1">
            <Minus aria-hidden className="h-3.5 w-3.5 text-amber-600" />
            払い出し
          </span>
          <Badge tone="danger">在庫切れ・期限切れ</Badge>
          <Badge tone="warning">期限 1ヶ月以内</Badge>
        </p>
      </header>

      {loading ? (
        <p className={cls.muted}>読み込み中...</p>
      ) : items.length === 0 || sections.length === 0 ? (
        <EmptyState icon={PackageOpen} {...EMPTY_LIST_MESSAGE[items.length === 0 ? "all" : filter]} />
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
  const marker = section.color ? (
    <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: section.color }} />
  ) : (
    <MapPin aria-hidden className="h-4 w-4 shrink-0 text-zinc-400" />
  );
  const count = <Badge>{section.items.length} 件</Badge>;
  // カテゴリ色の左バー (保管場所別・未設定はグレー)
  const bar = { borderLeftColor: section.color ?? "transparent" };

  if (section.items.length === 0) {
    return (
      <div className="flex items-center gap-2 border-l-4 px-4 py-3 text-zinc-400" style={bar}>
        <span className="w-4" />
        {marker}
        <h3 className="flex-1 font-medium">{section.title}</h3>
        {count}
      </div>
    );
  }

  return (
    <details className="group border-l-4" style={bar}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden
          className="h-4 w-4 shrink-0 text-zinc-400 transition-transform group-open:rotate-90"
        />
        {marker}
        <h3 className="flex-1 font-medium">{section.title}</h3>
        {count}
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
  const status = stockStatus(item);

  return (
    <li className="px-4 py-3 sm:pl-10">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium break-words">{item.name}</span>
            <button
              type="button"
              onClick={() => onAction("name", item)}
              aria-label="名前を編集"
              title="名前を編集"
              className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            >
              <Pencil aria-hidden className="h-3.5 w-3.5" />
            </button>
            {status !== "ok" && <Badge tone={STATUS_TONE[status]}>{STOCK_STATUS_LABEL[status]}</Badge>}
          </div>
          <AttributeButton
            icon={Barcode}
            title="バーコードを編集"
            value={item.barcode ? <span className="tabular-nums">{item.barcode}</span> : null}
            placeholder="未設定"
            onClick={() => onAction("barcode", item)}
          />
          <AttributeButton
            icon={Layers}
            title="グループを編集"
            value={item.group?.name ? <AttrBadge>{item.group.name}</AttrBadge> : null}
            placeholder="グループ未設定"
            onClick={() => onAction("group", item)}
          />
          <AttributeButton
            icon={MapPin}
            title="保管場所を編集"
            value={item.storage_location ? <AttrBadge>{item.storage_location.description}</AttrBadge> : null}
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
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onDecrement(item)}
            disabled={item.stock <= 0}
            aria-label="払い出し (-1)"
            title="払い出し (-1)"
            className="grid h-8 w-8 place-items-center rounded-full border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-40 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
          >
            <Minus aria-hidden className="h-4 w-4" />
          </button>
          <span
            className={
              "min-w-10 text-center text-lg font-semibold tabular-nums " +
              (item.stock <= 0 ? "text-red-600 dark:text-red-400" : "text-zinc-900 dark:text-zinc-100")
            }
          >
            {item.stock}
          </span>
          <button
            type="button"
            onClick={() => onIncrement(item)}
            aria-label="入庫 (+1)"
            title="入庫 (+1)"
            className="grid h-8 w-8 place-items-center rounded-full border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
          >
            <Plus aria-hidden className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onAction("category", item)}
            aria-label="カテゴリを変更"
            title="カテゴリを変更"
            className={`ml-1 ${cls.outlineButton}`}
          >
            <Tags aria-hidden className="h-3.5 w-3.5" />
            移動
          </button>
          <button type="button" onClick={() => onAction("history", item)} className={cls.outlineButton}>
            <History aria-hidden className="h-3.5 w-3.5" />
            履歴
          </button>
          <button
            type="button"
            onClick={() => onAction("delete", item)}
            aria-label="削除"
            title="削除"
            className={cls.dangerOutlineButton}
          >
            <Trash2 aria-hidden className="h-3.5 w-3.5" />
            削除
          </button>
        </div>
      </div>
    </li>
  );
}

function AttributeButton({
  icon: Icon,
  title,
  value,
  placeholder,
  onClick,
}: {
  icon: LucideIcon;
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
      <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" />
      {value ?? <span className="italic text-zinc-400">{placeholder}</span>}
      <Pencil aria-hidden className="h-3 w-3 text-zinc-400" />
    </button>
  );
}

function AttrBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
      {children}
    </span>
  );
}

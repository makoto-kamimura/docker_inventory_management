// 在庫一覧・物品追加・分析の表示ロジック (UI 非依存)。
// app/web/src/lib/inventory.ts と app/mobile/src/inventory.ts は同一内容を保つこと。
// Web / モバイルで仕様がずれないよう、画面の振る舞いに関わる判定はここに集約する。

import type {
  AnalyticsGroup,
  AnalyticsMetric,
  AnalyticsPeriod,
  AnalyticsSeries,
  Category,
  CreateItemInput,
  Item,
  StorageLocation,
} from "./api";

export type Option<T> = { value: T; label: string };

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function formatYen(value: number): string {
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

export function formatChange(change: number): string {
  return change > 0 ? `+${change}` : String(change);
}

// --- 日付 --------------------------------------------------------------------

/** "YYYY-MM-DD" (時刻付きでも可) をローカルタイムの日付として解釈する */
export function parseLocalDate(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

export function isExpired(expiresAt: string, today = startOfToday()): boolean {
  return parseLocalDate(expiresAt) < today;
}

// --- 在庫一覧 ----------------------------------------------------------------

export type ListFilter = "all" | "out_of_stock" | "expires_soon";
export type GroupBy = "category" | "storage";

export const LIST_FILTER_OPTIONS: Option<ListFilter>[] = [
  { value: "all", label: "すべて" },
  { value: "out_of_stock", label: "在庫切れ" },
  { value: "expires_soon", label: "期限 1ヶ月以内" },
];

export const GROUP_BY_OPTIONS: Option<GroupBy>[] = [
  { value: "category", label: "カテゴリ別" },
  { value: "storage", label: "保管場所別" },
];

export const EMPTY_LIST_MESSAGE: Record<ListFilter, string> = {
  all: "物品がありません",
  out_of_stock: "在庫切れの物品はありません",
  expires_soon: "期限が1ヶ月以内の物品はありません",
};

const EXPIRES_SOON_DAYS = 30;

/**
 * 一覧フィルタ。
 * - 在庫切れ: グループに属する品目は、グループ内の全品目が在庫0のときだけ表示する
 * - 期限 1ヶ月以内: 在庫の最も近い期限が 30 日以内 (期限切れを含む)
 */
export function filterItems(
  items: Item[],
  filter: ListFilter,
  today = startOfToday(),
): Item[] {
  if (filter === "out_of_stock") {
    const groupsInStock = new Set(
      items.filter((it) => it.group_id != null && it.stock > 0).map((it) => it.group_id),
    );
    return items.filter((it) =>
      it.group_id != null ? !groupsInStock.has(it.group_id) : it.stock <= 0,
    );
  }
  if (filter === "expires_soon") {
    const limit = new Date(today);
    limit.setDate(today.getDate() + EXPIRES_SOON_DAYS);
    return items.filter(
      (it) => it.nearest_expires_at != null && parseLocalDate(it.nearest_expires_at) <= limit,
    );
  }
  return items;
}

export type ItemSection = { key: string; title: string; items: Item[] };

/**
 * 一覧をカテゴリ別 / 保管場所別のセクションに分ける。
 * フィルタ中は該当品目のないセクションを省き、未設定の品目は末尾にまとめる。
 */
export function buildSections(
  items: Item[],
  filter: ListFilter,
  groupBy: GroupBy,
  categories: Category[],
  storageLocations: StorageLocation[],
): ItemSection[] {
  const groups =
    groupBy === "category"
      ? categories.map((c) => ({ id: c.id, title: c.name }))
      : storageLocations.map((sl) => ({ id: sl.id, title: sl.description }));
  const groupIdOf = (it: Item) =>
    groupBy === "category" ? it.category_id : it.storage_location_id;

  const buckets = new Map<number, Item[]>(groups.map((g) => [g.id, []]));
  const orphan: Item[] = [];
  for (const it of filterItems(items, filter)) {
    const id = groupIdOf(it);
    const bucket = id != null ? buckets.get(id) : undefined;
    if (bucket) bucket.push(it);
    else orphan.push(it);
  }

  const sections = groups
    .map((g) => ({ key: `${groupBy}-${g.id}`, title: g.title, items: buckets.get(g.id) ?? [] }))
    .filter((s) => filter === "all" || s.items.length > 0);
  if (orphan.length > 0) {
    sections.push({
      key: `${groupBy}-none`,
      title: groupBy === "category" ? "(カテゴリ未設定)" : "(保管場所未設定)",
      items: orphan,
    });
  }
  return sections;
}

/** 平均単価。未入力または 0 以下なら null (DECIMAL は文字列で返る) */
export function averageAmount(item: Item): number | null {
  if (item.avg_amount == null) return null;
  const value = Number(item.avg_amount);
  return value > 0 ? value : null;
}

// --- 物品追加 ----------------------------------------------------------------

export type ItemDraft = {
  name: string;
  categoryId: number | null;
  stock: string;
  groupId: number | null;
  storageLocationId: number | null;
  amount: string;
  expiresAt: string;
  // バーコードスキャンで未登録だったときに引き継ぐ
  barcode: string | null;
};

/** 空の入力。カテゴリは連続登録しやすいよう引き継ぐ */
export function emptyDraft(categoryId: number | null = null): ItemDraft {
  return {
    name: "",
    categoryId,
    stock: "0",
    groupId: null,
    storageLocationId: null,
    amount: "",
    expiresAt: "",
    barcode: null,
  };
}

/** 未登録バーコードから物品追加へ進むときの入力 (在庫 1 から開始) */
export function draftFromBarcode(barcode: string, categoryId: number | null): ItemDraft {
  return { ...emptyDraft(categoryId), stock: "1", barcode };
}

export function draftStock(draft: ItemDraft): number {
  return Math.max(0, Math.floor(Number(draft.stock) || 0));
}

export function canSubmitDraft(draft: ItemDraft): boolean {
  return draft.name.trim() !== "" && draft.categoryId != null;
}

/** 単価・期限は初期在庫がある場合のみ送る */
export function draftToInput(draft: ItemDraft): CreateItemInput | null {
  if (!canSubmitDraft(draft) || draft.categoryId == null) return null;
  const stock = draftStock(draft);
  const expiresAt = draft.expiresAt.trim();
  return {
    name: draft.name.trim(),
    category_id: draft.categoryId,
    stock,
    barcode: draft.barcode,
    group_id: draft.groupId,
    storage_location_id: draft.storageLocationId,
    amount: stock > 0 ? parseAmount(draft.amount) : null,
    expires_at: stock > 0 && expiresAt !== "" ? expiresAt : null,
  };
}

/** 金額入力 (任意)。空なら null、数値でなければ NaN */
export function parseAmount(text: string): number | null {
  const trimmed = text.trim();
  return trimmed === "" ? null : Math.floor(Number(trimmed));
}

export function isValidAmount(amount: number | null): boolean {
  return amount == null || (Number.isFinite(amount) && amount >= 0);
}

// --- 分析 --------------------------------------------------------------------

export const ANALYTICS_METRIC_OPTIONS: Option<AnalyticsMetric>[] = [
  { value: "stock", label: "在庫数" },
  { value: "amount", label: "金額" },
];

export const ANALYTICS_PERIOD_OPTIONS: Option<AnalyticsPeriod>[] = [
  { value: "daily", label: "日毎" },
  { value: "monthly", label: "月毎" },
];

export const ANALYTICS_GROUP_OPTIONS: Option<AnalyticsGroup>[] = [
  { value: "total", label: "総合計" },
  { value: "category", label: "カテゴリ別" },
];

export const ANALYTICS_TITLE: Record<AnalyticsMetric, string> = {
  stock: "在庫数の推移",
  amount: "補充金額の推移",
};

export const SERIES_COLORS = [
  "#2563eb",
  "#16a34a",
  "#dc2626",
  "#d97706",
  "#9333ea",
  "#0891b2",
  "#db2777",
  "#65a30d",
  "#475569",
  "#ea580c",
];

export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

export function formatMetricValue(value: number, metric: AnalyticsMetric): string {
  return metric === "amount" ? formatYen(value) : String(value);
}

/** daily: "YYYY-MM-DD" → "M/D"、monthly: "YYYY-MM" → "YY/M" */
export function formatBucketLabel(label: string, period: AnalyticsPeriod): string {
  const parts = label.split("-");
  if (period === "daily") {
    return parts.length === 3 ? `${Number(parts[1])}/${Number(parts[2])}` : label;
  }
  return parts.length === 2 ? `${parts[0].slice(2)}/${Number(parts[1])}` : label;
}

export type ChartScale = { min: number; max: number; ticks: number[] };

/** Y 軸の範囲と目盛り。値がすべて 0 以上なら下限を負にしない */
export function chartScale(series: AnalyticsSeries[], tickCount = 5): ChartScale {
  const values = series.flatMap((s) => s.values);
  let min = 0;
  let max = 1;
  if (values.length > 0) {
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    if (lo === hi) {
      min = lo - 1;
      max = hi + 1;
    } else {
      const pad = (hi - lo) * 0.1;
      min = Math.floor(lo - pad);
      max = Math.ceil(hi + pad);
    }
    if (lo >= 0) min = Math.max(0, min);
  }
  const step = (max - min) / tickCount;
  const ticks = Array.from(
    new Set(Array.from({ length: tickCount + 1 }, (_, i) => Math.round(min + step * i) || 0)),
  );
  return { min, max, ticks };
}

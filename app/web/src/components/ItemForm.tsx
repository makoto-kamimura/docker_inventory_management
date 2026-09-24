"use client";

import type { Category, ItemGroup, StorageLocation } from "@/lib/api";
import { canSubmitDraft, draftStock, type ItemDraft } from "@/lib/inventory";
import { AddForm, cls } from "./ui";

const toId = (value: string) => (value === "" ? null : Number(value));

export function ItemForm({
  draft,
  onChange,
  onSubmit,
  categories,
  itemGroups,
  storageLocations,
}: {
  draft: ItemDraft;
  onChange: (patch: Partial<ItemDraft>) => void;
  onSubmit: () => Promise<void>;
  categories: Category[];
  itemGroups: ItemGroup[];
  storageLocations: StorageLocation[];
}) {
  return (
    <AddForm title="物品追加" disabled={!canSubmitDraft(draft)} onSubmit={onSubmit}>
      {draft.barcode && (
        <div className="flex items-center gap-2 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm dark:border-blue-900 dark:bg-blue-950/40">
          <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">バーコード</span>
          <span className="flex-1 font-mono tabular-nums">{draft.barcode}</span>
          <button
            type="button"
            onClick={() => onChange({ barcode: null })}
            aria-label="バーコードを解除"
            className="text-blue-700 hover:text-blue-900 dark:text-blue-300"
          >
            ×
          </button>
        </div>
      )}
      <input
        type="text"
        value={draft.name}
        onChange={(e) => onChange({ name: e.target.value })}
        placeholder="名前"
        className={cls.input}
      />
      <select
        value={draft.categoryId ?? ""}
        onChange={(e) => onChange({ categoryId: toId(e.target.value) })}
        className={cls.input}
      >
        <option value="">カテゴリを選択</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <input
        type="number"
        min={0}
        value={draft.stock}
        onChange={(e) => onChange({ stock: e.target.value })}
        placeholder="初期在庫"
        className={cls.input}
      />
      {draftStock(draft) > 0 && (
        <>
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-sm text-zinc-500">¥</span>
            <input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={draft.amount}
              onChange={(e) => onChange({ amount: e.target.value })}
              placeholder="単価 (任意)"
              className={cls.input}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-zinc-600 dark:text-zinc-400">期限 (任意)</label>
            <input
              type="date"
              value={draft.expiresAt}
              onChange={(e) => onChange({ expiresAt: e.target.value })}
              className={cls.input}
            />
          </div>
        </>
      )}
      <select
        value={draft.groupId ?? ""}
        onChange={(e) => onChange({ groupId: toId(e.target.value) })}
        className={cls.input}
      >
        <option value="">グループなし (任意)</option>
        {itemGroups.map((g) => (
          <option key={g.id} value={g.id}>{g.name}</option>
        ))}
      </select>
      <select
        value={draft.storageLocationId ?? ""}
        onChange={(e) => onChange({ storageLocationId: toId(e.target.value) })}
        className={cls.input}
      >
        <option value="">保管場所なし (任意)</option>
        {storageLocations.map((sl) => (
          <option key={sl.id} value={sl.id}>{sl.description}</option>
        ))}
      </select>
    </AddForm>
  );
}

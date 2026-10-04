"use client";

import type { ReactNode } from "react";
import { Barcode, X } from "lucide-react";
import type { Category, ItemGroup, StorageLocation } from "@/lib/api";
import { canSubmitDraft, draftStock, type ItemDraft } from "@/lib/inventory";
import { AddForm, Callout, Hint, cls } from "./ui";

const toId = (value: string) => (value === "" ? null : Number(value));

function Field({
  label,
  required = false,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className={cls.label}>
        {label}
        {required ? (
          <span className="ml-1 text-xs text-red-600">必須</span>
        ) : (
          <span className="ml-1 text-xs font-normal text-zinc-400">任意</span>
        )}
      </span>
      {children}
      {hint && <Hint>{hint}</Hint>}
    </label>
  );
}

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
    <AddForm
      title="新しい物品"
      description="名前とカテゴリを入れると追加できます。ほかの項目はあとから一覧で変更できます。"
      disabled={!canSubmitDraft(draft)}
      onSubmit={onSubmit}
    >
      {draft.barcode && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-sm">
          <Barcode aria-hidden className="h-4 w-4 shrink-0 text-primary" />
          <span className="text-xs font-semibold text-primary">スキャンしたバーコード</span>
          <span className="flex-1 font-mono tabular-nums">{draft.barcode}</span>
          <button
            type="button"
            onClick={() => onChange({ barcode: null })}
            aria-label="バーコードを解除"
            className="text-primary opacity-70 hover:opacity-100"
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        </div>
      )}
      {categories.length === 0 && (
        <Callout tone="warning">カテゴリがまだありません。先にカテゴリタブで作成してください。</Callout>
      )}
      <Field label="名前" required>
        <input
          type="text"
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="例: トイレットペーパー 12ロール"
          className={cls.input}
        />
      </Field>
      <Field label="カテゴリ" required>
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
      </Field>
      <Field label="初期在庫" hint="0 のままにすると「在庫切れ」として登録されます。">
        <input
          type="number"
          min={0}
          value={draft.stock}
          onChange={(e) => onChange({ stock: e.target.value })}
          placeholder="0"
          className={cls.input}
        />
      </Field>
      {draftStock(draft) > 0 && (
        <div className="grid gap-3 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900/60 sm:grid-cols-2">
          <Field label="単価" hint="平均単価として、在庫切れの一覧に表示されます。">
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-sm text-zinc-500">¥</span>
              <input
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={draft.amount}
                onChange={(e) => onChange({ amount: e.target.value })}
                placeholder="例: 480"
                className={cls.input}
              />
            </div>
          </Field>
          <Field label="期限" hint="1ヶ月以内になると「期限間近」として表示されます。">
            <input
              type="date"
              value={draft.expiresAt}
              onChange={(e) => onChange({ expiresAt: e.target.value })}
              className={cls.input}
            />
          </Field>
        </div>
      )}
      <Field label="グループ" hint="銘柄違いなど、同じ用途の物品をまとめるときに使います。">
        <select
          value={draft.groupId ?? ""}
          onChange={(e) => onChange({ groupId: toId(e.target.value) })}
          className={cls.input}
        >
          <option value="">グループなし</option>
          {itemGroups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
      </Field>
      <Field label="保管場所">
        <select
          value={draft.storageLocationId ?? ""}
          onChange={(e) => onChange({ storageLocationId: toId(e.target.value) })}
          className={cls.input}
        >
          <option value="">保管場所なし</option>
          {storageLocations.map((sl) => (
            <option key={sl.id} value={sl.id}>{sl.description}</option>
          ))}
        </select>
      </Field>
    </AddForm>
  );
}

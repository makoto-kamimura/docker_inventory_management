"use client";

import { useState } from "react";
import { api, type Category, type Item, type ItemGroup, type StorageLocation } from "@/lib/api";
import { ConfirmDeleteModal } from "./modals";
import { AddForm, ListCard, cls } from "./ui";

/** API 呼び出し → 再読み込み。失敗時はエラー表示して false を返す */
export type Perform = (action: () => Promise<unknown>) => Promise<boolean>;

export function CategoryManager({
  categories,
  loading,
  perform,
}: {
  categories: Category[];
  loading: boolean;
  perform: Perform;
}) {
  const [name, setName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);

  const add = async () => {
    if (await perform(() => api.createCategory(name.trim()))) setName("");
  };

  return (
    <div className="space-y-6">
      <AddForm title="カテゴリ追加" disabled={!name.trim()} onSubmit={add}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例: 工具"
          className={cls.input}
        />
      </AddForm>

      <ListCard title="カテゴリ一覧" loading={loading} emptyText="カテゴリがありません" isEmpty={categories.length === 0}>
        {categories.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="font-medium">{c.name}</span>
            <button type="button" onClick={() => setDeleteTarget(c)} className={cls.dangerOutlineButton}>
              削除
            </button>
          </li>
        ))}
      </ListCard>

      {deleteTarget && (
        <ConfirmDeleteModal
          title="カテゴリの削除"
          message={`「${deleteTarget.name}」を削除しますか？物品が登録されている場合は削除できません。`}
          onClose={() => setDeleteTarget(null)}
          onConfirm={async () => {
            await perform(() => api.deleteCategory(deleteTarget.id));
            setDeleteTarget(null);
          }}
        />
      )}
    </div>
  );
}

export function GroupManager({
  itemGroups,
  items,
  loading,
  perform,
}: {
  itemGroups: ItemGroup[];
  items: Item[];
  loading: boolean;
  perform: Perform;
}) {
  const [name, setName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ItemGroup | null>(null);

  const add = async () => {
    if (await perform(() => api.createItemGroup(name.trim()))) setName("");
  };

  return (
    <div className="space-y-6">
      <AddForm title="グループ追加" disabled={!name.trim()} onSubmit={add}>
        <p className="text-sm text-zinc-500">
          グループを作成し、複数の品目をまとめます。在庫切れ表示ではグループ内に在庫がある品目が1つでもあればグループ全体が表示されません。
        </p>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例: トナーカートリッジ"
          className={cls.input}
        />
      </AddForm>

      <ListCard title="グループ一覧" loading={loading} emptyText="グループがありません" isEmpty={itemGroups.length === 0}>
        {itemGroups.map((g) => {
          const members = items.filter((it) => it.group_id === g.id);
          return (
            <li key={g.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className="font-medium">{g.name}</span>
                  <span className="ml-2 text-xs text-zinc-500">{members.length} 品目</span>
                </div>
                <button type="button" onClick={() => setDeleteTarget(g)} className={cls.dangerOutlineButton}>
                  削除
                </button>
              </div>
              {members.length > 0 && (
                <ul className="mt-2 space-y-0.5 pl-2">
                  {members.map((it) => (
                    <li key={it.id} className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                      <span className={it.stock <= 0 ? "text-red-500" : ""}>{it.name}</span>
                      <span className="tabular-nums text-xs">({it.stock})</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ListCard>

      {deleteTarget && (
        <ConfirmDeleteModal
          title="グループの削除"
          message={`「${deleteTarget.name}」を削除しますか？グループに属する品目のグループ設定は解除されます（品目は削除されません）。`}
          onClose={() => setDeleteTarget(null)}
          onConfirm={async () => {
            await perform(() => api.deleteItemGroup(deleteTarget.id));
            setDeleteTarget(null);
          }}
        />
      )}
    </div>
  );
}

export function StorageManager({
  storageLocations,
  loading,
  perform,
}: {
  storageLocations: StorageLocation[];
  loading: boolean;
  perform: Perform;
}) {
  const [description, setDescription] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<StorageLocation | null>(null);

  const add = async () => {
    if (await perform(() => api.createStorageLocation(description.trim()))) setDescription("");
  };

  return (
    <div className="space-y-6">
      <AddForm title="保管場所追加" disabled={!description.trim()} onSubmit={add}>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="保管場所 (自由記述)　例: 2F 倉庫 棚A-3"
          rows={2}
          className={cls.input}
        />
      </AddForm>

      <ListCard
        title="保管場所一覧"
        loading={loading}
        emptyText="保管場所がありません"
        isEmpty={storageLocations.length === 0}
      >
        {storageLocations.map((sl) => (
          <li key={sl.id} className="flex items-start justify-between gap-3 px-4 py-3">
            <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{sl.description}</span>
            <button type="button" onClick={() => setDeleteTarget(sl)} className={cls.dangerOutlineButton}>
              削除
            </button>
          </li>
        ))}
      </ListCard>

      {deleteTarget && (
        <ConfirmDeleteModal
          title="保管場所の削除"
          message={`「${deleteTarget.description}」を削除しますか？`}
          onClose={() => setDeleteTarget(null)}
          onConfirm={async () => {
            await perform(() => api.deleteStorageLocation(deleteTarget.id));
            setDeleteTarget(null);
          }}
        />
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { Layers, MapPin, Tags, Trash2 } from "lucide-react";
import { api, type Category, type Item, type ItemGroup, type StorageLocation } from "@/lib/api";
import { categoryColor } from "@/lib/inventory";
import { ConfirmDeleteModal } from "./modals";
import { AddForm, Badge, ListCard, cls } from "./ui";

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cls.dangerOutlineButton}>
      <Trash2 aria-hidden className="h-3.5 w-3.5" />
      削除
    </button>
  );
}

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
      <AddForm
        title="カテゴリ追加"
        description="色は自動で割り当てられ、在庫一覧の見出しに表示されます。"
        disabled={!name.trim()}
        onSubmit={add}
      >
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例: 食品、日用品、工具"
          className={cls.input}
        />
      </AddForm>

      <ListCard
        title="カテゴリ一覧"
        icon={Tags}
        loading={loading}
        emptyText="カテゴリがありません"
        emptyDescription="物品を登録するには、先にカテゴリを 1 つ以上作成してください。"
        isEmpty={categories.length === 0}
      >
        {categories.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="flex items-center gap-2 font-medium">
              <span aria-hidden className="h-3 w-3 rounded-full" style={{ backgroundColor: categoryColor(c.id) }} />
              {c.name}
            </span>
            <DeleteButton onClick={() => setDeleteTarget(c)} />
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
      <AddForm
        title="グループ追加"
        description="在庫切れの絞り込みでは、グループ内に在庫のある品目が 1 つでもあれば表示されません。"
        disabled={!name.trim()}
        onSubmit={add}
      >
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例: 食器用洗剤"
          className={cls.input}
        />
      </AddForm>

      <ListCard
        title="グループ一覧"
        icon={Layers}
        loading={loading}
        emptyText="グループがありません"
        emptyDescription="グループを作ったら、在庫一覧の品目から設定できます。"
        isEmpty={itemGroups.length === 0}
      >
        {itemGroups.map((g) => {
          const members = items.filter((it) => it.group_id === g.id);
          return (
            <li key={g.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Layers aria-hidden className="h-4 w-4 text-zinc-400" />
                  <span className="font-medium">{g.name}</span>
                  <Badge>{members.length} 品目</Badge>
                </div>
                <DeleteButton onClick={() => setDeleteTarget(g)} />
              </div>
              {members.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5 pl-6">
                  {members.map((it) => (
                    <li key={it.id}>
                      <Badge tone={it.stock <= 0 ? "danger" : "neutral"}>
                        {it.name}
                        <span className="tabular-nums opacity-70">{it.stock}</span>
                      </Badge>
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
      <AddForm
        title="保管場所追加"
        description="棚や部屋など、探すときにわかる書き方がおすすめです。"
        disabled={!description.trim()}
        onSubmit={add}
      >
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="例: キッチン 吊り戸棚の左"
          rows={2}
          className={cls.input}
        />
      </AddForm>

      <ListCard
        title="保管場所一覧"
        icon={MapPin}
        loading={loading}
        emptyText="保管場所がありません"
        emptyDescription="保管場所を登録すると、在庫一覧を場所ごとに表示できます。"
        isEmpty={storageLocations.length === 0}
      >
        {storageLocations.map((sl) => (
          <li key={sl.id} className="flex items-start justify-between gap-3 px-4 py-3">
            <MapPin aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
            <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{sl.description}</span>
            <DeleteButton onClick={() => setDeleteTarget(sl)} />
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

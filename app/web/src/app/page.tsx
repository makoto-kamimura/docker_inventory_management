"use client";

import { useEffect, useMemo, useState } from "react";
import {
  api,
  type Category,
  type Item,
  type ItemHistory,
} from "@/lib/api";

type Tab = "list" | "category" | "item";

export default function Home() {
  const [tab, setTab] = useState<Tab>("list");

  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newCategoryName, setNewCategoryName] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [newItemCategoryId, setNewItemCategoryId] = useState<number | "">("");
  const [newItemStock, setNewItemStock] = useState<number>(0);

  const [historyTarget, setHistoryTarget] = useState<Item | null>(null);
  const [histories, setHistories] = useState<ItemHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const reload = async () => {
    try {
      const [is, cs] = await Promise.all([
        api.listItems(),
        api.listCategories(),
      ]);
      setItems(is);
      setCategories(cs);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const itemsByCategory = useMemo(() => {
    const map = new Map<number, Item[]>();
    for (const c of categories) map.set(c.id, []);
    const orphan: Item[] = [];
    for (const it of items) {
      const bucket = map.get(it.category_id);
      if (bucket) bucket.push(it);
      else orphan.push(it);
    }
    return { map, orphan };
  }, [items, categories]);

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    try {
      await api.createCategory(name);
      setNewCategoryName("");
      await reload();
      setTab("list");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleAddItem = async () => {
    if (newItemCategoryId === "") {
      setError("カテゴリを選択してください");
      return;
    }
    const name = newItemName.trim();
    if (!name) return;
    try {
      await api.createItem({
        name,
        category_id: Number(newItemCategoryId),
        stock: Math.max(0, Math.floor(newItemStock)),
      });
      setNewItemName("");
      setNewItemStock(0);
      await reload();
      setTab("list");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDecrement = async (item: Item) => {
    try {
      await api.decrementItem(item.id);
      await reload();
      if (historyTarget?.id === item.id) {
        await openHistory(item);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const openHistory = async (item: Item) => {
    setHistoryTarget(item);
    setHistoryLoading(true);
    try {
      const hs = await api.listHistories(item.id);
      setHistories(hs);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-5xl p-6 sm:p-10 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">在庫管理</h1>
        <p className="text-sm text-zinc-500">
          Laravel API ({process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"}) 連携
        </p>
      </header>

      <nav
        role="tablist"
        className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800"
      >
        <TabButton active={tab === "list"} onClick={() => setTab("list")}>
          在庫一覧
        </TabButton>
        <TabButton active={tab === "category"} onClick={() => setTab("category")}>
          カテゴリ追加
        </TabButton>
        <TabButton active={tab === "item"} onClick={() => setTab("item")}>
          物品追加
        </TabButton>
      </nav>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <div className="flex items-start justify-between gap-4">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-red-700/70 hover:text-red-700 dark:text-red-300/70"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {tab === "list" && (
        <section className="rounded-lg border border-zinc-200 dark:border-zinc-800">
          <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <h2 className="font-semibold">在庫一覧</h2>
            <button
              type="button"
              onClick={reload}
              className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              再読み込み
            </button>
          </header>

          {loading ? (
            <p className="px-4 py-6 text-sm text-zinc-500">読み込み中...</p>
          ) : items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-zinc-500">物品がありません</p>
          ) : (
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {categories.map((c) => {
                const list = itemsByCategory.map.get(c.id) ?? [];
                return (
                  <CategoryGroup
                    key={c.id}
                    title={c.name}
                    count={list.length}
                    items={list}
                    onDecrement={handleDecrement}
                    onOpenHistory={openHistory}
                  />
                );
              })}
              {itemsByCategory.orphan.length > 0 && (
                <CategoryGroup
                  title="(カテゴリ未設定)"
                  count={itemsByCategory.orphan.length}
                  items={itemsByCategory.orphan}
                  onDecrement={handleDecrement}
                  onOpenHistory={openHistory}
                />
              )}
            </div>
          )}
        </section>
      )}

      {tab === "category" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleAddCategory();
          }}
          className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
        >
          <h2 className="font-semibold">カテゴリ追加</h2>
          <input
            type="text"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="例: 工具"
            className="w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            className="w-full rounded bg-zinc-900 px-4 py-2 text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            disabled={!newCategoryName.trim()}
          >
            追加
          </button>
        </form>
      )}

      {tab === "item" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleAddItem();
          }}
          className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
        >
          <h2 className="font-semibold">物品追加</h2>
          <input
            type="text"
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            placeholder="名前"
            className="w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <select
            value={newItemCategoryId}
            onChange={(e) =>
              setNewItemCategoryId(
                e.target.value === "" ? "" : Number(e.target.value),
              )
            }
            className="w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">カテゴリを選択</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            value={newItemStock}
            onChange={(e) => setNewItemStock(Number(e.target.value))}
            placeholder="初期在庫"
            className="w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            className="w-full rounded bg-zinc-900 px-4 py-2 text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            disabled={!newItemName.trim() || newItemCategoryId === ""}
          >
            追加
          </button>
        </form>
      )}

      {historyTarget && (
        <div
          className="fixed inset-0 z-10 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setHistoryTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">
                {historyTarget.name} の履歴
              </h3>
              <button
                type="button"
                onClick={() => setHistoryTarget(null)}
                className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                ×
              </button>
            </div>
            {historyLoading ? (
              <p className="text-sm text-zinc-500">読み込み中...</p>
            ) : histories.length === 0 ? (
              <p className="text-sm text-zinc-500">履歴がありません</p>
            ) : (
              <ul className="max-h-80 space-y-1 overflow-y-auto text-sm">
                {histories.map((h) => (
                  <li
                    key={h.id}
                    className="flex justify-between border-b border-zinc-100 py-1 dark:border-zinc-800"
                  >
                    <span className="tabular-nums">
                      {h.change > 0 ? `+${h.change}` : h.change}
                    </span>
                    <span className="text-zinc-500">
                      {new Date(h.changed_at).toLocaleString("ja-JP")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
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

function CategoryGroup({
  title,
  count,
  items,
  onDecrement,
  onOpenHistory,
}: {
  title: string;
  count: number;
  items: Item[];
  onDecrement: (item: Item) => void;
  onOpenHistory: (item: Item) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">{title}</h3>
          <span className="text-xs text-zinc-500">0 件</span>
        </div>
      </div>
    );
  }

  return (
    <details open className="group">
      <summary className="flex cursor-pointer items-center justify-between px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/40">
        <h3 className="font-medium">{title}</h3>
        <span className="text-xs text-zinc-500">{count} 件</span>
      </summary>
      <ul className="divide-y divide-zinc-100 border-t border-zinc-100 dark:divide-zinc-800 dark:border-zinc-800">
        {items.map((item) => (
          <li key={item.id} className="px-4 py-3 pl-8">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 font-medium">{item.name}</div>
              <div className="flex items-center gap-3">
                <span
                  className={
                    "min-w-12 text-right tabular-nums " +
                    (item.stock === 0
                      ? "text-red-600"
                      : "text-zinc-900 dark:text-zinc-100")
                  }
                >
                  {item.stock}
                </span>
                <button
                  type="button"
                  onClick={() => onDecrement(item)}
                  disabled={item.stock <= 0}
                  className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  −1
                </button>
                <button
                  type="button"
                  onClick={() => onOpenHistory(item)}
                  className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  履歴
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}

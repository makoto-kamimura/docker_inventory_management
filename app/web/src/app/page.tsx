"use client";

import { useEffect, useMemo, useState } from "react";
import {
  api,
  getToken,
  setUnauthorizedHandler,
  type AnalyticsGroup,
  type AnalyticsMetric,
  type AnalyticsPeriod,
  type AnalyticsTimeseries,
  type Category,
  type Item,
  type ItemGroup,
  type ItemHistory,
  type StorageLocation,
  type User,
} from "@/lib/api";

type Tab = "list" | "category" | "item" | "storage" | "group" | "analytics";

const CONTAINER = "mx-auto w-full max-w-5xl px-6 sm:px-10";

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));

    (async () => {
      if (!getToken()) {
        setChecking(false);
        return;
      }
      try {
        setUser(await api.me());
      } catch {
        setUser(null);
      } finally {
        setChecking(false);
      }
    })();

    return () => setUnauthorizedHandler(null);
  }, []);

  if (checking) {
    return (
      <main className={`${CONTAINER} py-10`}>
        <p className="text-sm text-zinc-500">読み込み中...</p>
      </main>
    );
  }

  if (!user) {
    return <LoginScreen onLoggedIn={setUser} />;
  }

  return <InventoryApp user={user} onLogout={() => setUser(null)} />;
}

function InventoryApp({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState<Tab>("list");

  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [storageLocations, setStorageLocations] = useState<StorageLocation[]>([]);
  const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newCategoryName, setNewCategoryName] = useState("");
  const [newItemName, setNewItemName] = useState("");
  const [newItemCategoryId, setNewItemCategoryId] = useState<number | "">("");
  const [newItemStock, setNewItemStock] = useState<number>(0);
  const [newItemGroupId, setNewItemGroupId] = useState<number | "">("");
  const [newItemStorageLocationId, setNewItemStorageLocationId] = useState<number | "">("");
  const [newItemAmount, setNewItemAmount] = useState<string>("");
  const [newItemExpiresAt, setNewItemExpiresAt] = useState<string>("");
  const [newStorageDescription, setNewStorageDescription] = useState("");
  const [newGroupName, setNewGroupName] = useState("");

  const [historyTarget, setHistoryTarget] = useState<Item | null>(null);
  const [histories, setHistories] = useState<ItemHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [analytics, setAnalytics] = useState<AnalyticsTimeseries | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsPeriod, setAnalyticsPeriod] = useState<AnalyticsPeriod>("daily");
  const [analyticsGroup, setAnalyticsGroup] = useState<AnalyticsGroup>("total");
  const [analyticsMetric, setAnalyticsMetric] = useState<AnalyticsMetric>("stock");

  const [barcodeEditTarget, setBarcodeEditTarget] = useState<Item | null>(null);
  const [categoryEditTarget, setCategoryEditTarget] = useState<Item | null>(null);
  const [nameEditTarget, setNameEditTarget] = useState<Item | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null);
  const [groupEditTarget, setGroupEditTarget] = useState<Item | null>(null);
  const [storageEditTarget, setStorageEditTarget] = useState<Item | null>(null);
  const [amountTarget, setAmountTarget] = useState<Item | null>(null);

  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<Category | null>(null);
  const [deleteStorageTarget, setDeleteStorageTarget] = useState<StorageLocation | null>(null);
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<ItemGroup | null>(null);

  const [listFilter, setListFilter] = useState<"all" | "out_of_stock" | "expires_soon">("all");

  const reload = async () => {
    try {
      const [is, cs, sl, gs] = await Promise.all([
        api.listItems(),
        api.listCategories(),
        api.listStorageLocations(),
        api.listItemGroups(),
      ]);
      setItems(is);
      setCategories(cs);
      setStorageLocations(sl);
      setItemGroups(gs);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // トークンはローカルでクリア済。失敗しても画面は閉じる。
    } finally {
      onLogout();
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const loadAnalytics = async (
    period: AnalyticsPeriod = analyticsPeriod,
    group: AnalyticsGroup = analyticsGroup,
    metric: AnalyticsMetric = analyticsMetric,
  ) => {
    setAnalyticsLoading(true);
    try {
      const data = await api.listAnalyticsTimeseries(period, group, metric);
      setAnalytics(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const openAnalytics = () => {
    setTab("analytics");
    void loadAnalytics(analyticsPeriod, analyticsGroup, analyticsMetric);
  };

  const handleChangePeriod = (next: AnalyticsPeriod) => {
    setAnalyticsPeriod(next);
    void loadAnalytics(next, analyticsGroup, analyticsMetric);
  };

  const handleChangeGroup = (next: AnalyticsGroup) => {
    setAnalyticsGroup(next);
    void loadAnalytics(analyticsPeriod, next, analyticsMetric);
  };

  const handleChangeMetric = (next: AnalyticsMetric) => {
    setAnalyticsMetric(next);
    void loadAnalytics(analyticsPeriod, analyticsGroup, next);
  };

  const itemsByCategory = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let filtered: Item[];
    if (listFilter === "out_of_stock") {
      const groupedItems = items.filter((it) => it.group_id != null);
      const stockByGroup = new Map<number, boolean>();
      for (const it of groupedItems) {
        const gid = it.group_id!;
        if (!stockByGroup.has(gid)) stockByGroup.set(gid, false);
        if (it.stock > 0) stockByGroup.set(gid, true);
      }
      filtered = items.filter((it) => {
        if (it.group_id != null) return !stockByGroup.get(it.group_id);
        return it.stock <= 0;
      });
    } else if (listFilter === "expires_soon") {
      const soon = new Date(today);
      soon.setDate(today.getDate() + 30);
      filtered = items.filter((it) => {
        if (!it.nearest_expires_at) return false;
        return new Date(it.nearest_expires_at) <= soon;
      });
    } else {
      filtered = items;
    }

    const map = new Map<number, Item[]>();
    for (const c of categories) map.set(c.id, []);
    const orphan: Item[] = [];
    for (const it of filtered) {
      const bucket = map.get(it.category_id);
      if (bucket) bucket.push(it);
      else orphan.push(it);
    }
    return { map, orphan };
  }, [items, categories, listFilter]);

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

  const handleDeleteCategory = async (category: Category) => {
    try {
      await api.deleteCategory(category.id);
      setDeleteCategoryTarget(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDeleteCategoryTarget(null);
    }
  };

  const handleAddItem = async () => {
    if (newItemCategoryId === "") {
      setError("カテゴリを選択してください");
      return;
    }
    const name = newItemName.trim();
    if (!name) return;
    const stock = Math.max(0, Math.floor(newItemStock));
    const parsedAmount = newItemAmount.trim() === "" ? null : Math.floor(Number(newItemAmount));
    try {
      await api.createItem({
        name,
        category_id: Number(newItemCategoryId),
        stock,
        group_id: newItemGroupId === "" ? null : Number(newItemGroupId),
        storage_location_id: newItemStorageLocationId === "" ? null : Number(newItemStorageLocationId),
        amount: stock > 0 ? (parsedAmount ?? null) : null,
        expires_at: stock > 0 && newItemExpiresAt.trim() ? newItemExpiresAt.trim() : null,
      });
      setNewItemName("");
      setNewItemStock(0);
      setNewItemGroupId("");
      setNewItemStorageLocationId("");
      setNewItemAmount("");
      setNewItemExpiresAt("");
      await reload();
      setTab("list");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleAddStorage = async () => {
    const description = newStorageDescription.trim();
    if (!description) return;
    try {
      await api.createStorageLocation(description);
      setNewStorageDescription("");
      await reload();
      setTab("storage");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDeleteStorage = async (sl: StorageLocation) => {
    try {
      await api.deleteStorageLocation(sl.id);
      setDeleteStorageTarget(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDeleteStorageTarget(null);
    }
  };

  const handleAddGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    try {
      await api.createItemGroup(name);
      setNewGroupName("");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDeleteGroup = async (group: ItemGroup) => {
    try {
      await api.deleteItemGroup(group.id);
      setDeleteGroupTarget(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDeleteGroupTarget(null);
    }
  };

  const handleDecrement = async (item: Item) => {
    try {
      await api.decrementItem(item.id);
      await reload();
      if (historyTarget?.id === item.id) await openHistory(item);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const doIncrement = async (item: Item, amount: number | null, expiresAt: string | null = null) => {
    try {
      await api.incrementItem(item.id, amount, expiresAt);
      await reload();
      if (historyTarget?.id === item.id) await openHistory(item);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleIncrement = (item: Item) => {
    if (item.stock <= 0) {
      setAmountTarget(item);
      return;
    }
    void doIncrement(item, null);
  };

  const handleConfirmAmount = async (item: Item, amount: number | null, expiresAt: string | null) => {
    setAmountTarget(null);
    await doIncrement(item, amount, expiresAt);
  };

  const handleSaveBarcode = async (item: Item, barcode: string | null) => {
    try {
      await api.setItemBarcode(item.id, barcode);
      setBarcodeEditTarget(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleSaveName = async (item: Item, name: string) => {
    try {
      await api.setItemName(item.id, name);
      setNameEditTarget(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDeleteItem = async (item: Item) => {
    try {
      await api.deleteItem(item.id);
      setDeleteTarget(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleSaveCategory = async (item: Item, categoryId: number) => {
    try {
      await api.setItemCategory(item.id, categoryId);
      setCategoryEditTarget(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleSaveGroup = async (item: Item, groupId: number | null) => {
    try {
      await api.setItemGroup(item.id, groupId);
      setGroupEditTarget(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleSaveStorageLocation = async (item: Item, storageLocationId: number | null) => {
    try {
      await api.setItemStorageLocation(item.id, storageLocationId);
      setStorageEditTarget(null);
      await reload();
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

  const addButtonDisabled =
    tab === "category" ? !newCategoryName.trim() :
    tab === "item" ? (!newItemName.trim() || newItemCategoryId === "") :
    tab === "storage" ? !newStorageDescription.trim() :
    tab === "group" ? !newGroupName.trim() :
    true;

  return (
    <main className={`${CONTAINER} py-6 sm:py-10 space-y-6 pb-24`}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">在庫管理</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-zinc-500">{user.name}</span>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded border border-zinc-300 px-3 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            ログアウト
          </button>
        </div>
      </header>

      <nav
        role="tablist"
        className="flex flex-wrap gap-1 border-b border-zinc-200 dark:border-zinc-800"
      >
        <TabButton active={tab === "list"} onClick={() => setTab("list")}>在庫一覧</TabButton>
        <TabButton active={tab === "item"} onClick={() => setTab("item")}>物品追加</TabButton>
        <TabButton active={tab === "category"} onClick={() => setTab("category")}>カテゴリ管理</TabButton>
        <TabButton active={tab === "group"} onClick={() => setTab("group")}>グループ管理</TabButton>
        <TabButton active={tab === "storage"} onClick={() => setTab("storage")}>保管場所管理</TabButton>
        <TabButton active={tab === "analytics"} onClick={openAnalytics}>分析</TabButton>
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

      {/* 在庫一覧 */}
      {tab === "list" && (
        <section className="rounded-lg border border-zinc-200 dark:border-zinc-800">
          <header className="flex flex-col gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-semibold">在庫一覧</h2>
            <div className="flex items-center gap-2 overflow-x-auto">
              <SegControl<"all" | "out_of_stock" | "expires_soon">
                value={listFilter}
                onChange={setListFilter}
                options={[
                  { value: "all", label: "すべて" },
                  { value: "out_of_stock", label: "在庫切れ" },
                  { value: "expires_soon", label: "期限 1ヶ月以内" },
                ]}
              />
              <button
                type="button"
                onClick={reload}
                aria-label="再読み込み"
                title="再読み込み"
                className="grid h-8 w-8 place-items-center rounded text-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                ↻
              </button>
            </div>
          </header>

          {loading ? (
            <p className="px-4 py-6 text-sm text-zinc-500">読み込み中...</p>
          ) : items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-zinc-500">物品がありません</p>
          ) : (() => {
            const visibleCategories = categories.filter(
              (c) =>
                listFilter === "all" ||
                (itemsByCategory.map.get(c.id)?.length ?? 0) > 0,
            );
            const hasAny = visibleCategories.length > 0 || itemsByCategory.orphan.length > 0;
            if (!hasAny) {
              const emptyMsg =
                listFilter === "out_of_stock" ? "在庫切れの物品はありません" :
                listFilter === "expires_soon" ? "期限が1ヶ月以内の物品はありません" :
                "物品がありません";
              return <p className="px-4 py-6 text-sm text-zinc-500">{emptyMsg}</p>;
            }
            const showAvgAmount = listFilter === "out_of_stock";
            const showExpiresAt = listFilter === "expires_soon";
            return (
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {visibleCategories.map((c) => {
                  const list = itemsByCategory.map.get(c.id) ?? [];
                  return (
                    <CategoryGroup
                      key={c.id}
                      title={c.name}
                      count={list.length}
                      items={list}
                      itemGroups={itemGroups}
                      showAvgAmount={showAvgAmount}
                      showExpiresAt={showExpiresAt}
                      onIncrement={handleIncrement}
                      onDecrement={handleDecrement}
                      onOpenHistory={openHistory}
                      onEditBarcode={setBarcodeEditTarget}
                      onMoveCategory={setCategoryEditTarget}
                      onEditName={setNameEditTarget}
                      onEditGroup={setGroupEditTarget}
                      onEditStorageLocation={setStorageEditTarget}
                      onDelete={setDeleteTarget}
                    />
                  );
                })}
                {itemsByCategory.orphan.length > 0 && (
                  <CategoryGroup
                    title="(カテゴリ未設定)"
                    count={itemsByCategory.orphan.length}
                    items={itemsByCategory.orphan}
                    itemGroups={itemGroups}
                    showAvgAmount={showAvgAmount}
                    showExpiresAt={showExpiresAt}
                    onIncrement={handleIncrement}
                    onDecrement={handleDecrement}
                    onOpenHistory={openHistory}
                    onEditBarcode={setBarcodeEditTarget}
                    onMoveCategory={setCategoryEditTarget}
                    onEditName={setNameEditTarget}
                    onEditGroup={setGroupEditTarget}
                    onEditStorageLocation={setStorageEditTarget}
                    onDelete={setDeleteTarget}
                  />
                )}
              </div>
            );
          })()}
        </section>
      )}

      {/* カテゴリ管理 */}
      {tab === "category" && (
        <div className="space-y-6">
          <form
            id="add-form"
            onSubmit={(e) => { e.preventDefault(); void handleAddCategory(); }}
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
          </form>

          <section className="rounded-lg border border-zinc-200 dark:border-zinc-800">
            <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <h2 className="font-semibold">カテゴリ一覧</h2>
            </header>
            {loading ? (
              <p className="px-4 py-6 text-sm text-zinc-500">読み込み中...</p>
            ) : categories.length === 0 ? (
              <p className="px-4 py-6 text-sm text-zinc-500">カテゴリがありません</p>
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {categories.map((c) => {
                  return (
                    <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <span className="font-medium">{c.name}</span>
                      <button
                        type="button"
                        onClick={() => setDeleteCategoryTarget(c)}
                        className="shrink-0 rounded border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                      >
                        削除
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* 物品追加 */}
      {tab === "item" && (
        <form
          id="add-form"
          onSubmit={(e) => { e.preventDefault(); void handleAddItem(); }}
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
              setNewItemCategoryId(e.target.value === "" ? "" : Number(e.target.value))
            }
            className="w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">カテゴリを選択</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
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
          {newItemStock > 0 && (
            <>
              <div className="flex items-center gap-2">
                <span className="shrink-0 text-sm text-zinc-500">¥</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={newItemAmount}
                  onChange={(e) => setNewItemAmount(e.target.value)}
                  placeholder="単価 (任意)"
                  className="w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-zinc-600 dark:text-zinc-400">期限 (任意)</label>
                <input
                  type="date"
                  value={newItemExpiresAt}
                  onChange={(e) => setNewItemExpiresAt(e.target.value)}
                  className="w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
                />
              </div>
            </>
          )}
          <select
            value={newItemGroupId}
            onChange={(e) =>
              setNewItemGroupId(e.target.value === "" ? "" : Number(e.target.value))
            }
            className="w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">グループなし (任意)</option>
            {itemGroups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <select
            value={newItemStorageLocationId}
            onChange={(e) =>
              setNewItemStorageLocationId(e.target.value === "" ? "" : Number(e.target.value))
            }
            className="w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">保管場所なし (任意)</option>
            {storageLocations.map((sl) => (
              <option key={sl.id} value={sl.id}>{sl.description}</option>
            ))}
          </select>
        </form>
      )}

      {/* 保管場所管理 */}
      {tab === "storage" && (
        <div className="space-y-6">
          <form
            id="add-form"
            onSubmit={(e) => { e.preventDefault(); void handleAddStorage(); }}
            className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
          >
            <h2 className="font-semibold">保管場所追加</h2>
            <textarea
              value={newStorageDescription}
              onChange={(e) => setNewStorageDescription(e.target.value)}
              placeholder="保管場所 (自由記述)　例: 2F 倉庫 棚A-3"
              rows={2}
              className="w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </form>

          <section className="rounded-lg border border-zinc-200 dark:border-zinc-800">
            <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <h2 className="font-semibold">保管場所一覧</h2>
            </header>
            {loading ? (
              <p className="px-4 py-6 text-sm text-zinc-500">読み込み中...</p>
            ) : storageLocations.length === 0 ? (
              <p className="px-4 py-6 text-sm text-zinc-500">保管場所がありません</p>
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {storageLocations.map((sl) => (
                  <li key={sl.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{sl.description}</span>
                    <button
                      type="button"
                      onClick={() => setDeleteStorageTarget(sl)}
                      className="shrink-0 rounded border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                    >
                      削除
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* グループ管理 */}
      {tab === "group" && (
        <div className="space-y-6">
          <form
            id="add-form"
            onSubmit={(e) => { e.preventDefault(); void handleAddGroup(); }}
            className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
          >
            <h2 className="font-semibold">グループ追加</h2>
            <p className="text-sm text-zinc-500">
              グループを作成し、複数の品目をまとめます。在庫切れ表示ではグループ内に在庫がある品目が1つでもあればグループ全体が表示されません。
            </p>
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="例: トナーカートリッジ"
              className="w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </form>

          <section className="rounded-lg border border-zinc-200 dark:border-zinc-800">
            <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <h2 className="font-semibold">グループ一覧</h2>
            </header>
            {loading ? (
              <p className="px-4 py-6 text-sm text-zinc-500">読み込み中...</p>
            ) : itemGroups.length === 0 ? (
              <p className="px-4 py-6 text-sm text-zinc-500">グループがありません</p>
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {itemGroups.map((g) => {
                  const members = items.filter((it) => it.group_id === g.id);
                  return (
                    <li key={g.id} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <span className="font-medium">{g.name}</span>
                          <span className="ml-2 text-xs text-zinc-500">{members.length} 品目</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setDeleteGroupTarget(g)}
                          className="rounded border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                        >
                          削除
                        </button>
                      </div>
                      {members.length > 0 && (
                        <ul className="mt-2 space-y-0.5 pl-2">
                          {members.map((it) => (
                            <li key={it.id} className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                              <span
                                className={it.stock <= 0 ? "text-red-500" : ""}
                              >
                                {it.name}
                              </span>
                              <span className="tabular-nums text-xs">
                                ({it.stock})
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* 分析 */}
      {tab === "analytics" && (
        <section className="rounded-lg border border-zinc-200 dark:border-zinc-800">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
            <h2 className="font-semibold">
              {analyticsMetric === "amount" ? "補充金額の推移" : "在庫数の推移"}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <SegControl<AnalyticsMetric>
                value={analyticsMetric}
                onChange={handleChangeMetric}
                options={[
                  { value: "stock", label: "在庫数" },
                  { value: "amount", label: "金額" },
                ]}
              />
              <SegControl<AnalyticsPeriod>
                value={analyticsPeriod}
                onChange={handleChangePeriod}
                options={[
                  { value: "daily", label: "日毎" },
                  { value: "monthly", label: "月毎" },
                ]}
              />
              <SegControl<AnalyticsGroup>
                value={analyticsGroup}
                onChange={handleChangeGroup}
                options={[
                  { value: "total", label: "総合計" },
                  { value: "category", label: "カテゴリ別" },
                ]}
              />
              <button
                type="button"
                onClick={() => void loadAnalytics()}
                aria-label="再読み込み"
                title="再読み込み"
                className="grid h-8 w-8 place-items-center rounded text-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                ↻
              </button>
            </div>
          </header>
          {analyticsLoading ? (
            <p className="px-4 py-6 text-sm text-zinc-500">読み込み中...</p>
          ) : !analytics || analytics.series.length === 0 ? (
            <p className="px-4 py-6 text-sm text-zinc-500">履歴がありません</p>
          ) : (
            <AnalyticsLineChart
              data={analytics}
              period={analyticsPeriod}
              metric={analyticsMetric}
            />
          )}
        </section>
      )}

      {/* モーダル群 */}
      {nameEditTarget && (
        <NameEditModal
          item={nameEditTarget}
          onClose={() => setNameEditTarget(null)}
          onSave={handleSaveName}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          item={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDeleteItem}
        />
      )}

      {barcodeEditTarget && (
        <BarcodeEditModal
          item={barcodeEditTarget}
          onClose={() => setBarcodeEditTarget(null)}
          onSave={handleSaveBarcode}
        />
      )}

      {categoryEditTarget && (
        <CategoryEditModal
          item={categoryEditTarget}
          categories={categories}
          onClose={() => setCategoryEditTarget(null)}
          onSave={handleSaveCategory}
        />
      )}

      {groupEditTarget && (
        <GroupEditModal
          item={groupEditTarget}
          itemGroups={itemGroups}
          onClose={() => setGroupEditTarget(null)}
          onSave={handleSaveGroup}
        />
      )}

      {storageEditTarget && (
        <StorageLocationEditModal
          item={storageEditTarget}
          storageLocations={storageLocations}
          onClose={() => setStorageEditTarget(null)}
          onSave={handleSaveStorageLocation}
        />
      )}

      {amountTarget && (
        <AmountModal
          item={amountTarget}
          onClose={() => setAmountTarget(null)}
          onConfirm={handleConfirmAmount}
        />
      )}

      {deleteCategoryTarget && (
        <SimpleDeleteModal
          title="カテゴリの削除"
          description={`「${deleteCategoryTarget.name}」を削除しますか？物品が登録されている場合は削除できません。`}
          onClose={() => setDeleteCategoryTarget(null)}
          onConfirm={() => handleDeleteCategory(deleteCategoryTarget)}
        />
      )}

      {deleteStorageTarget && (
        <SimpleDeleteModal
          title="保管場所の削除"
          description={`「${deleteStorageTarget.description}」を削除しますか？`}
          onClose={() => setDeleteStorageTarget(null)}
          onConfirm={() => handleDeleteStorage(deleteStorageTarget)}
        />
      )}

      {deleteGroupTarget && (
        <SimpleDeleteModal
          title="グループの削除"
          description={`「${deleteGroupTarget.name}」を削除しますか？グループに属する品目のグループ設定は解除されます（品目は削除されません）。`}
          onClose={() => setDeleteGroupTarget(null)}
          onConfirm={() => handleDeleteGroup(deleteGroupTarget)}
        />
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
              <h3 className="font-semibold">{historyTarget.name} の履歴</h3>
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
                    className="flex items-center justify-between gap-3 border-b border-zinc-100 py-1.5 dark:border-zinc-800"
                  >
                    <span className="flex flex-col gap-0.5">
                      <span className="flex items-baseline gap-2">
                        <span className="tabular-nums">
                          {h.change > 0 ? `+${h.change}` : h.change}
                        </span>
                        {h.amount != null && (
                          <span className="text-xs text-emerald-600 tabular-nums dark:text-emerald-400">
                            ¥{h.amount.toLocaleString("ja-JP")}
                          </span>
                        )}
                      </span>
                      {h.expires_at != null && (
                        <span className="text-xs text-amber-600 dark:text-amber-400">
                          期限 {h.expires_at}
                        </span>
                      )}
                    </span>
                    <span className="flex flex-col items-end text-right leading-tight">
                      <span className="text-zinc-500">
                        {new Date(h.changed_at).toLocaleString("ja-JP")}
                      </span>
                      <span className="text-xs text-zinc-400">
                        {h.user?.name ?? "不明"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      {/* 固定フッター: 追加ボタン */}
      {(tab === "category" || tab === "item" || tab === "storage" || tab === "group") && (
        <div className="fixed bottom-0 inset-x-0 z-10 border-t border-zinc-200 bg-white/95 py-3 px-4 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/95 sm:px-10">
          <div className="mx-auto w-full max-w-5xl">
            <button
              type="submit"
              form="add-form"
              disabled={addButtonDisabled}
              className="w-full rounded bg-zinc-900 px-4 py-2.5 text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              追加
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function LoginScreen({ onLoggedIn }: { onLoggedIn: (user: User) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const user = await api.login(email.trim(), password);
      onLoggedIn(user);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6">
      <form
        onSubmit={(e) => { e.preventDefault(); void submit(); }}
        className="space-y-4 rounded-lg border border-zinc-200 p-6 dark:border-zinc-800"
      >
        <h1 className="text-xl font-bold">在庫管理 ログイン</h1>
        {error && (
          <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}
        <div className="space-y-1">
          <label className="text-sm text-zinc-600 dark:text-zinc-300">メールアドレス</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            className="w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-zinc-600 dark:text-zinc-300">パスワード</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <button
          type="submit"
          disabled={submitting || !email.trim() || !password}
          className="w-full rounded bg-zinc-900 px-4 py-2 text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {submitting ? "ログイン中..." : "ログイン"}
        </button>
      </form>
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
  itemGroups,
  showAvgAmount = false,
  showExpiresAt = false,
  onIncrement,
  onDecrement,
  onOpenHistory,
  onEditBarcode,
  onMoveCategory,
  onEditName,
  onEditGroup,
  onEditStorageLocation,
  onDelete,
}: {
  title: string;
  count: number;
  items: Item[];
  itemGroups: ItemGroup[];
  showAvgAmount?: boolean;
  showExpiresAt?: boolean;
  onIncrement: (item: Item) => void;
  onDecrement: (item: Item) => void;
  onOpenHistory: (item: Item) => void;
  onEditBarcode: (item: Item) => void;
  onMoveCategory: (item: Item) => void;
  onEditName: (item: Item) => void;
  onEditGroup: (item: Item) => void;
  onEditStorageLocation: (item: Item) => void;
  onDelete: (item: Item) => void;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

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
        {items.map((item) => {
          const groupName = item.group?.name ?? null;
          const storageDesc = item.storage_location?.description ?? null;
          return (
            <li key={item.id} className="px-4 py-3 pl-8">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="font-medium break-words">{item.name}</span>
                    <button
                      type="button"
                      onClick={() => onEditName(item)}
                      aria-label="名前を編集"
                      title="名前を編集"
                      className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    >
                      ✎
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => onEditBarcode(item)}
                    className="mt-0.5 inline-flex items-center gap-1 text-left text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                    title="バーコードを編集"
                  >
                    <span aria-hidden>▮▮▮</span>
                    {item.barcode ? (
                      <span className="tabular-nums">{item.barcode}</span>
                    ) : (
                      <span className="italic text-zinc-400">未設定</span>
                    )}
                    <span aria-hidden className="text-zinc-400">✎</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onEditGroup(item)}
                    className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                    title="グループを編集"
                  >
                    <span aria-hidden>⊞</span>
                    {groupName ? (
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        {groupName}
                      </span>
                    ) : (
                      <span className="italic text-zinc-400">グループ未設定</span>
                    )}
                    <span aria-hidden className="text-zinc-400">✎</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onEditStorageLocation(item)}
                    className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                    title="保管場所を編集"
                  >
                    <span aria-hidden>📍</span>
                    {storageDesc ? (
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        {storageDesc}
                      </span>
                    ) : (
                      <span className="italic text-zinc-400">保管場所未設定</span>
                    )}
                    <span aria-hidden className="text-zinc-400">✎</span>
                  </button>
                  {showAvgAmount &&
                    item.avg_amount != null &&
                    Number(item.avg_amount) > 0 && (
                      <div className="mt-0.5 text-xs tabular-nums text-emerald-600 dark:text-emerald-400">
                        平均単価 ¥
                        {Math.round(Number(item.avg_amount)).toLocaleString("ja-JP")}
                      </div>
                    )}
                  {showExpiresAt && item.nearest_expires_at != null && (
                    <div
                      className={
                        "mt-0.5 text-xs tabular-nums " +
                        (new Date(item.nearest_expires_at) < today
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
                      (item.stock === 0
                        ? "text-red-600"
                        : "text-zinc-900 dark:text-zinc-100")
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
                    onClick={() => onMoveCategory(item)}
                    aria-label="カテゴリを変更"
                    title="カテゴリを変更"
                    className="ml-1 rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    移動
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenHistory(item)}
                    className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    履歴
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(item)}
                    aria-label="削除"
                    title="削除"
                    className="rounded border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                  >
                    削除
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function BarcodeEditModal({
  item,
  onClose,
  onSave,
}: {
  item: Item;
  onClose: () => void;
  onSave: (item: Item, barcode: string | null) => Promise<void>;
}) {
  const [value, setValue] = useState(item.barcode ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async (next: string | null) => {
    setSaving(true);
    try {
      await onSave(item, next);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md space-y-4 rounded-lg bg-white p-5 shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{item.name} のバーコード</h3>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">×</button>
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="例: 4901234567890"
          maxLength={64}
          className="w-full rounded border border-zinc-300 px-3 py-2 font-mono tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
          autoFocus
        />
        <div className="flex flex-wrap justify-end gap-2">
          {item.barcode && (
            <button
              type="button"
              disabled={saving}
              onClick={() => submit(null)}
              className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-40 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
            >
              解除
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            キャンセル
          </button>
          <button
            type="button"
            disabled={saving || value.trim() === (item.barcode ?? "")}
            onClick={() => submit(value.trim() === "" ? null : value.trim())}
            className="rounded bg-zinc-900 px-4 py-1.5 text-sm text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function CategoryEditModal({
  item,
  categories,
  onClose,
  onSave,
}: {
  item: Item;
  categories: Category[];
  onClose: () => void;
  onSave: (item: Item, categoryId: number) => Promise<void>;
}) {
  const [value, setValue] = useState<number | "">(item.category_id);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (value === "") return;
    setSaving(true);
    try {
      await onSave(item, Number(value));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md space-y-4 rounded-lg bg-white p-5 shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{item.name} のカテゴリ変更</h3>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">×</button>
        </div>
        <select
          value={value}
          onChange={(e) => setValue(e.target.value === "" ? "" : Number(e.target.value))}
          className="w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          autoFocus
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            キャンセル
          </button>
          <button
            type="button"
            disabled={saving || value === "" || value === item.category_id}
            onClick={() => void submit()}
            className="rounded bg-zinc-900 px-4 py-1.5 text-sm text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function GroupEditModal({
  item,
  itemGroups,
  onClose,
  onSave,
}: {
  item: Item;
  itemGroups: ItemGroup[];
  onClose: () => void;
  onSave: (item: Item, groupId: number | null) => Promise<void>;
}) {
  const [value, setValue] = useState<number | "">(item.group_id ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await onSave(item, value === "" ? null : Number(value));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md space-y-4 rounded-lg bg-white p-5 shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{item.name} のグループ設定</h3>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">×</button>
        </div>
        <select
          value={value}
          onChange={(e) => setValue(e.target.value === "" ? "" : Number(e.target.value))}
          className="w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          autoFocus
        >
          <option value="">グループなし</option>
          {itemGroups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            キャンセル
          </button>
          <button
            type="button"
            disabled={saving || (value === "" ? null : Number(value)) === (item.group_id ?? null)}
            onClick={() => void submit()}
            className="rounded bg-zinc-900 px-4 py-1.5 text-sm text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function StorageLocationEditModal({
  item,
  storageLocations,
  onClose,
  onSave,
}: {
  item: Item;
  storageLocations: StorageLocation[];
  onClose: () => void;
  onSave: (item: Item, storageLocationId: number | null) => Promise<void>;
}) {
  const [value, setValue] = useState<number | "">(item.storage_location_id ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await onSave(item, value === "" ? null : Number(value));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md space-y-4 rounded-lg bg-white p-5 shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{item.name} の保管場所</h3>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">×</button>
        </div>
        <select
          value={value}
          onChange={(e) => setValue(e.target.value === "" ? "" : Number(e.target.value))}
          className="w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          autoFocus
        >
          <option value="">保管場所なし</option>
          {storageLocations.map((sl) => (
            <option key={sl.id} value={sl.id}>{sl.description}</option>
          ))}
        </select>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            キャンセル
          </button>
          <button
            type="button"
            disabled={saving || (value === "" ? null : Number(value)) === (item.storage_location_id ?? null)}
            onClick={() => void submit()}
            className="rounded bg-zinc-900 px-4 py-1.5 text-sm text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function NameEditModal({
  item,
  onClose,
  onSave,
}: {
  item: Item;
  onClose: () => void;
  onSave: (item: Item, name: string) => Promise<void>;
}) {
  const [value, setValue] = useState(item.name);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await onSave(item, trimmed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md space-y-4 rounded-lg bg-white p-5 shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">品目名の編集</h3>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">×</button>
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={255}
          className="w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            キャンセル
          </button>
          <button
            type="button"
            disabled={saving || !value.trim() || value.trim() === item.name}
            onClick={() => void submit()}
            className="rounded bg-zinc-900 px-4 py-1.5 text-sm text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirmModal({
  item,
  onClose,
  onConfirm,
}: {
  item: Item;
  onClose: () => void;
  onConfirm: (item: Item) => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);

  const submit = async () => {
    setDeleting(true);
    try {
      await onConfirm(item);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md space-y-4 rounded-lg bg-white p-5 shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">品目の削除</h3>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">×</button>
        </div>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          <span className="font-medium">{item.name}</span> を削除しますか？この操作は元に戻せません。
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            キャンセル
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={() => void submit()}
            className="rounded border border-red-300 bg-red-600 px-4 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-40"
          >
            削除する
          </button>
        </div>
      </div>
    </div>
  );
}

function SimpleDeleteModal({
  title,
  description,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);

  const submit = async () => {
    setDeleting(true);
    try {
      await onConfirm();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md space-y-4 rounded-lg bg-white p-5 shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{title}</h3>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">×</button>
        </div>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">{description}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            キャンセル
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={() => void submit()}
            className="rounded border border-red-300 bg-red-600 px-4 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-40"
          >
            削除する
          </button>
        </div>
      </div>
    </div>
  );
}

function AmountModal({
  item,
  onClose,
  onConfirm,
}: {
  item: Item;
  onClose: () => void;
  onConfirm: (item: Item, amount: number | null, expiresAt: string | null) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (amount: number | null) => {
    setSaving(true);
    try {
      await onConfirm(item, amount, expiresAt.trim() !== "" ? expiresAt.trim() : null);
    } finally {
      setSaving(false);
    }
  };

  const parsed = value.trim() === "" ? null : Math.floor(Number(value));
  const invalid = parsed != null && (!Number.isFinite(parsed) || parsed < 0);

  return (
    <div
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md space-y-4 rounded-lg bg-white p-5 shadow-xl dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">{item.name} の補充 (+1)</h3>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">×</button>
        </div>
        <p className="text-sm text-zinc-500">
          在庫切れからの補充です。金額と期限を入力してください（どちらも任意）。
        </p>
        <div className="flex items-center gap-2">
          <span className="text-zinc-500">¥</span>
          <input
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="例: 1200"
            className="w-full rounded border border-zinc-300 px-3 py-2 tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
            autoFocus
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-zinc-600 dark:text-zinc-400">期限 (任意)</label>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => submit(null)}
            disabled={saving}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            金額なしで +1
          </button>
          <button
            type="button"
            onClick={() => submit(parsed)}
            disabled={saving || invalid}
            className="rounded bg-zinc-900 px-4 py-1.5 text-sm text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            +1 して記録
          </button>
        </div>
      </div>
    </div>
  );
}

function SegControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (next: T) => void;
  options: Array<{ value: T; label: string }>;
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

const SERIES_COLORS = [
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

function AnalyticsLineChart({
  data,
  period,
  metric,
}: {
  data: AnalyticsTimeseries;
  period: AnalyticsPeriod;
  metric: AnalyticsMetric;
}) {
  const { labels, series } = data;

  const fmt = (v: number) =>
    metric === "amount" ? `¥${v.toLocaleString("ja-JP")}` : String(v);

  const [yMin, yMax] = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const s of series) {
      for (const v of s.values) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1] as const;
    if (min === max) return [min - 1, max + 1] as const;
    const pad = (max - min) * 0.1;
    return [Math.floor(min - pad), Math.ceil(max + pad)] as const;
  }, [series]);

  const width = 1000;
  const height = 360;
  const padL = metric === "amount" ? 72 : 48;
  const padR = 16;
  const padT = 16;
  const padB = 40;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const n = labels.length;

  const xAt = (i: number) =>
    n === 1 ? padL + plotW / 2 : padL + (i * plotW) / (n - 1);
  const yAt = (v: number) =>
    padT + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;

  const yTicks = useMemo(() => {
    const tickCount = 5;
    const step = (yMax - yMin) / tickCount;
    return Array.from({ length: tickCount + 1 }, (_, i) => Math.round(yMin + step * i));
  }, [yMin, yMax]);

  const xTickStride = Math.max(1, Math.ceil(n / 8));

  return (
    <div className="px-4 py-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block h-auto w-full"
        role="img"
        aria-label="在庫数の推移"
      >
        {yTicks.map((t) => {
          const y = yAt(t);
          return (
            <g key={`y-${t}`}>
              <line x1={padL} y1={y} x2={width - padR} y2={y} className="stroke-zinc-200 dark:stroke-zinc-800" strokeWidth={1} />
              <text x={padL - 6} y={y} textAnchor="end" dominantBaseline="central" className="fill-zinc-500 text-[10px]">
                {fmt(t)}
              </text>
            </g>
          );
        })}

        {labels.map((label, i) => {
          if (i % xTickStride !== 0 && i !== n - 1) return null;
          return (
            <text key={`x-${label}`} x={xAt(i)} y={height - padB + 16} textAnchor="middle" className="fill-zinc-500 text-[10px]">
              {formatBucketLabel(label, period)}
            </text>
          );
        })}

        <line x1={padL} y1={padT} x2={padL} y2={height - padB} className="stroke-zinc-300 dark:stroke-zinc-700" strokeWidth={1} />
        <line x1={padL} y1={height - padB} x2={width - padR} y2={height - padB} className="stroke-zinc-300 dark:stroke-zinc-700" strokeWidth={1} />

        {series.map((s, si) => {
          const color = SERIES_COLORS[si % SERIES_COLORS.length];
          const pathD = s.values.map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(v)}`).join(" ");
          return (
            <g key={`s-${s.name}`}>
              <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {s.values.map((v, i) => (
                <circle key={`p-${s.name}-${i}`} cx={xAt(i)} cy={yAt(v)} r={2.5} fill={color}>
                  <title>{`${s.name} / ${formatBucketLabel(labels[i], period)}: ${fmt(v)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>

      {series.length > 1 && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {series.map((s, si) => (
            <li key={s.name} className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SERIES_COLORS[si % SERIES_COLORS.length] }} />
              <span className="text-zinc-700 dark:text-zinc-200">{s.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatBucketLabel(label: string, period: AnalyticsPeriod) {
  if (period === "daily") {
    const parts = label.split("-");
    if (parts.length !== 3) return label;
    return `${Number(parts[1])}/${Number(parts[2])}`;
  }
  const parts = label.split("-");
  if (parts.length !== 2) return label;
  return `${parts[0].slice(2)}/${Number(parts[1])}`;
}

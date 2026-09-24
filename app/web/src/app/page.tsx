"use client";

import { useCallback, useEffect, useState } from "react";
import { AnalyticsPanel } from "@/components/AnalyticsPanel";
import { InventoryList, type ItemAction } from "@/components/InventoryList";
import { ItemForm } from "@/components/ItemForm";
import { LoginScreen } from "@/components/LoginScreen";
import {
  CategoryManager,
  GroupManager,
  StorageManager,
  type Perform,
} from "@/components/ManageTabs";
import {
  AmountModal,
  BarcodeEditModal,
  BarcodeScanModal,
  ConfirmDeleteModal,
  HistoryModal,
  NameEditModal,
  SelectEditModal,
} from "@/components/modals";
import { Banner, TabButton, cls } from "@/components/ui";
import {
  api,
  getToken,
  setUnauthorizedHandler,
  type AnalyticsQuery,
  type Inventory,
  type Item,
  type ScanResult,
  type User,
} from "@/lib/api";
import {
  draftFromBarcode,
  draftToInput,
  emptyDraft,
  errorMessage,
  type GroupBy,
  type ItemDraft,
  type ListFilter,
} from "@/lib/inventory";

type Tab = "list" | "item" | "category" | "group" | "storage" | "analytics";

const TABS: { value: Tab; label: string }[] = [
  { value: "list", label: "在庫一覧" },
  { value: "item", label: "物品追加" },
  { value: "category", label: "カテゴリ管理" },
  { value: "group", label: "グループ管理" },
  { value: "storage", label: "保管場所管理" },
  { value: "analytics", label: "分析" },
];

type Dialog = { kind: ItemAction | "amount"; item: Item } | { kind: "scan" };

const EMPTY_INVENTORY: Inventory = {
  items: [],
  categories: [],
  storageLocations: [],
  itemGroups: [],
};

const ISSUE_URL = "https://github.com/makoto-kamimura/docker_inventory_management/issues/new";

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

function InventoryApp({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("list");
  const [inventory, setInventory] = useState<Inventory>(EMPTY_INVENTORY);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);

  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("category");
  const [draft, setDraft] = useState<ItemDraft>(() => emptyDraft());
  const [analyticsQuery, setAnalyticsQuery] = useState<AnalyticsQuery>({
    period: "daily",
    group: "total",
    metric: "stock",
  });

  const { items, categories, storageLocations, itemGroups } = inventory;

  const showError = useCallback((e: unknown) => {
    setBanner({ tone: "error", text: errorMessage(e) });
  }, []);

  const reload = useCallback(async () => {
    try {
      setInventory(await api.loadInventory());
      setBanner(null);
    } catch (e) {
      showError(e);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    let active = true;
    api
      .loadInventory()
      .then((data) => active && setInventory(data), (e) => active && showError(e))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [showError]);

  const perform: Perform = useCallback(
    async (action) => {
      try {
        await action();
      } catch (e) {
        showError(e);
        return false;
      }
      await reload();
      return true;
    },
    [reload, showError],
  );

  const closeDialog = () => setDialog(null);

  // 成功したときだけダイアログを閉じる (失敗時は入力を残す)
  const saveAndClose = async (action: () => Promise<unknown>) => {
    if (await perform(action)) closeDialog();
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

  // 在庫0からの補充は金額・期限の入力を挟む
  const handleIncrement = (item: Item) => {
    if (item.stock <= 0) setDialog({ kind: "amount", item });
    else void perform(() => api.incrementItem(item.id));
  };

  const handleDecrement = (item: Item) => {
    void perform(() => api.decrementItem(item.id));
  };

  const handleAddItem = async () => {
    const input = draftToInput(draft);
    if (!input) return;
    if (await perform(() => api.createItem(input))) {
      setDraft(emptyDraft(draft.categoryId));
      setTab("list");
    }
  };

  const handleScan = async (barcode: string) => {
    let result: ScanResult;
    try {
      result = await api.scanBarcode(barcode);
    } catch (e) {
      closeDialog();
      showError(e);
      return;
    }
    if (result.action === "needs_amount") {
      setDialog({ kind: "amount", item: result.item });
      return;
    }
    closeDialog();
    if (result.action === "incremented") {
      await reload();
      setBanner({
        tone: "info",
        text: `${result.item.name} の在庫を +1 しました (在庫: ${result.item.stock})`,
      });
    } else {
      setDraft((d) => draftFromBarcode(result.barcode, d.categoryId));
      setTab("item");
    }
  };

  const renderDialog = (d: Dialog) => {
    if (d.kind === "scan") {
      return <BarcodeScanModal onClose={closeDialog} onSubmit={handleScan} />;
    }
    const { item } = d;
    switch (d.kind) {
      case "name":
        return (
          <NameEditModal
            item={item}
            onClose={closeDialog}
            onSave={(name) => saveAndClose(() => api.setItemName(item.id, name))}
          />
        );
      case "barcode":
        return (
          <BarcodeEditModal
            item={item}
            onClose={closeDialog}
            onSave={(barcode) => saveAndClose(() => api.setItemBarcode(item.id, barcode))}
          />
        );
      case "category":
        return (
          <SelectEditModal
            title={`${item.name} のカテゴリ変更`}
            options={categories.map((c) => ({ id: c.id, label: c.name }))}
            current={item.category_id}
            onClose={closeDialog}
            onSave={(id) => saveAndClose(() => api.setItemCategory(item.id, id ?? item.category_id))}
          />
        );
      case "group":
        return (
          <SelectEditModal
            title={`${item.name} のグループ設定`}
            options={itemGroups.map((g) => ({ id: g.id, label: g.name }))}
            current={item.group_id ?? null}
            noneLabel="グループなし"
            onClose={closeDialog}
            onSave={(id) => saveAndClose(() => api.setItemGroup(item.id, id))}
          />
        );
      case "storage":
        return (
          <SelectEditModal
            title={`${item.name} の保管場所`}
            options={storageLocations.map((sl) => ({ id: sl.id, label: sl.description }))}
            current={item.storage_location_id ?? null}
            noneLabel="保管場所なし"
            onClose={closeDialog}
            onSave={(id) => saveAndClose(() => api.setItemStorageLocation(item.id, id))}
          />
        );
      case "amount":
        return (
          <AmountModal
            item={item}
            onClose={closeDialog}
            onConfirm={async (amount, expiresAt) => {
              closeDialog();
              await perform(() => api.incrementItem(item.id, amount, expiresAt));
            }}
          />
        );
      case "history":
        return <HistoryModal item={item} onClose={closeDialog} />;
      case "delete":
        return (
          <ConfirmDeleteModal
            title="品目の削除"
            message={`「${item.name}」を削除しますか？この操作は元に戻せません。`}
            onClose={closeDialog}
            onConfirm={() => saveAndClose(() => api.deleteItem(item.id))}
          />
        );
    }
  };

  return (
    <main className={`${CONTAINER} py-6 sm:py-10 space-y-6 pb-24`}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">ストクル</h1>
          {user.tenant === "demo" && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
              デモ環境（サンプルデータ）
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => setDialog({ kind: "scan" })}
            title="バーコードをスキャン"
            className={cls.outlineButton}
          >
            <span aria-hidden>⌖</span> スキャン
          </button>
          <span className="text-zinc-500">{user.name}</span>
          <a
            href={ISSUE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            🐛 バグ報告
          </a>
          <button type="button" onClick={handleLogout} className={cls.outlineButton}>
            ログアウト
          </button>
        </div>
      </header>

      <nav role="tablist" className="flex flex-wrap gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {TABS.map((t) => (
          <TabButton key={t.value} active={tab === t.value} onClick={() => setTab(t.value)}>
            {t.label}
          </TabButton>
        ))}
      </nav>

      {banner && (
        <Banner tone={banner.tone} onClose={() => setBanner(null)}>
          {banner.text}
        </Banner>
      )}

      {tab === "list" && (
        <InventoryList
          items={items}
          categories={categories}
          storageLocations={storageLocations}
          loading={loading}
          filter={listFilter}
          groupBy={groupBy}
          onChangeFilter={setListFilter}
          onChangeGroupBy={setGroupBy}
          onReload={reload}
          onIncrement={handleIncrement}
          onDecrement={handleDecrement}
          onAction={(kind, item) => setDialog({ kind, item })}
        />
      )}

      {tab === "item" && (
        <ItemForm
          draft={draft}
          onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          onSubmit={handleAddItem}
          categories={categories}
          itemGroups={itemGroups}
          storageLocations={storageLocations}
        />
      )}

      {tab === "category" && (
        <CategoryManager categories={categories} loading={loading} perform={perform} />
      )}

      {tab === "group" && (
        <GroupManager itemGroups={itemGroups} items={items} loading={loading} perform={perform} />
      )}

      {tab === "storage" && (
        <StorageManager storageLocations={storageLocations} loading={loading} perform={perform} />
      )}

      {tab === "analytics" && (
        <AnalyticsPanel
          query={analyticsQuery}
          onChangeQuery={setAnalyticsQuery}
          onError={(message) => setBanner({ tone: "error", text: message })}
        />
      )}

      {dialog && renderDialog(dialog)}
    </main>
  );
}

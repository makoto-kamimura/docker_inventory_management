import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, Pressable, SafeAreaView, Text, View } from "react-native";
import {
  api,
  apiBaseUrl,
  setUnauthorizedHandler,
  type AnalyticsQuery,
  type Inventory,
  type Item,
  type ScanResult,
  type User,
} from "./src/api";
import { AnalyticsPanel } from "./src/components/AnalyticsPanel";
import { InventoryList, type ItemAction } from "./src/components/InventoryList";
import { ItemForm } from "./src/components/ItemForm";
import { LoginScreen } from "./src/components/LoginScreen";
import {
  CategoryManager,
  GroupManager,
  StorageManager,
  type Perform,
} from "./src/components/ManageTabs";
import {
  AmountModal,
  BarcodeEditModal,
  HistoryModal,
  NameEditModal,
  SelectModal,
} from "./src/components/modals";
import { ScannerModal } from "./src/components/ScannerModal";
import { IconButton, SmallButton, TabButton, confirmDelete } from "./src/components/ui";
import {
  draftFromBarcode,
  draftToInput,
  emptyDraft,
  errorMessage,
  type GroupBy,
  type ItemDraft,
  type ListFilter,
} from "./src/inventory";
import { styles } from "./src/styles";

type Tab = "list" | "item" | "category" | "group" | "storage" | "analytics";

const TABS: { value: Tab; label: string }[] = [
  { value: "list", label: "在庫一覧" },
  { value: "item", label: "物品" },
  { value: "category", label: "カテゴリ" },
  { value: "group", label: "グループ" },
  { value: "storage", label: "保管場所" },
  { value: "analytics", label: "分析" },
];

// 削除は確認アラートで行うためダイアログにはしない
type Dialog =
  | { kind: Exclude<ItemAction, "delete"> | "category" | "amount"; item: Item }
  // target 指定時はその品目へのバーコード設定、未指定なら在庫 +1 / 物品追加
  | { kind: "scanner"; target: Item | null };

const EMPTY_INVENTORY: Inventory = {
  items: [],
  categories: [],
  storageLocations: [],
  itemGroups: [],
};

const ISSUE_URL = "https://github.com/makoto-kamimura/docker_inventory_management/issues/new";

export default function App() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    return () => setUnauthorizedHandler(null);
  }, []);

  if (!user) {
    return <LoginScreen onLoggedIn={setUser} />;
  }

  return <InventoryApp user={user} onLogout={() => setUser(null)} />;
}

function InventoryApp({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("list");
  const [inventory, setInventory] = useState<Inventory>(EMPTY_INVENTORY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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

  const reload = useCallback(async () => {
    try {
      setInventory(await api.loadInventory());
    } catch (e) {
      Alert.alert("読み込みエラー", errorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onRefresh = () => {
    setRefreshing(true);
    void reload();
  };

  const perform: Perform = useCallback(
    async (errorTitle, action) => {
      try {
        await action();
      } catch (e) {
        Alert.alert(errorTitle, errorMessage(e));
        return false;
      }
      await reload();
      return true;
    },
    [reload],
  );

  const closeDialog = () => setDialog(null);

  // 成功したときだけダイアログを閉じる (失敗時は入力を残す)
  const saveAndClose = async (errorTitle: string, action: () => Promise<unknown>) => {
    if (await perform(errorTitle, action)) closeDialog();
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
    else void perform("在庫増失敗", () => api.incrementItem(item.id));
  };

  const handleDecrement = (item: Item) => {
    void perform("払い出し失敗", () => api.decrementItem(item.id));
  };

  const handleAction = (action: ItemAction, item: Item) => {
    if (action === "delete") {
      confirmDelete(
        "品目の削除",
        `「${item.name}」を削除しますか？この操作は元に戻せません。`,
        () => void perform("削除失敗", () => api.deleteItem(item.id)),
      );
    } else {
      setDialog({ kind: action, item });
    }
  };

  const handleAddItem = async () => {
    const input = draftToInput(draft);
    if (!input) return;
    if (await perform("物品追加失敗", () => api.createItem(input))) {
      setDraft(emptyDraft(draft.categoryId));
      setTab("list");
    }
  };

  const handleScanned = async (barcode: string, target: Item | null) => {
    if (target) {
      try {
        await api.setItemBarcode(target.id, barcode);
      } catch (e) {
        closeDialog();
        Alert.alert("バーコード設定失敗", errorMessage(e));
        return;
      }
      closeDialog();
      await reload();
      Alert.alert("バーコードを設定しました", `${target.name}: ${barcode}`);
      return;
    }

    let result: ScanResult;
    try {
      result = await api.scanBarcode(barcode);
    } catch (e) {
      closeDialog();
      Alert.alert("スキャン失敗", errorMessage(e));
      return;
    }
    if (result.action === "needs_amount") {
      setDialog({ kind: "amount", item: result.item });
      return;
    }
    closeDialog();
    if (result.action === "incremented") {
      await reload();
      Alert.alert("在庫を +1 しました", `${result.item.name} (在庫: ${result.item.stock})`);
    } else {
      setDraft((d) => draftFromBarcode(result.barcode, d.categoryId));
      setTab("item");
    }
  };

  const renderDialog = (d: Dialog) => {
    if (d.kind === "scanner") {
      const { target } = d;
      return (
        <ScannerModal
          onClose={closeDialog}
          onScanned={(barcode) => handleScanned(barcode, target)}
          targetLabel={target ? `${target.name} にバーコードを設定` : null}
        />
      );
    }
    const { item } = d;
    switch (d.kind) {
      case "name":
        return (
          <NameEditModal
            item={item}
            onClose={closeDialog}
            onSave={(name) => saveAndClose("名前の変更失敗", () => api.setItemName(item.id, name))}
            onMoveCategory={() => setDialog({ kind: "category", item })}
          />
        );
      case "barcode":
        return (
          <BarcodeEditModal
            item={item}
            onClose={closeDialog}
            onSave={(barcode) =>
              saveAndClose("バーコード設定失敗", () => api.setItemBarcode(item.id, barcode))
            }
            onScan={() => setDialog({ kind: "scanner", target: item })}
          />
        );
      case "category":
        return (
          <SelectModal
            title={`${item.name} のカテゴリ変更`}
            options={categories.map((c) => ({ id: c.id, label: c.name }))}
            current={item.category_id}
            emptyText="(カテゴリ未登録)"
            onClose={closeDialog}
            onSave={(id) =>
              saveAndClose("カテゴリ変更失敗", () => api.setItemCategory(item.id, id ?? item.category_id))
            }
          />
        );
      case "group":
        return (
          <SelectModal
            title={`${item.name} のグループ設定`}
            options={itemGroups.map((g) => ({ id: g.id, label: g.name }))}
            current={item.group_id ?? null}
            noneLabel="グループなし"
            onClose={closeDialog}
            onSave={(id) => saveAndClose("グループ変更失敗", () => api.setItemGroup(item.id, id))}
          />
        );
      case "storage":
        return (
          <SelectModal
            title={`${item.name} の保管場所`}
            options={storageLocations.map((sl) => ({ id: sl.id, label: sl.description }))}
            current={item.storage_location_id ?? null}
            noneLabel="保管場所なし"
            onClose={closeDialog}
            onSave={(id) =>
              saveAndClose("保管場所変更失敗", () => api.setItemStorageLocation(item.id, id))
            }
          />
        );
      case "amount":
        return (
          <AmountModal
            item={item}
            onClose={closeDialog}
            onConfirm={async (amount, expiresAt) => {
              closeDialog();
              await perform("在庫増失敗", () => api.incrementItem(item.id, amount, expiresAt));
            }}
          />
        );
      case "history":
        return <HistoryModal item={item} onClose={closeDialog} />;
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="auto" />

      <View style={styles.headerWrap}>
        <View style={styles.headerRow}>
          <View style={styles.headerTitle}>
            <Text style={styles.h1}>ストクル</Text>
            {user.tenant === "demo" && (
              <View style={styles.demoBadge}>
                <Text style={styles.demoBadgeText}>デモ環境</Text>
              </View>
            )}
          </View>
          <View style={styles.headerUser}>
            <IconButton
              label="バーコードスキャン"
              icon="⌖"
              onPress={() => setDialog({ kind: "scanner", target: null })}
            />
            <Text style={styles.subtitle}>{user.name}</Text>
            <SmallButton label="ログアウト" onPress={() => void handleLogout()} />
          </View>
        </View>
        <View style={styles.headerRow}>
          <Text style={styles.subtitle}>API: {apiBaseUrl}</Text>
          <Pressable onPress={() => Linking.openURL(ISSUE_URL)} hitSlop={8}>
            <Text style={styles.subtitle}>🐛 バグ報告</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.tabBar}>
        {TABS.map((t) => (
          <TabButton
            key={t.value}
            label={t.label}
            active={tab === t.value}
            onPress={() => setTab(t.value)}
          />
        ))}
      </View>

      {tab === "list" && (
        <InventoryList
          items={items}
          categories={categories}
          storageLocations={storageLocations}
          loading={loading}
          refreshing={refreshing}
          filter={listFilter}
          groupBy={groupBy}
          onChangeFilter={setListFilter}
          onChangeGroupBy={setGroupBy}
          onRefresh={onRefresh}
          onIncrement={handleIncrement}
          onDecrement={handleDecrement}
          onAction={handleAction}
        />
      )}

      {tab === "item" && (
        <ItemForm
          draft={draft}
          onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          onSubmit={() => void handleAddItem()}
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
          onError={(message) => Alert.alert("分析データ取得失敗", message)}
        />
      )}

      {dialog && renderDialog(dialog)}
    </SafeAreaView>
  );
}

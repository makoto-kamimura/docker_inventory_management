// @ts-nocheck
// React Native 0.81 のクラスコンポーネント (View / Text / ScrollView 等) は
// React 19 の JSX 名前空間と型互換性がなく、TS2786 / TS2607 が発生する。
// これは Expo 54 ベースライン (初期テンプレートの App.tsx) でも同じく出る既知の上流問題。
// 実行時には Babel/Metro が型を見ないため動作に影響はない。
// react-native 型定義側で修正されたら本ディレクティブは削除して構わない。
import DateTimePicker from "@react-native-community/datetimepicker";
import { CameraView, useCameraPermissions } from "expo-camera";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  api,
  apiBaseUrl,
  setUnauthorizedHandler,
  type Category,
  type Item,
  type ItemGroup,
  type ItemHistory,
  type StorageLocation,
  type User,
} from "./src/api";

type Tab = "list" | "category" | "item" | "storage" | "group";

function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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
  const [refreshing, setRefreshing] = useState(false);

  const [listFilter, setListFilter] = useState<"all" | "out_of_stock" | "expires_soon">("all");

  const [categoryName, setCategoryName] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemCategoryId, setItemCategoryId] = useState<number | null>(null);
  const [itemStock, setItemStock] = useState("0");
  const [itemGroupId, setItemGroupId] = useState<number | null>(null);
  const [itemStorageLocationId, setItemStorageLocationId] = useState<number | null>(null);
  const [itemAmount, setItemAmount] = useState("");
  const [itemExpiresAt, setItemExpiresAt] = useState("");
  const [showItemExpiresAtPicker, setShowItemExpiresAtPicker] = useState(false);

  const [storageDescription, setStorageDescription] = useState("");
  const [storageEditItem, setStorageEditItem] = useState<Item | null>(null);

  const [newGroupName, setNewGroupName] = useState("");

  const [historyItem, setHistoryItem] = useState<Item | null>(null);
  const [histories, setHistories] = useState<ItemHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [categoryEditItem, setCategoryEditItem] = useState<Item | null>(null);
  const [groupEditItem, setGroupEditItem] = useState<Item | null>(null);
  const [nameEditItem, setNameEditItem] = useState<Item | null>(null);

  const [amountTarget, setAmountTarget] = useState<Item | null>(null);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanProcessing, setScanProcessing] = useState(false);
  const scanInFlight = useRef(false);
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null);
  const [barcodeTargetItem, setBarcodeTargetItem] = useState<Item | null>(null);

  const reload = useCallback(async () => {
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
      if (cs.length > 0 && itemCategoryId == null) {
        setItemCategoryId(cs[0].id);
      }
    } catch (e) {
      Alert.alert("読み込みエラー", e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [itemCategoryId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const onRefresh = () => {
    setRefreshing(true);
    reload();
  };

  // フィルタ: out_of_stock はグループ内全品目が在庫0の場合のみ表示
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
    const name = categoryName.trim();
    if (!name) return;
    try {
      await api.createCategory(name);
      setCategoryName("");
      await reload();
      setTab("list");
    } catch (e) {
      Alert.alert("カテゴリ追加失敗", e instanceof Error ? e.message : String(e));
    }
  };

  const handleDeleteCategory = (category: Category) => {
    Alert.alert(
      "カテゴリの削除",
      `「${category.name}」を削除しますか？物品が登録されている場合は削除できません。`,
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "削除",
          style: "destructive",
          onPress: async () => {
            try {
              await api.deleteCategory(category.id);
              await reload();
            } catch (e) {
              Alert.alert("削除失敗", e instanceof Error ? e.message : String(e));
            }
          },
        },
      ],
    );
  };

  const handleAddItem = async () => {
    if (itemCategoryId == null) {
      Alert.alert("入力エラー", "カテゴリを選択してください");
      return;
    }
    const name = itemName.trim();
    if (!name) return;
    const stock = Math.max(0, Math.floor(Number(itemStock) || 0));
    const parsedAmount = itemAmount.trim() === "" ? null : Math.floor(Number(itemAmount));
    try {
      await api.createItem({
        name,
        category_id: itemCategoryId,
        stock,
        barcode: pendingBarcode ?? null,
        group_id: itemGroupId,
        storage_location_id: itemStorageLocationId,
        amount: stock > 0 ? (parsedAmount ?? null) : null,
        expires_at: stock > 0 && itemExpiresAt.trim() ? itemExpiresAt.trim() : null,
      });
      setItemName("");
      setItemStock("0");
      setItemGroupId(null);
      setItemStorageLocationId(null);
      setItemAmount("");
      setItemExpiresAt("");
      setPendingBarcode(null);
      await reload();
      setTab("list");
    } catch (e) {
      Alert.alert("物品追加失敗", e instanceof Error ? e.message : String(e));
    }
  };

  const handleAddStorage = async () => {
    const description = storageDescription.trim();
    if (!description) return;
    try {
      await api.createStorageLocation(description);
      setStorageDescription("");
      await reload();
      setTab("list");
    } catch (e) {
      Alert.alert("保管場所追加失敗", e instanceof Error ? e.message : String(e));
    }
  };

  const handleSaveStorageLocation = async (item: Item, storageLocationId: number | null) => {
    try {
      await api.setItemStorageLocation(item.id, storageLocationId);
      setStorageEditItem(null);
      await reload();
    } catch (e) {
      Alert.alert("保管場所変更失敗", e instanceof Error ? e.message : String(e));
    }
  };

  const handleDeleteStorage = (sl: StorageLocation) => {
    Alert.alert(
      "保管場所の削除",
      `「${sl.description}」を削除しますか？`,
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "削除",
          style: "destructive",
          onPress: async () => {
            try {
              await api.deleteStorageLocation(sl.id);
              await reload();
            } catch (e) {
              Alert.alert("削除失敗", e instanceof Error ? e.message : String(e));
            }
          },
        },
      ],
    );
  };

  const handleAddGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    try {
      await api.createItemGroup(name);
      setNewGroupName("");
      await reload();
    } catch (e) {
      Alert.alert("グループ追加失敗", e instanceof Error ? e.message : String(e));
    }
  };

  const handleDeleteGroup = (group: ItemGroup) => {
    Alert.alert(
      "グループの削除",
      `「${group.name}」を削除しますか？グループに属する品目のグループ設定は解除されます（品目は削除されません）。`,
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "削除",
          style: "destructive",
          onPress: async () => {
            try {
              await api.deleteItemGroup(group.id);
              await reload();
            } catch (e) {
              Alert.alert("削除失敗", e instanceof Error ? e.message : String(e));
            }
          },
        },
      ],
    );
  };

  const handleSaveGroup = async (item: Item, groupId: number | null) => {
    try {
      await api.setItemGroup(item.id, groupId);
      setGroupEditItem(null);
      await reload();
    } catch (e) {
      Alert.alert("グループ変更失敗", e instanceof Error ? e.message : String(e));
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

  const handleScanned = useCallback(
    async (barcode: string) => {
      if (scanInFlight.current) return;
      scanInFlight.current = true;
      setScanProcessing(true);
      try {
        if (barcodeTargetItem) {
          const updated = await api.setItemBarcode(barcodeTargetItem.id, barcode);
          setScannerOpen(false);
          setBarcodeTargetItem(null);
          await reload();
          Alert.alert("バーコードを設定しました", `${updated.name}: ${barcode}`);
          return;
        }
        const result = await api.scanBarcode(barcode);
        setScannerOpen(false);
        if (result.action === "incremented") {
          await reload();
          Alert.alert("在庫を +1 しました", `${result.item.name} (在庫: ${result.item.stock})`);
        } else if (result.action === "needs_amount") {
          setAmountTarget(result.item);
        } else {
          setPendingBarcode(result.barcode);
          setItemName("");
          setItemStock("1");
          setTab("item");
        }
      } catch (e) {
        Alert.alert("スキャン失敗", e instanceof Error ? e.message : String(e));
      } finally {
        setScanProcessing(false);
        scanInFlight.current = false;
      }
    },
    [reload, barcodeTargetItem],
  );

  const openBarcodeScannerFor = (item: Item) => {
    if (item.barcode) {
      Alert.alert(
        "バーコードを再設定しますか？",
        `${item.name} には既に「${item.barcode}」が設定されています。スキャンすると上書きします。`,
        [
          { text: "キャンセル", style: "cancel" },
          {
            text: "再設定",
            onPress: () => {
              setBarcodeTargetItem(item);
              setScannerOpen(true);
            },
          },
          {
            text: "解除",
            style: "destructive",
            onPress: async () => {
              try {
                await api.setItemBarcode(item.id, null);
                await reload();
              } catch (e) {
                Alert.alert("解除失敗", e instanceof Error ? e.message : String(e));
              }
            },
          },
        ],
      );
    } else {
      setBarcodeTargetItem(item);
      setScannerOpen(true);
    }
  };

  const handleSaveName = async (item: Item, name: string) => {
    try {
      await api.setItemName(item.id, name);
      setNameEditItem(null);
      await reload();
    } catch (e) {
      Alert.alert("名前の変更失敗", e instanceof Error ? e.message : String(e));
    }
  };

  const handleDeleteItem = (item: Item) => {
    Alert.alert(
      "物品の削除",
      `「${item.name}」を削除しますか？この操作は取り消せません。`,
      [
        { text: "キャンセル", style: "cancel" },
        {
          text: "削除",
          style: "destructive",
          onPress: async () => {
            try {
              await api.deleteItem(item.id);
              await reload();
            } catch (e) {
              Alert.alert("削除失敗", e instanceof Error ? e.message : String(e));
            }
          },
        },
      ],
    );
  };

  const handleDecrement = async (item: Item) => {
    try {
      await api.decrementItem(item.id);
      await reload();
      if (historyItem?.id === item.id) await openHistory(item);
    } catch (e) {
      Alert.alert("払い出し失敗", e instanceof Error ? e.message : String(e));
    }
  };

  const doIncrement = async (item: Item, amount: number | null = null, expiresAt: string | null = null) => {
    try {
      await api.incrementItem(item.id, amount, expiresAt);
      await reload();
      if (historyItem?.id === item.id) await openHistory(item);
    } catch (e) {
      Alert.alert("在庫増失敗", e instanceof Error ? e.message : String(e));
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

  const handleMoveCategory = async (item: Item, categoryId: number) => {
    try {
      await api.setItemCategory(item.id, categoryId);
      setCategoryEditItem(null);
      await reload();
    } catch (e) {
      Alert.alert("カテゴリ変更失敗", e instanceof Error ? e.message : String(e));
    }
  };

  const openHistory = async (item: Item) => {
    setHistoryItem(item);
    setHistoryLoading(true);
    try {
      const hs = await api.listHistories(item.id);
      setHistories(hs);
    } catch (e) {
      Alert.alert("履歴取得失敗", e instanceof Error ? e.message : String(e));
    } finally {
      setHistoryLoading(false);
    }
  };

  const categoryOptions = useMemo(
    () => categories.map((c) => ({ ...c, selected: c.id === itemCategoryId })),
    [categories, itemCategoryId],
  );

  const addDisabled =
    tab === "category" ? !categoryName.trim() :
    tab === "item" ? (!itemName.trim() || itemCategoryId == null) :
    tab === "storage" ? !storageDescription.trim() :
    tab === "group" ? !newGroupName.trim() :
    true;

  const handleAddPress = () => {
    if (tab === "category") void handleAddCategory();
    else if (tab === "item") void handleAddItem();
    else if (tab === "storage") void handleAddStorage();
    else if (tab === "group") void handleAddGroup();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="auto" />

      <View style={styles.headerWrap}>
        <View style={styles.headerTopRow}>
          <Text style={styles.h1}>在庫管理</Text>
          <View style={styles.headerUser}>
            <Text style={styles.subtitle}>{user.name}</Text>
            <Pressable
              onPress={handleLogout}
              style={({ pressed }) => [styles.smallButton, pressed && styles.smallButtonPressed]}
            >
              <Text style={styles.smallButtonText}>ログアウト</Text>
            </Pressable>
          </View>
        </View>
        <Text style={styles.subtitle}>API: {apiBaseUrl}</Text>
      </View>

      <View style={styles.tabBar}>
        <TabButton label="在庫一覧" active={tab === "list"} onPress={() => setTab("list")} />
        <TabButton label="物品" active={tab === "item"} onPress={() => setTab("item")} />
        <TabButton label="カテゴリ" active={tab === "category"} onPress={() => setTab("category")} />
        <TabButton label="グループ" active={tab === "group"} onPress={() => setTab("group")} />
        <TabButton label="保管場所" active={tab === "storage"} onPress={() => setTab("storage")} />
      </View>

      {/* 在庫一覧 */}
      {tab === "list" && (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.h2}>在庫一覧</Text>
              <View style={styles.headerActions}>
                <Pressable
                  onPress={() => setScannerOpen(true)}
                  accessibilityLabel="バーコードスキャン"
                  style={({ pressed }) => [styles.iconButton, pressed && styles.smallButtonPressed]}
                >
                  <Text style={styles.iconButtonText}>⌖</Text>
                </Pressable>
                <Pressable
                  onPress={onRefresh}
                  accessibilityLabel="再読み込み"
                  style={({ pressed }) => [styles.iconButton, pressed && styles.smallButtonPressed]}
                >
                  <Text style={styles.iconButtonText}>↻</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.chipRow}>
              <Pressable
                onPress={() => setListFilter("all")}
                style={[styles.chip, listFilter === "all" && styles.chipSelected]}
              >
                <Text style={[styles.chipText, listFilter === "all" && styles.chipTextSelected]}>
                  すべて
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setListFilter("out_of_stock")}
                style={[styles.chip, listFilter === "out_of_stock" && styles.chipSelected]}
              >
                <Text style={[styles.chipText, listFilter === "out_of_stock" && styles.chipTextSelected]}>
                  在庫切れ
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setListFilter("expires_soon")}
                style={[styles.chip, listFilter === "expires_soon" && styles.chipSelected]}
              >
                <Text style={[styles.chipText, listFilter === "expires_soon" && styles.chipTextSelected]}>
                  期限 1ヶ月以内
                </Text>
              </Pressable>
            </View>
            {loading ? (
              <ActivityIndicator />
            ) : items.length === 0 ? (
              <Text style={styles.muted}>物品がありません</Text>
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
                  "物品はありません";
                return <Text style={styles.muted}>{emptyMsg}</Text>;
              }
              const showAvgAmount = listFilter === "out_of_stock";
              const showExpiresAt = listFilter === "expires_soon";
              return (
                <View style={styles.groupList}>
                  {visibleCategories.map((c) => (
                    <CategoryGroup
                      key={c.id}
                      title={c.name}
                      items={itemsByCategory.map.get(c.id) ?? []}
                      itemGroups={itemGroups}
                      showAvgAmount={showAvgAmount}
                      showExpiresAt={showExpiresAt}
                      onIncrement={handleIncrement}
                      onDecrement={handleDecrement}
                      onOpenHistory={openHistory}
                      onEditBarcode={openBarcodeScannerFor}
                      onMoveCategory={setCategoryEditItem}
                      onEditGroup={setGroupEditItem}
                      onEditStorageLocation={setStorageEditItem}
                      onEditName={setNameEditItem}
                      onDelete={handleDeleteItem}
                    />
                  ))}
                  {itemsByCategory.orphan.length > 0 && (
                    <CategoryGroup
                      title="(カテゴリ未設定)"
                      items={itemsByCategory.orphan}
                      itemGroups={itemGroups}
                      showAvgAmount={showAvgAmount}
                      showExpiresAt={showExpiresAt}
                      onIncrement={handleIncrement}
                      onDecrement={handleDecrement}
                      onOpenHistory={openHistory}
                      onEditBarcode={openBarcodeScannerFor}
                      onMoveCategory={setCategoryEditItem}
                      onEditGroup={setGroupEditItem}
                      onEditStorageLocation={setStorageEditItem}
                      onEditName={setNameEditItem}
                      onDelete={handleDeleteItem}
                    />
                  )}
                </View>
              );
            })()}
          </View>
        </ScrollView>
      )}

      {/* カテゴリ管理 */}
      {tab === "category" && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll}>
          <View style={styles.card}>
            <Text style={styles.h2}>カテゴリ追加</Text>
            <TextInput
              style={styles.input}
              value={categoryName}
              onChangeText={setCategoryName}
              placeholder="例: 工具"
              placeholderTextColor="#9ca3af"
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.h2}>カテゴリ一覧</Text>
            {loading ? (
              <ActivityIndicator />
            ) : categories.length === 0 ? (
              <Text style={styles.muted}>カテゴリがありません</Text>
            ) : (
              <View>
                {categories.map((c, idx) => (
                  <View key={c.id}>
                    {idx > 0 && <View style={styles.separator} />}
                    <View style={styles.listRow}>
                      <Text style={[styles.listRowText, { flex: 1 }]}>{c.name}</Text>
                      <Pressable
                        onPress={() => handleDeleteCategory(c)}
                        style={({ pressed }) => [styles.deleteButton, pressed && styles.smallButtonPressed]}
                      >
                        <Text style={styles.deleteButtonText}>削除</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* 物品追加 */}
      {tab === "item" && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll}>
          <View style={styles.card}>
            <Text style={styles.h2}>物品追加</Text>
            {pendingBarcode && (
              <View style={styles.barcodeNotice}>
                <Text style={styles.barcodeNoticeLabel}>バーコード</Text>
                <Text style={styles.barcodeNoticeValue}>{pendingBarcode}</Text>
                <Pressable onPress={() => setPendingBarcode(null)} hitSlop={8} accessibilityLabel="バーコードを解除">
                  <Text style={styles.barcodeNoticeClear}>×</Text>
                </Pressable>
              </View>
            )}
            <TextInput
              style={styles.input}
              value={itemName}
              onChangeText={setItemName}
              placeholder="名前"
              placeholderTextColor="#9ca3af"
            />
            <Text style={styles.label}>カテゴリ</Text>
            <View style={styles.chipRow}>
              {categoryOptions.length === 0 ? (
                <Text style={styles.muted}>(カテゴリ未登録)</Text>
              ) : (
                categoryOptions.map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => setItemCategoryId(c.id)}
                    style={[styles.chip, c.selected && styles.chipSelected]}
                  >
                    <Text style={[styles.chipText, c.selected && styles.chipTextSelected]}>
                      {c.name}
                    </Text>
                  </Pressable>
                ))
              )}
            </View>
            <Text style={styles.label}>初期在庫</Text>
            <TextInput
              style={styles.input}
              value={itemStock}
              onChangeText={setItemStock}
              keyboardType="number-pad"
            />
            {Number(itemStock) > 0 && (
              <>
                <Text style={styles.label}>単価 (任意)</Text>
                <View style={styles.amountInputRow}>
                  <Text style={styles.amountPrefix}>¥</Text>
                  <TextInput
                    style={[styles.input, styles.amountInputFlex]}
                    value={itemAmount}
                    onChangeText={setItemAmount}
                    keyboardType="number-pad"
                    placeholder="例: 1200"
                    placeholderTextColor="#9ca3af"
                  />
                </View>
                <Text style={styles.label}>期限 (任意)</Text>
                <Pressable
                  onPress={() => setShowItemExpiresAtPicker(true)}
                  style={styles.datePickerButton}
                >
                  <Text style={itemExpiresAt ? styles.datePickerText : styles.datePickerPlaceholder}>
                    {itemExpiresAt || "日付を選択"}
                  </Text>
                  {itemExpiresAt !== "" && (
                    <Pressable onPress={() => setItemExpiresAt("")} hitSlop={8}>
                      <Text style={styles.datePickerClear}>×</Text>
                    </Pressable>
                  )}
                </Pressable>
                {showItemExpiresAtPicker && (
                  <DateTimePicker
                    value={itemExpiresAt ? new Date(itemExpiresAt + "T12:00:00") : new Date()}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={(event, selected) => {
                      if (Platform.OS === "android") {
                        setShowItemExpiresAtPicker(false);
                        if (event.type === "set" && selected) setItemExpiresAt(toLocalDateString(selected));
                      } else if (selected) {
                        setItemExpiresAt(toLocalDateString(selected));
                      }
                    }}
                  />
                )}
                {showItemExpiresAtPicker && Platform.OS === "ios" && (
                  <Pressable onPress={() => setShowItemExpiresAtPicker(false)} style={styles.datePickerDoneRow}>
                    <Text style={styles.link}>完了</Text>
                  </Pressable>
                )}
              </>
            )}
            <Text style={styles.label}>グループ (任意)</Text>
            <View style={styles.chipRow}>
              <Pressable
                onPress={() => setItemGroupId(null)}
                style={[styles.chip, itemGroupId == null && styles.chipSelected]}
              >
                <Text style={[styles.chipText, itemGroupId == null && styles.chipTextSelected]}>
                  なし
                </Text>
              </Pressable>
              {itemGroups.map((g) => (
                <Pressable
                  key={g.id}
                  onPress={() => setItemGroupId(g.id)}
                  style={[styles.chip, itemGroupId === g.id && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, itemGroupId === g.id && styles.chipTextSelected]}>
                    {g.name}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>保管場所 (任意)</Text>
            <View style={styles.chipRow}>
              <Pressable
                onPress={() => setItemStorageLocationId(null)}
                style={[styles.chip, itemStorageLocationId == null && styles.chipSelected]}
              >
                <Text style={[styles.chipText, itemStorageLocationId == null && styles.chipTextSelected]}>
                  なし
                </Text>
              </Pressable>
              {storageLocations.map((sl) => (
                <Pressable
                  key={sl.id}
                  onPress={() => setItemStorageLocationId(sl.id)}
                  style={[styles.chip, itemStorageLocationId === sl.id && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, itemStorageLocationId === sl.id && styles.chipTextSelected]}>
                    {sl.description}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>
      )}

      {/* 保管場所管理 */}
      {tab === "storage" && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll}>
          <View style={styles.card}>
            <Text style={styles.h2}>保管場所追加</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={storageDescription}
              onChangeText={setStorageDescription}
              placeholder="例: 2F 倉庫 棚A-3"
              placeholderTextColor="#9ca3af"
              multiline
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.h2}>保管場所一覧</Text>
            {loading ? (
              <ActivityIndicator />
            ) : storageLocations.length === 0 ? (
              <Text style={styles.muted}>保管場所がありません</Text>
            ) : (
              <View>
                {storageLocations.map((sl, idx) => (
                  <View key={sl.id}>
                    {idx > 0 && <View style={styles.separator} />}
                    <View style={styles.storageRow}>
                      <Text style={[styles.storageDesc, { flex: 1 }]}>{sl.description}</Text>
                      <Pressable
                        onPress={() => handleDeleteStorage(sl)}
                        style={({ pressed }) => [styles.deleteButton, pressed && styles.smallButtonPressed]}
                      >
                        <Text style={styles.deleteButtonText}>削除</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* グループ管理 */}
      {tab === "group" && (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll}>
          <View style={styles.card}>
            <Text style={styles.h2}>グループ追加</Text>
            <Text style={styles.muted}>
              グループを作成し複数の品目をまとめます。在庫切れ表示ではグループ内に在庫がある品目が1つでもあればグループ全体が表示されません。
            </Text>
            <TextInput
              style={styles.input}
              value={newGroupName}
              onChangeText={setNewGroupName}
              placeholder="例: トナーカートリッジ"
              placeholderTextColor="#9ca3af"
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.h2}>グループ一覧</Text>
            {loading ? (
              <ActivityIndicator />
            ) : itemGroups.length === 0 ? (
              <Text style={styles.muted}>グループがありません</Text>
            ) : (
              <View>
                {itemGroups.map((g, idx) => {
                  const members = items.filter((it) => it.group_id === g.id);
                  return (
                    <View key={g.id}>
                      {idx > 0 && <View style={styles.separator} />}
                      <View style={styles.groupManageRow}>
                        <View style={{ flex: 1 }}>
                          <View style={styles.groupManageHeader}>
                            <Text style={styles.groupManageTitle}>{g.name}</Text>
                            <Text style={styles.muted}>{members.length} 品目</Text>
                          </View>
                          {members.length > 0 && (
                            <View style={styles.groupMembers}>
                              {members.map((it) => (
                                <Text
                                  key={it.id}
                                  style={[styles.groupMemberText, it.stock <= 0 && styles.groupMemberEmpty]}
                                >
                                  {it.name} ({it.stock})
                                </Text>
                              ))}
                            </View>
                          )}
                        </View>
                        <Pressable
                          onPress={() => handleDeleteGroup(g)}
                          style={({ pressed }) => [styles.deleteButton, pressed && styles.smallButtonPressed]}
                        >
                          <Text style={styles.deleteButtonText}>削除</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* 固定フッター: 追加ボタン */}
      {(tab === "category" || tab === "item" || tab === "storage" || tab === "group") && (
        <View style={styles.fixedBottom}>
          <Pressable
            style={({ pressed }) => [styles.button, (addDisabled || pressed) && styles.buttonPressed]}
            onPress={handleAddPress}
            disabled={addDisabled}
          >
            <Text style={styles.buttonText}>追加</Text>
          </Pressable>
        </View>
      )}

      {/* 品目名編集モーダル */}
      {nameEditItem && (
        <NameEditModal
          item={nameEditItem}
          onClose={() => setNameEditItem(null)}
          onSave={handleSaveName}
        />
      )}

      {/* AmountModal */}
      {amountTarget && (
        <AmountModal
          item={amountTarget}
          onClose={() => setAmountTarget(null)}
          onConfirm={handleConfirmAmount}
        />
      )}

      {/* バーコードスキャナー */}
      {scannerOpen && (
        <ScannerModal
          onClose={() => {
            setScannerOpen(false);
            setBarcodeTargetItem(null);
          }}
          onScanned={handleScanned}
          processing={scanProcessing}
          targetLabel={barcodeTargetItem ? `${barcodeTargetItem.name} にバーコードを設定` : null}
        />
      )}

      {/* カテゴリ変更モーダル */}
      {categoryEditItem && (
        <Modal
          visible
          animationType="slide"
          transparent
          onRequestClose={() => setCategoryEditItem(null)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setCategoryEditItem(null)}>
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <View style={styles.cardHeader}>
                <Text style={styles.h2}>{categoryEditItem.name} のカテゴリ変更</Text>
                <Pressable onPress={() => setCategoryEditItem(null)}>
                  <Text style={styles.link}>閉じる</Text>
                </Pressable>
              </View>
              {categories.length === 0 ? (
                <Text style={styles.muted}>(カテゴリ未登録)</Text>
              ) : (
                <View style={styles.chipRow}>
                  {categories.map((c) => {
                    const selected = c.id === categoryEditItem.category_id;
                    return (
                      <Pressable
                        key={c.id}
                        onPress={() => {
                          if (!selected) handleMoveCategory(categoryEditItem, c.id);
                        }}
                        style={[styles.chip, selected && styles.chipSelected]}
                      >
                        <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                          {c.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* グループ変更モーダル */}
      {groupEditItem && (
        <Modal
          visible
          animationType="slide"
          transparent
          onRequestClose={() => setGroupEditItem(null)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setGroupEditItem(null)}>
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <View style={styles.cardHeader}>
                <Text style={styles.h2}>{groupEditItem.name} のグループ変更</Text>
                <Pressable onPress={() => setGroupEditItem(null)}>
                  <Text style={styles.link}>閉じる</Text>
                </Pressable>
              </View>
              <View style={styles.chipRow}>
                <Pressable
                  onPress={() => {
                    if (groupEditItem.group_id != null) handleSaveGroup(groupEditItem, null);
                  }}
                  style={[styles.chip, groupEditItem.group_id == null && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, groupEditItem.group_id == null && styles.chipTextSelected]}>
                    グループなし
                  </Text>
                </Pressable>
                {itemGroups.map((g) => {
                  const selected = groupEditItem.group_id === g.id;
                  return (
                    <Pressable
                      key={g.id}
                      onPress={() => {
                        if (!selected) handleSaveGroup(groupEditItem, g.id);
                      }}
                      style={[styles.chip, selected && styles.chipSelected]}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                        {g.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* 保管場所変更モーダル */}
      {storageEditItem && (
        <Modal
          visible
          animationType="slide"
          transparent
          onRequestClose={() => setStorageEditItem(null)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setStorageEditItem(null)}>
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <View style={styles.cardHeader}>
                <Text style={styles.h2}>{storageEditItem.name} の保管場所</Text>
                <Pressable onPress={() => setStorageEditItem(null)}>
                  <Text style={styles.link}>閉じる</Text>
                </Pressable>
              </View>
              <View style={styles.chipRow}>
                <Pressable
                  onPress={() => {
                    if (storageEditItem.storage_location_id != null)
                      handleSaveStorageLocation(storageEditItem, null);
                  }}
                  style={[styles.chip, storageEditItem.storage_location_id == null && styles.chipSelected]}
                >
                  <Text style={[styles.chipText, storageEditItem.storage_location_id == null && styles.chipTextSelected]}>
                    なし
                  </Text>
                </Pressable>
                {storageLocations.map((sl) => {
                  const selected = storageEditItem.storage_location_id === sl.id;
                  return (
                    <Pressable
                      key={sl.id}
                      onPress={() => {
                        if (!selected) handleSaveStorageLocation(storageEditItem, sl.id);
                      }}
                      style={[styles.chip, selected && styles.chipSelected]}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                        {sl.description}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {/* 履歴モーダル */}
      {historyItem && (
        <Modal
          visible
          animationType="slide"
          transparent
          onRequestClose={() => setHistoryItem(null)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setHistoryItem(null)}>
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <View style={styles.cardHeader}>
                <Text style={styles.h2}>{historyItem.name} の履歴</Text>
                <Pressable onPress={() => setHistoryItem(null)}>
                  <Text style={styles.link}>閉じる</Text>
                </Pressable>
              </View>
              {historyLoading ? (
                <ActivityIndicator />
              ) : histories.length === 0 ? (
                <Text style={styles.muted}>履歴がありません</Text>
              ) : (
                <FlatList
                  data={histories}
                  keyExtractor={(h) => String(h.id)}
                  ItemSeparatorComponent={() => <View style={styles.separator} />}
                  renderItem={({ item: h }) => (
                    <View style={styles.historyRow}>
                      <View style={styles.historyLeft}>
                        <Text style={styles.historyChange}>
                          {h.change > 0 ? `+${h.change}` : String(h.change)}
                        </Text>
                        <View>
                          {h.amount != null && (
                            <Text style={styles.historyAmount}>
                              ¥{h.amount.toLocaleString("ja-JP")}
                            </Text>
                          )}
                          {h.expires_at != null && (
                            <Text style={styles.historyExpires}>
                              期限 {h.expires_at}
                            </Text>
                          )}
                        </View>
                      </View>
                      <View style={styles.historyMeta}>
                        <Text style={styles.muted}>
                          {new Date(h.changed_at).toLocaleString("ja-JP")}
                        </Text>
                        <Text style={styles.historyUser}>{h.user?.name ?? "不明"}</Text>
                      </View>
                    </View>
                  )}
                />
              )}
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </SafeAreaView>
  );
}

function ScannerModal({
  onClose,
  onScanned,
  processing,
  targetLabel,
}: {
  onClose: () => void;
  onScanned: (barcode: string) => void;
  processing: boolean;
  targetLabel?: string | null;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const handledRef = useRef(false);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <SafeAreaView style={styles.scannerSafe}>
        <View style={styles.scannerHeader}>
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.scannerTitle}>バーコードをスキャン</Text>
            {targetLabel && <Text style={styles.scannerTarget}>{targetLabel}</Text>}
          </View>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={styles.scannerClose}>閉じる</Text>
          </Pressable>
        </View>
        {!permission ? (
          <View style={styles.scannerBody}><ActivityIndicator /></View>
        ) : !permission.granted ? (
          <View style={styles.scannerBody}>
            <Text style={styles.scannerHint}>カメラへのアクセスが許可されていません。</Text>
            <Pressable
              onPress={requestPermission}
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            >
              <Text style={styles.buttonText}>権限をリクエスト</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.scannerBody}>
            <CameraView
              style={styles.cameraView}
              barcodeScannerSettings={{
                barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "code93", "qr"],
              }}
              onBarcodeScanned={({ data }) => {
                if (handledRef.current) return;
                handledRef.current = true;
                onScanned(data);
              }}
            />
            <View style={styles.scannerOverlay} pointerEvents="none">
              <View style={styles.scannerFrame} />
            </View>
            <Text style={styles.scannerHint}>
              {processing ? "処理中..." : "枠内にバーコードを収めてください"}
            </Text>
          </View>
        )}
      </SafeAreaView>
    </Modal>
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
      const u = await api.login(email.trim(), password);
      onLoggedIn(u);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const disabled = submitting || !email.trim() || !password;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="auto" />
      <View style={styles.loginWrap}>
        <View style={styles.card}>
          <Text style={styles.h1}>在庫管理 ログイン</Text>
          {error && <Text style={styles.loginError}>{error}</Text>}
          <Text style={styles.label}>メールアドレス</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="admin@example.com"
            placeholderTextColor="#9ca3af"
          />
          <Text style={styles.label}>パスワード</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="パスワード"
            placeholderTextColor="#9ca3af"
          />
          <Pressable
            style={({ pressed }) => [styles.button, (disabled || pressed) && styles.buttonPressed]}
            onPress={submit}
            disabled={disabled}
          >
            <Text style={styles.buttonText}>{submitting ? "ログイン中..." : "ログイン"}</Text>
          </Pressable>
          <Text style={styles.subtitle}>API: {apiBaseUrl}</Text>
        </View>
      </View>
    </SafeAreaView>
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

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  const canSave = value.trim().length > 0 && value.trim() !== item.name && !saving;

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave(item, value.trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalFill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.modalBackdrop} onPress={onClose}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.cardHeader}>
              <Text style={styles.h2}>品目名の編集</Text>
              <Pressable onPress={onClose}>
                <Text style={styles.link}>閉じる</Text>
              </Pressable>
            </View>
            <TextInput
              style={styles.input}
              value={value}
              onChangeText={setValue}
              maxLength={255}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => { void submit(); }}
            />
            <View style={styles.amountActions}>
              <Pressable
                style={({ pressed }) => [
                  styles.smallButton,
                  (saving || pressed) && styles.smallButtonPressed,
                ]}
                onPress={onClose}
                disabled={saving}
              >
                <Text style={styles.smallButtonText}>キャンセル</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  styles.amountConfirm,
                  (!canSave || pressed) && styles.buttonPressed,
                ]}
                onPress={() => { void submit(); }}
                disabled={!canSave}
              >
                <Text style={styles.buttonText}>保存</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function AmountModal({
  item,
  onClose,
  onConfirm,
}: {
  item: Item;
  onClose: () => void;
  onConfirm: (item: Item, amount: number | null, expiresAt: string | null) => void | Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  const submit = async (amount: number | null) => {
    setSaving(true);
    try {
      const ea = expiresAt.trim() !== "" ? expiresAt.trim() : null;
      await onConfirm(item, amount, ea);
    } finally {
      setSaving(false);
    }
  };

  const parsed = value.trim() === "" ? null : Math.floor(Number(value));
  const invalid = parsed != null && (!isFinite(parsed) || parsed < 0);

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <KeyboardAvoidingView
        style={styles.modalFill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.modalBackdrop} onPress={onClose}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.amountScrollContent}>
              <View style={styles.cardHeader}>
                <Text style={styles.h2}>{item.name} の補充 (+1)</Text>
                <Pressable onPress={onClose}>
                  <Text style={styles.link}>閉じる</Text>
                </Pressable>
              </View>
              <Text style={styles.muted}>
                在庫切れからの補充です。金額と期限を入力してください（どちらも任意）。
              </Text>
              <Text style={styles.label}>金額 (円)</Text>
              <TextInput
                style={styles.input}
                value={value}
                onChangeText={setValue}
                keyboardType="number-pad"
                placeholder="例: 1200"
                placeholderTextColor="#9ca3af"
                autoFocus
              />
              <Text style={styles.label}>期限 (任意)</Text>
              <Pressable
                onPress={() => setShowDatePicker(true)}
                style={styles.datePickerButton}
              >
                <Text style={expiresAt ? styles.datePickerText : styles.datePickerPlaceholder}>
                  {expiresAt || "日付を選択"}
                </Text>
                {expiresAt !== "" && (
                  <Pressable onPress={() => setExpiresAt("")} hitSlop={8}>
                    <Text style={styles.datePickerClear}>×</Text>
                  </Pressable>
                )}
              </Pressable>
              {showDatePicker && (
                <DateTimePicker
                  value={expiresAt ? new Date(expiresAt + "T12:00:00") : new Date()}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={(event, selected) => {
                    if (Platform.OS === "android") {
                      setShowDatePicker(false);
                      if (event.type === "set" && selected) setExpiresAt(toLocalDateString(selected));
                    } else if (selected) {
                      setExpiresAt(toLocalDateString(selected));
                    }
                  }}
                />
              )}
              {showDatePicker && Platform.OS === "ios" && (
                <Pressable onPress={() => setShowDatePicker(false)} style={styles.datePickerDoneRow}>
                  <Text style={styles.link}>完了</Text>
                </Pressable>
              )}
              <View style={styles.amountActions}>
                <Pressable
                  style={({ pressed }) => [
                    styles.smallButton,
                    (saving || pressed) && styles.smallButtonPressed,
                  ]}
                  onPress={() => submit(null)}
                  disabled={saving}
                >
                  <Text style={styles.smallButtonText}>金額なしで +1</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.button,
                    styles.amountConfirm,
                    (saving || invalid || pressed) && styles.buttonPressed,
                  ]}
                  onPress={() => submit(parsed)}
                  disabled={saving || invalid}
                >
                  <Text style={styles.buttonText}>+1 して記録</Text>
                </Pressable>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </View>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tabButton,
        active && styles.tabButtonActive,
        pressed && styles.tabButtonPressed,
      ]}
    >
      <Text style={[styles.tabButtonText, active && styles.tabButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

function CategoryGroup({
  title,
  items,
  itemGroups,
  showAvgAmount = false,
  showExpiresAt = false,
  onIncrement,
  onDecrement,
  onOpenHistory,
  onEditBarcode,
  onMoveCategory,
  onEditGroup,
  onEditStorageLocation,
  onEditName,
  onDelete,
}: {
  title: string;
  items: Item[];
  itemGroups: ItemGroup[];
  showAvgAmount?: boolean;
  showExpiresAt?: boolean;
  onIncrement: (item: Item) => void;
  onDecrement: (item: Item) => void;
  onOpenHistory: (item: Item) => void;
  onEditBarcode: (item: Item) => void;
  onMoveCategory: (item: Item) => void;
  onEditGroup: (item: Item) => void;
  onEditStorageLocation: (item: Item) => void;
  onEditName: (item: Item) => void;
  onDelete: (item: Item) => void;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <View style={styles.group}>
      <View style={styles.groupHeader}>
        <Text style={styles.groupTitle}>{title}</Text>
        <Text style={styles.muted}>{items.length} 件</Text>
      </View>
      {items.length === 0 ? null : (
        <View>
          {items.map((item, idx) => {
            const groupName = item.group?.name ?? null;
            const isExpired =
              item.nearest_expires_at != null &&
              new Date(item.nearest_expires_at) < today;
            return (
              <View key={item.id}>
                {idx > 0 && <View style={styles.separator} />}
                <View style={styles.row}>
                  <View style={styles.rowLeft}>
                    <View style={styles.rowTitleRow}>
                      <Text style={styles.rowTitle}>{item.name}</Text>
                      <Pressable
                        onPress={() => onEditName(item)}
                        hitSlop={8}
                        accessibilityLabel="名前を編集"
                      >
                        <Text style={styles.barcodeMuted}>✎</Text>
                      </Pressable>
                    </View>
                    <Pressable
                      onPress={() => onEditBarcode(item)}
                      hitSlop={6}
                      accessibilityLabel="バーコードを設定"
                    >
                      <Text style={styles.barcodeLine}>
                        <Text style={styles.barcodeIcon}>▮▮▮ </Text>
                        {item.barcode ? (
                          <Text style={styles.barcodeValue}>{item.barcode}</Text>
                        ) : (
                          <Text style={styles.barcodeMuted}>未設定</Text>
                        )}
                        <Text style={styles.barcodeMuted}>  ✎</Text>
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => onEditGroup(item)}
                      hitSlop={6}
                      accessibilityLabel="グループを設定"
                    >
                      <Text style={styles.groupLine}>
                        <Text style={styles.barcodeIcon}>⊞ </Text>
                        {groupName ? (
                          <Text style={styles.groupBadgeText}>{groupName}</Text>
                        ) : (
                          <Text style={styles.barcodeMuted}>グループ未設定</Text>
                        )}
                        <Text style={styles.barcodeMuted}>  ✎</Text>
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => onEditStorageLocation(item)}
                      hitSlop={6}
                      accessibilityLabel="保管場所を設定"
                    >
                      <Text style={styles.groupLine}>
                        <Text style={styles.barcodeIcon}>📍 </Text>
                        {item.storage_location ? (
                          <Text style={styles.groupBadgeText}>{item.storage_location.description}</Text>
                        ) : (
                          <Text style={styles.barcodeMuted}>保管場所未設定</Text>
                        )}
                        <Text style={styles.barcodeMuted}>  ✎</Text>
                      </Text>
                    </Pressable>
                    {showAvgAmount &&
                      item.avg_amount != null &&
                      Number(item.avg_amount) > 0 && (
                        <Text style={styles.avgAmountLine}>
                          平均単価 ¥
                          {Math.round(Number(item.avg_amount)).toLocaleString("ja-JP")}
                        </Text>
                      )}
                    {showExpiresAt && item.nearest_expires_at != null && (
                      <Text
                        style={[
                          styles.expiresAtLine,
                          isExpired ? styles.expiresAtExpired : styles.expiresAtSoon,
                        ]}
                      >
                        期限 {item.nearest_expires_at}
                      </Text>
                    )}
                  </View>
                  <View style={styles.rowRight}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.iconButton,
                        (item.stock <= 0 || pressed) && styles.smallButtonPressed,
                      ]}
                      onPress={() => onDecrement(item)}
                      disabled={item.stock <= 0}
                      accessibilityLabel="在庫減 (-1)"
                    >
                      <Text style={styles.iconButtonText}>−</Text>
                    </Pressable>
                    <Text style={[styles.stock, item.stock === 0 && styles.stockEmpty]}>
                      {item.stock}
                    </Text>
                    <Pressable
                      style={({ pressed }) => [styles.iconButton, pressed && styles.smallButtonPressed]}
                      onPress={() => onIncrement(item)}
                      accessibilityLabel="在庫増 (+1)"
                    >
                      <Text style={styles.iconButtonText}>＋</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.smallButton, pressed && styles.smallButtonPressed]}
                      onPress={() => onMoveCategory(item)}
                      accessibilityLabel="カテゴリを変更"
                    >
                      <Text style={styles.smallButtonText}>移動</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.smallButton, pressed && styles.smallButtonPressed]}
                      onPress={() => onOpenHistory(item)}
                    >
                      <Text style={styles.smallButtonText}>履歴</Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.deleteButton, pressed && styles.smallButtonPressed]}
                      onPress={() => onDelete(item)}
                      accessibilityLabel="削除"
                    >
                      <Text style={styles.deleteButtonText}>削除</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f8fafc" },
  headerWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerUser: { flexDirection: "row", alignItems: "center", gap: 8 },
  scroll: { padding: 16, gap: 16 },
  h1: { fontSize: 24, fontWeight: "700", color: "#0f172a" },
  subtitle: { fontSize: 12, color: "#64748b", marginTop: 2 },
  loginWrap: { flex: 1, justifyContent: "center", padding: 16 },
  loginError: {
    fontSize: 13,
    color: "#b91c1c",
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  inputMultiline: { minHeight: 64, textAlignVertical: "top" },
  storageRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
  },
  storageDesc: { flexShrink: 1, fontSize: 14, color: "#0f172a" },
  h2: { fontSize: 16, fontWeight: "600", color: "#0f172a" },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    backgroundColor: "#fff",
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabButtonActive: { borderBottomColor: "#0f172a" },
  tabButtonPressed: { opacity: 0.5 },
  tabButtonText: { fontSize: 11, color: "#64748b" },
  tabButtonTextActive: { color: "#0f172a", fontWeight: "600" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: { fontSize: 13, color: "#475569", marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#0f172a",
    backgroundColor: "#fff",
  },
  button: {
    backgroundColor: "#0f172a",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonPressed: { opacity: 0.6 },
  buttonText: { color: "#fff", fontWeight: "600" },
  link: { color: "#2563eb", fontSize: 13 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#fff",
  },
  chipSelected: { backgroundColor: "#0f172a", borderColor: "#0f172a" },
  chipText: { fontSize: 13, color: "#475569" },
  chipTextSelected: { color: "#fff" },
  muted: { fontSize: 13, color: "#94a3b8" },
  separator: { height: 1, backgroundColor: "#e2e8f0" },
  groupList: { gap: 12 },
  group: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    overflow: "hidden",
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#f1f5f9",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  groupTitle: { fontSize: 14, fontWeight: "600", color: "#0f172a" },
  row: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    rowGap: 8,
    columnGap: 12,
  },
  rowLeft: { flexShrink: 1, flexGrow: 1, minWidth: 150 },
  rowRight: { flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 8 },
  rowTitle: { fontSize: 15, fontWeight: "500", color: "#0f172a" },
  rowTitleRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  barcodeLine: { fontSize: 11, marginTop: 2, lineHeight: 14 },
  barcodeIcon: { color: "#94a3b8", letterSpacing: -1 },
  barcodeValue: { color: "#475569", fontVariant: ["tabular-nums"] },
  barcodeMuted: { color: "#94a3b8", fontStyle: "italic" },
  groupLine: { fontSize: 11, marginTop: 3, lineHeight: 14 },
  groupBadgeText: { color: "#374151", backgroundColor: "#f3f4f6" },
  avgAmountLine: {
    fontSize: 12,
    marginTop: 2,
    color: "#059669",
    fontVariant: ["tabular-nums"],
  },
  expiresAtLine: {
    fontSize: 12,
    marginTop: 2,
    fontVariant: ["tabular-nums"],
  },
  expiresAtSoon: { color: "#d97706" },
  expiresAtExpired: { color: "#dc2626" },
  stock: {
    fontSize: 16,
    fontVariant: ["tabular-nums"],
    minWidth: 32,
    textAlign: "right",
    color: "#0f172a",
  },
  stockEmpty: { color: "#dc2626" },
  smallButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#fff",
  },
  smallButtonPressed: { opacity: 0.5 },
  smallButtonText: { fontSize: 13, color: "#0f172a" },
  deleteButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#fca5a5",
    backgroundColor: "#fff",
  },
  deleteButtonText: { fontSize: 13, color: "#b91c1c" },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonText: { fontSize: 18, lineHeight: 20, color: "#0f172a" },
  headerActions: { flexDirection: "row", gap: 8 },
  barcodeNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  barcodeNoticeLabel: { fontSize: 11, color: "#1d4ed8", fontWeight: "600" },
  barcodeNoticeValue: {
    flex: 1,
    fontSize: 14,
    color: "#0f172a",
    fontVariant: ["tabular-nums"],
  },
  barcodeNoticeClear: { fontSize: 18, color: "#1d4ed8", paddingHorizontal: 4 },
  scannerSafe: { flex: 1, backgroundColor: "#000" },
  scannerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  scannerTitle: { color: "#fff", fontSize: 16, fontWeight: "600" },
  scannerTarget: { color: "#fde68a", fontSize: 12, marginTop: 2 },
  scannerClose: { color: "#93c5fd", fontSize: 14 },
  scannerBody: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    gap: 16,
  },
  cameraView: { ...StyleSheet.absoluteFillObject },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  scannerFrame: {
    width: 260,
    height: 160,
    borderWidth: 2,
    borderColor: "#22d3ee",
    borderRadius: 12,
  },
  scannerHint: {
    position: "absolute",
    bottom: 32,
    color: "#fff",
    fontSize: 13,
    textAlign: "center",
  },
  modalFill: { flex: 1 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 16,
  },
  amountScrollContent: { gap: 12 },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    gap: 12,
    maxHeight: "80%",
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  historyChange: {
    fontSize: 14,
    fontVariant: ["tabular-nums"],
    color: "#0f172a",
  },
  historyMeta: { alignItems: "flex-end" },
  historyUser: { fontSize: 11, color: "#94a3b8" },
  historyLeft: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  historyAmount: {
    fontSize: 12,
    color: "#059669",
    fontVariant: ["tabular-nums"],
  },
  historyExpires: {
    fontSize: 11,
    color: "#d97706",
    marginTop: 2,
  },
  amountActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: 8,
  },
  amountConfirm: { paddingHorizontal: 16 },
  amountInputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  amountPrefix: { fontSize: 14, color: "#64748b" },
  amountInputFlex: { flex: 1 },
  datePickerButton: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
  },
  datePickerText: { fontSize: 14, color: "#0f172a" },
  datePickerPlaceholder: { fontSize: 14, color: "#9ca3af" },
  datePickerClear: { fontSize: 18, color: "#94a3b8", paddingHorizontal: 4 },
  datePickerDoneRow: { alignItems: "flex-end", paddingTop: 4 },
  fixedBottom: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    backgroundColor: "#fff",
  },
  storageLine: {
    fontSize: 11,
    color: "#94a3b8",
    marginTop: 2,
  },
  // カテゴリ/保管場所一覧行
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    gap: 12,
  },
  listRowText: { flex: 1, fontSize: 14, color: "#0f172a" },
  // グループ管理
  groupManageRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 12,
    gap: 12,
  },
  groupManageHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  groupManageTitle: { fontSize: 14, fontWeight: "600", color: "#0f172a" },
  groupMembers: { paddingLeft: 4, gap: 2 },
  groupMemberText: { fontSize: 12, color: "#64748b" },
  groupMemberEmpty: { color: "#dc2626" },
});

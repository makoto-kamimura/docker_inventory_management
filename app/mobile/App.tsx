// @ts-nocheck
// React Native 0.81 のクラスコンポーネント (View / Text / ScrollView 等) は
// React 19 の JSX 名前空間と型互換性がなく、TS2786 / TS2607 が発生する。
// これは Expo 54 ベースライン (初期テンプレートの App.tsx) でも同じく出る既知の上流問題。
// 実行時には Babel/Metro が型を見ないため動作に影響はない。
// react-native 型定義側で修正されたら本ディレクティブは削除して構わない。
import { CameraView, useCameraPermissions } from "expo-camera";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
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
  type ItemHistory,
  type StorageLocation,
  type User,
} from "./src/api";

type Tab = "list" | "category" | "item" | "storage";

export default function App() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // 401 を受けたら自動でログイン画面に戻す
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // 在庫一覧の絞り込み: すべて / 在庫切れ (stock<=0) のみ
  const [listFilter, setListFilter] = useState<"all" | "out_of_stock">("all");

  const [storageLocations, setStorageLocations] = useState<StorageLocation[]>(
    [],
  );

  const [categoryName, setCategoryName] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemCategoryId, setItemCategoryId] = useState<number | null>(null);
  const [itemStock, setItemStock] = useState("0");

  const [storageCategoryId, setStorageCategoryId] = useState<number | null>(
    null,
  );
  const [storageDescription, setStorageDescription] = useState("");

  const [historyItem, setHistoryItem] = useState<Item | null>(null);
  const [histories, setHistories] = useState<ItemHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // カテゴリ変更対象 (null なら閉じている)
  const [categoryEditItem, setCategoryEditItem] = useState<Item | null>(null);

  // 在庫0からの補充時に金額を入力させる対象 (null なら閉じている)
  const [amountTarget, setAmountTarget] = useState<Item | null>(null);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanProcessing, setScanProcessing] = useState(false);
  // CameraView は 1 フレームごとに onBarcodeScanned を発火する (~30fps)。
  // setState は非同期/バッチ更新なので state ガードは間に合わず多重発火する。
  // 同期的に変更できる ref で実行中フラグを保持する。
  const scanInFlight = useRef(false);
  // 未登録バーコード時に物品追加フォームへプリフィルする
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null);
  // 指定した既存品にバーコードを後付けする時の対象 (null なら通常スキャン)
  const [barcodeTargetItem, setBarcodeTargetItem] = useState<Item | null>(null);

  const reload = useCallback(async () => {
    try {
      const [is, cs, sl] = await Promise.all([
        api.listItems(),
        api.listCategories(),
        api.listStorageLocations(),
      ]);
      setItems(is);
      setCategories(cs);
      setStorageLocations(sl);
      if (cs.length > 0 && itemCategoryId == null) {
        setItemCategoryId(cs[0].id);
      }
      if (cs.length > 0 && storageCategoryId == null) {
        setStorageCategoryId(cs[0].id);
      }
    } catch (e) {
      Alert.alert("読み込みエラー", e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [itemCategoryId, storageCategoryId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const onRefresh = () => {
    setRefreshing(true);
    reload();
  };

  const itemsByCategory = useMemo(() => {
    const filtered =
      listFilter === "out_of_stock"
        ? items.filter((it) => it.stock <= 0)
        : items;
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

  const handleAddItem = async () => {
    if (itemCategoryId == null) {
      Alert.alert("入力エラー", "カテゴリを選択してください");
      return;
    }
    const name = itemName.trim();
    if (!name) return;
    const stock = Math.max(0, Math.floor(Number(itemStock) || 0));
    try {
      await api.createItem({
        name,
        category_id: itemCategoryId,
        stock,
        barcode: pendingBarcode ?? null,
      });
      setItemName("");
      setItemStock("0");
      setPendingBarcode(null);
      await reload();
      setTab("list");
    } catch (e) {
      Alert.alert("物品追加失敗", e instanceof Error ? e.message : String(e));
    }
  };

  const handleAddStorage = async () => {
    if (storageCategoryId == null) {
      Alert.alert("入力エラー", "カテゴリを選択してください");
      return;
    }
    const description = storageDescription.trim();
    if (!description) return;
    try {
      await api.createStorageLocation({
        category_id: storageCategoryId,
        description,
      });
      setStorageDescription("");
      await reload();
      setTab("list");
    } catch (e) {
      Alert.alert("保管場所追加失敗", e instanceof Error ? e.message : String(e));
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
      // ref で同期的に二重起動を弾く。state ガードはフレーム単位の発火に追いつかない。
      if (scanInFlight.current) return;
      scanInFlight.current = true;
      setScanProcessing(true);
      try {
        // 既存品への付与モード
        if (barcodeTargetItem) {
          const updated = await api.setItemBarcode(
            barcodeTargetItem.id,
            barcode,
          );
          setScannerOpen(false);
          setBarcodeTargetItem(null);
          await reload();
          Alert.alert(
            "バーコードを設定しました",
            `${updated.name}: ${barcode}`,
          );
          return;
        }
        // 通常スキャン (+1 / 在庫0で金額入力 / 未登録)
        const result = await api.scanBarcode(barcode);
        setScannerOpen(false);
        if (result.action === "incremented") {
          await reload();
          Alert.alert(
            "在庫を +1 しました",
            `${result.item.name} (在庫: ${result.item.stock})`,
          );
        } else if (result.action === "needs_amount") {
          // 在庫切れからの補充: 金額モーダルを出してから +1 する
          setAmountTarget(result.item);
        } else {
          setPendingBarcode(result.barcode);
          setItemName("");
          setItemStock("1");
          setTab("item");
        }
      } catch (e) {
        Alert.alert(
          "スキャン失敗",
          e instanceof Error ? e.message : String(e),
        );
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
                Alert.alert(
                  "解除失敗",
                  e instanceof Error ? e.message : String(e),
                );
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

  const handleDecrement = async (item: Item) => {
    try {
      await api.decrementItem(item.id);
      await reload();
      if (historyItem?.id === item.id) {
        await openHistory(item);
      }
    } catch (e) {
      Alert.alert("払い出し失敗", e instanceof Error ? e.message : String(e));
    }
  };

  const doIncrement = async (item: Item, amount: number | null = null) => {
    try {
      await api.incrementItem(item.id, amount);
      await reload();
      if (historyItem?.id === item.id) {
        await openHistory(item);
      }
    } catch (e) {
      Alert.alert("在庫増失敗", e instanceof Error ? e.message : String(e));
    }
  };

  const handleIncrement = (item: Item) => {
    // 在庫0からの補充だけ金額入力モーダルを挟む。在庫>0 は従来どおり即時 +1。
    if (item.stock <= 0) {
      setAmountTarget(item);
      return;
    }
    void doIncrement(item, null);
  };

  const handleConfirmAmount = async (item: Item, amount: number | null) => {
    setAmountTarget(null);
    await doIncrement(item, amount);
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
    () =>
      categories.map((c) => ({
        ...c,
        selected: c.id === itemCategoryId,
      })),
    [categories, itemCategoryId],
  );

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
              style={({ pressed }) => [
                styles.smallButton,
                pressed && styles.smallButtonPressed,
              ]}
            >
              <Text style={styles.smallButtonText}>ログアウト</Text>
            </Pressable>
          </View>
        </View>
        <Text style={styles.subtitle}>API: {apiBaseUrl}</Text>
      </View>

      <View style={styles.tabBar}>
        <TabButton label="在庫一覧" active={tab === "list"} onPress={() => setTab("list")} />
        <TabButton label="カテゴリ" active={tab === "category"} onPress={() => setTab("category")} />
        <TabButton label="物品" active={tab === "item"} onPress={() => setTab("item")} />
        <TabButton label="保管場所" active={tab === "storage"} onPress={() => setTab("storage")} />
      </View>

      {tab === "list" && (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.h2}>在庫一覧</Text>
              <View style={styles.headerActions}>
                <Pressable
                  onPress={() => setScannerOpen(true)}
                  accessibilityLabel="バーコードスキャン"
                  style={({ pressed }) => [
                    styles.iconButton,
                    pressed && styles.smallButtonPressed,
                  ]}
                >
                  <Text style={styles.iconButtonText}>⌖</Text>
                </Pressable>
                <Pressable
                  onPress={onRefresh}
                  accessibilityLabel="再読み込み"
                  style={({ pressed }) => [
                    styles.iconButton,
                    pressed && styles.smallButtonPressed,
                  ]}
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
                <Text
                  style={[
                    styles.chipText,
                    listFilter === "all" && styles.chipTextSelected,
                  ]}
                >
                  すべて
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setListFilter("out_of_stock")}
                style={[
                  styles.chip,
                  listFilter === "out_of_stock" && styles.chipSelected,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    listFilter === "out_of_stock" && styles.chipTextSelected,
                  ]}
                >
                  在庫切れのみ
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
                  listFilter !== "out_of_stock" ||
                  (itemsByCategory.map.get(c.id)?.length ?? 0) > 0,
              );
              const hasAny =
                visibleCategories.length > 0 ||
                itemsByCategory.orphan.length > 0;
              if (!hasAny) {
                return (
                  <Text style={styles.muted}>在庫切れの物品はありません</Text>
                );
              }
              return (
                <View style={styles.groupList}>
                  {visibleCategories.map((c) => (
                    <CategoryGroup
                      key={c.id}
                      title={c.name}
                      items={itemsByCategory.map.get(c.id) ?? []}
                      onIncrement={handleIncrement}
                      onDecrement={handleDecrement}
                      onOpenHistory={openHistory}
                      onEditBarcode={openBarcodeScannerFor}
                      onMoveCategory={setCategoryEditItem}
                    />
                  ))}
                  {itemsByCategory.orphan.length > 0 && (
                    <CategoryGroup
                      title="(カテゴリ未設定)"
                      items={itemsByCategory.orphan}
                      onIncrement={handleIncrement}
                      onDecrement={handleDecrement}
                      onOpenHistory={openHistory}
                      onEditBarcode={openBarcodeScannerFor}
                      onMoveCategory={setCategoryEditItem}
                    />
                  )}
                </View>
              );
            })()}
          </View>
        </ScrollView>
      )}

      {tab === "category" && (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.card}>
            <Text style={styles.h2}>カテゴリ追加</Text>
            <TextInput
              style={styles.input}
              value={categoryName}
              onChangeText={setCategoryName}
              placeholder="例: 工具"
              placeholderTextColor="#9ca3af"
            />
            <Pressable
              style={({ pressed }) => [
                styles.button,
                (!categoryName.trim() || pressed) && styles.buttonPressed,
              ]}
              onPress={handleAddCategory}
              disabled={!categoryName.trim()}
            >
              <Text style={styles.buttonText}>追加</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}

      {tab === "item" && (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.card}>
            <Text style={styles.h2}>物品追加</Text>
            {pendingBarcode && (
              <View style={styles.barcodeNotice}>
                <Text style={styles.barcodeNoticeLabel}>バーコード</Text>
                <Text style={styles.barcodeNoticeValue}>{pendingBarcode}</Text>
                <Pressable
                  onPress={() => setPendingBarcode(null)}
                  hitSlop={8}
                  accessibilityLabel="バーコードを解除"
                >
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
                    <Text
                      style={[
                        styles.chipText,
                        c.selected && styles.chipTextSelected,
                      ]}
                    >
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
            <Pressable
              style={({ pressed }) => [
                styles.button,
                (!itemName.trim() ||
                  itemCategoryId == null ||
                  pressed) &&
                  styles.buttonPressed,
              ]}
              onPress={handleAddItem}
              disabled={!itemName.trim() || itemCategoryId == null}
            >
              <Text style={styles.buttonText}>追加</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}

      {tab === "storage" && (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.card}>
            <Text style={styles.h2}>保管場所追加</Text>
            <Text style={styles.label}>カテゴリ</Text>
            <View style={styles.chipRow}>
              {categories.length === 0 ? (
                <Text style={styles.muted}>(カテゴリ未登録)</Text>
              ) : (
                categories.map((c) => {
                  const selected = c.id === storageCategoryId;
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => setStorageCategoryId(c.id)}
                      style={[styles.chip, selected && styles.chipSelected]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          selected && styles.chipTextSelected,
                        ]}
                      >
                        {c.name}
                      </Text>
                    </Pressable>
                  );
                })
              )}
            </View>
            <Text style={styles.label}>保管場所 (自由記述)</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={storageDescription}
              onChangeText={setStorageDescription}
              placeholder="例: 2F 倉庫 棚A-3"
              placeholderTextColor="#9ca3af"
              multiline
            />
            <Pressable
              style={({ pressed }) => [
                styles.button,
                (!storageDescription.trim() ||
                  storageCategoryId == null ||
                  pressed) &&
                  styles.buttonPressed,
              ]}
              onPress={handleAddStorage}
              disabled={!storageDescription.trim() || storageCategoryId == null}
            >
              <Text style={styles.buttonText}>追加</Text>
            </Pressable>
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
                      <Text style={styles.storageDesc}>{sl.description}</Text>
                      <View style={styles.storageBadge}>
                        <Text style={styles.storageBadgeText}>
                          {sl.category?.name ?? "(未設定)"}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {amountTarget && (
        <AmountModal
          item={amountTarget}
          onClose={() => setAmountTarget(null)}
          onConfirm={handleConfirmAmount}
        />
      )}

      <ScannerModal
        visible={scannerOpen}
        onClose={() => {
          setScannerOpen(false);
          setBarcodeTargetItem(null);
        }}
        onScanned={handleScanned}
        processing={scanProcessing}
        targetLabel={
          barcodeTargetItem
            ? `${barcodeTargetItem.name} にバーコードを設定`
            : null
        }
      />

      <Modal
        visible={categoryEditItem !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setCategoryEditItem(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setCategoryEditItem(null)}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.cardHeader}>
              <Text style={styles.h2}>
                {categoryEditItem?.name} のカテゴリ変更
              </Text>
              <Pressable onPress={() => setCategoryEditItem(null)}>
                <Text style={styles.link}>閉じる</Text>
              </Pressable>
            </View>
            {categories.length === 0 ? (
              <Text style={styles.muted}>(カテゴリ未登録)</Text>
            ) : (
              <View style={styles.chipRow}>
                {categories.map((c) => {
                  const selected = c.id === categoryEditItem?.category_id;
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => {
                        if (categoryEditItem && !selected) {
                          handleMoveCategory(categoryEditItem, c.id);
                        }
                      }}
                      style={[styles.chip, selected && styles.chipSelected]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          selected && styles.chipTextSelected,
                        ]}
                      >
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

      <Modal
        visible={historyItem !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setHistoryItem(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setHistoryItem(null)}
        >
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.cardHeader}>
              <Text style={styles.h2}>
                {historyItem?.name} の履歴
              </Text>
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
                      {h.amount != null && (
                        <Text style={styles.historyAmount}>
                          ¥{h.amount.toLocaleString("ja-JP")}
                        </Text>
                      )}
                    </View>
                    <View style={styles.historyMeta}>
                      <Text style={styles.muted}>
                        {new Date(h.changed_at).toLocaleString("ja-JP")}
                      </Text>
                      <Text style={styles.historyUser}>
                        {h.user?.name ?? "不明"}
                      </Text>
                    </View>
                  </View>
                )}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function ScannerModal({
  visible,
  onClose,
  onScanned,
  processing,
  targetLabel,
}: {
  visible: boolean;
  onClose: () => void;
  onScanned: (barcode: string) => void;
  processing: boolean;
  targetLabel?: string | null;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  // CameraView は毎フレーム発火するので、state ではなく ref で同期ガードする。
  // 一度ハンドラを呼んだら次にモーダルが開き直されるまで再発火させない。
  const handledRef = useRef(false);

  useEffect(() => {
    if (visible) handledRef.current = false;
  }, [visible]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
    >
      <SafeAreaView style={styles.scannerSafe}>
        <View style={styles.scannerHeader}>
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.scannerTitle}>バーコードをスキャン</Text>
            {targetLabel && (
              <Text style={styles.scannerTarget}>{targetLabel}</Text>
            )}
          </View>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={styles.scannerClose}>閉じる</Text>
          </Pressable>
        </View>
        {!permission ? (
          <View style={styles.scannerBody}>
            <ActivityIndicator />
          </View>
        ) : !permission.granted ? (
          <View style={styles.scannerBody}>
            <Text style={styles.scannerHint}>
              カメラへのアクセスが許可されていません。
            </Text>
            <Pressable
              onPress={requestPermission}
              style={({ pressed }) => [
                styles.button,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.buttonText}>権限をリクエスト</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.scannerBody}>
            <CameraView
              style={styles.cameraView}
              barcodeScannerSettings={{
                barcodeTypes: [
                  "ean13",
                  "ean8",
                  "upc_a",
                  "upc_e",
                  "code128",
                  "code39",
                  "code93",
                  "qr",
                ],
              }}
              onBarcodeScanned={({ data }) => {
                // ref ガードで同期的に弾く。state ベースだと毎フレーム発火に追いつかない。
                if (handledRef.current) return;
                handledRef.current = true;
                onScanned(data);
              }}
            />
            <View style={styles.scannerOverlay} pointerEvents="none">
              <View style={styles.scannerFrame} />
            </View>
            <Text style={styles.scannerHint}>
              {processing
                ? "処理中..."
                : "枠内にバーコードを収めてください"}
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
            style={({ pressed }) => [
              styles.button,
              (disabled || pressed) && styles.buttonPressed,
            ]}
            onPress={submit}
            disabled={disabled}
          >
            <Text style={styles.buttonText}>
              {submitting ? "ログイン中..." : "ログイン"}
            </Text>
          </Pressable>
          <Text style={styles.subtitle}>API: {apiBaseUrl}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function AmountModal({
  item,
  onClose,
  onConfirm,
}: {
  item: Item;
  onClose: () => void;
  onConfirm: (item: Item, amount: number | null) => void | Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (amount: number | null) => {
    setSaving(true);
    try {
      await onConfirm(item, amount);
    } finally {
      setSaving(false);
    }
  };

  const parsed = value.trim() === "" ? null : Math.floor(Number(value));
  const invalid = parsed != null && (!isFinite(parsed) || parsed < 0);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <View style={styles.cardHeader}>
            <Text style={styles.h2}>{item.name} の補充 (+1)</Text>
            <Pressable onPress={onClose}>
              <Text style={styles.link}>閉じる</Text>
            </Pressable>
          </View>
          <Text style={styles.muted}>
            在庫切れからの補充です。金額 (円) を入力してください。未入力でも追加できます。
          </Text>
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={setValue}
            keyboardType="number-pad"
            placeholder="例: 1200"
            placeholderTextColor="#9ca3af"
            autoFocus
          />
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
        </Pressable>
      </Pressable>
    </Modal>
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
      <Text style={[styles.tabButtonText, active && styles.tabButtonTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function CategoryGroup({
  title,
  items,
  onIncrement,
  onDecrement,
  onOpenHistory,
  onEditBarcode,
  onMoveCategory,
}: {
  title: string;
  items: Item[];
  onIncrement: (item: Item) => void;
  onDecrement: (item: Item) => void;
  onOpenHistory: (item: Item) => void;
  onEditBarcode: (item: Item) => void;
  onMoveCategory: (item: Item) => void;
}) {
  return (
    <View style={styles.group}>
      <View style={styles.groupHeader}>
        <Text style={styles.groupTitle}>{title}</Text>
        <Text style={styles.muted}>{items.length} 件</Text>
      </View>
      {items.length === 0 ? null : (
        <View>
          {items.map((item, idx) => (
            <View key={item.id}>
              {idx > 0 && <View style={styles.separator} />}
              <View style={styles.row}>
                <View style={styles.rowLeft}>
                  <Text style={styles.rowTitle}>{item.name}</Text>
                  <Pressable
                    onPress={() => onEditBarcode(item)}
                    hitSlop={6}
                    accessibilityLabel="バーコードを設定"
                  >
                    <Text style={styles.barcodeLine}>
                      <Text style={styles.barcodeIcon}>▮▮▮ </Text>
                      {item.barcode ? (
                        <Text style={styles.barcodeValue}>
                          {item.barcode}
                        </Text>
                      ) : (
                        <Text style={styles.barcodeMuted}>未設定</Text>
                      )}
                      <Text style={styles.barcodeMuted}>  ✎</Text>
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.rowRight}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.iconButton,
                      (item.stock <= 0 || pressed) &&
                        styles.smallButtonPressed,
                    ]}
                    onPress={() => onDecrement(item)}
                    disabled={item.stock <= 0}
                    accessibilityLabel="在庫減 (-1)"
                  >
                    <Text style={styles.iconButtonText}>−</Text>
                  </Pressable>
                  <Text
                    style={[
                      styles.stock,
                      item.stock === 0 && styles.stockEmpty,
                    ]}
                  >
                    {item.stock}
                  </Text>
                  <Pressable
                    style={({ pressed }) => [
                      styles.iconButton,
                      pressed && styles.smallButtonPressed,
                    ]}
                    onPress={() => onIncrement(item)}
                    accessibilityLabel="在庫増 (+1)"
                  >
                    <Text style={styles.iconButtonText}>＋</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.smallButton,
                      pressed && styles.smallButtonPressed,
                    ]}
                    onPress={() => onMoveCategory(item)}
                    accessibilityLabel="カテゴリを変更"
                  >
                    <Text style={styles.smallButtonText}>移動</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.smallButton,
                      pressed && styles.smallButtonPressed,
                    ]}
                    onPress={() => onOpenHistory(item)}
                  >
                    <Text style={styles.smallButtonText}>履歴</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ))}
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
  storageBadge: {
    flexShrink: 0,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
  },
  storageBadgeText: { fontSize: 11, color: "#475569" },
  h2: { fontSize: 16, fontWeight: "600", color: "#0f172a" },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    backgroundColor: "#fff",
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabButtonActive: { borderBottomColor: "#0f172a" },
  tabButtonPressed: { opacity: 0.5 },
  tabButtonText: { fontSize: 13, color: "#64748b" },
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
  // 名前側に最小幅を確保し、ボタン群が増えても潰れず読めるようにする。
  // 幅が足りなければ row の flexWrap でボタン群が次行へ折り返す。
  rowLeft: { flexShrink: 1, flexGrow: 1, minWidth: 150 },
  rowRight: { flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 8 },
  rowTitle: { fontSize: 15, fontWeight: "500", color: "#0f172a" },
  barcodeLine: { fontSize: 11, marginTop: 2, lineHeight: 14 },
  barcodeIcon: { color: "#94a3b8", letterSpacing: -1 },
  barcodeValue: {
    color: "#475569",
    fontVariant: ["tabular-nums"],
  },
  barcodeMuted: { color: "#94a3b8", fontStyle: "italic" },
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
  iconButtonText: {
    fontSize: 18,
    lineHeight: 20,
    color: "#0f172a",
  },
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    gap: 12,
    maxHeight: "70%",
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
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
  historyLeft: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  historyAmount: {
    fontSize: 12,
    color: "#059669",
    fontVariant: ["tabular-nums"],
  },
  amountActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: 8,
  },
  amountConfirm: { paddingHorizontal: 16 },
});

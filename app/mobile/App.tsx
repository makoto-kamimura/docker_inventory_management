// @ts-nocheck
// React Native 0.81 のクラスコンポーネント (View / Text / ScrollView 等) は
// React 19 の JSX 名前空間と型互換性がなく、TS2786 / TS2607 が発生する。
// これは Expo 54 ベースライン (初期テンプレートの App.tsx) でも同じく出る既知の上流問題。
// 実行時には Babel/Metro が型を見ないため動作に影響はない。
// react-native 型定義側で修正されたら本ディレクティブは削除して構わない。
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  type Category,
  type Item,
  type ItemHistory,
} from "./src/api";

type Tab = "list" | "category" | "item";

export default function App() {
  const [tab, setTab] = useState<Tab>("list");

  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [categoryName, setCategoryName] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemCategoryId, setItemCategoryId] = useState<number | null>(null);
  const [itemStock, setItemStock] = useState("0");

  const [historyItem, setHistoryItem] = useState<Item | null>(null);
  const [histories, setHistories] = useState<ItemHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [is, cs] = await Promise.all([
        api.listItems(),
        api.listCategories(),
      ]);
      setItems(is);
      setCategories(cs);
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
      await api.createItem({ name, category_id: itemCategoryId, stock });
      setItemName("");
      setItemStock("0");
      await reload();
      setTab("list");
    } catch (e) {
      Alert.alert("物品追加失敗", e instanceof Error ? e.message : String(e));
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
        <Text style={styles.h1}>在庫管理</Text>
        <Text style={styles.subtitle}>API: {apiBaseUrl}</Text>
      </View>

      <View style={styles.tabBar}>
        <TabButton label="在庫一覧" active={tab === "list"} onPress={() => setTab("list")} />
        <TabButton label="カテゴリ追加" active={tab === "category"} onPress={() => setTab("category")} />
        <TabButton label="物品追加" active={tab === "item"} onPress={() => setTab("item")} />
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
              <Pressable onPress={onRefresh}>
                <Text style={styles.link}>再読み込み</Text>
              </Pressable>
            </View>
            {loading ? (
              <ActivityIndicator />
            ) : items.length === 0 ? (
              <Text style={styles.muted}>物品がありません</Text>
            ) : (
              <View style={styles.groupList}>
                {categories.map((c) => (
                  <CategoryGroup
                    key={c.id}
                    title={c.name}
                    items={itemsByCategory.map.get(c.id) ?? []}
                    onDecrement={handleDecrement}
                    onOpenHistory={openHistory}
                  />
                ))}
                {itemsByCategory.orphan.length > 0 && (
                  <CategoryGroup
                    title="(カテゴリ未設定)"
                    items={itemsByCategory.orphan}
                    onDecrement={handleDecrement}
                    onOpenHistory={openHistory}
                  />
                )}
              </View>
            )}
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
                    <Text style={styles.historyChange}>
                      {h.change > 0 ? `+${h.change}` : String(h.change)}
                    </Text>
                    <Text style={styles.muted}>
                      {new Date(h.changed_at).toLocaleString("ja-JP")}
                    </Text>
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
  onDecrement,
  onOpenHistory,
}: {
  title: string;
  items: Item[];
  onDecrement: (item: Item) => void;
  onOpenHistory: (item: Item) => void;
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
                </View>
                <View style={styles.rowRight}>
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
                      styles.smallButton,
                      (item.stock <= 0 || pressed) &&
                        styles.smallButtonPressed,
                    ]}
                    onPress={() => onDecrement(item)}
                    disabled={item.stock <= 0}
                  >
                    <Text style={styles.smallButtonText}>−1</Text>
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
  scroll: { padding: 16, gap: 16 },
  h1: { fontSize: 24, fontWeight: "700", color: "#0f172a" },
  subtitle: { fontSize: 12, color: "#64748b", marginTop: 2 },
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
    gap: 12,
  },
  rowLeft: { flexShrink: 1, flexGrow: 1 },
  rowRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowTitle: { fontSize: 15, fontWeight: "500", color: "#0f172a" },
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
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  historyChange: {
    fontSize: 14,
    fontVariant: ["tabular-nums"],
    color: "#0f172a",
  },
});

import { useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import type { Category, Item, StorageLocation } from "../api";
import {
  EMPTY_LIST_MESSAGE,
  GROUP_BY_OPTIONS,
  LIST_FILTER_OPTIONS,
  averageAmount,
  buildSections,
  formatYen,
  isExpired,
  type GroupBy,
  type ItemSection as Section,
  type ListFilter,
} from "../inventory";
import { styles } from "../styles";
import { ChipSelect, IconButton, SmallButton } from "./ui";

/**
 * 品目行から開くダイアログの種類。
 * カテゴリ変更は行の幅が足りないため、名前編集ダイアログから開く。
 */
export type ItemAction = "name" | "barcode" | "group" | "storage" | "history" | "delete";

type RowHandlers = {
  onIncrement: (item: Item) => void;
  onDecrement: (item: Item) => void;
  onAction: (action: ItemAction, item: Item) => void;
};

export function InventoryList({
  items,
  categories,
  storageLocations,
  loading,
  refreshing,
  filter,
  groupBy,
  onChangeFilter,
  onChangeGroupBy,
  onRefresh,
  ...handlers
}: {
  items: Item[];
  categories: Category[];
  storageLocations: StorageLocation[];
  loading: boolean;
  refreshing: boolean;
  filter: ListFilter;
  groupBy: GroupBy;
  onChangeFilter: (next: ListFilter) => void;
  onChangeGroupBy: (next: GroupBy) => void;
  onRefresh: () => void;
} & RowHandlers) {
  const sections = useMemo(
    () => buildSections(items, filter, groupBy, categories, storageLocations),
    [items, filter, groupBy, categories, storageLocations],
  );

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.h2}>在庫一覧</Text>
          <IconButton label="再読み込み" icon="↻" onPress={onRefresh} />
        </View>
        <ChipSelect options={LIST_FILTER_OPTIONS} value={filter} onChange={onChangeFilter} />
        <ChipSelect options={GROUP_BY_OPTIONS} value={groupBy} onChange={onChangeGroupBy} />
        {loading ? (
          <ActivityIndicator />
        ) : items.length === 0 || sections.length === 0 ? (
          <Text style={styles.muted}>
            {EMPTY_LIST_MESSAGE[items.length === 0 ? "all" : filter]}
          </Text>
        ) : (
          <View style={styles.sectionList}>
            {sections.map((section) => (
              <ItemSection
                key={section.key}
                section={section}
                showAvgAmount={filter === "out_of_stock"}
                showExpiresAt={filter === "expires_soon"}
                {...handlers}
              />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function ItemSection({
  section,
  ...rowProps
}: {
  section: Section;
  showAvgAmount: boolean;
  showExpiresAt: boolean;
} & RowHandlers) {
  // 画面が狭いため初期状態は折りたたみ
  const [expanded, setExpanded] = useState(false);
  const open = expanded && section.items.length > 0;

  return (
    <View style={styles.section}>
      <Pressable
        style={[styles.sectionHeader, !open && styles.sectionHeaderNoBorder]}
        onPress={() => setExpanded((v) => !v)}
        accessibilityLabel={`${section.title} を${expanded ? "折りたたむ" : "展開する"}`}
      >
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionChevron}>{expanded ? "▼" : "▶"}</Text>
          <Text style={styles.sectionTitle}>{section.title}</Text>
        </View>
        <Text style={styles.muted}>{section.items.length} 件</Text>
      </Pressable>
      {open &&
        section.items.map((item, idx) => (
          <View key={item.id}>
            {idx > 0 && <View style={styles.separator} />}
            <ItemRow item={item} {...rowProps} />
          </View>
        ))}
    </View>
  );
}

function ItemRow({
  item,
  showAvgAmount,
  showExpiresAt,
  onIncrement,
  onDecrement,
  onAction,
}: {
  item: Item;
  showAvgAmount: boolean;
  showExpiresAt: boolean;
} & RowHandlers) {
  const avgAmount = averageAmount(item);

  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <View style={styles.rowTitleRow}>
          <Text style={styles.rowTitle}>{item.name}</Text>
          <Pressable onPress={() => onAction("name", item)} hitSlop={8} accessibilityLabel="名前を編集">
            <Text style={styles.attrMuted}>✎</Text>
          </Pressable>
        </View>
        <AttributeLine
          icon="▮▮▮"
          label="バーコードを編集"
          value={item.barcode ? <Text style={styles.attrValue}>{item.barcode}</Text> : null}
          placeholder="未設定"
          onPress={() => onAction("barcode", item)}
        />
        <AttributeLine
          icon="⊞"
          label="グループを編集"
          value={item.group?.name ? <Text style={styles.attrBadge}>{item.group.name}</Text> : null}
          placeholder="グループ未設定"
          onPress={() => onAction("group", item)}
        />
        <AttributeLine
          icon="📍"
          label="保管場所を編集"
          value={
            item.storage_location ? (
              <Text style={styles.attrBadge}>{item.storage_location.description}</Text>
            ) : null
          }
          placeholder="保管場所未設定"
          onPress={() => onAction("storage", item)}
        />
        {showAvgAmount && avgAmount != null && (
          <Text style={styles.avgAmountLine}>平均単価 {formatYen(avgAmount)}</Text>
        )}
        {showExpiresAt && item.nearest_expires_at != null && (
          <Text
            style={[
              styles.expiresAtLine,
              isExpired(item.nearest_expires_at) ? styles.expiresAtExpired : styles.expiresAtSoon,
            ]}
          >
            期限 {item.nearest_expires_at}
          </Text>
        )}
      </View>
      <View style={styles.rowRight}>
        <IconButton
          label="在庫減 (-1)"
          icon="−"
          onPress={() => onDecrement(item)}
          disabled={item.stock <= 0}
        />
        <Text style={[styles.stock, item.stock <= 0 && styles.stockEmpty]}>{item.stock}</Text>
        <IconButton label="在庫増 (+1)" icon="＋" onPress={() => onIncrement(item)} />
        <SmallButton label="履歴" onPress={() => onAction("history", item)} />
        <SmallButton label="削除" danger onPress={() => onAction("delete", item)} />
      </View>
    </View>
  );
}

function AttributeLine({
  icon,
  label,
  value,
  placeholder,
  onPress,
}: {
  icon: string;
  label: string;
  value: ReactNode | null;
  placeholder: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={6} accessibilityLabel={label}>
      <Text style={styles.attrLine}>
        <Text style={styles.attrIcon}>{icon} </Text>
        {value ?? <Text style={styles.attrMuted}>{placeholder}</Text>}
        <Text style={styles.attrMuted}>  ✎</Text>
      </Text>
    </Pressable>
  );
}

import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { Category, ItemGroup, StorageLocation } from "../api";
import { canSubmitDraft, draftStock, type ItemDraft } from "../inventory";
import { colors, styles } from "../styles";
import { ChipSelect, DateField, FooterButton } from "./ui";

export function ItemForm({
  draft,
  onChange,
  onSubmit,
  categories,
  itemGroups,
  storageLocations,
}: {
  draft: ItemDraft;
  onChange: (patch: Partial<ItemDraft>) => void;
  onSubmit: () => void;
  categories: Category[];
  itemGroups: ItemGroup[];
  storageLocations: StorageLocation[];
}) {
  return (
    <>
      <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.h2}>物品追加</Text>
          {draft.barcode && (
            <View style={styles.barcodeNotice}>
              <Text style={styles.barcodeNoticeLabel}>バーコード</Text>
              <Text style={styles.barcodeNoticeValue}>{draft.barcode}</Text>
              <Pressable
                onPress={() => onChange({ barcode: null })}
                hitSlop={8}
                accessibilityLabel="バーコードを解除"
              >
                <Text style={styles.barcodeNoticeClear}>×</Text>
              </Pressable>
            </View>
          )}
          <TextInput
            style={styles.input}
            value={draft.name}
            onChangeText={(name) => onChange({ name })}
            placeholder="名前"
            placeholderTextColor={colors.placeholder}
          />
          <Text style={styles.label}>カテゴリ</Text>
          {categories.length === 0 ? (
            <Text style={styles.muted}>(カテゴリ未登録)</Text>
          ) : (
            <ChipSelect
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
              value={draft.categoryId}
              onChange={(categoryId) => onChange({ categoryId })}
            />
          )}
          <Text style={styles.label}>初期在庫</Text>
          <TextInput
            style={styles.input}
            value={draft.stock}
            onChangeText={(stock) => onChange({ stock })}
            keyboardType="number-pad"
          />
          {draftStock(draft) > 0 && (
            <>
              <Text style={styles.label}>単価 (任意)</Text>
              <View style={styles.amountInputRow}>
                <Text style={styles.amountPrefix}>¥</Text>
                <TextInput
                  style={[styles.input, styles.flex]}
                  value={draft.amount}
                  onChangeText={(amount) => onChange({ amount })}
                  keyboardType="number-pad"
                  placeholder="例: 1200"
                  placeholderTextColor={colors.placeholder}
                />
              </View>
              <Text style={styles.label}>期限 (任意)</Text>
              <DateField value={draft.expiresAt} onChange={(expiresAt) => onChange({ expiresAt })} />
            </>
          )}
          <Text style={styles.label}>グループ (任意)</Text>
          <ChipSelect
            options={[
              { value: null, label: "なし" },
              ...itemGroups.map((g) => ({ value: g.id, label: g.name })),
            ]}
            value={draft.groupId}
            onChange={(groupId) => onChange({ groupId })}
          />
          <Text style={styles.label}>保管場所 (任意)</Text>
          <ChipSelect
            options={[
              { value: null, label: "なし" },
              ...storageLocations.map((sl) => ({ value: sl.id, label: sl.description })),
            ]}
            value={draft.storageLocationId}
            onChange={(storageLocationId) => onChange({ storageLocationId })}
          />
        </View>
      </ScrollView>
      <FooterButton disabled={!canSubmitDraft(draft)} onPress={onSubmit} />
    </>
  );
}

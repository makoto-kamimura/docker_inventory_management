import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { Category, ItemGroup, StorageLocation } from "../api";
import { canSubmitDraft, draftStock, type ItemDraft } from "../inventory";
import { colors, styles } from "../styles";
import { Callout, ChipSelect, DateField, FieldLabel, FooterButton, Hint, ScreenIntro } from "./ui";

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
        <ScreenIntro screen="item" />
        <View style={styles.card}>
          <Text style={styles.h2}>新しい物品</Text>
          <Hint>名前とカテゴリを入れると追加できます。ほかの項目はあとから一覧で変更できます。</Hint>
          {draft.barcode && (
            <View style={styles.barcodeNotice}>
              <Text style={styles.barcodeNoticeLabel}>スキャンしたバーコード</Text>
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
          <FieldLabel label="名前" required />
          <TextInput
            style={styles.input}
            value={draft.name}
            onChangeText={(name) => onChange({ name })}
            placeholder="例: トイレットペーパー 12ロール"
            placeholderTextColor={colors.placeholder}
          />
          <FieldLabel label="カテゴリ" required />
          {categories.length === 0 ? (
            <Callout tone="warning">カテゴリがまだありません。先にカテゴリタブで作成してください。</Callout>
          ) : (
            <ChipSelect
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
              value={draft.categoryId}
              onChange={(categoryId) => onChange({ categoryId })}
            />
          )}
          <FieldLabel label="初期在庫" />
          <TextInput
            style={styles.input}
            value={draft.stock}
            onChangeText={(stock) => onChange({ stock })}
            keyboardType="number-pad"
          />
          <Hint>0 のままにすると「在庫切れ」として登録されます。</Hint>
          {draftStock(draft) > 0 && (
            <View style={styles.optionalBox}>
              <FieldLabel label="単価" />
              <View style={styles.amountInputRow}>
                <Text style={styles.amountPrefix}>¥</Text>
                <TextInput
                  style={[styles.input, styles.flex]}
                  value={draft.amount}
                  onChangeText={(amount) => onChange({ amount })}
                  keyboardType="number-pad"
                  placeholder="例: 480"
                  placeholderTextColor={colors.placeholder}
                />
              </View>
              <Hint>平均単価として、在庫切れの一覧に表示されます。</Hint>
              <FieldLabel label="期限" />
              <DateField value={draft.expiresAt} onChange={(expiresAt) => onChange({ expiresAt })} />
              <Hint>1ヶ月以内になると「期限間近」として表示されます。</Hint>
            </View>
          )}
          <FieldLabel label="グループ" />
          <ChipSelect
            options={[
              { value: null, label: "なし" },
              ...itemGroups.map((g) => ({ value: g.id, label: g.name })),
            ]}
            value={draft.groupId}
            onChange={(groupId) => onChange({ groupId })}
          />
          <Hint>銘柄違いなど、同じ用途の物品をまとめるときに使います。</Hint>
          <FieldLabel label="保管場所" />
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

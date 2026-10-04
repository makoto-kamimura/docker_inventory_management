import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { api, type Item, type ItemHistory } from "../api";
import { errorMessage, formatChange, formatYen, isValidAmount, parseAmount } from "../inventory";
import { colors, styles } from "../styles";
import {
  Badge,
  Callout,
  ChipSelect,
  DateField,
  FieldLabel,
  Hint,
  Overlay,
  PrimaryButton,
  SmallButton,
  useBusy,
} from "./ui";

export function NameEditModal({
  item,
  onClose,
  onSave,
  onMoveCategory,
}: {
  item: Item;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
  onMoveCategory: () => void;
}) {
  const [value, setValue] = useState(item.name);
  const [saving, run] = useBusy();
  const trimmed = value.trim();
  const canSave = !saving && trimmed !== "" && trimmed !== item.name;

  const submit = () => {
    if (canSave) void run(() => onSave(trimmed));
  };

  return (
    <Overlay title="品目名の編集" onClose={onClose}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={setValue}
        maxLength={255}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <SmallButton label="カテゴリを変更" onPress={onMoveCategory} disabled={saving} />
      <View style={styles.actions}>
        <SmallButton label="キャンセル" onPress={onClose} disabled={saving} />
        <PrimaryButton label="保存" onPress={submit} disabled={!canSave} />
      </View>
    </Overlay>
  );
}

export function BarcodeEditModal({
  item,
  onClose,
  onSave,
  onScan,
}: {
  item: Item;
  onClose: () => void;
  onSave: (barcode: string | null) => Promise<void>;
  onScan: () => void;
}) {
  const [value, setValue] = useState(item.barcode ?? "");
  const [saving, run] = useBusy();
  const trimmed = value.trim();

  return (
    <Overlay title={`${item.name} のバーコード`} onClose={onClose}>
      <TextInput
        style={[styles.input, styles.monoInput]}
        value={value}
        onChangeText={setValue}
        placeholder="例: 4901234567890"
        placeholderTextColor={colors.placeholder}
        maxLength={64}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <SmallButton label="📷 カメラで読み取る" onPress={onScan} disabled={saving} />
      <View style={styles.actions}>
        {item.barcode && (
          <SmallButton label="解除" danger onPress={() => run(() => onSave(null))} disabled={saving} />
        )}
        <SmallButton label="キャンセル" onPress={onClose} disabled={saving} />
        <PrimaryButton
          label="保存"
          onPress={() => run(() => onSave(trimmed === "" ? null : trimmed))}
          disabled={saving || trimmed === (item.barcode ?? "")}
        />
      </View>
    </Overlay>
  );
}

/** カテゴリ / グループ / 保管場所の付け替え。チップを押すと即保存する */
export function SelectModal({
  title,
  options,
  current,
  noneLabel,
  emptyText,
  onClose,
  onSave,
}: {
  title: string;
  options: { id: number; label: string }[];
  current: number | null;
  noneLabel?: string;
  emptyText?: string;
  onClose: () => void;
  onSave: (id: number | null) => Promise<void>;
}) {
  const [saving, run] = useBusy();
  const choices = [
    ...(noneLabel != null ? [{ value: null, label: noneLabel }] : []),
    ...options.map((o) => ({ value: o.id as number | null, label: o.label })),
  ];

  return (
    <Overlay title={title} onClose={onClose}>
      {choices.length === 0 ? (
        <Text style={styles.muted}>{emptyText ?? "(未登録)"}</Text>
      ) : (
        <ChipSelect
          options={choices}
          value={current}
          onChange={(id) => {
            if (!saving && id !== current) void run(() => onSave(id));
          }}
        />
      )}
    </Overlay>
  );
}

/** 在庫0からの補充 (+1)。金額と期限を任意で記録する */
export function AmountModal({
  item,
  onClose,
  onConfirm,
}: {
  item: Item;
  onClose: () => void;
  onConfirm: (amount: number | null, expiresAt: string | null) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [saving, run] = useBusy();
  const amount = parseAmount(value);

  const submit = (withAmount: boolean) =>
    run(() => onConfirm(withAmount ? amount : null, expiresAt.trim() || null));

  return (
    <Overlay title={`${item.name} の補充 (+1)`} onClose={onClose}>
      <Callout tone="success">
        在庫切れからの補充です。金額と期限を入れておくと、平均単価や期限の表示に使われます（どちらも任意）。
      </Callout>
      <FieldLabel label="金額 (円)" />
      <View style={styles.amountInputRow}>
        <Text style={styles.amountPrefix}>¥</Text>
        <TextInput
          style={[styles.input, styles.flex]}
          value={value}
          onChangeText={setValue}
          keyboardType="number-pad"
          placeholder="例: 1200"
          placeholderTextColor={colors.placeholder}
          autoFocus
        />
      </View>
      <FieldLabel label="期限" />
      <DateField value={expiresAt} onChange={setExpiresAt} />
      <Hint>1ヶ月以内になると、在庫一覧で「期限間近」と表示されます。</Hint>
      <View style={styles.actions}>
        <SmallButton label="キャンセル" onPress={onClose} disabled={saving} />
        <SmallButton label="金額なしで +1" onPress={() => submit(false)} disabled={saving} />
        <PrimaryButton
          label="+1 して記録"
          onPress={() => submit(true)}
          disabled={saving || !isValidAmount(amount)}
        />
      </View>
    </Overlay>
  );
}

export function HistoryModal({ item, onClose }: { item: Item; onClose: () => void }) {
  const [histories, setHistories] = useState<ItemHistory[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.listHistories(item.id).then(
      (hs) => active && setHistories(hs),
      (e) => active && setError(errorMessage(e)),
    );
    return () => {
      active = false;
    };
  }, [item.id]);

  return (
    <Overlay title={`${item.name} の履歴`} onClose={onClose} scroll={false}>
      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : histories == null ? (
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
                <Text
                  style={[styles.historyChange, h.change > 0 ? styles.historyChangeIn : styles.historyChangeOut]}
                >
                  {formatChange(h.change)}
                </Text>
                <View>
                  {h.amount != null && <Text style={styles.historyAmount}>{formatYen(h.amount)}</Text>}
                  {h.expires_at != null && <Text style={styles.historyExpires}>期限 {h.expires_at}</Text>}
                </View>
              </View>
              <View style={styles.historyMeta}>
                <Text style={styles.muted}>{new Date(h.changed_at).toLocaleString("ja-JP")}</Text>
                <Text style={styles.historyUser}>{h.user?.name ?? "不明"}</Text>
              </View>
            </View>
          )}
        />
      )}
    </Overlay>
  );
}

/** スキャンした品目が登録済みのとき、入庫 (+1) か払い出し (-1) かを選ぶ */
export function ScanActionModal({
  item,
  onClose,
  onIncrement,
  onDecrement,
}: {
  item: Item;
  onClose: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  const canDecrement = item.stock > 0;

  return (
    <Overlay title="入庫 / 払い出し" onClose={onClose}>
      <View style={styles.scanItemBox}>
        <Text style={styles.scanItemName}>{item.name}</Text>
        {item.barcode && <Text style={styles.scanBarcode}>▮▮▮ {item.barcode}</Text>}
        <Badge
          tone={canDecrement ? "info" : "danger"}
          label={canDecrement ? `現在の在庫 ${item.stock}` : "在庫切れ"}
        />
      </View>
      <Hint>買ってきたら「入庫」、使ったら「払い出し」を選んでください。</Hint>
      <View style={styles.scanChoiceRow}>
        <Pressable
          onPress={onIncrement}
          accessibilityLabel="入庫 (+1)"
          style={({ pressed }) => [
            styles.scanChoice,
            styles.scanChoiceIncrement,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.scanChoiceIcon}>＋</Text>
          <Text style={styles.scanChoiceText}>入庫 (+1)</Text>
        </Pressable>
        <Pressable
          onPress={onDecrement}
          disabled={!canDecrement}
          accessibilityLabel="払い出し (-1)"
          style={({ pressed }) => [
            styles.scanChoice,
            styles.scanChoiceDecrement,
            !canDecrement && styles.scanChoiceDisabled,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.scanChoiceIcon}>−</Text>
          <Text style={styles.scanChoiceText}>払い出し (-1)</Text>
        </Pressable>
      </View>
      {!canDecrement && (
        <Hint>在庫が 0 のため、払い出しはできません。入庫すると金額と期限を入力できます。</Hint>
      )}
      <View style={styles.actions}>
        <SmallButton label="キャンセル" onPress={onClose} />
      </View>
    </Overlay>
  );
}

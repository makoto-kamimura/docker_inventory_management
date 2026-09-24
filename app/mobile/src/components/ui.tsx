import DateTimePicker from "@react-native-community/datetimepicker";
import { useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { parseLocalDate, toLocalDateString, type Option } from "../inventory";
import { styles } from "../styles";

/** 非同期処理中フラグ付きで処理を実行する (保存ボタンの二重押し防止) */
export function useBusy() {
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };
  return [busy, run] as const;
}

export function confirmDelete(title: string, message: string, onConfirm: () => void) {
  Alert.alert(title, message, [
    { text: "キャンセル", style: "cancel" },
    { text: "削除", style: "destructive", onPress: onConfirm },
  ]);
}

/**
 * 画面内に重ねるダイアログ。
 * iOS では RN の Modal を閉じると同時に別の Modal を開くと表示されないことがあるため
 * (スキャナー → 金額入力 など)、スキャナー以外のダイアログはすべてこのオーバーレイで表示する。
 * scroll=false のときは子要素側でスクロール (FlatList 等) を用意する。
 */
export function Overlay({
  title,
  onClose,
  scroll = true,
  children,
}: {
  title: string;
  onClose: () => void;
  scroll?: boolean;
  children: ReactNode;
}) {
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <KeyboardAvoidingView
        style={styles.modalFill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.modalBackdrop} onPress={onClose}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <View style={styles.cardHeader}>
              <Text style={styles.h2}>{title}</Text>
              <Pressable onPress={onClose} hitSlop={8}>
                <Text style={styles.link}>閉じる</Text>
              </Pressable>
            </View>
            {scroll ? (
              <ScrollView
                style={styles.modalScroll}
                contentContainerStyle={styles.modalContent}
                keyboardShouldPersistTaps="handled"
              >
                {children}
              </ScrollView>
            ) : (
              children
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </View>
  );
}

export function TabButton({
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
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
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

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityState={{ selected }}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

/** 単一選択のチップ列 */
export function ChipSelect<T extends string | number | null>({
  options,
  value,
  onChange,
}: {
  options: Option<T>[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((opt) => (
        <Chip
          key={String(opt.value)}
          label={opt.label}
          selected={opt.value === value}
          onPress={() => onChange(opt.value)}
        />
      ))}
    </View>
  );
}

export function IconButton({
  label,
  icon,
  onPress,
  disabled = false,
}: {
  label: string;
  icon: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.iconButton,
        (disabled || pressed) && styles.smallButtonPressed,
      ]}
    >
      <Text style={styles.iconButtonText}>{icon}</Text>
    </Pressable>
  );
}

export function SmallButton({
  label,
  onPress,
  disabled = false,
  danger = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        danger ? styles.deleteButton : styles.smallButton,
        (disabled || pressed) && styles.smallButtonPressed,
      ]}
    >
      <Text style={danger ? styles.deleteButtonText : styles.smallButtonText}>{label}</Text>
    </Pressable>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.button, (disabled || pressed) && styles.buttonPressed]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

/** 画面下部に固定する追加ボタン */
export function FooterButton({
  disabled,
  onPress,
}: {
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <View style={styles.fixedBottom}>
      <PrimaryButton label="追加" onPress={onPress} disabled={disabled} />
    </View>
  );
}

/** 日付入力 ("YYYY-MM-DD" / 空文字)。iOS はインライン、Android はダイアログで選ぶ */
export function DateField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const date = value ? parseLocalDate(value) : new Date();

  const clearButton = value !== "" && (
    <Pressable onPress={() => onChange("")} hitSlop={8} accessibilityLabel="日付をクリア">
      <Text style={styles.datePickerClear}>×</Text>
    </Pressable>
  );

  if (Platform.OS === "ios") {
    return (
      <View style={styles.datePickerCompactRow}>
        <DateTimePicker
          value={date}
          mode="date"
          display="compact"
          onChange={(_, selected) => {
            if (selected) onChange(toLocalDateString(selected));
          }}
        />
        {clearButton}
      </View>
    );
  }

  return (
    <>
      <Pressable onPress={() => setPickerOpen(true)} style={styles.datePickerButton}>
        <Text style={value ? styles.datePickerText : styles.datePickerPlaceholder}>
          {value || "日付を選択"}
        </Text>
        {clearButton}
      </Pressable>
      {pickerOpen && (
        <DateTimePicker
          value={date}
          mode="date"
          display="default"
          onChange={(event, selected) => {
            setPickerOpen(false);
            if (event.type === "set" && selected) onChange(toLocalDateString(selected));
          }}
        />
      )}
    </>
  );
}

/** 見出し付きの一覧カード (読み込み中 / 空表示 / 区切り線を含む) */
export function ListCard<T>({
  title,
  loading,
  emptyText,
  data,
  keyOf,
  renderRow,
}: {
  title: string;
  loading: boolean;
  emptyText: string;
  data: T[];
  keyOf: (row: T) => string | number;
  renderRow: (row: T) => ReactNode;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.h2}>{title}</Text>
      {loading ? (
        <ActivityIndicator />
      ) : data.length === 0 ? (
        <Text style={styles.muted}>{emptyText}</Text>
      ) : (
        <View>
          {data.map((row, idx) => (
            <View key={keyOf(row)}>
              {idx > 0 && <View style={styles.separator} />}
              {renderRow(row)}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

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
import {
  SCREEN_INTRO,
  parseLocalDate,
  toLocalDateString,
  type Option,
  type Screen,
} from "../inventory";
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

export type Tone = "info" | "success" | "warning" | "danger" | "neutral";

// 色だけに頼らず、アイコンと文言を必ず添える (しおりカレンダーと同じ方針)
const CALLOUT_STYLE = {
  info: [styles.calloutInfo, styles.calloutInfoText, "ℹ️"],
  success: [styles.calloutSuccess, styles.calloutSuccessText, "✅"],
  warning: [styles.calloutWarning, styles.calloutWarningText, "⚠️"],
  danger: [styles.calloutDanger, styles.calloutDangerText, "⛔"],
  neutral: [styles.calloutInfo, styles.calloutInfoText, "ℹ️"],
} as const;

const BADGE_STYLE = {
  info: [styles.badgeInfo, styles.badgeInfoText],
  success: [styles.badgeSuccess, styles.badgeSuccessText],
  warning: [styles.badgeWarning, styles.badgeWarningText],
  danger: [styles.badgeDanger, styles.badgeDangerText],
  neutral: [styles.badgeNeutral, styles.badgeNeutralText],
} as const;

/** アプリのロゴマーク */
export function LogoMark({ large = false }: { large?: boolean }) {
  return (
    <View style={[styles.logo, large && styles.logoLarge]}>
      <Text style={[styles.logoText, large && styles.logoTextLarge]}>📦</Text>
    </View>
  );
}

/** タブと画面見出しのアイコン */
export const SCREEN_ICON: Record<Screen, string> = {
  scan: "📷",
  list: "📦",
  item: "➕",
  category: "🏷️",
  group: "🗂️",
  storage: "📍",
  analytics: "📊",
};

/** 画面の見出しと説明文 */
export function ScreenIntro({ screen }: { screen: Screen }) {
  const icon = SCREEN_ICON[screen];
  const { title, description } = SCREEN_INTRO[screen];
  return (
    <View style={styles.intro}>
      <View style={styles.introIcon}>
        <Text style={styles.introIconText}>{icon}</Text>
      </View>
      <View style={styles.introBody}>
        <Text style={styles.introTitle}>{title}</Text>
        <Text style={styles.introText}>{description}</Text>
      </View>
    </View>
  );
}

/** 補足説明の囲み */
export function Callout({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  const [box, text, icon] = CALLOUT_STYLE[tone];
  return (
    <View style={[styles.callout, box]}>
      <Text style={styles.calloutIcon}>{icon}</Text>
      <Text style={[styles.calloutText, text]}>{children}</Text>
    </View>
  );
}

/** データがないときの案内 */
export function EmptyState({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description?: string;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Text style={styles.emptyIconText}>{icon}</Text>
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {description && <Text style={styles.emptyText}>{description}</Text>}
    </View>
  );
}

/** 入力欄の下の補足 */
export function Hint({ children }: { children: ReactNode }) {
  return <Text style={styles.hint}>{children}</Text>;
}

export function Badge({ tone = "neutral", label }: { tone?: Tone; label: string }) {
  const [box, text] = BADGE_STYLE[tone];
  return (
    <View style={[styles.badge, box]}>
      <Text style={[styles.badgeText, text]}>{label}</Text>
    </View>
  );
}

/** 入力欄のラベル (必須 / 任意の表示つき) */
export function FieldLabel({ label, required = false }: { label: string; required?: boolean }) {
  return (
    <Text style={styles.label}>
      {label}{" "}
      <Text style={required ? styles.labelRequired : styles.labelOptional}>
        {required ? "必須" : "任意"}
      </Text>
    </Text>
  );
}

export function TabButton({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: string;
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
      <Text style={[styles.tabButtonIcon, active && styles.tabButtonIconActive]}>{icon}</Text>
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
  tone,
}: {
  label: string;
  icon: string;
  onPress: () => void;
  disabled?: boolean;
  /** increment = 入庫 (緑) / decrement = 払い出し (琥珀) */
  tone?: "increment" | "decrement";
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.iconButton,
        tone === "increment" && styles.iconButtonIncrement,
        tone === "decrement" && styles.iconButtonDecrement,
        (disabled || pressed) && styles.smallButtonPressed,
      ]}
    >
      <Text
        style={[
          styles.iconButtonText,
          tone === "increment" && styles.iconButtonIncrementText,
          tone === "decrement" && styles.iconButtonDecrementText,
        ]}
      >
        {icon}
      </Text>
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
  icon,
  loading,
  emptyText,
  emptyDescription,
  data,
  keyOf,
  renderRow,
}: {
  title: string;
  icon: string;
  loading: boolean;
  emptyText: string;
  emptyDescription?: string;
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
        <EmptyState icon={icon} title={emptyText} description={emptyDescription} />
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

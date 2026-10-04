import { Pressable, ScrollView, Text, View } from "react-native";
import { colors, styles } from "../styles";
import { Callout, Hint, ScreenIntro } from "./ui";

const STEPS = [
  {
    icon: "📷",
    background: colors.primarySoft,
    title: "バーコードを読み取る",
    body: "上のボタンを押すとカメラが起動します。",
  },
  {
    icon: "🔁",
    background: colors.successSoft,
    title: "登録済みなら入庫 / 払い出し",
    body: "買ってきたら「入庫 (+1)」、使ったら「払い出し (-1)」を選びます。",
  },
  {
    icon: "🆕",
    background: "#f0f9ff",
    title: "未登録なら物品追加へ",
    body: "バーコードを引き継いだまま、物品追加の画面に進みます。",
  },
];

/** 初期表示のスキャン画面。登録済みなら入庫/払い出しを選び、未登録なら物品追加に進む */
export function ScanPanel({ onScan }: { onScan: () => void }) {
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <ScreenIntro screen="scan" />
      <View style={[styles.card, styles.scanCard]}>
        <View style={styles.scanButtonRing}>
          <Pressable
            onPress={onScan}
            accessibilityRole="button"
            accessibilityLabel="バーコードをスキャン"
            style={({ pressed }) => [styles.scanButton, pressed && styles.buttonPressed]}
          >
            <Text style={styles.scanButtonIcon}>⌖</Text>
            <Text style={styles.scanButtonText}>スキャン</Text>
          </Pressable>
        </View>
        <Text style={styles.scanHint}>ボタンを押すと読み取りが始まります</Text>
      </View>

      <View style={styles.card}>
        {STEPS.map((step, i) => (
          <View key={step.title} style={styles.stepRow}>
            <View style={[styles.stepIcon, { backgroundColor: step.background }]}>
              <Text style={styles.stepIconText}>{step.icon}</Text>
            </View>
            <View style={styles.stepBody}>
              <Text style={styles.stepTitle}>
                {i + 1}. {step.title}
              </Text>
              <Hint>{step.body}</Hint>
            </View>
          </View>
        ))}
      </View>

      <Callout>払い出しは在庫が 1 以上のときだけ選べます。在庫 0 から入庫すると、金額と期限を記録できます。</Callout>
    </ScrollView>
  );
}

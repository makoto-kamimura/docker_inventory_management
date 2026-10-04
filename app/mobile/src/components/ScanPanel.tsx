import { Pressable, ScrollView, Text, View } from "react-native";
import { styles } from "../styles";

/** 初期表示のスキャン画面。登録済みなら入庫/払い出しを選び、未登録なら物品追加に進む */
export function ScanPanel({ onScan }: { onScan: () => void }) {
  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={[styles.card, styles.scanCard]}>
        <Text style={styles.scanHint}>
          バーコードを読み取って、入庫・払い出しや物品の追加を行います。
        </Text>
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
    </ScrollView>
  );
}

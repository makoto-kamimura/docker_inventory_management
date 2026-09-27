import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { SafeAreaView, Text, TextInput, View } from "react-native";
import { api, apiBaseUrl, type User } from "../api";
import { errorMessage } from "../inventory";
import { colors, styles } from "../styles";
import { PrimaryButton } from "./ui";

export function LoginScreen({ onLoggedIn }: { onLoggedIn: (user: User) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      onLoggedIn(await api.login(email.trim(), password));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="auto" />
      <View style={styles.loginWrap}>
        <View style={styles.card}>
          <Text style={styles.h1}>ストクル ログイン</Text>
          {error && <Text style={styles.loginError}>{error}</Text>}
          <Text style={styles.label}>メールアドレス</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor={colors.placeholder}
          />
          <Text style={styles.label}>パスワード</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="パスワード"
            placeholderTextColor={colors.placeholder}
          />
          <PrimaryButton
            label={submitting ? "ログイン中..." : "ログイン"}
            onPress={() => void submit()}
            disabled={submitting || !email.trim() || !password}
          />

          <Text style={styles.subtitle}>API: {apiBaseUrl}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

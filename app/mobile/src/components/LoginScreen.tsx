import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { SafeAreaView, Text, TextInput, View } from "react-native";
import { api, apiBaseUrl, type User } from "../api";
import { errorMessage } from "../inventory";
import { signInWithSso } from "../sso";
import { colors, styles } from "../styles";
import { LogoMark, PrimaryButton, SmallButton } from "./ui";

export function LoginScreen({ onLoggedIn }: { onLoggedIn: (user: User) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sso, setSso] = useState<string | null>(null);

  useEffect(() => {
    void api.ssoProviders().then((p) => setSso(p.sso ? p.sso_name || "SSO" : null));
  }, []);

  const signInSso = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await signInWithSso("login");
      if (res?.mode === "login") onLoggedIn(res.user);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

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
        <View style={styles.loginHero}>
          <LogoMark large />
          <Text style={styles.h1}>ストクル</Text>
          <Text style={styles.loginTagline}>おうちの在庫を、スキャンでかんたん管理</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.h2}>ログイン</Text>
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

          {sso && (
            <>
              <Text style={[styles.subtitle, { textAlign: "center", marginTop: 8 }]}>または</Text>
              <SmallButton label={`${sso} でログイン`} onPress={() => void signInSso()} disabled={submitting} />
              <Text style={styles.subtitle}>「アカウント」で {sso} を連携した人だけが使えます。</Text>
            </>
          )}

          <Text style={styles.subtitle}>API: {apiBaseUrl}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

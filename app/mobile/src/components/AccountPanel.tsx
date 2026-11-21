import { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { api, type SsoIdentities, type User } from "../api";
import { errorMessage } from "../inventory";
import { signInWithSso } from "../sso";
import { styles } from "../styles";
import { PrimaryButton, ScreenIntro, SmallButton } from "./ui";

/** アカウント: ログイン中の利用者と、SSO (共通のアカウント) の連携・「SSO だけでログインする」 */
export function AccountPanel({ user }: { user: User }) {
  const [ids, setIds] = useState<SsoIdentities | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setIds(await api.ssoIdentities());
    } catch (e) {
      Alert.alert("読み込めませんでした", errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await fn();
      if (done) Alert.alert(done);
      await load();
    } catch (e) {
      Alert.alert("できませんでした", errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const name = ids?.sso_name || "SSO";
  const sso = ids?.identities.find((i) => i.provider === "sso");

  const confirm = (title: string, message: string, label: string, onOk: () => void) =>
    Alert.alert(title, message, [
      { text: "キャンセル", style: "cancel" },
      { text: label, style: "destructive", onPress: onOk },
    ]);

  return (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }}>
      <ScreenIntro screen="account" />
      <View style={styles.card}>
        <Text style={styles.h2}>ログイン中</Text>
        <Text style={styles.subtitle}>
          {user.name}（{user.email}）
        </Text>
      </View>

      {ids?.sso_enabled ? (
        <View style={[styles.card, { gap: 8 }]}>
          <Text style={styles.h2}>{name} でログイン</Text>
          <Text style={styles.muted}>
            共通のアカウントと連携すると、ほかのアプリと同じログインで入れます。このアプリには、{name} にパスキーでログインした場合だけ入れます。
          </Text>
          {sso ? (
            <>
              <Text style={styles.label}>連携済み: {sso.email ?? `${name} のアカウント`}</Text>
              <Text style={styles.label}>
                {name} だけでログインする: {ids.sso_only ? "オン" : "オフ"}
              </Text>
              <Text style={styles.muted}>
                オンにすると、メールアドレスとパスワードではログインできなくなります。ほかの端末でパスワードで入っているログインも切れます。
              </Text>
              {ids.sso_only ? (
                <SmallButton label="オフにする" disabled={busy} onPress={() => void run(() => api.ssoSetOnly(false))} />
              ) : ids.login_method === "sso" ? (
                <SmallButton
                  label="オンにする"
                  disabled={busy}
                  onPress={() =>
                    confirm(`${name} だけでログインしますか？`, "メールアドレスとパスワードではログインできなくなります。", "オンにする", () =>
                      void run(() => api.ssoSetOnly(true)),
                    )
                  }
                />
              ) : (
                <Text style={styles.muted}>
                  オンにするには、いったんログアウトして「{name} でログイン」で入り直してください。
                </Text>
              )}
              <SmallButton
                label="連携を解除"
                danger
                disabled={busy}
                onPress={() =>
                  confirm("連携を解除しますか？", `「${name} だけ」も外れ、パスワードでログインできるようになります。`, "解除", () =>
                    void run(() => api.ssoUnlink()),
                  )
                }
              />
            </>
          ) : ids.can_link ? (
            <PrimaryButton
              label={`${name} のアカウントと連携する`}
              disabled={busy}
              onPress={() => void run(() => signInWithSso("link"), "連携しました")}
            />
          ) : (
            <Text style={styles.muted}>デモ用のアカウントには {name} を連携できません。</Text>
          )}
        </View>
      ) : (
        ids && <Text style={styles.muted}>この環境では共通のアカウントでのログイン（SSO）は使えません。</Text>
      )}
    </ScrollView>
  );
}

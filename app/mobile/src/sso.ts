// SSO (共通の認証サーバー) でのログイン / 連携。仕様は docker_auth_server の docs/runbooks/app-integration.md。
// アプリ内のブラウザで API の開始 URL を開き、認証サーバーでログインしたあと、ディープリンクで戻ってくる
// (Expo Go では exp://…/--/auth/sso、ビルド版では inventory://auth/sso)。
// 戻り URL の結果コードは、ここで作った code_verifier (PKCE) がないと交換できない。
import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { api, apiBaseUrl, getToken, setToken, type User } from "./api";

export type SsoMode = "login" | "link";

export type SsoResult = { mode: "login"; token: string; user: User } | { mode: "link"; email: string | null };

const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function base64url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = i + 1 >= bytes.length ? 2 : i + 2 >= bytes.length ? 3 : 4;
    for (let j = 0; j < chars; j++) out += B64URL[(n >> (18 - 6 * j)) & 63];
  }
  return out;
}

async function challengeOf(verifier: string): Promise<string> {
  const b64 = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function ssoErrorMessage(reason: string): string {
  switch (reason) {
    case "not_linked":
      return "この SSO のアカウントは連携されていません。メールアドレスとパスワードでログインし、「アカウント」で連携してください。";
    case "mfa_required":
      return "このアプリは 2 段階認証が必須です。SSO にパスキーでログインしてから、もう一度お試しください。";
    case "cancelled":
      return "SSO での操作を中止しました。";
    case "expired":
      return "有効期限が切れました。もう一度やり直してください。";
    default:
      return "SSO でログインできませんでした。もう一度お試しください。";
  }
}

/** 認証サーバーの画面を開く。利用者が閉じたときは null */
export async function signInWithSso(mode: SsoMode): Promise<SsoResult | null> {
  const verifier = base64url(Crypto.getRandomBytes(32));
  const redirectUri = Linking.createURL("auth/sso");
  const params: Record<string, string> = {
    mode,
    client: "mobile",
    code_challenge: await challengeOf(verifier),
    redirect_uri: redirectUri,
  };
  // 連携はログイン中の本人だけ。ブラウザには Bearer を渡せないので、先に intent を取る
  if (mode === "link") params.intent = (await api.ssoIntent()).intent;
  const query = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const result = await WebBrowser.openAuthSessionAsync(`${apiBaseUrl}/api/auth/sso/start?${query}`, redirectUri);
  if (result.type !== "success") return null;
  const { queryParams } = Linking.parse(result.url);
  if (queryParams?.error) throw new Error(ssoErrorMessage(String(queryParams.error)));
  const code = queryParams?.code;
  if (!code) throw new Error(ssoErrorMessage("failed"));

  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  const token = getToken();
  if (mode === "link" && token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${apiBaseUrl}/api/auth/sso/exchange`, {
    method: "POST",
    headers,
    body: JSON.stringify({ code: String(code), code_verifier: verifier }),
  });
  const data = (await res.json().catch(() => ({}))) as SsoResult & { message?: string };
  if (!res.ok) throw new Error(data.message ?? ssoErrorMessage("failed"));
  if (data.mode === "login") setToken(data.token);
  return data;
}

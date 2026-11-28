// SSO (共通の認証サーバー) でのログイン / 連携。仕様は認証サーバーのリポジトリの docs/runbooks/app-integration.md。
// この Web は画面がブラウザで動くので、code_verifier (PKCE) は sessionStorage に持ち、交換もブラウザから行う。
// 戻ってきた結果コードは、このタブの sessionStorage にある code_verifier がないと交換できない
// (他人に開始 URL や戻り URL を踏ませても成立しない)。
import { API_BASE_URL, api, getToken, setToken } from "@/lib/api";

const PKCE_KEY = "inventory_sso_pkce";

export type SsoMode = "login" | "link";

function b64url(bytes: Uint8Array): string {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function challengeOf(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}

/** 認証サーバーの画面へ移る。連携のときは、先にログイン中の本人として intent を取る */
export async function startSso(mode: SsoMode): Promise<void> {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const params = new URLSearchParams({ mode, client: "web", code_challenge: await challengeOf(verifier) });
  if (mode === "link") params.set("intent", (await api.ssoIntent()).intent);
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ mode, verifier, at: Date.now() }));
  window.location.href = `${API_BASE_URL}/api/auth/sso/start?${params}`;
}

/** 戻ってきたときの処理。成功ならログイン / 連携を済ませ、移る先の URL を返す */
export async function completeSso(search: URLSearchParams): Promise<string> {
  const raw = sessionStorage.getItem(PKCE_KEY);
  sessionStorage.removeItem(PKCE_KEY);
  const saved = raw ? (JSON.parse(raw) as { mode: SsoMode; verifier: string; at: number }) : null;
  // このタブで始めた流れではない (または 10 分を過ぎた)
  if (!saved || Date.now() - saved.at > 10 * 60 * 1000) return "/?sso_error=expired";
  const back = (reason: string) =>
    saved.mode === "link" ? `/?tab=account&sso_error=${encodeURIComponent(reason)}` : `/?sso_error=${encodeURIComponent(reason)}`;
  const error = search.get("error");
  const code = search.get("code");
  if (error || !code) return back(error ?? "failed");

  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  const token = getToken();
  if (saved.mode === "link" && token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/auth/sso/exchange`, {
      method: "POST",
      headers,
      body: JSON.stringify({ code, code_verifier: saved.verifier }),
    });
  } catch {
    return back("failed");
  }
  if (!res.ok) return back(res.status === 409 ? "conflict" : res.status === 400 ? "demo" : "failed");
  if (saved.mode === "link") return "/?tab=account&sso=linked";
  const data = (await res.json()) as { token?: string };
  if (!data.token) return back("failed");
  setToken(data.token);
  return "/";
}

/** API から戻ってきた error を、画面に出す文に変える */
export function ssoErrorMessage(reason: string | null, mode: SsoMode, name = "SSO"): string | null {
  if (!reason) return null;
  switch (reason) {
    case "not_linked":
      return `この ${name} のアカウントは連携されていません。メールアドレスとパスワードでログインし、「アカウント」で連携してください。`;
    case "mfa_required":
      return `このアプリは 2 段階認証が必須です。${name} にパスキーでログインしてから、もう一度お試しください。`;
    case "cancelled":
      return mode === "login" ? `${name} でのログインを中止しました。` : `${name} との連携を中止しました。`;
    case "expired":
      return "有効期限が切れました。もう一度やり直してください。";
    case "conflict":
      return `この ${name} のアカウントは、ほかの利用者に連携されているか、すでに別のアカウントと連携済みです。`;
    case "demo":
      return `デモ用のアカウントには ${name} を連携できません。`;
    default:
      return mode === "login"
        ? `${name} でログインできませんでした。もう一度お試しください。`
        : `${name} と連携できませんでした。もう一度お試しください。`;
  }
}

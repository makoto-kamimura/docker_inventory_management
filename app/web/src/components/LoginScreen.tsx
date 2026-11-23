"use client";

import { useEffect, useState } from "react";
import { api, type User } from "@/lib/api";
import { errorMessage } from "@/lib/inventory";
import { ssoErrorMessage, startSso } from "@/lib/sso";
import { CalendarClock, ScanLine, TriangleAlert } from "lucide-react";
import { LogoMark, cls } from "./ui";

export function LoginScreen({ onLoggedIn }: { onLoggedIn: (user: User) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // SSO から戻ってきたときのエラー (?sso_error=...)。この画面はブラウザでだけ描く
  const [error, setError] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : ssoErrorMessage(new URLSearchParams(window.location.search).get("sso_error"), "login"),
  );
  const [submitting, setSubmitting] = useState(false);
  const [sso, setSso] = useState<string | null>(null);

  useEffect(() => {
    void api.ssoProviders().then((p) => setSso(p.sso ? p.sso_name || "SSO" : null));
    if (window.location.search) window.history.replaceState(null, "", window.location.pathname);
  }, []);

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
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-6 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <LogoMark size="lg" />
        <div>
          <h1 className="text-2xl font-bold">ストクル</h1>
          <p className="text-sm text-zinc-500">おうちの在庫を、スキャンでかんたん管理</p>
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className={`space-y-4 p-6 ${cls.card}`}
      >
        <h2 className="font-semibold">ログイン</h2>
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        <div className="space-y-1">
          <label className={cls.label}>メールアドレス</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            className={cls.input}
          />
        </div>
        <div className="space-y-1">
          <label className={cls.label}>パスワード</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className={cls.input}
          />
        </div>
        <button
          type="submit"
          disabled={submitting || !email.trim() || !password}
          className="w-full rounded-lg bg-primary px-4 py-2.5 font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-40"
        >
          {submitting ? "ログイン中..." : "ログイン"}
        </button>
        {sso && (
          <>
            <p className="text-center text-xs text-zinc-500">または</p>
            <button
              type="button"
              onClick={() => void startSso("login").catch((e) => setError(errorMessage(e)))}
              className="w-full rounded-lg border border-zinc-300 px-4 py-2.5 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              {sso} でログイン
            </button>
            <p className="text-center text-xs text-zinc-500">「アカウント」で {sso} を連携した人だけが使えます。</p>
          </>
        )}
      </form>
      <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-zinc-500">
        <li className="flex items-center gap-1.5 whitespace-nowrap">
          <ScanLine aria-hidden className="h-4 w-4 text-primary" />
          バーコードで入庫・払い出し
        </li>
        <li className="flex items-center gap-1.5 whitespace-nowrap">
          <CalendarClock aria-hidden className="h-4 w-4 text-amber-600" />
          在庫切れ・期限をひと目で
        </li>
      </ul>
    </main>
  );
}

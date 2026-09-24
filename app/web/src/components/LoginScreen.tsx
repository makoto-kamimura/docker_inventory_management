"use client";

import { useState } from "react";
import { api, type User } from "@/lib/api";
import { errorMessage } from "@/lib/inventory";
import { cls } from "./ui";

const DEMO_ACCOUNTS = [
  { label: "管理者", account: "admin@example.com" },
  { label: "一般ユーザー", account: "user@example.com" },
];
const DEMO_PASSWORD = "password";

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
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center px-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className={`space-y-4 p-6 ${cls.card}`}
      >
        <h1 className="text-xl font-bold">ストクル ログイン</h1>
        {error && (
          <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}
        <div className="space-y-1">
          <label className="text-sm text-zinc-600 dark:text-zinc-300">メールアドレス</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            className={cls.input}
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm text-zinc-600 dark:text-zinc-300">パスワード</label>
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
          className="w-full rounded bg-zinc-900 px-4 py-2 text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {submitting ? "ログイン中..." : "ログイン"}
        </button>

        <div className="space-y-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <p className="text-center text-xs text-zinc-400">
            デモアカウント（共通パスワード: {DEMO_PASSWORD}）
          </p>
          {DEMO_ACCOUNTS.map(({ label, account }) => (
            <button
              key={account}
              type="button"
              onClick={() => {
                setEmail(account);
                setPassword(DEMO_PASSWORD);
              }}
              className="flex w-full items-center justify-between rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              <span className="font-medium text-zinc-600 dark:text-zinc-300">{label}</span>
              <span className="text-zinc-500 dark:text-zinc-400">{account}</span>
            </button>
          ))}
        </div>
      </form>
    </main>
  );
}

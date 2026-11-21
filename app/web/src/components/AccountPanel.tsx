"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, TriangleAlert } from "lucide-react";
import { api, type SsoIdentities, type User } from "@/lib/api";
import { errorMessage } from "@/lib/inventory";
import { startSso } from "@/lib/sso";
import { cls } from "./ui";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "medium", timeStyle: "short" });
}

/** アカウント: ログイン中の利用者と、SSO (共通のアカウント) の連携・「SSO だけでログインする」 */
export function AccountPanel({ user, linked, initialError }: { user: User; linked: boolean; initialError: string | null }) {
  const [ids, setIds] = useState<SsoIdentities | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [notice, setNotice] = useState<string | null>(linked ? "連携しました。" : null);

  const load = useCallback(async () => {
    try {
      setIds(await api.ssoIdentities());
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    let alive = true;
    api
      .ssoIdentities()
      .then((r) => alive && setIds(r))
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, []);

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      if (done) setNotice(done);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const name = ids?.sso_name || "SSO";
  const sso = ids?.identities.find((i) => i.provider === "sso");

  return (
    <div className="space-y-4">
      <section className={`space-y-1 p-5 ${cls.card}`}>
        <h3 className="font-semibold">ログイン中</h3>
        <p className="text-sm">
          {user.name}（{user.email}）
        </p>
      </section>

      {ids?.sso_enabled && (
        <section className={`space-y-3 p-5 ${cls.card}`}>
          <h3 className="flex items-center gap-2 font-semibold">
            <KeyRound aria-hidden className="h-4 w-4 text-primary" />
            {name} でログイン
          </h3>
          <p className="text-sm text-zinc-500">
            共通のアカウントと連携すると、ほかのアプリと同じログインで入れます。このアプリには、{name}{" "}
            にパスキーでログインした場合だけ入れます。
          </p>
          {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{notice}</p>}
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          {sso ? (
            <>
              <div className="text-sm">
                <strong>連携済み</strong>: {sso.email ?? `${name} のアカウント`}
                <div className="text-xs text-zinc-500">
                  連携した日時: {formatDate(sso.created_at)} / 最後に {name} でログイン: {formatDate(sso.last_login_at)}
                </div>
              </div>
              <div className="space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                <div className="text-sm">
                  <strong>{name} だけでログインする</strong>: {ids.sso_only ? "オン" : "オフ"}
                  <div className="text-xs text-zinc-500">
                    オンにすると、メールアドレスとパスワードではログインできなくなります。ほかの端末でパスワードで入っているログインも、その時点で切れます。
                  </div>
                </div>
                {ids.sso_only ? (
                  <button disabled={busy} onClick={() => void run(() => api.ssoSetOnly(false), "オフにしました。")} className={cls.secondaryButton}>
                    オフにする
                  </button>
                ) : ids.login_method === "sso" ? (
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`${name} だけでログインしますか？ メールアドレスとパスワードではログインできなくなります。`)) {
                        void run(() => api.ssoSetOnly(true), "オンにしました。");
                      }
                    }}
                    className={cls.primaryButton}
                  >
                    オンにする
                  </button>
                ) : (
                  <p className="text-xs text-zinc-500">
                    オンにするには、いったんログアウトして「{name} でログイン」で入り直してください（{name} で入れることを確かめるため）。
                  </p>
                )}
              </div>
              <button
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`連携を解除しますか？「${name} だけ」も外れ、パスワードでログインできるようになります。`)) {
                    void run(() => api.ssoUnlink(), "連携を解除しました。");
                  }
                }}
                className={cls.dangerOutlineButton}
              >
                連携を解除
              </button>
            </>
          ) : ids.can_link ? (
            <button
              disabled={busy}
              onClick={() => void run(() => startSso("link"))}
              className={cls.primaryButton}
            >
              {name} のアカウントと連携する
            </button>
          ) : (
            <p className="text-sm text-zinc-500">デモ用のアカウントには {name} を連携できません。</p>
          )}
        </section>
      )}
      {ids && !ids.sso_enabled && <p className="text-sm text-zinc-500">この環境では共通のアカウントでのログイン（SSO）は使えません。</p>}
    </div>
  );
}

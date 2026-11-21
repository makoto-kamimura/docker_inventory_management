"use client";

import { useEffect } from "react";
import { completeSso } from "@/lib/sso";

/** 認証サーバーから API を経由して戻ってくる。結果コードと sessionStorage の code_verifier を交換する */
export default function SsoComplete() {
  useEffect(() => {
    void completeSso(new URLSearchParams(window.location.search)).then((to) => window.location.replace(to));
  }, []);
  return (
    <main className="mx-auto max-w-sm px-6 py-10">
      <p className="text-sm text-zinc-500">ログインしています...</p>
    </main>
  );
}

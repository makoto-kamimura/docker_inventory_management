import type { MetadataRoute } from "next";

/** ホーム画面に追加したときの名前とアイコン */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ストクル — Stock＋Cycle",
    short_name: "ストクル",
    description: "使ったら減らす、足したら増やす。在庫の出入りを、1回の操作で。",
    lang: "ja",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0d9488",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

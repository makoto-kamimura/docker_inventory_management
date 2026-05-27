# docker_inventory_management

社内向けの簡易在庫管理アプリケーション。Laravel API + Next.js Web + Expo モバイルを Docker Compose で動かす構成。

## ディレクトリ構成

```
docker_inventory_management/
├── app/
│   ├── backend/   Laravel 12 / PHP 8.2 (REST API)
│   ├── web/       Next.js 16 / React 19 (Tailwind v4)
│   └── mobile/    Expo 54 / React Native 0.81 (TypeScript)
├── platform/
│   ├── docker/                Dockerfile (php:8.2-fpm)
│   ├── docker-compose.yml     app / db / phpmyadmin
│   ├── mysql/                 MySQL データ (gitignore)
│   └── .env.example           Docker 用環境変数の雛形
└── doc/
    ├── design.md              システム設計・API 仕様
    ├── operation.md           起動・運用手順
    ├── task.md                対応事項リスト
    └── archive/               旧 React Native 実装の参考保管
```

## クイックスタート

```bash
# 1. 環境変数を準備
cp app/backend/.env.example app/backend/.env
cp platform/.env.example platform/.env       # DB パスワード / WEB_MODE 等を必要に応じて編集

# 2. 全サービス起動 (API + Web + DB + phpMyAdmin)
#    初回は MIGRATE_MODE=fresh で seed 投入
cd platform
MIGRATE_MODE=fresh docker compose up -d

# 3. APP_KEY 生成 (空のまま起動した場合)
docker compose exec app php artisan key:generate

# 4. 動作確認
open http://localhost:3000                   # Web UI
curl http://localhost:8000/api/items         # API
open http://localhost:8080                   # phpMyAdmin
```

| Service       | URL                       |
| ------------- | ------------------------- |
| Web (Next.js) | http://localhost:3000     |
| Laravel API   | http://localhost:8000     |
| phpMyAdmin    | http://localhost:8080     |
| MySQL         | localhost:3306            |

Web は既定で **production モード** (`next build` + `next start`) で起動する。開発中に HMR が欲しい場合は `WEB_MODE=dev` を指定:

```bash
WEB_MODE=dev docker compose up -d web        # その場で dev に切替
# もしくは platform/.env に WEB_MODE=dev を書いて永続化
```

詳細 (モード切替・Docker を介さない直接起動・トラブルシュート) は [doc/operation.md](doc/operation.md) を参照。

## フロントエンド

### Mobile (Expo)

モバイルは Docker に含めず、開発機から起動する:

```bash
cd app/mobile
npm install
npx expo start
```

> Next.js 16 / Expo 54 は破壊的変更を含むため、それぞれ `app/web/AGENTS.md` / `app/mobile/AGENTS.md` の指示に従いバージョン別ドキュメントを参照すること。

## ドキュメント

- **[doc/design.md](doc/design.md)** — システム構成・データモデル・API 仕様
- **[doc/operation.md](doc/operation.md)** — 詳細な起動手順・運用 Tips・トラブルシュート
- **[doc/task.md](doc/task.md)** — 残課題リスト

## セキュリティに関する注意

- `platform/docker-compose.yml` および `platform/.env.example` に記載の DB パスワードは **開発専用のデフォルト値** です。本番環境では必ず差し替えてください。
- 現状 API は認証なしです。公開ネットワークでの利用は想定していません ([doc/task.md](doc/task.md) T-06 参照)。
- CORS は `app/backend/config/cors.php` で `localhost` の dev サーバのみ許可しています。

## License

[MIT](LICENSE)

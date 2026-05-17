# operation.md — 起動・運用手順

`docker_inventory_management` のローカル開発環境のセットアップから日常運用までの手順をまとめる。

## 1. 前提

| ツール          | 推奨バージョン            | 用途                          |
| --------------- | ------------------------- | ----------------------------- |
| Docker Desktop  | 4.x 以降 (`docker compose` v2 が使えること) | API / MySQL / phpMyAdmin 起動 |
| Node.js         | 20 以降 (LTS)             | Web (Next.js 16) / Mobile (Expo 54) |
| npm             | 10 以降                   | パッケージ管理                |
| (任意) Expo CLI | `npx expo` で都度実行可   | モバイル開発                  |
| (任意) PHP 8.2  | コンテナ外から artisan を直接叩く場合のみ |              |

ポート占有確認: `8000` (Laravel), `8080` (phpMyAdmin), `3306` (MySQL), `3000` (Next.js dev), `8081` (Expo Metro)。

## 2. 初回セットアップ

```bash
git clone <repo-url> docker_inventory_management
cd docker_inventory_management

# Laravel 用 .env (Docker MySQL 想定の雛形済)
cp app/backend/.env.example app/backend/.env

# Docker Compose 用 .env (DB パスワード等。デフォルトのままでも動く)
cp platform/.env.example platform/.env
```

`.env` は基本そのままで動く。必要に応じて `APP_KEY` を生成 (空のままだと起動後に artisan で生成):

```bash
docker compose -f platform/docker-compose.yml exec app php artisan key:generate
```

### 2.1 DB パスワードを変更したい場合

`platform/.env` で `MYSQL_ROOT_PASSWORD` / `MYSQL_PASSWORD` を編集 → 既存のボリュームを捨てて再起動:

```bash
cd platform
docker compose down
rm -rf mysql/*           # 既存データを破棄 (パスワード変更時に必要)
docker compose up -d
```

`app/backend/.env` 側の `DB_USERNAME` / `DB_PASSWORD` も同じ値に合わせること。

## 3. バックエンド + DB 起動 (Docker)

### 3.1 通常起動 (データ保持)

```bash
cd platform
docker compose up -d           # app / db / phpmyadmin をバックグラウンド起動
docker compose logs -f app     # 起動ログ確認 (Ctrl-C で抜ける)
```

起動シーケンス (`app/backend/wait-for-db.sh`):
1. `db:3306` の listen を待機 (compose の healthcheck と二重で安全側)
2. `MIGRATE_MODE` (デフォルト `migrate`) に応じてマイグレーション実行
   - `migrate` → `php artisan migrate --force` (差分適用のみ。**既存データ保持**)
   - `fresh`   → `php artisan migrate:fresh --seed --force` (全 drop → 再投入)
3. `php artisan serve --host=0.0.0.0 --port=8000`

### 3.2 初期化したい / 初回シード投入

```bash
cd platform
MIGRATE_MODE=fresh docker compose up -d   # 一時的に fresh+seed
docker compose logs -f app                # "MIGRATE_MODE=fresh" のログを確認
```

> **このアップデート後の初回は `MIGRATE_MODE=fresh` で起動推奨**: 旧 `equipments` / `equipment_stocks` テーブルが残っている DB がある場合に整合性をリセットできる。

### 3.3 動作確認

```bash
# API ヘルス
curl http://localhost:8000/up

# データ
curl http://localhost:8000/api/categories
curl http://localhost:8000/api/items

# 在庫追加 (Item)
curl -X POST http://localhost:8000/api/items \
  -H "Content-Type: application/json" \
  -d '{"name":"テスト","category_id":1,"stock":3}'

# 払い出し (-1)
curl -X PUT http://localhost:8000/api/items/1/decrement

# 履歴
curl http://localhost:8000/api/items/1/histories

# phpMyAdmin
open http://localhost:8080
```

### 3.4 停止 / 再起動

```bash
cd platform
docker compose stop            # 停止のみ (データ保持)
docker compose start           # 再開
docker compose down            # コンテナ削除 (mysql/ ボリュームは残る)
docker compose down -v         # ボリュームも削除 (← MySQL 完全初期化)
```

## 4. Web フロントエンド (Next.js)

```bash
cd app/web
cp .env.example .env.local     # 必要に応じて NEXT_PUBLIC_API_BASE_URL を編集
npm install                    # 初回のみ
npm run dev                    # http://localhost:3000
```

ビルド / 本番起動:

```bash
npm run build
npm run start
```

機能: カテゴリ追加 / 物品追加 / 在庫一覧 / 払い出し (-1) / 履歴閲覧 (モーダル)。Client Component (`'use client'`) で実装、API は [src/lib/api.ts](../app/web/src/lib/api.ts) 経由。

> Next.js 16 系は API/規約が訓練データと異なる。`node_modules/next/dist/docs/` の該当ガイドを参照してから実装すること (`app/web/AGENTS.md`)。

## 5. モバイル (Expo)

```bash
cd app/mobile
cp .env.example .env           # 実機/Android エミュ用に URL を編集 (下表参照)
npm install                    # 初回のみ
npx expo start                 # Metro 起動
#  i: iOS シミュレータ / a: Android / w: Web
```

iOS シミュレータ単独起動: `npm run ios` / Android: `npm run android`。

機能は Web と同等 (カテゴリ追加 / 物品追加 / 一覧 / 払い出し / 履歴 Modal)。プルリフレッシュ対応。

### 5.1 接続先 (`EXPO_PUBLIC_API_BASE_URL`)

| 実行環境               | URL                                | 補足                                   |
| ---------------------- | ---------------------------------- | -------------------------------------- |
| iOS シミュレータ       | `http://localhost:8000`            | デフォルトで動く                       |
| Android エミュレータ   | `http://10.0.2.2:8000`             | エミュ→ホストの特殊 IP                 |
| 実機 (LAN 経由)        | `http://<PC の LAN IP>:8000`       | 例 `http://192.168.1.10:8000`          |

実機接続時は `app/backend/config/cors.php` の `allowed_origins` にも対応 URL を追加すること (ネイティブから直接叩く場合は CORS 不要だが、Expo Web 経由なら必要)。

### 5.2 既知の TS 型エラーについて

Expo 54 / RN 0.81 / React 19 / TS 5.9 の組合せで、RN クラスコンポーネント (`View` / `Text` 等) が `TS2786 / TS2607` を出す上流型互換性問題があり、Expo 54 の初期テンプレートでも同じく発生します。暫定回避として `App.tsx` 先頭に `@ts-nocheck` を付与済み (詳細は [task.md](task.md) T-19 参照)。実行時には影響しません。

> Expo 54 の最新仕様は https://docs.expo.dev/versions/v54.0.0/ を確認 (`app/mobile/AGENTS.md`)。

## 6. 開発時のよく使うコマンド

### 6.1 Laravel (コンテナ内)

```bash
# シェル
docker compose -f platform/docker-compose.yml exec app bash

# 任意 artisan
docker compose -f platform/docker-compose.yml exec app php artisan route:list
docker compose -f platform/docker-compose.yml exec app php artisan migrate:status
docker compose -f platform/docker-compose.yml exec app php artisan db:seed
docker compose -f platform/docker-compose.yml exec app php artisan tinker

# テスト (現状アプリテストはなし)
docker compose -f platform/docker-compose.yml exec app php artisan test
```

### 6.2 DB に直接接続

```bash
docker compose -f platform/docker-compose.yml exec db mysql -uuser -ppassword inventory
# GUI
open http://localhost:8080
```

## 7. 運用 Tips / トラブルシュート

### 7.1 `Connection refused` / API が DB に繋がらない

- `docker compose ps` で `db` が `healthy` になっているか確認
- `.env` の `DB_HOST` が `db` (compose の service 名) であること。`127.0.0.1` ではコンテナ内から到達不可
- `docker compose logs db` に `ready for connections` が出ているか

### 7.2 `APP_KEY` 未設定エラー

```bash
docker compose -f platform/docker-compose.yml exec app php artisan key:generate
docker compose -f platform/docker-compose.yml exec app php artisan config:clear
```

### 7.3 ルート (404) が出る

`bootstrap/app.php` の `withRouting()` に `api: __DIR__.'/../routes/api.php'` が含まれているか確認。Laravel 11+ では API ルートは明示登録必須。

```bash
docker compose -f platform/docker-compose.yml exec app php artisan route:list --path=api
```

### 7.4 ポート競合

```bash
lsof -i :8000     # 占有プロセス確認
# docker-compose.yml の ports を "8001:8000" などに変更
```

### 7.5 MySQL データを完全リセット

```bash
cd platform
docker compose down
rm -rf mysql/*           # ホスト側ボリューム削除 (.gitkeep は残す)
MIGRATE_MODE=fresh docker compose up -d
```

### 7.6 Web/モバイルから API を叩く

- Web (Next.js dev `http://localhost:3000`): `config/cors.php` で許可済。
- モバイル実機: `localhost` は端末自身を指すため、PC の LAN IP (例 `http://192.168.x.x:8000`) を使う。必要なら `config/cors.php` の `allowed_origins` に追加。

### 7.7 CORS エラー

許可オリジンは `app/backend/config/cors.php` の `allowed_origins` で管理。変更後はキャッシュクリア:

```bash
docker compose -f platform/docker-compose.yml exec app php artisan config:clear
```

## 8. デプロイ (将来)

現状は開発用 Docker Compose のみで、本番デプロイ手順は未定義。本番化する際は以下を別途設計:

- `php artisan serve` → PHP-FPM + Nginx / Caddy への置き換え
- MySQL の本番運用 (マネージド DB or 永続ボリューム + バックアップ)
- 環境別 `.env` の安全な配布 (Secrets Manager 等)
- `config/cors.php` の `allowed_origins` を公開ドメインに変更
- フロントエンドの静的配信 (Vercel / S3+CloudFront / Expo EAS)

## 9. ディレクトリ早見表

| パス                                   | 役割                                   |
| -------------------------------------- | -------------------------------------- |
| `platform/docker-compose.yml`          | コンテナ定義の入り口                   |
| `platform/docker/Dockerfile`           | Laravel 実行用イメージ                 |
| `app/backend/.env`                     | Laravel 環境変数 (gitignore)           |
| `app/backend/wait-for-db.sh`           | コンテナ実行時に走る起動スクリプト     |
| `app/backend/bootstrap/app.php`        | Laravel ブート設定 (api ルート登録あり)|
| `app/backend/routes/api.php`           | API ルーティング                       |
| `app/backend/app/Http/Controllers/`    | `ItemController` / `CategoryController` |
| `app/backend/app/Models/`              | `Item` / `Category` / `ItemHistory` / `User` |
| `app/backend/config/cors.php`          | CORS 許可オリジン定義                  |
| `app/backend/database/migrations/`     | スキーマ定義                           |
| `app/backend/database/seeders/`        | 初期データ投入 (Item 系)              |
| `platform/mysql/`                      | MySQL データ (gitignore)               |

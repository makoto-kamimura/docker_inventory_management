# design.md — システム要件・設計

在庫管理アプリケーション (`docker_inventory_management`) のシステム要件と構成をまとめる。

## 1. プロダクト概要

社内向けの簡易在庫管理システム。カテゴリに属する物品を登録し、在庫数の参照・追加・払い出し (1個ずつ減算) と履歴記録を行う。

- バックエンド: Laravel 12 (PHP 8.2) を REST API として提供
- フロントエンド: Web (Next.js 16) とモバイル (Expo / React Native 0.81) の 2 系統
- データストア: MySQL 8.0 (Docker コンテナで管理、phpMyAdmin 同梱)
- 実行基盤: ローカル開発は Docker Compose、Web/モバイルはホスト側で `npm` / `expo` 起動

## 2. システム構成

```
┌────────────────┐     ┌─────────────────────────┐     ┌──────────────┐
│  Web (Next.js) │ ──▶ │  Laravel API :8000      │ ──▶ │  MySQL :3306 │
│  app/web       │     │  app/backend            │     │  (Docker)    │
└────────────────┘     │   - REST /api/*         │     └──────────────┘
┌────────────────┐ ──▶ │   - Eloquent ORM        │            ▲
│ Mobile (Expo)  │     │   - CORS (config/cors)  │            │
│  app/mobile    │     └─────────────────────────┘            │
└────────────────┘                                  ┌──────────────────┐
                                                    │ phpMyAdmin :8080 │
                                                    └──────────────────┘
```

### 2.1 ディレクトリ構成

```
docker_inventory_management/
├── app/
│   ├── backend/   Laravel API (PHP 8.2 / Laravel 12)
│   ├── web/       Next.js 16 (App Router, TypeScript, Tailwind v4)
│   └── mobile/    Expo 54 + React Native 0.81 (TypeScript)
├── platform/
│   ├── docker/                Dockerfile (php:8.2-fpm ベース)
│   ├── mysql/                 MySQL データボリューム (gitignore)
│   └── docker-compose.yml     コンテナ定義 (app / db / phpmyadmin)
└── doc/
    ├── README.md / design.md / operation.md / task.md
    └── archive/               旧 React Native 実装の参考保管
```

> `wait-for-db.sh` は `app/backend/` 配下に集約 (コンテナへ volume マウントされる場所)。旧 `platform/script/wait-for-db.sh` は削除済。

## 3. 機能要件

| ID    | 機能            | 概要                                                              | 現状   |
| ----- | --------------- | ----------------------------------------------------------------- | ------ |
| F-01  | 在庫一覧取得    | `GET /api/items` — 全 Item を `category` リレーション込みで返却   | 実装済 |
| F-02  | 在庫登録        | `POST /api/items` — `name` / `category_id` / `stock` を受け付け   | 実装済 |
| F-03  | 在庫減算 (-1)   | `PUT /api/items/{item}/decrement` — 1個払い出し + 履歴記録 + 在庫0は 409 | 実装済 |
| F-04  | カテゴリ一覧    | `GET /api/categories`                                             | 実装済 |
| F-05  | カテゴリ追加    | `POST /api/categories` — `name` (unique)                          | 実装済 |
| F-06  | 在庫履歴閲覧    | `GET /api/items/{item}/histories` — 増減ログ取得                   | 実装済 |
| F-07  | Web UI          | 一覧 / 登録 / 払い出し画面                                        | 未着手 (Next.js 雛形) |
| F-08  | モバイル UI     | 同上 (Expo)                                                       | 未着手 (Expo 雛形) |
| F-09  | 認証 / 認可     | ユーザ識別、操作ログの紐付け                                       | 未要件化 (`users` テーブルのみ存在) |

## 4. データモデル

ドメインは **Item 系に統合**。旧 Equipment / EquipmentStock 系は削除済。

| テーブル          | 主なカラム                                                                              |
| ----------------- | --------------------------------------------------------------------------------------- |
| `categories`      | `id`, `name` (unique), timestamps                                                       |
| `items`           | `id`, `name`, `category_id` (FK→categories, cascade), `stock` (int, default 0), ts      |
| `item_histories`  | `id`, `item_id` (FK→items, cascade), `change` (int 増減数), `changed_at`, timestamps    |

Eloquent: `Item belongsTo Category` / `Item hasMany ItemHistory` / `Category hasMany Item`。

### 4.1 Laravel 標準テーブル

`users` / `cache` / `jobs` / `sessions` などの Laravel 標準テーブルあり。`SESSION_DRIVER=database`, `QUEUE_CONNECTION=database`, `CACHE_STORE=database` を前提とした構成。

## 5. API 仕様

| Method | Path                                | 説明                       | 主なステータス  |
| ------ | ----------------------------------- | -------------------------- | --------------- |
| GET    | `/api/categories`                   | カテゴリ一覧 (name 昇順)   | 200             |
| POST   | `/api/categories`                   | カテゴリ作成 (`name` 必須/unique) | 201 / 422 |
| GET    | `/api/items`                        | Item 一覧 (category 同梱)  | 200             |
| POST   | `/api/items`                        | Item 作成。初期在庫>0なら履歴追加 | 201 / 422 |
| PUT    | `/api/items/{item}/decrement`       | 在庫 -1 + 履歴追加         | 200 / 404 / 409 |
| GET    | `/api/items/{item}/histories`       | Item の履歴 (新しい順)     | 200 / 404      |
| GET    | `/up`                               | Laravel 標準ヘルスチェック | 200             |

> ルートは `bootstrap/app.php` の `withRouting(api: ...)` で `/api` プレフィックス + `api` ミドルウェアグループ。Laravel 11+ では明示登録が必須。

## 6. 外部インターフェース

### 6.1 公開ポート (Docker)

| Service     | ホスト側 URL              | 用途                                |
| ----------- | ------------------------- | ----------------------------------- |
| Laravel API | http://localhost:8000     | REST API (`/api/*`)                 |
| phpMyAdmin  | http://localhost:8080     | DB 管理 UI (user: `user` / `password`) |
| MySQL       | localhost:3306            | DB (`inventory` / user: `user`)     |

### 6.2 環境変数 (DB)

`docker-compose.yml` で定義 (開発用デフォルト):

```
MYSQL_ROOT_PASSWORD=rootpassword
MYSQL_DATABASE=inventory
MYSQL_USER=user
MYSQL_PASSWORD=password
```

Laravel 側 `.env` は `DB_CONNECTION=mysql / DB_HOST=db / DB_PORT=3306 / DB_DATABASE=inventory / DB_USERNAME=user / DB_PASSWORD=password`。`.env.example` も同設定を雛形化済 (sqlite から MySQL 既定へ変更)。

### 6.3 CORS

`config/cors.php` で API パスのみ許可、許可オリジンは開発用に limitar:

- `http://localhost:3000` / `http://127.0.0.1:3000` (Next.js dev)
- `http://localhost:8081` / `http://127.0.0.1:8081` (Expo dev / Web)
- `http://localhost:19006` (Expo Web 旧ポート)

本番化時は公開ドメインに絞る必要あり。

### 6.4 マイグレーション挙動の切替

`MIGRATE_MODE` 環境変数で `wait-for-db.sh` の挙動を制御:

| 値        | 動作                                                |
| --------- | --------------------------------------------------- |
| `migrate` | (デフォルト) 差分マイグレーションのみ。**データ保持** |
| `fresh`   | `migrate:fresh --seed` で全テーブル drop → seed 投入 |

`docker-compose.yml` の `app.environment.MIGRATE_MODE` から渡される。一時的に初期化したい場合は `MIGRATE_MODE=fresh docker compose up -d` のように上書き。

## 7. 非機能要件 (現時点の前提)

- **対象**: 開発・社内検証のみ (本番運用要件は未定義)
- **可用性**: 単一ホスト上の Docker Compose 想定。冗長化なし
- **データ永続化**: `platform/mysql/` をホストバインドマウントで保持。デフォルト起動 (`MIGRATE_MODE=migrate`) で再起動後もデータは残る
- **DB 起動待ち**: `db` サービスに `mysqladmin ping` の healthcheck、`app` / `phpmyadmin` は `depends_on.condition: service_healthy` で起動順を保証
- **セキュリティ**: 認証/認可なし。CORS は dev origin のみ許可 (本番化時は要見直し)
- **テスト**: PHPUnit セットアップのみ。アプリケーションテストは未実装

## 8. 採用技術スタック

| 層          | 技術                                                | 備考                                                |
| ----------- | --------------------------------------------------- | --------------------------------------------------- |
| Backend     | PHP 8.2 / Laravel 12 / Eloquent / `php artisan serve` | 開発サーバ運用。production WSGI/PHP-FPM 化は別途    |
| Frontend    | Next.js 16.2 (App Router) / React 19.2 / Tailwind v4 | **訓練データと挙動が異なる**。`node_modules/next/dist/docs/` 参照必須 |
| Mobile      | Expo 54 / React Native 0.81 / TypeScript            | https://docs.expo.dev/versions/v54.0.0/ を参照     |
| DB          | MySQL 8.0 (`mysql_native_password`)                 |                                                     |
| Container   | Docker Compose v2 (`docker compose`)                | `version:` キーは指定しない (v2 で obsolete)       |

## 9. アーキテクチャ方針

- バックエンド・Web・モバイルはそれぞれ独立アプリ (モノレポ内)
- Web/モバイルはホスト側 Node.js / Expo CLI で起動し、API のみコンテナ化
- 旧実装 (`doc/archive/reactnative_app*`) は参考保管。新規開発の参照元にしない

## 10. 既知の課題サマリ

詳細は [task.md](task.md) を参照。今回の再調整で T-01〜T-06、T-09〜T-14 は対応済。残課題は以下:

- T-07 / T-08: Web / モバイル UI 実装
- T-15: フロント側 API クライアントと API ベース URL の環境変数化
- T-16〜T-18: テスト導入 / CI 整備 / エラーレスポンス統一
- T-06 (発展): Sanctum 等による認証導入 (現状は CORS のみ整備)

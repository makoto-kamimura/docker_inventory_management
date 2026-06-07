# design.md — システム要件・設計

在庫管理アプリケーション (`docker_inventory_management`) のシステム要件と構成をまとめる。

## 1. プロダクト概要

社内向けの簡易在庫管理システム。カテゴリに属する物品を登録し、在庫数の参照・追加・払い出し (1個ずつ減算) と履歴記録を行う。

- バックエンド: Laravel 12 (PHP 8.2) を REST API として提供
- フロントエンド: Web (Next.js 16) とモバイル (Expo / React Native 0.81) の 2 系統
- データストア: MySQL 8.0 (Docker コンテナで管理、phpMyAdmin 同梱)
- 実行基盤: Backend / DB / phpMyAdmin / **Web** を Docker Compose で一括起動。モバイル (Expo) は開発時はホスト側 `npx expo start`、本番は **EAS Build** でスタンドアロンアプリ化 (Metro 不要、[operation.md §5.5](operation.md))
- 追加機能: モバイルからの **バーコードスキャン** で在庫 +1、未登録なら物品追加フォームへ遷移
- 認証: **トークン (Bearer) 認証必須**。ログイン (`POST /api/login`) でトークンを発行し、以降の全 API に付与。ユーザーはシードで作成 (画面からの新規登録は無し)
- 保管場所: **カテゴリに紐づく自由記述の保管場所** を専用タブから登録・一覧 (物品とは未紐付け)

## 2. システム構成

```
┌─────────────────────┐     ┌─────────────────────────┐     ┌──────────────┐
│ Web :3000 (Next.js) │ ──▶ │  Laravel API :8000      │ ──▶ │  MySQL :3306 │
│  app/web (Docker)   │     │  app/backend (Docker)   │     │  (Docker)    │
└─────────────────────┘     │   - REST /api/*         │     └──────────────┘
┌─────────────────────┐ ──▶ │   - Eloquent ORM        │            ▲
│ Mobile (Expo)       │     │   - CORS (config/cors)  │            │
│  app/mobile (host)  │     └─────────────────────────┘            │
│  ＋カメラ/バーコード │                                ┌──────────────────┐
└─────────────────────┘                                │ phpMyAdmin :8080 │
                                                       └──────────────────┘
```

Web / Backend / DB / phpMyAdmin はすべて `platform/docker-compose.yml` で起動する 1 つの compose プロジェクト (`platform`)。モバイルは Expo CLI を経由してホスト側で起動し、ネイティブ機能 (カメラ) を利用する。

### 2.1 ディレクトリ構成

```
docker_inventory_management/
├── app/
│   ├── backend/   Laravel API (PHP 8.2 / Laravel 12)
│   ├── web/       Next.js 16 (App Router, TypeScript, Tailwind v4)
│   │   └── Dockerfile         Node 22 alpine、WEB_MODE で dev/prod を切替
│   └── mobile/    Expo 54 + React Native 0.81 (TypeScript) — expo-camera 同梱
├── platform/
│   ├── docker/                Dockerfile (php:8.2-fpm ベース)
│   ├── mysql/                 MySQL データボリューム (gitignore)
│   └── docker-compose.yml     コンテナ定義 (app / db / phpmyadmin / web)
└── doc/
    ├── README.md / design.md / operation.md / task.md
    └── archive/               旧 React Native 実装の参考保管
```

> `wait-for-db.sh` は `app/backend/` 配下に集約 (コンテナへ volume マウントされる場所)。旧 `platform/script/wait-for-db.sh` は削除済。

## 3. 機能要件

| ID    | 機能            | 概要                                                              | 現状   |
| ----- | --------------- | ----------------------------------------------------------------- | ------ |
| F-01  | 在庫一覧取得    | `GET /api/items` — 全 Item を `category` リレーション込みで返却   | 実装済 |
| F-02  | 在庫登録        | `POST /api/items` — `name` / `category_id` / `stock` / `barcode?` を受け付け | 実装済 |
| F-03  | 在庫減算 (-1)   | `PUT /api/items/{item}/decrement` — 1個払い出し + 履歴記録 + 在庫0は 409 | 実装済 |
| F-04  | カテゴリ一覧    | `GET /api/categories`                                             | 実装済 |
| F-05  | カテゴリ追加    | `POST /api/categories` — `name` (unique)                          | 実装済 |
| F-06  | 在庫履歴閲覧    | `GET /api/items/{item}/histories` — 増減ログ取得 (**更新者 `user` 同梱**)。Web/モバイルの履歴 Modal に日時+ユーザー名を表示 | 実装済 |
| F-07  | Web UI          | ログイン / 在庫一覧 / カテゴリ追加 / 物品追加 / 保管場所追加 / 増減アイコンボタン (`＋`/`−`) / カテゴリ移動 Modal / 履歴 Modal / 分析タブ (横棒グラフ) / ログアウト | 実装済 |
| F-08  | モバイル UI     | Web と同等の機能 (保管場所追加・ログインを含む) + プルリフレッシュ + バーコードスキャン | 実装済 |
| F-09  | 認証 / 認可     | トークン (Bearer) 認証。`POST /api/login` でトークン発行、全 API に付与必須。失効は `POST /api/logout` | 実装済 (シードユーザーのみ。認可ロールは無し) |
| F-10  | 在庫増 (+1)     | `PUT /api/items/{item}/increment` — 1個追加 + 履歴 `+1` 記録 (在庫0からの補充は金額入力 → 履歴 `amount`) | 実装済 |
| F-11  | バーコードスキャン | `POST /api/items/scan` — barcode 一致なら +1 して `{action:"incremented",item}` / 未登録なら 404 + `{action:"not_found",barcode}` を返す。モバイルは `expo-camera` の `CameraView` で読み取り | 実装済 (モバイルのみ) |
| F-12  | 分析 (時系列)   | `GET /api/analytics/timeseries?period=&group=&metric=` — **在庫数 (`metric=stock`, 水準)** または **補充金額 (`metric=amount`, 各バケットの `amount` 合計)** を日毎/月毎・総合計/カテゴリ別で返却。Web の「分析」タブで折れ線表示 (在庫数/金額トグル) | 実装済 (Web のみ) |
| F-13  | カテゴリ変更    | `PUT /api/items/{item}/category` — 登録済み物品の所属カテゴリを変更。Web は一覧の「移動」ボタンから select Modal、モバイルは「移動」ボタンから chip 選択 Modal | 実装済 |
| F-14  | 在庫切れ絞り込み | 在庫一覧で「すべて / 在庫切れのみ (`stock<=0`)」を切替。Web / モバイル両対応 | 実装済 |
| F-15  | 保管場所管理    | `GET/POST /api/storage-locations` — カテゴリに紐づく自由記述 (`description`) の保管場所を登録・一覧。Web/モバイルに「保管場所追加」タブ | 実装済 |
| F-16  | 補充金額の記録  | **在庫0の物品が +1 される時のみ**金額入力モーダルを表示 (+1 ボタン / バーコード両方)。金額は任意で `item_histories.amount` に記録、履歴 Modal に `¥` 表示。在庫>0 の +1 は従来どおり即時 | 実装済 |

## 4. データモデル

ドメインは **Item 系に統合**。旧 Equipment / EquipmentStock 系は削除済。

| テーブル          | 主なカラム                                                                              |
| ----------------- | --------------------------------------------------------------------------------------- |
| `categories`      | `id`, `name` (unique), timestamps                                                       |
| `items`           | `id`, `name`, `category_id` (FK→categories, cascade), `barcode` (string, nullable, **unique**), `stock` (int, default 0), ts |
| `item_histories`  | `id`, `item_id` (FK→items, cascade), `user_id` (FK→users, nullable, nullOnDelete — 更新者), `change` (int 増減数), `amount` (unsignedInt, nullable — 在庫0からの補充時の金額/円), `changed_at`, timestamps |
| `storage_locations` | `id`, `category_id` (FK→categories, cascade), `description` (text 自由記述), timestamps |
| `api_tokens`      | `id`, `user_id` (FK→users, cascade), `name` (nullable), `token` (SHA-256 ハッシュ, unique), `last_used_at`, timestamps |

Eloquent: `Item belongsTo Category` / `Item hasMany ItemHistory` / `ItemHistory belongsTo User` / `Category hasMany Item` / `Category hasMany StorageLocation` / `StorageLocation belongsTo Category` / `User hasMany ApiToken`。

在庫を増減する操作 (作成時の初回在庫 / `increment` / `decrement` / `scan`) の履歴には、認証中ユーザーの `user_id` を記録する。`GET /api/items/{item}/histories` は `user:id,name` を同梱して返す (既存行や未認証ぶんは `user: null`)。

`api_tokens.token` には平文ではなく SHA-256 ハッシュを保存 (平文はログイン応答で一度だけ返す)。`AuthenticateToken` ミドルウェア (`auth.token` エイリアス) が `Authorization: Bearer <token>` を検証して認証する。Sanctum は使わず依存追加なしの軽量実装。

`items.barcode` は `2026_05_25_140000_add_barcode_to_items.php` で追加。1 Item につき 1 バーコードまで (unique 制約)、未設定許可 (nullable)。

### 4.1 Laravel 標準テーブル

`users` / `cache` / `jobs` / `sessions` などの Laravel 標準テーブルあり。`SESSION_DRIVER=database`, `QUEUE_CONNECTION=database`, `CACHE_STORE=database` を前提とした構成。

## 5. API 仕様

> **`POST /api/login` 以外のすべての API はトークン認証必須** (`auth.token` ミドルウェア)。`Authorization: Bearer <token>` が無い/無効なら `401 {"message":"Unauthenticated."}`。

| Method | Path                                | 説明                       | 主なステータス  |
| ------ | ----------------------------------- | -------------------------- | --------------- |
| POST   | `/api/login`                        | `{email,password}` で認証。成功で `{token, user}` を返す (公開) | 200 / 422 |
| GET    | `/api/me`                           | 現在のトークンのユーザー情報 | 200 / 401      |
| POST   | `/api/logout`                       | 現在のトークンを失効        | 204 / 401      |
| GET    | `/api/storage-locations`            | 保管場所一覧 (category 同梱、新しい順) | 200 / 401 |
| POST   | `/api/storage-locations`            | 保管場所作成 (`category_id` 必須/exists、`description` 必須) | 200 / 401 / 422 |
| GET    | `/api/categories`                   | カテゴリ一覧 (name 昇順)   | 200             |
| POST   | `/api/categories`                   | カテゴリ作成 (`name` 必須/unique) | 201 / 422 |
| GET    | `/api/items`                        | Item 一覧 (category 同梱)  | 200             |
| POST   | `/api/items`                        | Item 作成 (`name`/`category_id`/`stock` 必須、`barcode?` 任意 unique)。初期在庫>0なら履歴追加 | 201 / 422 |
| POST   | `/api/items/scan`                   | `{barcode}` を受け取る。在庫>0 の一致は `+1` + 履歴 (`incremented`)、**在庫0 の一致は加算せず `needs_amount`** (フロントが金額モーダル→increment)、未一致は `not_found` | 200 / 404 / 422 |
| PUT    | `/api/items/{item}/decrement`       | 在庫 -1 + 履歴追加         | 200 / 404 / 409 |
| PUT    | `/api/items/{item}/increment`       | 在庫 +1 + 履歴追加。`amount?` (nullable int, 円) を渡すと履歴に金額を記録 (在庫0からの補充時のみフロントが送る) | 200 / 404 / 422 |
| PUT    | `/api/items/{item}/barcode`         | バーコード設定/解除 (`barcode?` nullable unique)。Item 同梱で返却 | 200 / 404 / 422 |
| PUT    | `/api/items/{item}/category`        | 所属カテゴリ変更 (`category_id` 必須/`exists:categories,id`)。Item を `category` 同梱で返却 | 200 / 404 / 422 |
| GET    | `/api/items/{item}/histories`       | Item の履歴 (新しい順)     | 200 / 404      |
| GET    | `/api/analytics/timeseries`         | `period` (daily/monthly) × `group` (total/category) × `metric` (stock/amount) で時系列を集計。`{labels, series:[{name,values}]}` を返却 | 200 |
| GET    | `/up`                               | Laravel 標準ヘルスチェック | 200             |

> ルートは `bootstrap/app.php` の `withRouting(api: ...)` で `/api` プレフィックス + `api` ミドルウェアグループ。Laravel 11+ では明示登録が必須。

### 5.1 `POST /api/items/scan` のレスポンス契約

```jsonc
// 既存バーコード・在庫>0 (200) → サーバ側で +1 済
{ "action": "incremented", "item": { "id": 5, "name": "...", "barcode": "...", "stock": 2, "category": {...} } }

// 既存バーコード・在庫0 (200) → 未加算。フロントが金額モーダルを出し、確定後に
//   PUT /api/items/{id}/increment (amount 任意) を呼ぶ
{ "action": "needs_amount", "item": { "id": 5, "name": "...", "stock": 0, "category": {...} } }

// 未登録バーコード (404)
{ "action": "not_found", "barcode": "4901234567890" }
```

クライアントは HTTP ステータスではなく `action` で分岐すること (404 でもエラー扱いにはしない設計)。バリデーション失敗は通常通り 422。**在庫0からの補充は金額入力を挟むため、scan / +1 ボタンとも `needs_amount` 相当の分岐でモーダルを表示する。**

## 6. 外部インターフェース

### 6.1 公開ポート (Docker)

| Service       | ホスト側 URL              | 用途                                |
| ------------- | ------------------------- | ----------------------------------- |
| Web (Next.js) | http://localhost:3000     | フロント UI (`web` サービス)        |
| Laravel API   | http://localhost:8000     | REST API (`/api/*`)                 |
| phpMyAdmin    | http://localhost:8080     | DB 管理 UI (user: `user` / `password`) |
| MySQL         | localhost:3306            | DB (`inventory` / user: `user`)     |

### 6.2 環境変数

`platform/docker-compose.yml` (compose) と `app/backend/.env` (Laravel) / `app/web/.env.local` (Next.js) / `app/mobile/.env` (Expo) でそれぞれ管理。

#### MySQL (compose)

```
MYSQL_ROOT_PASSWORD=rootpassword
MYSQL_DATABASE=inventory
MYSQL_USER=user
MYSQL_PASSWORD=password
```

Laravel 側 `.env` は `DB_CONNECTION=mysql / DB_HOST=db / DB_PORT=3306 / DB_DATABASE=inventory / DB_USERNAME=user / DB_PASSWORD=password`。`.env.example` も同設定を雛形化済 (sqlite から MySQL 既定へ変更)。

#### Web (`web` サービス、compose 経由)

| 変数                       | 既定                     | 役割                                             |
| -------------------------- | ------------------------ | ------------------------------------------------ |
| `WEB_MODE`                 | `production`             | `production`=`next build`→`next start` / `dev`=`next dev` (HMR) |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:8000`  | ブラウザから API を叩く URL (client バンドル埋め込み) |

#### Mobile (Expo)

| 変数                         | 既定                     | 役割                                       |
| ---------------------------- | ------------------------ | ------------------------------------------ |
| `EXPO_PUBLIC_API_BASE_URL`   | `http://localhost:8000`  | 端末から API を叩く URL。実機は LAN IP 必須 |

### 6.3 CORS

`config/cors.php` で API パスのみ許可、許可オリジンは開発用に limitar:

- `http://localhost:3000` / `http://127.0.0.1:3000` (Next.js dev — host / Docker 両方で 3000)
- `http://localhost:8081` / `http://127.0.0.1:8081` (Expo dev / Web)
- `http://localhost:19006` (Expo Web 旧ポート)

実機 iPhone から Expo 経由で叩く際は CORS 自体は通常チェックされない (RN の fetch はネイティブ) が、Expo Web や preflight 経由のために LAN IP を追加することを推奨。詳細は [operation.md §5.2](operation.md) を参照。本番化時は公開ドメインに絞る必要あり。

### 6.4 マイグレーション挙動の切替

`MIGRATE_MODE` 環境変数で `wait-for-db.sh` の挙動を制御:

| 値        | 動作                                                |
| --------- | --------------------------------------------------- |
| `migrate` | (デフォルト) 差分マイグレーションのみ。**データ保持** |
| `fresh`   | `migrate:fresh --seed` で全テーブル drop → seed 投入 |

`docker-compose.yml` の `app.environment.MIGRATE_MODE` から渡される。一時的に初期化したい場合は `MIGRATE_MODE=fresh docker compose up -d` のように上書き。

## 7. 非機能要件 (現時点の前提)

- **対象**: 開発 (`docker-compose.yml`) と本番 (`docker-compose.prod.yml`) の 2 系統を提供
- **可用性**: 単一ホスト上の Docker Compose 想定。冗長化なし (将来マネージド DB / オーケストレータ前提)
- **データ永続化**:
  - dev: `platform/mysql/` をホストバインドマウントで保持 (`MIGRATE_MODE=migrate` 既定)
  - prod: 名前付きボリューム `db_data` / `laravel_storage` / `caddy_data` / `caddy_config` で保持
- **DB 起動待ち**: `db` サービスに `mysqladmin ping` の healthcheck、`app` / `phpmyadmin` は `depends_on.condition: service_healthy` で起動順を保証
- **Web ビルド**:
  - dev: `web` サービスは production モード既定で `next build` を起動毎に実行 (ソースは bind mount)。HMR は `WEB_MODE=dev`
  - prod: マルチステージビルドで `.next` をイメージに焼き込み、`next start` を非 root ユーザで実行
- **セキュリティ**: アプリ層は**トークン (Bearer) 認証**を全 API に適用済 (`auth.token` ミドルウェア)。ユーザーはシードで作成し、画面からの新規登録は無効。**認可ロール (admin/一般等の権限差) は未実装**。本番は Caddy で自動 TLS + 内部ネットワーク隔離、CORS は同一オリジン構成のため通常チェックされない
- **テスト**: PHPUnit セットアップのみ。アプリケーションテストは未実装
- **モバイルカメラ**: `expo-camera` の `CameraView` を利用。iOS Info.plist 用の `NSCameraUsageDescription` は `app.json` の `plugins.expo-camera.cameraPermission` で注入。iOS Simulator は物理カメラに接続されないため、バーコード機能の動作確認は実機でのみ可能

## 8. 採用技術スタック

| 層             | 技術                                                | 備考                                                |
| -------------- | --------------------------------------------------- | --------------------------------------------------- |
| Backend (dev)  | PHP 8.2 / Laravel 12 / Eloquent / `php artisan serve` | 開発用シングルプロセス。ソース bind mount で即反映 |
| Backend (prod) | PHP 8.2 FPM (`php:8.2-fpm-alpine`) + Composer `--no-dev` | `migrate --force` + `config:cache` を entrypoint で実行 |
| Frontend       | Next.js 16.2 (App Router) / React 19.2 / Tailwind v4 | **訓練データと挙動が異なる**。`node_modules/next/dist/docs/` 参照必須。Docker (node:22-alpine) で起動 |
| Mobile         | Expo 54 / React Native 0.81 / TypeScript / expo-camera 17 | https://docs.expo.dev/versions/v54.0.0/ を参照 |
| DB             | MySQL 8.0 (`mysql_native_password`)                 |                                                     |
| Reverse proxy (prod) | Caddy 2 (alpine)                              | Let's Encrypt 自動 TLS、`/api/*` `/up` を FastCGI で `app`、それ以外を `web` に reverse_proxy |
| Container      | Docker Compose v2 (`docker compose`)                | `version:` キーは指定しない (v2 で obsolete)       |

## 9. アーキテクチャ方針

- バックエンド・Web・モバイルはそれぞれ独立アプリ (モノレポ内)
- **Backend / Web / DB / phpMyAdmin** は Docker Compose で一括起動 (`platform-app` / `platform-web` / `platform-db` / `platform-phpmyadmin`)
- **モバイル** はネイティブ機能 (カメラ) と各種シミュレータ依存のためホスト側 Expo CLI で別途起動
- フロントから API への通信は **ブラウザ/端末 → ホストの `localhost:8000`** (compose の `app` サービスがマップ)。NEXT_PUBLIC / EXPO_PUBLIC 変数はクライアントバンドル埋め込み
- 旧実装 (`doc/archive/reactnative_app*`) は参考保管。新規開発の参照元にしない

## 10. 本番デプロイ構成

dev (`docker-compose.yml`) と並列で **`platform/docker-compose.prod.yml`** を提供。Caddy が唯一のインターネット公開窓口、アプリ層はすべて compose 内部ネットワーク。

### 10.1 ネットワーク図

```
                       ┌────────────────────────────────────────────┐
                       │  internet                                  │
                       └────────┬───────────────────────────────────┘
                                │  80 / 443 (HTTP/3 含む)
                       ┌────────▼───────────────────────────────────┐
                       │  proxy  (caddy_proxy_prod)                 │
                       │   - Caddyfile (env で SITE_HOSTNAME 切替)  │
                       │   - Let's Encrypt 自動 TLS (caddy_data)    │
                       │   - /api/* + /up + favicon/robots          │
                       │   - それ以外                                │
                       │   - 別ホスト名 (PMA_HOSTNAME) は phpmyadmin │
                       └────┬──────────────┬─────────────┬──────────┘
                            │ FastCGI:9000 │ HTTP:3000   │ HTTP:80
                       ┌────▼────────┐ ┌──▼────────┐ ┌──▼──────────┐
                       │ app         │ │ web       │ │ phpmyadmin  │
                       │ PHP-FPM     │ │ next start│ │ (内部のみ)  │
                       │ (laravel_   │ │ multi-stg │ │             │
                       │  storage)   │ │           │ │             │
                       └────┬────────┘ └───────────┘ └────┬────────┘
                            │ pdo_mysql                     │
                       ┌────▼───────────────────────────────▼────┐
                       │  db  (mysql:8.0, db_data volume)         │
                       │   - ホストポート非公開、内部ネットワークのみ │
                       └──────────────────────────────────────────┘
```

### 10.2 デプロイ単位

| サービス | 公開 | イメージビルド | 役割 |
| --- | --- | --- | --- |
| `proxy` (Caddy) | **80 / 443** | `platform/proxy/Dockerfile` (Caddyfile + Laravel `public/` を焼き込み) | TLS 終端・ルーティング・サブドメイン分岐・Basic 認証 |
| `app` (PHP-FPM) | 内部 9000 | `platform/docker/Dockerfile.prod` (composer `--no-dev`) | API / `migrate --force` / `config:cache` を entrypoint で実行 |
| `web` (Next.js) | 内部 3000 | `app/web/Dockerfile.prod` (multi-stage、非 root ユーザ) | `next build` 済みを `next start` |
| `db` (MySQL) | 内部 3306 | `mysql:8.0` | RDS / Cloud SQL に置き換える時は services から削除し `DB_HOST` を外部に向ける |
| `phpmyadmin` | 内部 80 | `phpmyadmin:latest` | Caddy のサブドメイン + Basic 認証経由でのみアクセス可 |

### 10.3 重要な分岐ポイント

- **`SITE_HOSTNAME=:80`** … HTTP のみ。ドメイン未取得 / 内部テスト用
- **`SITE_HOSTNAME=inventory.example.com`** … Caddy が ACME を走らせて自動で TLS + 80→443 リダイレクト
- **`PMA_HOSTNAME=pma.inventory.example.com`** + `PMA_PASSWORD_HASH=$2a$...` … phpMyAdmin をサブドメインで限定公開 (Basic 認証付き)
- **`NEXT_PUBLIC_API_BASE_URL=""`** … 同一オリジン (Caddy 経由で相対パス)。別ドメイン公開時のみ書く

### 10.4 dev / prod 構成差分

| 項目 | dev | prod |
| --- | --- | --- |
| compose ファイル | `docker-compose.yml` | `docker-compose.prod.yml` |
| Backend 実行 | `php artisan serve` | PHP-FPM |
| ソース反映 | bind mount で即時 | イメージ焼き込み (要 rebuild) |
| 公開ポート | 8000 / 3000 / 8080 / 3306 | 80 / 443 のみ |
| 認証 | なし | Caddy で TLS、PMA は Basic |
| マイグレーション | `MIGRATE_MODE=migrate/fresh` | `migrate --force` 固定 (entrypoint) |

詳細手順は [operation.md §8](operation.md) 参照。

## 11. 既知の課題サマリ

詳細は [task.md](task.md) を参照。今回の再調整で T-01〜T-15 は対応済 (Web/モバイル UI を含む)。Web の Docker 化・在庫増 (`+1`) API・バーコードスキャン・日次分析タブはその後に追加。残課題は以下:

- T-16〜T-18: テスト導入 / CI 整備 / エラーレスポンス統一
- T-19: Expo 54 / RN 0.81 / React 19 の JSX 型互換性問題 (`@ts-nocheck` で暫定回避中)
- T-06: トークン (Bearer) 認証を全 API に導入済 (Sanctum 不使用の軽量実装)。残: 認可ロール / 画面からのユーザー管理 / トークンの有効期限・ローテーション
- バーコード機能の Web 対応: 現状はモバイルのみ。Web ブラウザでも WebUSB / `BarcodeDetector` 等で読み取らせるかは未着手
- 日次分析の Mobile 対応: 現状は Web のみ
- マイグレーション番号の整理: 旧 `000002` / `000003` 削除で番号が飛び番 (`000001` → `000004` → `000005` → `2026_05_25_*`)。fresh 許容時にリネーム推奨

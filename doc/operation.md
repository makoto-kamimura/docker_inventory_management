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

ポート占有確認: `8000` (Laravel), `8080` (phpMyAdmin), `3306` (MySQL), `3000` (Next.js — docker / ローカル両方), `8081` (Expo Metro)。

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

## 3. バックエンド + Web + DB 起動 (Docker)

### 3.1 通常起動 (データ保持)

```bash
cd platform
docker compose up -d           # app / db / phpmyadmin / web をバックグラウンド起動
docker compose logs -f app     # API 起動ログ (Ctrl-C で抜ける)
docker compose logs -f web     # Web 起動ログ
```

起動後の URL:

| Service     | URL                       |
| ----------- | ------------------------- |
| Web (Next.js) | http://localhost:3000   |
| Laravel API | http://localhost:8000     |
| phpMyAdmin  | http://localhost:8080     |
| MySQL       | localhost:3306            |

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

> **`/api/login` 以外の API はトークン認証必須**。まずログインしてトークンを取得し、以降は `Authorization: Bearer <token>` を付ける (詳細は §3.5)。

```bash
# API ヘルス (認証不要)
curl http://localhost:8000/up

# ログインしてトークンを取得 (シードユーザー)
TOKEN=$(curl -s -X POST http://localhost:8000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')
echo "$TOKEN"

# 以降は Authorization ヘッダを付与
curl http://localhost:8000/api/categories     -H "Authorization: Bearer $TOKEN"
curl http://localhost:8000/api/items          -H "Authorization: Bearer $TOKEN"
curl http://localhost:8000/api/storage-locations -H "Authorization: Bearer $TOKEN"

# 在庫追加 (Item)
curl -X POST http://localhost:8000/api/items \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"テスト","category_id":1,"stock":3}'

# 保管場所追加 (カテゴリに紐づく自由記述)
curl -X POST http://localhost:8000/api/storage-locations \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"category_id":1,"description":"2F 倉庫 棚A-3"}'

# 払い出し (-1)
curl -X PUT http://localhost:8000/api/items/1/decrement -H "Authorization: Bearer $TOKEN"

# 履歴 (各レコードに更新者 user:{id,name} が同梱される)
curl http://localhost:8000/api/items/1/histories -H "Authorization: Bearer $TOKEN"

# phpMyAdmin
open http://localhost:8080
```

> トークン無し/無効だと `401 {"message":"Unauthenticated."}` が返る。

### 3.4 停止 / 再起動

```bash
cd platform
docker compose stop            # 停止のみ (データ保持)
docker compose start           # 再開
docker compose down            # コンテナ削除 (mysql/ ボリュームは残る)
docker compose down -v         # ボリュームも削除 (← MySQL 完全初期化)
```

### 3.5 認証 (ログイン / ユーザー追加)

API は **トークン (Bearer) 認証必須**。Web / モバイルとも、起動するとまずログイン画面が出る。**画面からの新規ユーザー登録は無い** (シードで作成する運用)。

> ⚠️ **このアップデート後の初回**: 既存 DB にはユーザーが 1 人も居ないためログインできない。データを保持したまま**サンプルユーザーだけ追加**するには `db:seed` を実行する (破壊しない / §下記「方法 B」):
> ```bash
> docker compose -f platform/docker-compose.yml exec app php artisan db:seed
> ```
> 新しいテーブル (`api_tokens` / `storage_locations`) のマイグレーションは通常起動の `migrate` で差分適用されるので、初期化 (`fresh`) は不要。

#### サンプルユーザー (seeder で作成)

`MIGRATE_MODE=fresh` でシードすると以下が作成される (`database/seeders/DatabaseSeeder.php`)。**本番では必ずパスワードを変更すること。**

| 名前         | メール              | パスワード  |
| ------------ | ------------------- | ----------- |
| 管理者       | `admin@example.com` | `password`  |
| 一般ユーザー | `user@example.com`  | `password`  |

> 認可ロール (admin / 一般の権限差) は未実装で、どちらも同じ操作ができる。

#### ユーザーを追加する

**方法 A: tinker でその場で追加 (推奨・即時)**

```bash
docker compose -f platform/docker-compose.yml exec app php artisan tinker
```
```php
\App\Models\User::create([
    'name' => '山田太郎',
    'email' => 'yamada@example.com',
    'password' => \Illuminate\Support\Facades\Hash::make('好きなパスワード'),
]);
```
`password` は `casts()` の `hashed` で自動ハッシュされるが、tinker で明示的に `Hash::make()` しておくと確実。

**方法 B: seeder に追記して再シード**

`database/seeders/DatabaseSeeder.php` の `User::firstOrCreate(...)` を増やして:

```bash
docker compose -f platform/docker-compose.yml exec app php artisan db:seed
```
> `db:seed` は `firstOrCreate` なので既存データは壊さず、未登録ユーザーだけ追加される。

#### パスワードを変更する

```bash
docker compose -f platform/docker-compose.yml exec app php artisan tinker
```
```php
$u = \App\Models\User::where('email', 'admin@example.com')->first();
$u->password = \Illuminate\Support\Facades\Hash::make('新しいパスワード');
$u->save();
```

#### トークンの仕組み (補足)

- ログイン (`POST /api/login`) 時に 64 文字のランダムトークンを発行し、DB (`api_tokens`) には **SHA-256 ハッシュ**を保存。平文は応答で一度だけ返す。
- Web はブラウザの `localStorage`、モバイルは**メモリ**に保持 (モバイルはアプリ再起動で再ログインが必要 — 永続化したい場合は `expo-secure-store` を導入)。
- ログアウト (`POST /api/logout`) で現在のトークンを失効。全トークンを一括失効したい場合は `api_tokens` から該当 `user_id` の行を削除:
  ```bash
  docker compose -f platform/docker-compose.yml exec app php artisan tinker
  ```
  ```php
  \App\Models\User::where('email','admin@example.com')->first()->apiTokens()->delete();
  ```

## 4. Web フロントエンド (Next.js)

Web (`app/web`) は docker-compose の `web` サービスとして自動起動する。`docker compose up -d` 後に http://localhost:3000 にアクセスすれば使える。

機能: ログイン / カテゴリ追加 / 物品追加 / 保管場所追加 / 在庫一覧 (在庫切れ絞り込み) / 払い出し (-1) / 在庫増 (+1) / カテゴリ移動 / 履歴閲覧 (モーダル) / 分析 / ログアウト。Client Component (`'use client'`) で実装、API は [src/lib/api.ts](../app/web/src/lib/api.ts) 経由 (トークンは `localStorage` 保持)。

### 4.1 起動モード (`WEB_MODE`)

| モード        | 動作                                              | 用途                              |
| ------------- | ------------------------------------------------- | --------------------------------- |
| `production` (default) | コンテナ起動毎に `next build` → `next start` | 本番想定の挙動確認。コード変更は再起動で反映 |
| `dev`         | `next dev` で HMR (ホットリロード)                | 開発中。ファイル保存で即反映      |

切替は `platform/.env` の `WEB_MODE` か、起動時の環境変数で行う:

```bash
# 一時的に dev モードで起動
cd platform
WEB_MODE=dev docker compose up -d web

# 恒久的に dev にしたい場合は platform/.env で WEB_MODE=dev に変更してから up -d
```

### 4.2 コード変更の反映

ソースは bind mount しているため、ファイル編集はコンテナ内に即時反映される。

- **dev**: HMR が拾うので保存だけで反映。
- **production**: `next build` 済みの成果物 (`.next/`) を配信するため、変更を反映するには再起動が必要。
  ```bash
  cd platform
  docker compose restart web        # 起動時に build → start が再実行される
  ```

### 4.3 API 接続先 (`NEXT_PUBLIC_API_BASE_URL`)

- 既定 `http://localhost:8000` (ブラウザから Docker の `app` コンテナへの公開ポート)。
- LAN / リバプロ越しに公開する場合は `platform/.env` で `NEXT_PUBLIC_API_BASE_URL` を上書き → `docker compose up -d web` で再ビルド。
- `NEXT_PUBLIC_*` は client バンドルに埋め込まれる点に注意。

### 4.4 Docker を介さず直接走らせる (任意)

`node` がホストにあるなら従来通りローカル起動も可能 (compose の `web` を止めてから):

```bash
cd platform && docker compose stop web
cd ../app/web
cp .env.example .env.local
npm install
npm run dev                    # http://localhost:3000
```

> Next.js 16 系は API/規約が訓練データと異なる。`node_modules/next/dist/docs/` の該当ガイドを参照してから実装すること (`app/web/AGENTS.md`)。

## 5. モバイル (Expo)

```bash
cd app/mobile
cp .env.example .env           # 実機/Android エミュ用に URL を編集 (5.3 参照)
npm install                    # 初回のみ
npx expo start                 # Metro 起動
#  i: iOS シミュレータ / a: Android / w: Web
```

機能: ログイン / 在庫一覧 (在庫切れ絞り込み) / カテゴリ追加 / 物品追加 / 保管場所追加 / 在庫増 (＋1) / 在庫減 (−1) / カテゴリ移動 / 履歴 Modal / プルリフレッシュ / ログアウト / **バーコードスキャン** (一覧ヘッダの `⌖` ボタン)。トークンはメモリ保持のため**アプリ再起動で再ログインが必要**。

### 5.1 iOS シミュレータで実行する

**前提:** Xcode (App Store) のフルインストールが必須。CLI Tools (`/Library/Developer/CommandLineTools`) だけでは `simctl` が無く `npx expo start --ios` が失敗する。

```bash
# Xcode インストール後、開発ディレクトリを切替
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer

cd app/mobile
npx expo start --ios           # Metro 起動 → Simulator が立ち上がり Expo Go が自動投入される
```

うまく開かない場合 (`xcrun simctl openurl` が code 115 で失敗するなど) は Expo Go のキャッシュが壊れていることがある。クリーン再インストール:

```bash
xcrun simctl uninstall booted host.exp.Exponent
xcrun simctl install booted ~/.expo/ios-simulator-app-cache/Expo-Go-*.tar.app
xcrun simctl openurl booted "exp://127.0.0.1:8081"
```

> **シミュレータの制約**: iOS Simulator はホスト Mac のカメラに接続されない。`⌖` (バーコードスキャン) を押しても CameraView は黒画面/ダミーになる。バーコード機能の動作確認は実機で行うこと (5.2)。

### 5.2 実機 iPhone で実行する (バーコード機能含む)

シミュレータでは確認できないカメラ系機能を試したい場合や、社内で実機検証する場合のフロー。

#### 手順

1. **iPhone に Expo Go をインストール**
   - App Store で「Expo Go」を検索してインストール (無料)。

2. **PC の LAN IP を確認**
   ```bash
   # macOS で Wi-Fi の IPv4 を取得
   ipconfig getifaddr en0          # 例: 192.168.1.10
   # 取れない場合 (Ethernet 等) は en1 / en2 も試す。
   ```

3. **モバイル `.env` の API URL を LAN IP に変更**
   ```bash
   # app/mobile/.env
   EXPO_PUBLIC_API_BASE_URL=http://192.168.1.10:8000
   ```
   ※ Expo の env はバンドル時に埋め込まれるので、変更後は Metro を再起動 (`Ctrl-C` → `npx expo start`)。

4. **バックエンド CORS に LAN IP を追加**
   ```php
   // app/backend/config/cors.php
   'allowed_origins' => [
       'http://localhost:3000',
       // ...
       'http://192.168.1.10:8000',   // ← 実機端末が叩く URL
   ],
   ```
   反映:
   ```bash
   docker compose -f platform/docker-compose.yml exec app php artisan config:clear
   ```
   > ネイティブ fetch だけなら CORS は実際にはチェックされないが、Expo Web 経由や将来の preflight 対策で揃えておく。

5. **同じ Wi-Fi に接続して `npx expo start` の QR を読む**
   - PC と iPhone を **同一 LAN** に接続。
   - `cd app/mobile && npx expo start` で出る QR を iPhone のカメラ (もしくは Expo Go の "Scan QR Code") で読み取り。
   - 起動するとアプリが立ち上がる (この時点ではまだカメラ権限は要求されない)。

#### カメラ権限の許可フロー

権限リクエストは **アプリ起動直後ではなく、`⌖` (バーコードスキャン) ボタンを最初に押した時** に発生する。手順:

1. アプリ起動後、「在庫一覧」タブのヘッダ右側にある `⌖` ボタンをタップ。
2. ScannerModal が開く → 初回は `useCameraPermissions()` が「未許可」を返すので、画面中央に **「権限をリクエスト」** ボタンが表示される。
3. その「権限をリクエスト」ボタンをタップ → iOS の **OS 標準ダイアログ** が出る:

   > "Expo Go" はカメラへのアクセスを求めています
   > バーコード読み取りのためにカメラへのアクセスを許可してください

   この文言は [app/mobile/app.json](../app/mobile/app.json) の `plugins.expo-camera.cameraPermission` で定義 (Info.plist の `NSCameraUsageDescription` に注入される)。

4. **「OK」** をタップ → そのまま `CameraView` のプレビューに切り替わる。以降、`⌖` を押すと即カメラが開く。

##### 拒否してしまった / 後から変更したい

OS 設定からのみ変更可能 (アプリ内では再度ダイアログを出せない)。

- **iOS (Expo Go)**: 設定 → Expo Go → カメラ → ON
- **iOS (EAS Build した独自ビルド)**: 設定 → `<アプリ名>` → カメラ → ON
- **Android**: 設定 → アプリ → Expo Go → 権限 → カメラ → 許可

> iOS Simulator でも同じ権限フローが走るが、Simulator は物理カメラを持たないため許可しても CameraView は黒画面/プレースホルダーのまま。実カメラの動作確認は実機でのみ可能。

#### バーコードスキャンの動作

| 状態                                    | 振る舞い                                                         |
| --------------------------------------- | ---------------------------------------------------------------- |
| バーコードが Item と紐付け済 (`barcode` 一致) | `POST /api/items/scan` が `+1` を実行 → アラート「在庫を +1 しました」 |
| 未登録のバーコード                      | 物品追加タブへ自動遷移、入力フォーム上部に青いバッジで barcode を表示。`name` / `category` を入力して保存すると barcode 付きの Item として登録される |
| スキャン失敗 / ネットワークエラー       | アラートで `Error.message` を表示。Metro ログにも出る            |

#### よくある引っかかり

- **`Network request failed`**: `EXPO_PUBLIC_API_BASE_URL` が `localhost` のまま (実機からは PC に届かない)。LAN IP に変更したか確認。
- **QR が表示されない / 接続できない**: PC のファイアウォール (System Settings → Network → Firewall) が Metro ポート (8081) を遮断していないか確認。
- **カメラ画面が真っ黒のまま**: 設定 → Expo Go → カメラの権限が OFF になっていないか確認 (前項「カメラ権限の許可フロー」参照)。Simulator なら物理カメラ非対応のため正常 (実機でテストすること)。
- **macOS の `ipconfig getifaddr en0` が空**: 有線 LAN や VPN 経由の場合は `en1` / `utun*` を `ifconfig` で確認。

### 5.3 接続先 (`EXPO_PUBLIC_API_BASE_URL`)

| 実行環境               | URL                                | 補足                                   |
| ---------------------- | ---------------------------------- | -------------------------------------- |
| iOS シミュレータ       | `http://localhost:8000`            | デフォルトで動く                       |
| Android エミュレータ   | `http://10.0.2.2:8000`             | エミュ→ホストの特殊 IP                 |
| 実機 (LAN 経由)        | `http://<PC の LAN IP>:8000`       | 例 `http://192.168.1.10:8000`。CORS にも追加要 (5.2 参照) |

### 5.4 既知の TS 型エラーについて

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

- Web (Next.js `http://localhost:3000`, docker / ローカル両方): `config/cors.php` で許可済。
- モバイル実機: `localhost` は端末自身を指すため、PC の LAN IP (例 `http://192.168.x.x:8000`) を使う。必要なら `config/cors.php` の `allowed_origins` に追加。

### 7.8 Web コンテナでビルドエラー / 反映されない

```bash
# build キャッシュ (.next の匿名ボリューム) を捨てて再生成
cd platform
docker compose down web
docker compose up -d --build web
```

依存関係を更新した場合 (`package.json` 変更時) はイメージ再ビルドが必要:

```bash
docker compose build --no-cache web
docker compose up -d web
```

### 7.7 CORS エラー

許可オリジンは `app/backend/config/cors.php` の `allowed_origins` で管理。変更後はキャッシュクリア:

```bash
docker compose -f platform/docker-compose.yml exec app php artisan config:clear
```

## 8. 本番デプロイ

dev (`docker-compose.yml`) とは別ファイル **`docker-compose.prod.yml`** で本番構成を提供する。Caddy が唯一の公開エントリポイント (80/443)、PHP-FPM・Next.js・MySQL・phpMyAdmin はすべて内部のみ。

### 8.1 構成サマリ

| サービス | 中身 | 公開 |
| --- | --- | --- |
| `proxy` (Caddy) | リバプロ。`/api/*` `/up` → `app` に FastCGI、それ以外 → `web` に reverse_proxy。ACME で TLS 自動取得 | **80 / 443** |
| `app` | PHP-FPM (`php:8.2-fpm-alpine`)。`composer install --no-dev`、`migrate --force` + `config:cache` 起動時自動 | 内部 9000 |
| `web` | Next.js を `next build` 済みの状態で `next start` (非 root, multi-stage) | 内部 3000 |
| `db` | MySQL 8.0。ホストポート非公開 | 内部 3306 |
| `phpmyadmin` | Caddy のサブドメイン経由 + Basic 認証で限定公開 (任意) | 内部 80 |

### 8.2 デプロイ前提

| 項目 | 内容 |
| --- | --- |
| サーバ | Docker / Docker Compose v2 が動く Linux ホスト |
| ネットワーク | TCP 80 / 443 がインターネットから到達可能 |
| DNS (TLS する場合) | `inventory.example.com` の A レコードがサーバ IP を指す。phpMyAdmin を使うなら `pma.inventory.example.com` も同様 |
| アウトバウンド | ACME (Let's Encrypt) と `composer install` / `npm ci` のためにインターネット出口必須 |

### 8.3 初回デプロイ手順

```bash
# 1) リポジトリ取得
git clone <repo-url> docker_inventory_management
cd docker_inventory_management/platform

# 2) env を作成
cp .env.prod.example .env.prod
# .env.prod を編集:
#   - APP_KEY        : 下記 3) で生成して埋める
#   - MYSQL_ROOT_PASSWORD / DB_PASSWORD : 強いパスワード
#   - SITE_HOSTNAME  : ドメイン取れているなら `inventory.example.com`、未取得なら ":80"
#   - ACME_EMAIL     : Let's Encrypt 通知用
#   - PMA_HOSTNAME / PMA_USER / PMA_PASSWORD_HASH (任意)

# 3) APP_KEY を生成して .env.prod に貼る
docker compose -f docker-compose.prod.yml --env-file .env.prod \
    run --rm --no-deps -e APP_KEY=base64:placeholder app \
    php artisan key:generate --show
# 出力 (base64:xxxxxxxx...) を .env.prod の APP_KEY= に貼る

# 4) phpMyAdmin の Basic 認証パスワードを生成 (任意)
docker compose -f docker-compose.prod.yml --env-file .env.prod \
    run --rm proxy caddy hash-password --plaintext 'YourStrongPassword'
# 出力 $2a$14$... を .env.prod の PMA_PASSWORD_HASH= に貼る

# 5) 起動
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# 6) 動作確認
curl -sI http://<your-host>/up                # 200 OK が返ること
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f proxy
```

### 8.4 ドメイン無しで先に立ち上げる

`SITE_HOSTNAME=:80` のままで起動すれば、HTTP のみ・自己署名なしで公開できる。後からドメインを取得したら:

```bash
# .env.prod の SITE_HOSTNAME を inventory.example.com に書き換える
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d proxy
# Caddy が起動時に ACME を実行し、自動で TLS 化 + 80→443 リダイレクト
docker compose -f docker-compose.prod.yml --env-file .env.prod logs proxy | grep -i "certificate"
```

### 8.5 phpMyAdmin をサブドメイン公開する

```bash
# .env.prod
PMA_HOSTNAME=pma.inventory.example.com
PMA_USER=admin
PMA_PASSWORD_HASH=$2a$14$...       # caddy hash-password で生成

# DNS の A レコード pma.inventory.example.com を追加 → サーバ IP

docker compose -f docker-compose.prod.yml --env-file .env.prod up -d proxy
```

ブラウザで `https://pma.inventory.example.com` を開くと Basic 認証 → phpMyAdmin。Caddy は両ドメインを同じ ACME アカウントで束ねて TLS 化する。

### 8.6 マイグレーション / アップデート

```bash
# コード更新
git pull

# イメージ再ビルド + 順次起動 (downtime < 数秒)
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# migrate --force は entrypoint 内で自動実行されるので artisan を明示する必要はない。
# 手動で叩きたい場合:
docker compose -f docker-compose.prod.yml --env-file .env.prod \
    exec app php artisan migrate --force
```

> **`migrate:fresh` は本番では絶対に実行しない** (全データ消失)。dev compose の `MIGRATE_MODE=fresh` 機能は prod entrypoint には実装していない。

### 8.7 ログ / トラブルシュート

| 確認内容 | コマンド |
| --- | --- |
| Caddy アクセスログ / ACME 動作 | `docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f proxy` |
| Laravel エラー (stderr 経由で docker logs に流れる) | `docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f app` |
| Next.js | `... logs -f web` |
| DB | `... logs -f db` |
| Caddy 証明書ファイル | コンテナ内 `/data/caddy/certificates/...` (永続化 volume `caddy_data`) |

#### よくあるトラブル

- **`502 Bad Gateway`**: `app` か `web` が未起動。`logs app` / `logs web` で原因確認。`entrypoint` のマイグレーションが失敗していることが多い (DB パスワード不一致など)。
- **TLS 証明書が取得できない**: 80 / 443 がファイアウォールで塞がれている、DNS A レコードがまだ伝播していない、ACME レート制限 (同じドメイン週 5 回まで)。`caddy_data` ボリュームを消すと再リクエストになるので注意。
- **`APP_KEY` エラー**: `.env.prod` の `APP_KEY=` 行が空。手順 3 を再実行。
- **CSS / JS が読み込めない**: `web` コンテナで `next build` が失敗している、もしくは `NEXT_PUBLIC_API_BASE_URL` がビルド時に間違っていた。`--build` で再ビルド。

### 8.8 外部マネージド DB に切り替え

`db` サービスを `compose.prod.yml` から削除し、`.env.prod` の `DB_HOST` を RDS / Cloud SQL のエンドポイントに変更。`MYSQL_*` 系の env は不要になる:

```yaml
# docker-compose.prod.yml から db / phpmyadmin / depends_on.db を削除
```

```bash
# .env.prod
DB_HOST=inventory-prod.xxx.ap-northeast-1.rds.amazonaws.com
DB_PORT=3306
DB_DATABASE=inventory
DB_USERNAME=app
DB_PASSWORD=...
```

### 8.9 外部 Nginx (社内 LB / Cloudflare 等) 配下に置く場合

既に Nginx などのリバースプロキシが TLS 終端 + 公開を担っている環境では、Caddy をその背後に置く構成にできる。Caddy は TLS を持たず、**ルーティング・FastCGI 連携・サブドメイン分岐・Basic 認証**だけを担う。

#### 8.9.1 構成

```
Internet
   │ 443 (TLS)
   ▼
┌──────────────┐
│  Nginx (外側) │  TLS 終端 / WAF / rate limit / 既存ドメイン束ね
└──────┬───────┘
       │ HTTP (Host / X-Forwarded-* を透過)
       ▼
┌──────────────┐
│  Caddy (本)   │  /api/* → app:9000 / その他 → web:3000 / PMA サブドメイン
└──────────────┘
```

#### 8.9.2 こちら側の設定変更

1. **`.env.prod` で TLS をオフ**
   ```bash
   SITE_HOSTNAME=:80
   # ACME_EMAIL は使われなくなる。PMA_HOSTNAME も "localhost:8888" のままで OK。
   ```

2. **`docker-compose.prod.yml` から 443 公開を削除** (もしくはループバック限定):
   ```yaml
   # 443 系を削除し、80 のみ。Nginx と同居なら 127.0.0.1 バインドが安全:
   ports:
     - "127.0.0.1:80:80"
   ```

3. **`platform/proxy/Caddyfile` の `trusted_proxies` を必要に応じて調整**
   - 既定 `private_ranges` は RFC1918 (10/8, 172.16/12, 192.168/16) を信頼。Nginx を同一 Docker ホストや同 VPC に置く場合はそのままで OK。
   - Nginx が **公的 IP の別ホスト** にある場合のみ、`static` で IP を明示:
     ```caddy
     servers {
         trusted_proxies static 203.0.113.10/32 198.51.100.0/24
     }
     ```

4. **起動**
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
   ```

#### 8.9.3 Nginx 側の設定例

```nginx
upstream inventory_caddy {
    server <caddy-host>:80;       # 同一ホストなら 127.0.0.1:80
    keepalive 32;
}

# メインサイト + phpMyAdmin サブドメインを束ねて受ける
server {
    listen 443 ssl http2;
    server_name inventory.example.com pma.inventory.example.com;

    ssl_certificate     /etc/letsencrypt/live/inventory.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/inventory.example.com/privkey.pem;

    # Caddy のサブドメイン分岐 (PMA) を活かすため Host を必ず透過
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;       # ★ Laravel が https を認識する鍵

    location / {
        proxy_pass http://inventory_caddy;
        proxy_http_version 1.1;
        # Next.js (RSC ストリーミング) や将来の WebSocket
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
    }
}

# 80 → 443 リダイレクトは Nginx 側で
server {
    listen 80;
    server_name inventory.example.com pma.inventory.example.com;
    return 301 https://$host$request_uri;
}
```

#### 8.9.4 動作確認 / よくある失敗

| 症状 | 原因 / 対処 |
| --- | --- |
| ブラウザは HTTPS なのに Laravel の生成リンクが `http://` | Nginx の `X-Forwarded-Proto` 透過漏れ。`proxy_set_header X-Forwarded-Proto $scheme;` を追加 |
| phpMyAdmin サブドメインに飛ぶと **メインサイト**が出る | Nginx が `Host` を書き換えている。`proxy_set_header Host $host;` を確認。Caddy 側で `PMA_HOSTNAME` を実ドメインに設定済か |
| アクセスログの IP が Nginx の IP ばかり | `Caddyfile` の `trusted_proxies` が Nginx の IP / CIDR をカバーしていない。`private_ranges` で十分か、もしくは `static` 列挙へ |
| `502 Bad Gateway` | Caddy コンテナが listen していない (`SITE_HOSTNAME=:80` か再確認) / 80 公開が `127.0.0.1` 限定で Nginx から到達できない |
| `[caddy] using OCSP from filesystem` のような警告 | TLS 関連の試行ログ。`SITE_HOSTNAME=:80` で無効化されているはずだが、過去に取得した証明書が `caddy_data` に残っている場合 `docker volume rm platform_caddy_data` でクリーンに |

#### 8.9.5 Cloudflare 等を使う場合

- Cloudflare で TLS 終端 + キャッシュ + WAF を担い、Caddy までは HTTP/2 over 自社 IP 範囲。
- `trusted_proxies` には **Cloudflare の IP レンジ** を `static` で列挙 (Cloudflare 公式ドキュメントから取得)。RFC1918 ではないので `private_ranges` だけでは効かない。
- Cloudflare の "Origin Rules" で `Host` をオリジナルドメインのまま渡すこと (デフォルト挙動)。

### 8.10 dev / prod の使い分け

| | dev (`docker-compose.yml`) | prod (`docker-compose.prod.yml`) |
| --- | --- | --- |
| Backend | `php artisan serve` (バインドマウント) | PHP-FPM (`--no-dev`、イメージ焼き込み) |
| Web | `next dev` or `next build`+`next start` (バインドマウント) | `next build` 済みイメージで `next start` (非 root) |
| DB | ホスト 3306 公開 | 内部のみ |
| phpMyAdmin | ホスト 8080 公開、認証なし | Caddy 経由 + Basic 認証 |
| 起動コマンド | `docker compose up -d` | `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build` |
| マイグレーション | `MIGRATE_MODE=migrate` / `fresh` で切替 | `migrate --force` 固定 (entrypoint) |
| TLS | なし | Caddy 自動取得 (LE) |

## 9. ディレクトリ早見表

| パス                                   | 役割                                   |
| -------------------------------------- | -------------------------------------- |
| `platform/docker-compose.yml`          | コンテナ定義の入り口 (`app` / `db` / `phpmyadmin` / `web`) |
| `platform/docker/Dockerfile`           | Laravel 実行用イメージ                 |
| `app/web/Dockerfile`                   | Next.js (web) 実行用イメージ            |
| `app/backend/.env`                     | Laravel 環境変数 (gitignore)           |
| `app/backend/wait-for-db.sh`           | コンテナ実行時に走る起動スクリプト     |
| `app/backend/bootstrap/app.php`        | Laravel ブート設定 (api ルート登録あり)|
| `app/backend/routes/api.php`           | API ルーティング                       |
| `app/backend/app/Http/Controllers/`    | `Auth` / `Item` / `Category` / `StorageLocation` / `Analytics` Controller |
| `app/backend/app/Http/Middleware/`     | `AuthenticateToken` (`auth.token` エイリアス、Bearer 認証) |
| `app/backend/app/Models/`              | `Item` / `Category` / `ItemHistory` / `StorageLocation` / `ApiToken` / `User` |
| `app/backend/config/cors.php`          | CORS 許可オリジン定義                  |
| `app/backend/database/migrations/`     | スキーマ定義                           |
| `app/backend/database/seeders/`        | 初期データ投入 (Item 系)              |
| `platform/mysql/`                      | MySQL データ (gitignore)               |

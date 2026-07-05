# Alexa スキル セットアップ手順

「アレクサ、在庫管理を開いて」→「○○を払い出して」で在庫を1個払い出せるカスタムスキル。

## デプロイ方式の選択

バックエンドは 2 つの方式から選択できる。どちらもハンドラーのロジックは同じ。

| 項目 | 方式 A: Lambda | 方式 B: 自サーバー |
|---|---|---|
| バックエンド | AWS Lambda (Node.js 22.x) | `alexa_server` コンテナ (Express) |
| AWS アカウント | 必要 | 不要 |
| エンドポイント指定 | Lambda ARN | HTTPS URL (`/alexa`) |
| 構成図 | `Alexa → Lambda → Laravel API` | `Alexa → Nginx → alexa_server → Laravel API` |
| コスト | AWS 無料枠内 (月 1M リクエスト) | サーバー費用に含まれる |
| 更新 | zip ビルド → Lambda アップロード | `docker compose restart alexa-server` |

---

## 前提条件 (共通)

| 必要なもの | 用途 |
|---|---|
| Amazon/Alexa アカウント | Alexa Developer Console ログイン |
| 公開 HTTPS の Laravel API | Alexa バックエンドから呼び出すため |

> API が `localhost:8000` のままだと外部から到達できない。本番環境 (Nginx + 独自ドメイン) が必要。

### API トークンの取得

```bash
curl -s -X POST https://<your-api-domain>/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password"}'
```

レスポンスの `token` をメモしておく。

---

## 方式 A: Lambda セットアップ

### A-1. skill.zip をビルド

```bash
cd platform
docker compose --profile alexa run --rm alexa-build
```

`app/alexa/skill.zip` が生成される。ローカルへの Node.js インストールは不要。

### A-2. AWS Console で Lambda 関数を作成

1. [AWS Lambda コンソール](https://console.aws.amazon.com/lambda) を開く
2. **関数の作成** → 一から作成
   - 関数名: `inventory-alexa-skill`
   - ランタイム: `Node.js 22.x`
   - アーキテクチャ: `x86_64`
3. **コードソース** → **.zip ファイルをアップロード** → `app/alexa/skill.zip` を選択

### A-3. 環境変数を設定

**「設定」タブ → 「環境変数」** に以下を追加:

| キー | 値 |
|---|---|
| `API_BASE_URL` | `https://<your-api-domain>` |
| `API_TOKEN` | 前述で取得したトークン |

### A-4. タイムアウトを延ばす

**「設定」タブ → 「一般設定」** → タイムアウトを **15 秒** に変更。

### A-5. Alexa スキルにエンドポイントを設定

1. [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask) → スキル「在庫管理」→「ビルド」タブ
2. **エンドポイント** → **「AWS Lambda ARN」** → Lambda ARN を貼り付け → 「エンドポイントを保存」

### A-6. インタラクションモデルをデプロイ

左メニュー **「インタラクションモデル」→「JSON エディター」** を開き、`app/alexa/interaction-model/ja-JP.json` の内容を貼り付けて **「モデルを保存」→「モデルをビルド」**。

### A-7. 動作確認

「テスト」タブで `在庫管理を開いて` → 「在庫管理を開きました。何を払い出しますか？」が返れば成功。

---

## 方式 B: 自サーバー (alexa_server コンテナ) セットアップ

### B-1. `platform/.env` に API トークンを設定

```bash
# platform/.env
API_BASE_URL=http://demo-inventory-api:8000
API_TOKEN=<前述で取得したトークン>
```

### B-2. alexa_server コンテナを起動

```bash
cd platform
docker compose up -d alexa-server
docker compose logs alexa-server   # "Alexa skill server running on port 3002" を確認
```

### B-3. Nginx の `/alexa` ルーティングを確認

`nginx_data/conf.d/inventory.conf` に以下が含まれていること (設定済み):

```nginx
location /alexa {
    modsecurity off;
    proxy_pass         http://demo-inventory-alexa:3002;
    proxy_read_timeout 10s;
    ...
}
```

疎通確認 (400 が返れば正常):

```bash
curl -sI -X POST https://inventory.example.com/alexa
# → HTTP/2 400
```

### B-4. Alexa スキルにエンドポイントを設定

1. [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask) → スキル「在庫管理」→「ビルド」タブ
2. **エンドポイント** → **「HTTPS」** を選択:

| 項目 | 値 |
|---|---|
| デフォルトのリージョン URL | `https://inventory.example.com/alexa` |
| SSL 証明書の種類 | 「サブドメインのワイルドカード証明書を持つ信頼できる証明機関」 |

「エンドポイントを保存」。

### B-5. インタラクションモデルをデプロイ

方式 A の A-6 と同手順。`app/alexa/interaction-model/ja-JP.json` を貼り付けて「モデルを保存」→「モデルをビルド」。

### B-6. 動作確認

Alexa シミュレーター (または実機) で `在庫管理を開いて` → 「在庫管理を開きました。何を払い出しますか？」が返れば成功。

---

## 発話サンプル

| 発話 | 動作 |
|---|---|
| `アレクサ、在庫管理を開いて` | スキル起動 |
| `マウス` | マウスの在庫を -1 |
| `ボールペンを払い出して` | ボールペンの在庫を -1 |
| `大丈夫` / `払い出さない` / `いいえ` | 終了 |
| `ヘルプ` | 使い方を案内 |
| `キャンセル` / `ストップ` | 終了 |

---

## トラブルシュート

### 方式 A (Lambda)

| 症状 | 原因と対処 |
|---|---|
| `Runtime.CallbackHandlerDeprecated` | ランタイムが Node.js 24 → Node.js 22.x に変更 |
| `Unable to find a suitable request handler` | 未登録インテント。ハンドラーを追加して再デプロイ |
| `SessionEndedRequest reason: "ERROR"` | `LaunchRequest` で `addElicitSlotDirective` を使用しているなど仕様違反 |
| API タイムアウト | Lambda タイムアウトを 15 秒以上に変更 |

### 方式 B (自サーバー)

| 症状 | 原因と対処 |
|---|---|
| `curl` が 404 | Nginx の `/alexa` ロケーションブロック未設定、または `alexa_server` が `proxy_network` 未接続 |
| `curl` が 502 / 503 | `docker ps` で `alexa_server` が起動しているか確認 |
| 「在庫システムに接続できませんでした」 | `API_BASE_URL=http://demo-inventory-api:8000` を確認。`docker logs alexa_server` で `getItems error:` を確認 |
| 「スキルが応答できませんでした」 | Alexa Developer Console のエンドポイントが Lambda ARN のまま → HTTPS URL に変更 |
| 401 エラー | `API_TOKEN` が誤り。`platform/.env` を確認後 `docker compose restart alexa-server` |

### 共通

| 症状 | 原因と対処 |
|---|---|
| 「○○は見つかりませんでした」 | 品名表記が DB と不一致。Web UI で確認し発音・表記を合わせる |
| 401 エラー (API 側) | トークンが失効。API トークンを再取得して環境変数を更新 |

---

## ストアでのプレビュー (ja-JP 公開設定)

Alexa Developer Console → **「公開」タブ → 「ja-JP スキルプレビュー」** に入力する内容。

---

### スキル名

```
在庫管理
```

---

### 概要 (130文字以内)

```
声で在庫を払い出せる社内向けスキル。品名を話すだけで在庫を1個減らし、残数を読み上げます。
```

---

### 詳細な説明

```
在庫管理スキルは、倉庫・オフィスの在庫払い出し作業を音声で行えるスキルです。

【使い方】
「アレクサ、在庫管理を開いて」と話しかけてスキルを起動し、払い出したい品名（例：マウス、ボールペンなど）を言うと、在庫を1個減らして残数をお知らせします。続けて別の品名を言えば複数の払い出しを連続して行えます。終わるときは「大丈夫」「払い出さない」と言うと終了します。

【対応品目の例】
ハンマー、ドライバー、ボールペン、鉛筆、マウス、キーボード、ノート、テープ、はさみ など

【ご注意】
このスキルは社内の在庫管理システムと連携して動作します。ご利用には管理者によるシステム設定が必要です。
```

---

### 使用例のフレーズ (3つ必須)

```
アレクサ、在庫管理を開いて
```
```
マウス
```
```
大丈夫
```

> Alexa の制約上、2・3つ目は呼び出し名なしの短いフレーズでも登録できる。スキル起動後の発話例として示す。

---

### キーワード

```
在庫, 管理, 払い出し, 倉庫, 音声操作
```

---

### カテゴリ

```
オーガナイザーとアシスタント (ORGANIZERS_AND_ASSISTANTS)
```

---

### テスト手順

```
「アレクサ、在庫管理を開いて」と言ってスキルを起動し、「マウス」など登録済みの品名を発話して在庫が1個減ることを確認してください。「大丈夫」と言うとスキルが終了します。
```

---

### プライバシーポリシー URL / 利用規約 URL

社内専用スキルのため不要 (空欄で可)。

---

### アイコン

| 種別 | サイズ | ファイル |
|---|---|---|
| 大きいアイコン | 512×512 px | `app/alexa/icon_512.png` |
| 小さいアイコン | 108×108 px | `app/alexa/icon_108.png` |

---

## ファイル構成

```
app/alexa/                          方式 A: Lambda 関連
├── lambda/
│   ├── index.js                    Lambda ハンドラー (exports.handler)
│   └── package.json                依存 (ask-sdk-core, axios)
├── interaction-model/
│   └── ja-JP.json                  日本語インタラクションモデル
├── icon_108.png / icon_512.png     スキルアイコン
└── skill-manifest.json             スキルメタデータ (ASK CLI 用)

platform/alexa-server/              方式 B: 自サーバー (Express)
├── index.js                        Express + ask-sdk-express-adapter エントリーポイント
└── package.json                    依存 (ask-sdk-core, ask-sdk-express-adapter, express, axios)
```

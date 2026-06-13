# Alexa スキル セットアップ手順

「アレクサ、在庫管理を開いて」→「○○を減らして」で在庫を1個払い出せるカスタムスキル。

## 構成

```
Alexa (音声) → AWS Lambda (Node.js) → Laravel API → MySQL
```

Lambda は AWS 無料枠 (月1M リクエスト) で動作する。

---

## 前提条件

| 必要なもの | 用途 |
|---|---|
| Amazon/Alexa アカウント | Alexa Developer Console ログイン |
| AWS アカウント | Lambda 関数のデプロイ |
| 公開 HTTPS の Laravel API URL | Lambda から呼び出すため |

> API が `localhost:8000` のままだと Lambda から到達できない。本番環境 (Caddy + 独自ドメイン) か ngrok/Cloudflare Tunnel でトンネルを作成してから進めること。

---

## 手順

### 1. API トークンを取得する

API が起動している状態で以下を実行:

```bash
curl -s -X POST https://<your-api-domain>/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password"}'
```

レスポンスの `token` をメモしておく。

---

### 2. Lambda 関数を作成する

#### 2-1. コンテナで依存パッケージをインストールして zip を作る

```bash
cd platform
docker compose --profile alexa run --rm alexa-build
```

`app/alexa/skill.zip` が生成される。ローカルへの Node.js インストールは不要。

#### 2-2. AWS Console で Lambda 関数を作成

1. [AWS Lambda コンソール](https://console.aws.amazon.com/lambda) を開く
2. **関数の作成** → 一から作成
   - 関数名: `inventory-alexa-skill`
   - ランタイム: `Node.js 20.x`
   - アーキテクチャ: `x86_64`
3. **コードソース** → **.zip ファイルをアップロード** → `app/alexa/skill.zip` を選択

#### 2-3. 環境変数を設定

**設定 → 環境変数** に以下を追加:

| キー | 値 |
|---|---|
| `API_BASE_URL` | `https://<your-api-domain>` |
| `API_TOKEN` | 手順 1 で取得したトークン |

#### 2-4. タイムアウトを延ばす

**設定 → 全般設定** → タイムアウトを **15秒** に変更 (API 応答を待つため)。

#### 2-5. Lambda 関数の ARN をコピー

ページ右上に表示される ARN (`arn:aws:lambda:ap-northeast-1:...`) をコピーしておく。

---

### 3. Alexa スキルを作成する

1. [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask) を開く
2. **スキルの作成**
   - スキル名: `在庫管理`
   - 第一言語: `日本語 (JP)`
   - スキルモデル: **カスタム**
   - ホスティング: **独自のプロビジョニング**
3. **呼び出し名** を `在庫管理` に設定

#### 3-1. インタラクションモデルをインポート

左メニュー **インタラクションモデル → JSON エディター** を開き、
`app/alexa/interaction-model/ja-JP.json` の内容をそのまま貼り付けて **保存** → **モデルをビルド**。

#### 3-2. エンドポイントに Lambda を指定

左メニュー **エンドポイント** → **AWS Lambda ARN**  
- デフォルトのリージョン: 手順 2-5 でコピーした ARN を貼り付け

**保存** をクリック。

---

### 4. 動作確認

Alexa Developer Console の **テスト** タブを開き、言語を `日本語` に切り替えてから:

```
在庫管理を開いて
```

→ 「在庫管理を開きました。何を払い出しますか？」と返ってくれば成功。

続けて:

```
鉛筆を減らして
```

→ 「鉛筆を1個払い出しました。残り〇個です。」

---

## 発話サンプル

| 発話 | 動作 |
|---|---|
| `アレクサ、在庫管理を開いて` | スキル起動 |
| `鉛筆を減らして` | 鉛筆の在庫を -1 |
| `マウスを払い出して` | マウスの在庫を -1 |
| `鉛筆を一個使った` | 鉛筆の在庫を -1 |
| `ヘルプ` | 使い方を案内 |
| `終了` | スキルを終了 |

---

## トラブルシュート

| 症状 | 原因と対処 |
|---|---|
| 「在庫システムに接続できませんでした」 | `API_BASE_URL` が誤っているか、API が公開されていない。`curl <API_BASE_URL>/api/items -H "Authorization: Bearer <TOKEN>"` で確認 |
| 「○○は見つかりませんでした」 | Alexa が認識した品名とDB上の品名が一致しない。Web UI で品名を確認し、発音・表記を合わせる |
| Lambda タイムアウト | タイムアウトを 15 秒以上に設定。API 側の応答も確認 |
| 401 エラー | トークンが失効している。手順 1 を再実行して `API_TOKEN` 環境変数を更新 |

---

## ファイル構成

```
app/alexa/
├── lambda/
│   ├── index.js          Lambda エントリーポイント
│   └── package.json      依存 (ask-sdk-core, axios)
├── interaction-model/
│   └── ja-JP.json        日本語インタラクションモデル
└── skill-manifest.json   スキルメタデータ (ASK CLI 用)
```

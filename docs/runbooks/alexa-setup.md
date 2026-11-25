# Alexa スキル セットアップ手順

「アレクサ、ストクルを開いて」→「マウスを2個」で在庫を払い出せるカスタムスキル。在庫の確認（「マウスの在庫は？」）と、直前の払い出しの取り消し（「取り消して」）もできる。仕様は README の第 7 章。

## デプロイ方式の選択

バックエンドは 2 つの方式から選択できる。ハンドラーは `app/alexa/skill/lib/` の 1 か所にあり、どちらも同じものを使う。

| 項目 | 方式 A: Lambda | 方式 B: 自サーバー |
|---|---|---|
| バックエンド | AWS Lambda (Node.js 22.x) | `alexa_server` コンテナ (Express) |
| 入口 | `app/alexa/skill/index.js`（`index.handler`） | `app/alexa/skill/server.js` |
| AWS アカウント | 必要 | 不要 |
| エンドポイント指定 | Lambda ARN | HTTPS URL (`/alexa`) |
| 構成図 | `Alexa → Lambda → Laravel API` | `Alexa → Nginx → alexa_server → Laravel API` |
| コスト | AWS 無料枠内 (月 1M リクエスト) | サーバー費用に含まれる |
| 更新 | zip ビルド → Lambda アップロード | `docker compose up -d --build alexa-server` |

---

## 前提条件 (共通)

| 必要なもの | 用途 |
|---|---|
| Amazon/Alexa アカウント | Alexa Developer Console ログイン |
| 公開 HTTPS の Laravel API | Alexa バックエンドから呼び出すため |
| スキル ID（`amzn1.ask.skill.…`） | Alexa Developer Console のスキル一覧で確かめる。`ALEXA_SKILL_ID` に設定する |

> API が `localhost:8000` のままだと外部から到達できない。本番環境 (Nginx + 独自ドメイン) が必要。

### Alexa 用トークンの発行

Alexa には、ログインで得たトークンではなく、**Alexa 用のトークン**を使う。品目の参照と増減だけができ、期限（既定 365 日）がある（README の D13）。

API のコンテナで、トークンの持ち主のメールアドレスを指定して発行する。持ち主のテナントの品目が対象になり、履歴の記録者もこの人になる（履歴には「（Alexa）」と付く）。

```bash
cd platform
docker compose exec app php artisan inventory:alexa-token alexa@example.com
# 期限を変えるとき: --days=90（0 で無期限）
```

最後の行に表示される 64 文字がトークン。**この表示のあとは確かめられない**ので、すぐに `API_TOKEN` に設定する。

- 同じ人の Alexa 用トークンは、発行のたびに作り直す。前のトークンはその場で使えなくなるので、発行したらすぐに `API_TOKEN` を差し替える。
- 取り消すだけなら `php artisan inventory:alexa-token alexa@example.com --revoke`。
- 期限が切れると、Alexa は「ストクルの設定に問題があり…管理者に連絡してください」と答える。期限の前に発行し直す。
- 持ち主には、Alexa の操作の記録用に専用のユーザーを作っておくとよい（人の操作と区別しやすい）。

---

## 方式 A: Lambda セットアップ

### A-1. skill.zip をビルド

```bash
cd platform
docker compose --profile alexa run --rm alexa-build
```

`app/alexa/skill.zip` が生成される（`index.js`・`lib/`・`node_modules`）。ローカルへの Node.js インストールは不要。

### A-2. AWS Console で Lambda 関数を作成

1. [AWS Lambda コンソール](https://console.aws.amazon.com/lambda) を開く
2. **関数の作成** → 一から作成
   - 関数名: `inventory-alexa-skill`
   - ランタイム: `Node.js 22.x`
   - アーキテクチャ: `x86_64`
3. **コードソース** → **.zip ファイルをアップロード** → `app/alexa/skill.zip` を選択
4. ハンドラーが `index.handler` であることを確認

### A-3. 環境変数を設定

**「設定」タブ → 「環境変数」** に以下を追加:

| キー | 値 |
|---|---|
| `API_BASE_URL` | `https://<your-api-domain>` |
| `API_TOKEN` | 前述で発行した Alexa 用トークン |
| `ALEXA_SKILL_ID` | スキル ID（`amzn1.ask.skill.…`）。未設定だと、すべての要求をエラーにする |

### A-4. タイムアウトを延ばす

**「設定」タブ → 「一般設定」** → タイムアウトを **15 秒** に変更。

### A-5. Alexa のトリガーを追加

**「設定」タブ → 「トリガー」** →「トリガーを追加」→「Alexa Skills Kit」→ スキル ID の検証を有効にして、スキル ID を入力する（コードの `ALEXA_SKILL_ID` の確認とあわせて二重に絞る）。

### A-6. Alexa スキルにエンドポイントを設定

1. [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask) → スキル「ストクル」→「ビルド」タブ
2. **エンドポイント** → **「AWS Lambda ARN」** → Lambda ARN を貼り付け → 「エンドポイントを保存」

### A-7. インタラクションモデルをデプロイ

左メニュー **「インタラクションモデル」→「JSON エディター」** を開き、`app/alexa/interaction-model/ja-JP.json` の内容を貼り付けて **「モデルを保存」→「モデルをビルド」**。

### A-8. 動作確認

「テスト」タブで `ストクルを開いて` → 「ストクルを開きました。何を払い出しますか？」が返れば成功。続けて下の「発話サンプル」を試す。

---

## 方式 B: 自サーバー (alexa_server コンテナ) セットアップ

### B-1. `platform/.env` に API トークンとスキル ID を設定

```bash
# platform/.env
API_BASE_URL=http://demo-inventory-api:8000
API_TOKEN=<前述で発行した Alexa 用トークン>
ALEXA_SKILL_ID=<Alexa Developer Console のスキル ID (amzn1.ask.skill.…)>
```

`ALEXA_SKILL_ID` が空だと、`alexa-server` はすべての要求を 503 で断る（ほかの人のスキルからの要求を受けないため）。

### B-2. alexa_server コンテナを起動

`app/alexa/skill/Dockerfile` からイメージを作る（依存は lockfile どおりに入れ、root ではないユーザーで動かす）。

```bash
cd platform
docker compose up -d --build alexa-server
docker compose logs alexa-server   # "Alexa skill server running on port 3002" と "Skill ID verification: enabled" を確認
docker compose ps alexa-server     # STATUS が healthy になること (コンテナ内の /healthz を見ている)
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

疎通確認 (400 が返れば正常 — 署名のない要求を断っている):

```bash
curl -sI -X POST https://inventory.example.com/alexa
# → HTTP/2 400
```

### B-4. Alexa スキルにエンドポイントを設定

1. [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask) → スキル「ストクル」→「ビルド」タブ
2. **エンドポイント** → **「HTTPS」** を選択:

| 項目 | 値 |
|---|---|
| デフォルトのリージョン URL | `https://inventory.example.com/alexa` |
| SSL 証明書の種類 | 「サブドメインのワイルドカード証明書を持つ信頼できる証明機関」 |

「エンドポイントを保存」。

### B-5. インタラクションモデルをデプロイ

方式 A の A-7 と同手順。`app/alexa/interaction-model/ja-JP.json` を貼り付けて「モデルを保存」→「モデルをビルド」。

### B-6. 動作確認

Alexa シミュレーター (または実機) で `ストクルを開いて` → 「ストクルを開きました。何を払い出しますか？」が返れば成功。

---

## 発話サンプル

| 発話 | 動作 |
|---|---|
| `アレクサ、ストクルを開いて` | スキル起動 |
| `マウス` / `マウスを払い出して` | マウスの在庫を −1 |
| `マウスを3個` / `マウスを3個使った` | マウスの在庫を −3（10 個以上は確かめてから） |
| `マウスの在庫は` / `マウスは何個ある` | 残りの数を答える（変えない） |
| `取り消して` / `間違えた` | 開いているあいだの、直前の払い出しを戻す |
| `はい` / `いいえ` | 「〜を払い出しますか？」への答え |
| `アレクサ、ストクルでマウスを払い出して` | 一言で払い出す |
| `大丈夫` / `いいえ`（確かめていないとき） | 終了 |
| `ヘルプ` / `使い方` | 使い方を案内 |
| `キャンセル` / `ストップ` | 終了 |

---

## トラブルシュート

### 方式 A (Lambda)

| 症状 | 原因と対処 |
|---|---|
| `ALEXA_SKILL_ID is not configured` | Lambda の環境変数に `ALEXA_SKILL_ID` を設定する |
| `Unable to find a suitable request handler` | 未登録インテント。`lib/skill.js` にハンドラーを追加して再デプロイ |
| `SessionEndedRequest reason: "ERROR"` | 応答が仕様違反。CloudWatch のログの `SessionEnded with error:` を見る |
| API タイムアウト | Lambda タイムアウトを 15 秒以上に変更 |

### 方式 B (自サーバー)

| 症状 | 原因と対処 |
|---|---|
| `curl` が 404 | Nginx の `/alexa` ロケーションブロック未設定、または `alexa_server` が `proxy_network` 未接続 |
| `curl` が 502 / 503 | `docker ps` で `alexa_server` が起動しているか確認 |
| 「在庫システムに接続できませんでした」 | `API_BASE_URL=http://demo-inventory-api:8000` を確認。`docker logs alexa_server` で `listItems failed:` を確認 |
| 「スキルが応答できませんでした」 | Alexa Developer Console のエンドポイントが Lambda ARN のまま → HTTPS URL に変更 |
| どの発話にも応答しない・ログに `ALEXA_SKILL_ID is not set` | `ALEXA_SKILL_ID` が未設定か、スキルの ID と違う。`platform/.env` を直し、`docker compose up -d alexa-server` で作り直す |

### 共通

| 症状 | 原因と対処 |
|---|---|
| 「ストクルの設定に問題があり…管理者に連絡してください」 | API がトークンを断った（401 / 403）。期限切れ、取り消し済み、またはログインで得たトークンを設定している。Alexa 用トークンを発行し直して環境変数を更新 |
| 「○○は見つかりませんでした」 | 品名の表記が DB と違う。Web で品名を確かめる。品名はスキルを開いたときに API から読んで Alexa に渡す（最大 100 件）ので、品目が多いときは一言で呼ぶより、開いてから言う方が当たりやすい |
| 「○○という品目が複数あるため、音声では選べません」 | 同じ名前の品目が複数ある。Web で名前を分ける（例：「ボールペン（黒）」） |
| 新しいインテントが反応しない | `ja-JP.json` を貼り付けてモデルをビルドし直したか確認 |

---

## ストアでのプレビュー (ja-JP 公開設定)

Alexa Developer Console → **「公開」タブ → 「ja-JP スキルプレビュー」** に入力する内容。

---

### スキル名

```
ストクル
```

---

### 概要 (130文字以内)

```
声で在庫を払い出せる社内向けスキル。品名と個数を話すだけで在庫を減らし、残数を読み上げます。在庫の確認と取り消しもできます。
```

---

### 詳細な説明

```
ストクルは、倉庫・オフィスの在庫払い出し作業を音声で行えるスキルです。

【使い方】
「アレクサ、ストクルを開いて」と話しかけてスキルを起動し、払い出したい品名（例：マウス、ボールペンなど）を言うと、在庫を減らして残数をお知らせします。「マウスを3個」のように個数も指定できます。続けて別の品名を言えば、複数の払い出しを連続して行えます。

「マウスの在庫は？」と聞くと残りの数を、「取り消して」と言うと直前の払い出しを元に戻します。終わるときは「大丈夫」と言うと終了します。

【ご注意】
このスキルは社内の在庫管理システムと連携して動作します。ご利用には管理者によるシステム設定が必要です。
```

---

### 使用例のフレーズ (3つ必須)

```
アレクサ、ストクルを開いて
```
```
アレクサ、ストクルでマウスを2個払い出して
```
```
アレクサ、ストクルでマウスの在庫を教えて
```

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
「アレクサ、ストクルを開いて」と言ってスキルを起動し、「マウス」など登録済みの品名を発話して在庫が1個減ることを確認してください。「マウスを2個」で2個減ること、「マウスの在庫は？」で残数が読み上げられること、「取り消して」で直前の払い出しが戻ることも確認できます。「大丈夫」と言うとスキルが終了します。
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
app/alexa/
├── skill/                          Lambda と自サーバーで共通
│   ├── index.js                    方式 A: Lambda の入口 (exports.handler)
│   ├── server.js                   方式 B: Express の入口 (/alexa と /healthz)
│   ├── lib/
│   │   ├── skill.js                ハンドラー (払い出し・在庫の確認・取り消し・確認の「はい / いいえ」)
│   │   ├── match.js                品名の照合 (完全一致 → 部分一致)
│   │   ├── api.js                  在庫の API のクライアント
│   │   └── speech.js               読み上げ用のエスケープ
│   ├── test/                       node --test のテスト
│   ├── Dockerfile                  方式 B のイメージ
│   └── package.json                依存 (ask-sdk-core, ask-sdk-express-adapter, express, axios)
├── interaction-model/
│   └── ja-JP.json                  日本語インタラクションモデル
├── icon_108.png / icon_512.png     スキルアイコン
└── skill-manifest.json             スキルメタデータ (ASK CLI 用)
```

テストは次のとおり（API につながずに動く）。

```bash
docker run --rm -v "$PWD/app/alexa/skill":/app -w /app node:22-alpine sh -c 'npm ci && npm test'
```

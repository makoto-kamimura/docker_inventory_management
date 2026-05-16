# docker_inventory_management

在庫管理アプリケーション。

## ディレクトリ構成

```
docker_inventory_management/
├── app/                      アプリケーション層
│   ├── backend/              Laravel API (PHP 8.2)
│   ├── web/                  Next.js (App Router, TypeScript)
│   └── mobile/               Expo + React Native (TypeScript)
├── platform/                 インフラ層
│   ├── docker/               Dockerfile (PHP/Laravel イメージ)
│   ├── mysql/                MySQL データボリューム
│   ├── script/               起動・運用スクリプト
│   └── docker-compose.yml    コンテナ定義
└── doc/                      ドキュメント / アーカイブ
    ├── README.md             このファイル
    └── archive/              旧版・参考実装
```

## 起動

```bash
cd platform
docker compose up -d
```

| Service     | URL                       |
| ----------- | ------------------------- |
| Laravel API | http://localhost:8000     |
| phpMyAdmin  | http://localhost:8080     |
| MySQL       | localhost:3306            |

## フロントエンド

### Web (Next.js)

```bash
cd app/web
npm run dev
```

### Mobile (Expo)

```bash
cd app/mobile
npx expo start
```

## アーカイブ

- `doc/archive/reactnative_app/` — 旧 Expo プロジェクト
- `doc/archive/reactnative_app_bk/` — 旧 React Native バックアップ

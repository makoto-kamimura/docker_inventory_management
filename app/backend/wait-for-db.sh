#!/bin/sh
set -e

# MySQL の listen 待ち
echo "Waiting for MySQL (db:3306)..."
until nc -z db 3306; do
  sleep 2
done
echo "MySQL is ready."

# マイグレーション挙動を MIGRATE_MODE で切り替え:
#   migrate (default) — 差分適用のみ。データ保持。
#   fresh             — 全テーブル drop → migrate:fresh --seed (初期化用)
MODE="${MIGRATE_MODE:-migrate}"

case "$MODE" in
  fresh)
    echo "MIGRATE_MODE=fresh → migrate:fresh --seed を実行します"
    php artisan migrate:fresh --seed --force
    ;;
  migrate|*)
    echo "MIGRATE_MODE=$MODE → migrate --force を実行します"
    php artisan migrate --force
    ;;
esac

# 開発サーバ起動
exec php artisan serve --host=0.0.0.0 --port=8000

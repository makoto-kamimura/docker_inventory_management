#!/bin/sh
# Laravel 本番起動スクリプト
# - DB を待つ
# - migrate (forward only) を実行 (本番では fresh は禁止)
# - config / route / view をキャッシュ
# - php-fpm を起動
set -e

DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-3306}"

echo "[entrypoint] waiting for ${DB_HOST}:${DB_PORT}..."
until nc -z "${DB_HOST}" "${DB_PORT}" 2>/dev/null; do
    sleep 1
done
echo "[entrypoint] database is ready"

# 本番では migrate --force のみ。fresh は破壊的なので許可しない。
echo "[entrypoint] running migrations..."
php artisan migrate --force

# パフォーマンス用キャッシュ
echo "[entrypoint] optimizing caches..."
php artisan config:cache
php artisan route:cache
php artisan view:cache

echo "[entrypoint] starting: $*"
exec "$@"

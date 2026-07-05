#!/bin/sh
set -e

# .env がなければ .env.example からコピー (デモ起動用)
if [ ! -f /var/www/.env ]; then
  echo ".env が見つかりません。.env.example からコピーします..."
  cp /var/www/.env.example /var/www/.env
fi

# Composer 依存パッケージのインストール (vendor/ がなければ実行)
if [ ! -d /var/www/vendor ]; then
  echo "vendor/ が見つかりません。composer install を実行します..."
  composer install --no-interaction --prefer-dist --optimize-autoloader
fi

# APP_KEY が未設定なら自動生成
if ! grep -q "^APP_KEY=base64:" /var/www/.env 2>/dev/null; then
  echo "APP_KEY を生成します..."
  php artisan key:generate --force
fi

# 環境変数が .env のデフォルト値と異なる場合は .env を上書きする。
# php artisan serve が起動する子プロセス (php -S) は親の環境変数を引き継がないため、
# .env に正しい値を書き込んでおく必要がある。
for _VAR in DB_HOST DB_PORT DB_DATABASE DB_USERNAME DB_PASSWORD APP_KEY APP_URL APP_ENV APP_DEBUG; do
  _VAL="$(eval echo \"\${${_VAR}+x}\")"
  if [ -n "${_VAL}" ]; then
    _ACTUAL="$(eval echo \"\$${_VAR}\")"
    if grep -q "^${_VAR}=" /var/www/.env 2>/dev/null; then
      sed -i "s|^${_VAR}=.*|${_VAR}=${_ACTUAL}|" /var/www/.env
    else
      echo "${_VAR}=${_ACTUAL}" >> /var/www/.env
    fi
  fi
done

# MySQL の listen 待ち (DB_HOST / DB_PORT は環境変数から取得)
_DB_HOST="${DB_HOST:-db}"
_DB_PORT="${DB_PORT:-3306}"
echo "Waiting for MySQL (${_DB_HOST}:${_DB_PORT})..."
until nc -z "${_DB_HOST}" "${_DB_PORT}"; do
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

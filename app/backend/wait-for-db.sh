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
# 配信 (FrankenPHP) と artisan のコマンドが、同じ値を見るようにするため。
# SSO (OIDC_*・PUBLIC_BASE_URL) も同じ理由で書き写す
for _VAR in DB_HOST DB_PORT DB_DATABASE DB_USERNAME DB_PASSWORD APP_KEY APP_URL APP_ENV APP_DEBUG \
    OIDC_ISSUER OIDC_CLIENT_ID OIDC_CLIENT_SECRET PUBLIC_BASE_URL OIDC_REQUIRE_MFA OIDC_DISPLAY_NAME OIDC_SCOPE \
    OIDC_MOBILE_REDIRECT_PREFIXES OIDC_LINK_DENY_EMAIL_DOMAINS OIDC_ALLOW_PASSWORD_FOR_SSO_ONLY; do
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

# FrankenPHP で配信する（ワーカーではない通常のモード。リクエストごとに PHP を読み直す）。
# :8000 の HTTP だけを待ち受け、HTTPS の自動設定はしない（TLS は前段のプロキシが終端する）
exec frankenphp php-server --listen :8000 --root public/

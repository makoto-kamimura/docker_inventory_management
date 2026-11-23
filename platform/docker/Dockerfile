# Laravel API — デモ環境用 PHP イメージ
#
# docker-compose.demo.yml から参照される。
# アプリのソースコードは compose 側の volumes で bind mount するため、
# このイメージは PHP の実行環境（FrankenPHP）と Composer だけを提供する。
# 配信は wait-for-db.sh の最後で FrankenPHP（php-server）を起動して行う。
#
# ビルドコンテキスト: platform/docker/
FROM dunglas/frankenphp:1.14.0-php8.4.28-alpine

# PHP 拡張（mbstring・xml は土台のイメージに入っている）
RUN apk add --no-cache \
        git \
        unzip \
        netcat-openbsd \
    && install-php-extensions \
        pdo_mysql \
        bcmath

# Composer
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www

# 土台のイメージの healthcheck は管理用の口（:2019）を見るが、php-server では無効なので、アプリの /up を見る
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/up || exit 1

# Laravel API — デモ環境用 PHP イメージ
#
# docker-compose.demo.yml から参照される。
# アプリのソースコードは compose 側の volumes で bind mount するため、
# このイメージは PHP 実行環境と Composer のみを提供する。
#
# ビルドコンテキスト: platform/docker/
FROM php:8.2-cli-alpine

# PHP 拡張に必要なシステムパッケージ
RUN apk add --no-cache \
        git \
        unzip \
        oniguruma-dev \
        libxml2-dev \
        netcat-openbsd \
    && docker-php-ext-install \
        pdo_mysql \
        mbstring \
        xml \
        bcmath

# Composer
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /var/www

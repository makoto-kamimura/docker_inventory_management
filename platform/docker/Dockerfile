FROM php:8.2-fpm

# 必要なパッケージ & PHP拡張
RUN apt-get update && apt-get install -y \
    git zip unzip libpq-dev libonig-dev libxml2-dev \
    netcat-openbsd \
    && docker-php-ext-install pdo pdo_mysql mbstring xml

# Composer install
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

# 作業ディレクトリ
WORKDIR /var/www

# パーミッション設定
RUN chown -R www-data:www-data /var/www \
    && chmod -R 755 /var/www
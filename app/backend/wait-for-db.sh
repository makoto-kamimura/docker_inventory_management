#!/bin/sh

echo "Waiting for MySQL to be ready..."

# MySQL が接続可能になるまで待機
until nc -z db 3306; do
  echo "Waiting for MySQL..."
  sleep 2
done

echo "MySQL is ready! Running migrations..."

# マイグレーション & シード
php artisan migrate:fresh --seed

# Laravel 開発サーバー起動
php artisan serve --host=0.0.0.0 --port=8000
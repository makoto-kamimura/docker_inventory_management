# Caddy リバースプロキシ — production
# ビルドコンテキストはリポジトリルート (docker-compose.prod.yml で build.context: ..)
FROM caddy:2-alpine

# Caddyfile を焼き込む
COPY platform/proxy/Caddyfile /etc/caddy/Caddyfile

# Laravel public/ (favicon, robots.txt, index.php の存在確認用) を焼き込む。
# index.php 自体は PHP-FPM 側で実行される (Caddy は SCRIPT_FILENAME を渡すだけ) が、
# Caddy が静的ファイル分岐するために public/ ツリーがローカルに必要。
COPY app/backend/public/ /var/www/public/

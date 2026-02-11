#!/bin/bash
# Cloudflare Origin Certificate — настройка SSL для avgust.prygunov.com

set -e

if [ ! -f /etc/ssl/cloudflare/origin.crt ] || [ ! -f /etc/ssl/cloudflare/origin.key ]; then
    echo "Ошибка: Создайте /etc/ssl/cloudflare/origin.crt и origin.key"
    exit 1
fi

chmod 600 /etc/ssl/cloudflare/origin.key
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "$SCRIPT_DIR/nginx_cloudflare_ssl.conf" /etc/nginx/sites-available/finans_assistant
ln -sf /etc/nginx/sites-available/finans_assistant /etc/nginx/sites-enabled/finans_assistant
nginx -t
systemctl reload nginx
echo "SSL настроен. Проверьте: https://avgust.prygunov.com"

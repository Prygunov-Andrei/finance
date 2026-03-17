#!/usr/bin/env bash
set -euo pipefail

# Однократная начальная настройка сервера для HVAC News
# Запускать с локальной машины, пример:
#   SSH_USER=root SSH_HOST=72.56.80.247 bash deploy/server-setup.sh

SSH_USER="${SSH_USER:-root}"
SSH_HOST="${SSH_HOST:-72.56.80.247}"
REMOTE="${SSH_USER}@${SSH_HOST}"

echo "==> Сервер: ${REMOTE}"

# Базовые команды SSH/SCP, с поддержкой sshpass при наличии SSHPASS
if [[ -n "${SSHPASS:-}" ]]; then
  SSH_CMD=(sshpass -p "${SSHPASS}" ssh -o StrictHostKeyChecking=accept-new)
  SCP_CMD=(sshpass -p "${SSHPASS}" scp)
else
  SSH_CMD=(ssh -o StrictHostKeyChecking=accept-new)
  SCP_CMD=(scp)
fi

remote_run() {
  "${SSH_CMD[@]}" "$REMOTE" "$@"
}

echo "==> Обновление пакетов и установка зависимостей"
remote_run "apt-get update -y && apt-get upgrade -y"
remote_run "DEBIAN_FRONTEND=noninteractive apt-get install -y nginx postgresql postgresql-contrib python3-venv python3-pip certbot python3-certbot-nginx ufw"

echo '==> Настройка swap (1G, если нет)'
remote_run "if ! swapon --show | grep -q swapfile; then \
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && \
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab; \
fi"

echo "==> Настройка PostgreSQL (роль и база hvac_db)"
remote_run "sudo -u postgres psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname = 'hvac_user'\" | grep -q 1 || sudo -u postgres psql -c \"CREATE ROLE hvac_user LOGIN PASSWORD 'CHANGE_ME_DB_PASSWORD';\""
remote_run "sudo -u postgres psql -tAc \"SELECT 1 FROM pg_database WHERE datname = 'hvac_db'\" | grep -q 1 || sudo -u postgres createdb -O hvac_user hvac_db"

echo "==> Создание структуры /var/www/hvac-news"
remote_run "mkdir -p /var/www/hvac-news/backend /var/www/hvac-news/frontend/build /var/www/hvac-news/backups"
remote_run "chown -R www-data:www-data /var/www/hvac-news && chmod -R 755 /var/www/hvac-news"

echo "==> Развёртывание конфига Nginx"
"${SCP_CMD[@]}" deploy/nginx.conf "$REMOTE:/etc/nginx/sites-available/hvac-news.conf"
remote_run "ln -sf /etc/nginx/sites-available/hvac-news.conf /etc/nginx/sites-enabled/hvac-news.conf && rm -f /etc/nginx/sites-enabled/default"

echo "==> Настройка UFW (22,80,443)"
remote_run "ufw allow OpenSSH || true; ufw allow 80/tcp; ufw allow 443/tcp; echo 'y' | ufw enable || true"

echo "==> Создание systemd сервиса Gunicorn"
"${SCP_CMD[@]}" deploy/gunicorn.service "$REMOTE:/etc/systemd/system/gunicorn.service"
remote_run "systemctl daemon-reload && systemctl enable gunicorn"

echo "==> Проверка конфигурации Nginx"
remote_run "nginx -t"

echo "==> Перезапуск Nginx"
remote_run "systemctl restart nginx"

echo "==> Настройка SSL через Certbot (можно выполнить вручную, если нужно)"
echo "    Пример команды на сервере:"
echo "      certbot --nginx -d hvac-news.online -d www.hvac-news.online -d hvac-info.com -d www.hvac-info.com"

echo "==> Базовая настройка сервера завершена."


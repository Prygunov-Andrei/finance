#!/usr/bin/env bash
set -euo pipefail

# Деплой HVAC News одной командой
# Запускать из корня проекта:
#   SSH_USER=root SSH_HOST=72.56.80.247 bash deploy/deploy.sh

SSH_USER="${SSH_USER:-root}"
SSH_HOST="${SSH_HOST:-72.56.80.247}"
REMOTE="${SSH_USER}@${SSH_HOST}"
REMOTE_DIR="/var/www/hvac-news"

echo "==> Деплой на ${REMOTE}"

# SSH/RSYNC с поддержкой sshpass через SSHPASS
if [[ -n "${SSHPASS:-}" ]]; then
  SSH_CMD=(sshpass -p "${SSHPASS}" ssh -o StrictHostKeyChecking=accept-new)
  RSYNC_CMD=(sshpass -p "${SSHPASS}" rsync)
else
  SSH_CMD=(ssh -o StrictHostKeyChecking=accept-new)
  RSYNC_CMD=(rsync)
fi

echo "==> Шаг 1: build фронтенда (локально)"
cd "$(dirname "${BASH_SOURCE[0]}")/.."
cd frontend
npm install
npm run build

cd ..

echo "==> Шаг 2: rsync кода на сервер"
# Backend
# ВАЖНО: rsync source = ./backend/, поэтому exclude должны быть относительно этой папки.
# Так мы гарантируем, что медиа/venv никогда не затрутся случайно (особенно если кто-то добавит --delete).
"${RSYNC_CMD[@]}" -avz \
  --exclude 'venv' \
  --exclude '__pycache__' \
  --exclude 'media' \
  --exclude 'staticfiles' \
  --exclude '.env' \
  --exclude '.DS_Store' \
  --exclude '.git' \
  ./backend/ "$REMOTE:${REMOTE_DIR}/backend/"

# Frontend build
"${RSYNC_CMD[@]}" -avz \
  ./frontend/build/ "$REMOTE:${REMOTE_DIR}/frontend/build/"

# Nginx config
"${RSYNC_CMD[@]}" -avz \
  ./deploy/nginx.conf "$REMOTE:/etc/nginx/sites-available/hvac-news.conf"

echo "==> Шаг 3: backend на сервере (venv, migrate, collectstatic)"
"${SSH_CMD[@]}" "$REMOTE" bash <<'EOF'
set -euo pipefail
REMOTE_DIR="/var/www/hvac-news"
cd "${REMOTE_DIR}/backend"

python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

HVAC_ENV=prod python manage.py migrate --noinput
HVAC_ENV=prod python manage.py collectstatic --noinput

systemctl restart gunicorn
nginx -t
systemctl reload nginx
EOF

echo "==> Деплой завершён."


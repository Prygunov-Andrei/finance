#!/bin/bash
# ISMeta production deploy script.
# Запускать на production сервере: cd /opt/finans_assistant/ismeta/deploy && ./deploy.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== ISMeta Deploy ==="
echo "Project: $PROJECT_DIR"
echo ""

# 1. Проверить .env.prod
if [ ! -f "$SCRIPT_DIR/.env.prod" ]; then
    echo "ERROR: $SCRIPT_DIR/.env.prod не найден."
    echo "Скопируйте .env.prod.example → .env.prod и заполните."
    exit 1
fi

# 2. Pull latest code
echo ">>> git pull..."
cd "$PROJECT_DIR/.."
git pull origin main

# 3. Build and restart
echo ">>> docker compose build..."
cd "$SCRIPT_DIR"
docker compose -f docker-compose.prod.yml --env-file .env.prod build

echo ">>> docker compose up..."
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# 4. Wait for healthy
echo ">>> Ожидание healthy..."
sleep 10

# 5. Migrations
echo ">>> Миграции..."
docker compose -f docker-compose.prod.yml --env-file .env.prod exec backend python manage.py migrate --no-input

# 6. Seed (только первый раз)
echo ">>> Seed dev data (идемпотентно)..."
docker compose -f docker-compose.prod.yml --env-file .env.prod exec backend python manage.py seed_dev_data

# 7. Collect static
echo ">>> Collect static..."
docker compose -f docker-compose.prod.yml --env-file .env.prod exec backend python manage.py collectstatic --no-input 2>/dev/null || true

# 8. Health check
echo ">>> Health check..."
sleep 3
HEALTH=$(curl -sf http://127.0.0.1:8002/health 2>/dev/null || echo "FAIL")
if [ "$HEALTH" = "FAIL" ]; then
    echo "WARNING: backend health check failed. Check logs:"
    echo "  docker compose -f docker-compose.prod.yml logs backend --tail 50"
else
    echo "Backend: OK"
fi

FRONTEND=$(curl -sf http://127.0.0.1:3002/ -o /dev/null -w "%{http_code}" 2>/dev/null || echo "000")
if [ "$FRONTEND" = "200" ] || [ "$FRONTEND" = "307" ]; then
    echo "Frontend: OK (HTTP $FRONTEND)"
else
    echo "WARNING: frontend returned HTTP $FRONTEND"
fi

echo ""
echo "=== ISMeta Deploy Complete ==="
echo "Backend:  http://127.0.0.1:8002"
echo "Frontend: http://127.0.0.1:3002"
echo ""
echo "Для внешнего доступа — настройте nginx reverse proxy."

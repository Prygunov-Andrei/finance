#!/bin/bash
# =============================================================================
# Локальная разработка: инфраструктура в Docker, приложения — нативно
# Запуск: ./dev-local.sh
# Остановка: Ctrl+C (или ./dev-stop.sh из другого терминала)
# =============================================================================

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PIDFILE="$ROOT_DIR/.dev-pids"
VENV_DIR="$ROOT_DIR/backend/.venv"
PYTHON="$VENV_DIR/bin/python"
CELERY="$VENV_DIR/bin/celery"

# Цвета
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

cleanup() {
    echo ""
    echo -e "${YELLOW}Останавливаю приложения...${NC}"

    if [ -f "$PIDFILE" ]; then
        while read -r pid; do
            if kill -0 "$pid" 2>/dev/null; then
                kill "$pid" 2>/dev/null || true
            fi
        done < "$PIDFILE"
        rm -f "$PIDFILE"
    fi

    # Немного подождать завершения процессов
    sleep 1

    echo -e "${YELLOW}Останавливаю Docker инфраструктуру...${NC}"
    docker compose -f "$ROOT_DIR/docker-compose.dev.yml" down

    echo -e "${GREEN}Всё остановлено.${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Проверить venv
if [ ! -f "$PYTHON" ]; then
    echo -e "${RED}Python venv не найден: $VENV_DIR${NC}"
    echo "Создайте: python3.12 -m venv backend/.venv && source backend/.venv/bin/activate && pip install -r backend/requirements.txt"
    exit 1
fi

# Очистить старый pidfile
rm -f "$PIDFILE"

# =========================================================================
# 1. Поднять инфраструктуру
# =========================================================================
echo -e "${GREEN}[1/5] Поднимаю Docker инфраструктуру (PostgreSQL, Redis, MinIO)...${NC}"
docker compose -f "$ROOT_DIR/docker-compose.dev.yml" up -d

# =========================================================================
# 2. Подождать готовности сервисов
# =========================================================================
echo -e "${GREEN}[2/5] Жду готовности сервисов...${NC}"

echo -n "  PostgreSQL..."
until docker compose -f "$ROOT_DIR/docker-compose.dev.yml" exec -T postgres pg_isready -U postgres > /dev/null 2>&1; do
    echo -n "."
    sleep 1
done
echo " OK"

echo -n "  Redis..."
until docker compose -f "$ROOT_DIR/docker-compose.dev.yml" exec -T redis redis-cli ping > /dev/null 2>&1; do
    echo -n "."
    sleep 1
done
echo " OK"

echo -n "  MinIO..."
until curl -sf http://localhost:9000/minio/health/live > /dev/null 2>&1; do
    echo -n "."
    sleep 1
done
echo " OK"

# =========================================================================
# 2.5. Загрузить переменные из .env (kanban_service не использует dotenv)
# =========================================================================
set -a
source "$ROOT_DIR/backend/.env"
set +a

# =========================================================================
# 3. Миграции
# =========================================================================
echo -e "${GREEN}[3/5] Применяю миграции...${NC}"
cd "$ROOT_DIR/backend"

echo "  ERP (finans_assistant)..."
$PYTHON manage.py migrate --no-input

echo "  Kanban..."
DJANGO_SETTINGS_MODULE=kanban_service.settings $PYTHON manage.py migrate --no-input

cd "$ROOT_DIR"

# =========================================================================
# 4. Запуск приложений
# =========================================================================
echo -e "${GREEN}[4/5] Запускаю приложения...${NC}"

# Django ERP (порт 8000)
cd "$ROOT_DIR/backend"
$PYTHON manage.py runserver 0.0.0.0:8000 &
echo $! >> "$PIDFILE"
echo "  Django ERP         → PID $!"

# Kanban API (порт 8010)
DJANGO_SETTINGS_MODULE=kanban_service.settings $PYTHON manage.py runserver 0.0.0.0:8010 &
echo $! >> "$PIDFILE"
echo "  Kanban API         → PID $!"

# Celery ERP worker
# macOS: --pool=solo чтобы избежать SIGSEGV при fork() (ObjC runtime)
CELERY_POOL="prefork"
if [ "$(uname)" = "Darwin" ]; then
    CELERY_POOL="solo"
fi
$CELERY -A finans_assistant worker --pool=$CELERY_POOL --concurrency=1 -l info &
echo $! >> "$PIDFILE"
echo "  Celery ERP worker  → PID $! (pool=$CELERY_POOL)"

# Celery Kanban worker
$CELERY -A kanban_service worker --pool=$CELERY_POOL --concurrency=1 -l info &
echo $! >> "$PIDFILE"
echo "  Celery Kanban worker → PID $! (pool=$CELERY_POOL)"

# Vite dev server (порт 3000)
cd "$ROOT_DIR/frontend"
npm run dev &
echo $! >> "$PIDFILE"
echo "  Vite frontend      → PID $!"

cd "$ROOT_DIR"

# =========================================================================
# 5. Готово
# =========================================================================
echo ""
echo -e "${GREEN}[5/5] Локальная разработка запущена!${NC}"
echo ""
echo "  Frontend (Vite HMR):  http://localhost:3000"
echo "  ERP API:              http://localhost:8000/api/v1/"
echo "  Kanban API:           http://localhost:8010/kanban-api/v1/"
echo "  MinIO Console:        http://localhost:9001"
echo ""
echo -e "${YELLOW}Ctrl+C для остановки всех сервисов${NC}"
echo ""

# Ждём завершения (Ctrl+C вызовет cleanup через trap)
wait

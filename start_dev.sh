#!/bin/bash

# ============================================
# Скрипт запуска проекта Finans Assistant
# для локальной разработки
# ============================================

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}   Finans Assistant - Локальная разработка${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Проверка PostgreSQL
check_postgres() {
    echo -e "${YELLOW}Проверка PostgreSQL...${NC}"
    if pg_isready -q 2>/dev/null; then
        echo -e "${GREEN}✓ PostgreSQL запущен${NC}"
        return 0
    else
        echo -e "${RED}✗ PostgreSQL не запущен${NC}"
        echo -e "${YELLOW}  Попробуйте: brew services start postgresql${NC}"
        return 1
    fi
}

# Проверка виртуального окружения Python
check_venv() {
    if [ -d "$BACKEND_DIR/venv" ]; then
        echo -e "${GREEN}✓ Виртуальное окружение найдено${NC}"
        return 0
    else
        echo -e "${YELLOW}! Виртуальное окружение не найдено${NC}"
        echo -e "${YELLOW}  Создаём...${NC}"
        cd "$BACKEND_DIR"
        python3 -m venv venv
        source venv/bin/activate
        pip install -r requirements.txt
        echo -e "${GREEN}✓ Виртуальное окружение создано${NC}"
        return 0
    fi
}

# Проверка node_modules
check_node_modules() {
    if [ -d "$FRONTEND_DIR/node_modules" ]; then
        echo -e "${GREEN}✓ node_modules найдены${NC}"
        return 0
    else
        echo -e "${YELLOW}! node_modules не найдены${NC}"
        echo -e "${YELLOW}  Устанавливаем зависимости...${NC}"
        cd "$FRONTEND_DIR"
        npm install
        echo -e "${GREEN}✓ Зависимости установлены${NC}"
        return 0
    fi
}

# Запуск бекенда
start_backend() {
    echo ""
    echo -e "${BLUE}Запуск Backend (Django)...${NC}"
    cd "$BACKEND_DIR"
    source venv/bin/activate
    
    # Применяем миграции если нужно
    echo -e "${YELLOW}Проверка миграций...${NC}"
    python manage.py migrate --check 2>/dev/null || {
        echo -e "${YELLOW}Применяем миграции...${NC}"
        python manage.py migrate
    }
    
    echo -e "${GREEN}✓ Backend запускается на http://localhost:8000${NC}"
    python manage.py runserver &
    BACKEND_PID=$!
    echo "  PID: $BACKEND_PID"
}

# Запуск фронтенда
start_frontend() {
    echo ""
    echo -e "${BLUE}Запуск Frontend (Vite + React)...${NC}"
    cd "$FRONTEND_DIR"
    echo -e "${GREEN}✓ Frontend запускается на http://localhost:3000${NC}"
    npm run dev &
    FRONTEND_PID=$!
    echo "  PID: $FRONTEND_PID"
}

# Функция остановки при Ctrl+C
cleanup() {
    echo ""
    echo -e "${YELLOW}Остановка серверов...${NC}"
    
    if [ -n "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null && echo -e "${GREEN}✓ Backend остановлен${NC}"
    fi
    
    if [ -n "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null && echo -e "${GREEN}✓ Frontend остановлен${NC}"
    fi
    
    # Убиваем все процессы на портах
    lsof -ti:8000 | xargs kill -9 2>/dev/null
    lsof -ti:3000 | xargs kill -9 2>/dev/null
    
    echo -e "${GREEN}Готово!${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Главная функция
main() {
    # Проверки
    check_postgres || exit 1
    check_venv
    check_node_modules
    
    # Запуск
    start_backend
    sleep 2  # Даём бекенду время на старт
    start_frontend
    
    echo ""
    echo -e "${GREEN}================================================${NC}"
    echo -e "${GREEN}   Проект запущен!${NC}"
    echo -e "${GREEN}================================================${NC}"
    echo ""
    echo -e "   ${BLUE}Backend:${NC}  http://localhost:8000"
    echo -e "   ${BLUE}Frontend:${NC} http://localhost:3000"
    echo -e "   ${BLUE}API Docs:${NC} http://localhost:8000/api/schema/swagger-ui/"
    echo ""
    echo -e "   ${YELLOW}Нажмите Ctrl+C для остановки${NC}"
    echo ""
    
    # Ждём завершения
    wait
}

# Обработка аргументов
case "${1:-}" in
    backend)
        check_postgres || exit 1
        check_venv
        cd "$BACKEND_DIR"
        source venv/bin/activate
        python manage.py runserver
        ;;
    frontend)
        check_node_modules
        cd "$FRONTEND_DIR"
        npm run dev
        ;;
    migrate)
        check_venv
        cd "$BACKEND_DIR"
        source venv/bin/activate
        python manage.py migrate
        ;;
    shell)
        check_venv
        cd "$BACKEND_DIR"
        source venv/bin/activate
        python manage.py shell
        ;;
    *)
        main
        ;;
esac

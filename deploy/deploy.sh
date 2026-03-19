#!/bin/bash
set -e

echo "=========================================="
echo "Full Deployment Script"
echo "=========================================="
echo ""

# Проверка что мы на сервере
if [ ! -d "/opt/finans_assistant" ]; then
    echo "Error: /opt/finans_assistant does not exist!"
    echo "Please run this script on the production server."
    exit 1
fi

cd /opt/finans_assistant

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}[1/9] Pulling latest code from GitHub...${NC}"
git pull origin main

# Проверка BANK_ENCRYPTION_KEY для банковского модуля
if ! grep -q 'BANK_ENCRYPTION_KEY=.' .env 2>/dev/null; then
    echo -e "${YELLOW}Внимание: BANK_ENCRYPTION_KEY не задан в .env. Добавьте его для работы банковского модуля.${NC}"
    echo "Сгенерировать: python3 -c \"from cryptography.fernet import Fernet; print('BANK_ENCRYPTION_KEY=' + Fernet.generate_key().decode())\""
fi

echo -e "${GREEN}[2/9] Backing up database before deploy...${NC}"
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U "${DB_USER:-finans_user}" "${DB_NAME:-finans_assistant_prod}" > "/opt/backups/finans_assistant/pre_deploy_$(date +%Y%m%d_%H%M%S).sql" 2>/dev/null || echo -e "${YELLOW}Warning: Backup failed (DB may not be running yet)${NC}"

echo -e "${GREEN}[3/9] Stopping existing containers...${NC}"
docker compose -f docker-compose.prod.yml down

echo -e "${GREEN}[4/9] Building Docker images...${NC}"
docker compose -f docker-compose.prod.yml build --no-cache

echo -e "${GREEN}[5/9] Starting containers...${NC}"
docker compose -f docker-compose.prod.yml up -d

echo -e "${GREEN}[6/9] Waiting for services to be healthy...${NC}"
sleep 30

echo -e "${GREEN}[7/9] Running database migrations...${NC}"
docker compose -f docker-compose.prod.yml exec -T backend python manage.py migrate --noinput

echo -e "${GREEN}[7.1/9] Настройка LLM-провайдеров...${NC}"
docker compose -f docker-compose.prod.yml exec -T backend python manage.py setup_providers

echo -e "${GREEN}[7.2/9] Collecting static files...${NC}"
docker compose -f docker-compose.prod.yml exec -T backend python manage.py collectstatic --noinput

echo -e "${GREEN}[8/9] Checking service status...${NC}"
docker compose -f docker-compose.prod.yml ps

echo -e "${GREEN}[9/9] Testing backend health...${NC}"
sleep 5
curl -sf http://localhost:8000/api/schema/ >/dev/null 2>&1 && echo -e "${GREEN}Backend OK${NC}" || echo -e "${YELLOW}Warning: Backend health check failed${NC}"
curl -sf http://localhost:3000/ >/dev/null 2>&1 && echo -e "${GREEN}Frontend OK${NC}" || echo -e "${YELLOW}Warning: Frontend health check failed${NC}"

echo ""
echo -e "${GREEN}Deployment completed!${NC}"
echo ""
echo "Services status:"
docker compose -f docker-compose.prod.yml ps
echo ""
echo "To view logs: docker compose -f docker-compose.prod.yml logs -f [service]"
echo "To restart: docker compose -f docker-compose.prod.yml restart [service]"
echo ""

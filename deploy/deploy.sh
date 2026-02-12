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
NC='\033[0m'

echo -e "${GREEN}[1/10] Pulling latest code from GitHub...${NC}"
git pull origin main

# Проверка BANK_ENCRYPTION_KEY для банковского модуля
if ! grep -q 'BANK_ENCRYPTION_KEY=.' .env 2>/dev/null; then
    echo -e "${YELLOW}Внимание: BANK_ENCRYPTION_KEY не задан в .env. Добавьте его для работы банковского модуля.${NC}"
    echo "Сгенерировать: python3 -c \"from cryptography.fernet import Fernet; print('BANK_ENCRYPTION_KEY=' + Fernet.generate_key().decode())\""
fi

echo -e "${GREEN}[2/10] Stopping existing containers...${NC}"
docker compose -f docker-compose.prod.yml down

echo -e "${GREEN}[3/10] Building Docker images...${NC}"
docker compose -f docker-compose.prod.yml build --no-cache

echo -e "${GREEN}[4/10] Starting containers...${NC}"
docker compose -f docker-compose.prod.yml up -d

echo -e "${GREEN}[5/10] Waiting for services to be healthy...${NC}"
sleep 30

echo -e "${GREEN}[6/10] Running database migrations...${NC}"
docker compose -f docker-compose.prod.yml exec -T backend python manage.py migrate --noinput

echo -e "${GREEN}[7/10] Collecting static files...${NC}"
docker compose -f docker-compose.prod.yml exec -T backend python manage.py collectstatic --noinput

echo -e "${GREEN}[8/10] Checking service status...${NC}"
docker compose -f docker-compose.prod.yml ps

echo -e "${GREEN}[9/10] Testing backend health...${NC}"
sleep 5
curl -f http://localhost:8000/api/v1/ || echo -e "${YELLOW}Warning: Backend health check failed${NC}"

echo -e "${GREEN}[10/10] Deployment completed!${NC}"
echo ""
echo "Services status:"
docker compose -f docker-compose.prod.yml ps
echo ""
echo "To view logs: docker compose -f docker-compose.prod.yml logs -f [service]"
echo "To restart: docker compose -f docker-compose.prod.yml restart [service]"
echo ""

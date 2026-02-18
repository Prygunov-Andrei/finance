#!/bin/bash
set -e

echo "=========================================="
echo "Finans Assistant - Master Setup Script"
echo "=========================================="
echo ""
echo "This script will guide you through the complete"
echo "production deployment of Finans Assistant."
echo ""

# Цвета
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Проверка что скрипт запущен с правами root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Error: Please run as root (use sudo)${NC}"
    exit 1
fi

echo -e "${YELLOW}Current server information:${NC}"
SERVER_IP="$(curl -fsSL https://api.ipify.org 2>/dev/null || true)"
if [ -z "$SERVER_IP" ]; then
    SERVER_IP="SERVER_IP"
fi
echo "  IP: ${SERVER_IP}"
echo "  OS: $(lsb_release -d | cut -f2)"
echo "  User: $(whoami)"
echo ""

read -p "Continue with installation? (y/n): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Installation cancelled."
    exit 1
fi

echo ""
echo "=========================================="
echo "STEP 1: Server Preparation"
echo "=========================================="
./server_prep.sh

echo ""
echo "=========================================="
echo "STEP 2: Clone Repository"
echo "=========================================="
if [ ! -d "/opt/finans_assistant/.git" ]; then
    cd /opt
    git clone https://github.com/Prygunov-Andrei/finance.git finans_assistant
    echo -e "${GREEN}Repository cloned successfully${NC}"
else
    echo -e "${YELLOW}Repository already exists, pulling latest changes...${NC}"
    cd /opt/finans_assistant
    git pull origin main
fi

cd /opt/finans_assistant

echo ""
echo "=========================================="
echo "STEP 3: Generate Production .env"
echo "=========================================="
./deploy/create_production_env.sh

echo ""
echo "=========================================="
echo "STEP 4: Install Nginx"
echo "=========================================="
./deploy/install_nginx.sh

echo ""
echo "=========================================="
echo "STEP 5: Build and Start Docker Containers"
echo "=========================================="
echo "Building Docker images (this may take 5-10 minutes)..."
docker compose -f docker-compose.prod.yml build --no-cache

echo "Starting containers..."
docker compose -f docker-compose.prod.yml up -d

echo "Waiting for services to be healthy (30 seconds)..."
sleep 30

echo ""
echo "=========================================="
echo "STEP 6: Database Migrations"
echo "=========================================="
docker compose -f docker-compose.prod.yml exec -T backend python manage.py migrate --noinput
docker compose -f docker-compose.prod.yml exec -T kanban-api python manage_kanban.py migrate --noinput
docker compose -f docker-compose.prod.yml exec -T backend python manage.py collectstatic --noinput

echo ""
echo "=========================================="
echo "STEP 7: Create Django Superuser"
echo "=========================================="
echo "Please create an admin user for Django:"
docker compose -f docker-compose.prod.yml exec backend python manage.py createsuperuser

echo ""
echo "=========================================="
echo "STEP 8: Setup Cron Jobs for Backups"
echo "=========================================="
(crontab -l 2>/dev/null; cat ./deploy/crontab.example) | crontab -
echo -e "${GREEN}Cron jobs installed${NC}"

echo ""
echo "=========================================="
echo "INSTALLATION COMPLETED!"
echo "=========================================="
echo ""
echo -e "${GREEN}✓ Server prepared${NC}"
echo -e "${GREEN}✓ Repository cloned${NC}"
echo -e "${GREEN}✓ Production .env created${NC}"
echo -e "${GREEN}✓ Nginx installed${NC}"
echo -e "${GREEN}✓ Docker containers running${NC}"
echo -e "${GREEN}✓ Database migrated${NC}"
echo -e "${GREEN}✓ Backup cron jobs configured${NC}"
echo ""
echo -e "${YELLOW}=== NEXT STEPS ===${NC}"
echo ""
echo "1. Configure DNS:"
echo "   - Point your domain to SERVER_IP"
echo "   - Or use Cloudflare DNS proxy"
echo ""
echo "2. Setup SSL Certificate:"
echo "   - Option A: Let's Encrypt"
echo "     apt install certbot python3-certbot-nginx"
echo "     certbot --nginx -d your-domain.com"
echo ""
echo "   - Option B: Cloudflare Origin Certificate"
echo "     Download from Cloudflare Dashboard"
echo "     Place in /etc/ssl/cloudflare/"
echo ""
echo "3. Setup Telegram Webhook:"
echo "   ./deploy/setup_webhook.sh"
echo ""
echo "4. Update BotFather:"
echo "   - Open @BotFather in Telegram"
echo "   - /myapps → @avgust_worklog_bot"
echo "   - Change Web App URL to: https://your-domain.com/miniapp/"
echo ""
echo "5. Test deployment:"
echo "   curl https://your-domain.com/health"
echo "   curl https://your-domain.com/api/v1/"
echo ""
echo "=== USEFUL COMMANDS ===${NC}"
echo "  View logs: docker compose -f docker-compose.prod.yml logs -f [service]"
echo "  Restart: docker compose -f docker-compose.prod.yml restart [service]"
echo "  Backup: /opt/finans_assistant/deploy/backup.sh"
echo "  Deploy updates: /opt/finans_assistant/deploy/deploy.sh"
echo ""
echo "Documentation: /opt/finans_assistant/docs/work_logging/DEPLOYMENT.md"
echo ""

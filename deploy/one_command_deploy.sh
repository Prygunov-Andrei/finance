#!/bin/bash
# ==============================================================================
# ONE-COMMAND DEPLOYMENT SCRIPT
# ==============================================================================
# Этот скрипт нужно выполнить НА production сервере
# 
# Использование:
#   1. SSH на сервер: ssh root@72.56.83.95
#   2. Скопировать этот скрипт или выполнить команду ниже:
#
# curl -sSL https://raw.githubusercontent.com/Prygunov-Andrei/finance/main/deploy/one_command_deploy.sh | bash
#
# ==============================================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "=============================================="
echo "  Finans Assistant - Production Deployment"
echo "=============================================="
echo -e "${NC}"

# Проверка root прав
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Error: Please run as root${NC}"
    exit 1
fi

echo -e "${GREEN}[1/12] Updating system packages...${NC}"
apt update -qq && apt upgrade -y -qq

echo -e "${GREEN}[2/12] Installing Docker Engine...${NC}"
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    systemctl enable docker
    systemctl start docker
    echo "✓ Docker installed"
else
    echo "✓ Docker already installed"
fi

echo -e "${GREEN}[3/12] Installing Docker Compose plugin...${NC}"
if ! docker compose version &> /dev/null; then
    apt install -y docker-compose-plugin
    echo "✓ Docker Compose installed"
else
    echo "✓ Docker Compose already installed"
fi

echo -e "${GREEN}[4/12] Configuring firewall...${NC}"
if ! command -v ufw &> /dev/null; then
    apt install -y ufw
fi
ufw --force enable
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
echo "✓ Firewall configured (ports 22, 80, 443 open)"

echo -e "${GREEN}[5/12] Checking swap...${NC}"
SWAP_SIZE=$(free -m | grep Swap | awk '{print $2}')
if [ "$SWAP_SIZE" -lt 1024 ]; then
    echo "Creating 2GB swap file..."
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    echo "✓ Swap created (2GB)"
else
    echo "✓ Swap already configured (${SWAP_SIZE}MB)"
fi

echo -e "${GREEN}[6/12] Cloning repository...${NC}"
mkdir -p /opt
if [ ! -d "/opt/finans_assistant/.git" ]; then
    cd /opt
    git clone https://github.com/Prygunov-Andrei/finance.git finans_assistant
    echo "✓ Repository cloned"
else
    echo "✓ Repository exists, pulling latest..."
    cd /opt/finans_assistant
    git pull origin main
fi

cd /opt/finans_assistant

echo -e "${GREEN}[7/12] Generating production .env file...${NC}"
# Генерация безопасных паролей
DB_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
MINIO_USER="minio_$(openssl rand -base64 12 | tr -d "=+/" | cut -c1-12)"
MINIO_PASSWORD=$(openssl rand -base64 32 | tr -d "=+/" | cut -c1-25)
DJANGO_SECRET=$(python3 -c "import secrets; print(''.join(secrets.choice('abcdefghijklmnopqrstuvwxyz0123456789!@#\$%^&*(-_=+)') for i in range(50)))" 2>/dev/null || openssl rand -base64 50)
BANK_ENCRYPTION_KEY=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())" 2>/dev/null || openssl rand -base64 32)

# Определение домена (пока работаем по IP)
DOMAIN="72.56.83.95"
WEBHOOK_URL="http://${DOMAIN}/bot/webhook"
MINIAPP_URL="http://${DOMAIN}/miniapp/"
PUBLIC_URL="http://${DOMAIN}"

cat > .env << EOF
# =============================================================================
# PRODUCTION Environment Variables
# Generated: $(date)
# =============================================================================

# --- PostgreSQL ---
DB_NAME=finans_assistant_prod
DB_USER=finans_user
DB_PASSWORD=${DB_PASSWORD}

# --- MinIO ---
MINIO_ROOT_USER=${MINIO_USER}
MINIO_ROOT_PASSWORD=${MINIO_PASSWORD}

# --- Django ---
DEBUG=False
SECRET_KEY=${DJANGO_SECRET}
BANK_ENCRYPTION_KEY=${BANK_ENCRYPTION_KEY}

# --- Supply / LLM (заполните после деплоя) ---
BITRIX_WEBHOOK_TIMEOUT=30
OPENAI_API_KEY=
GEMINI_API_KEY=

# --- Telegram Bot ---
TELEGRAM_BOT_TOKEN=8462412197:AAGyBinH5uYv1vTaum-4ry34gGCsGKLazaU
BOT_WEBHOOK_URL=${WEBHOOK_URL}
MINI_APP_URL=${MINIAPP_URL}

# --- ElevenLabs ---
ELEVENLABS_API_KEY=sk_b7d766e2ff68578bd4af7670534f429991bf3838ee9425e4

# --- Sentry ---
SENTRY_DSN=https://637ea7a0734e1fedf97c76c688ecd65c@o4510856303673344.ingest.de.sentry.io/4510856306491472
SENTRY_ENVIRONMENT=production

# --- Public URLs ---
PUBLIC_BACKEND_URL=${PUBLIC_URL}
PRODUCTION_DOMAIN=${DOMAIN}
EOF

echo "✓ Production .env created"
echo ""
echo -e "${YELLOW}Generated credentials (SAVE THESE!):${NC}"
echo "  PostgreSQL password: ${DB_PASSWORD}"
echo "  MinIO user: ${MINIO_USER}"
echo "  MinIO password: ${MINIO_PASSWORD}"
echo ""

echo -e "${GREEN}[8/12] Installing nginx...${NC}"
apt install -y nginx
cp deploy/nginx_finans_assistant.conf /etc/nginx/sites-available/finans_assistant
ln -sf /etc/nginx/sites-available/finans_assistant /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
echo "✓ Nginx configured"

echo -e "${GREEN}[9/12] Building Docker images (this may take 5-10 minutes)...${NC}"
docker compose -f docker-compose.prod.yml build --no-cache

echo -e "${GREEN}[10/12] Starting containers...${NC}"
docker compose -f docker-compose.prod.yml up -d

echo -e "${GREEN}[11/12] Waiting for services to be healthy...${NC}"
sleep 30

echo -e "${GREEN}[12/12] Running database migrations...${NC}"
docker compose -f docker-compose.prod.yml exec -T backend python manage.py migrate --noinput
docker compose -f docker-compose.prod.yml exec -T backend python manage.py collectstatic --noinput

echo ""
echo -e "${BLUE}=============================================="
echo "  Deployment completed!"
echo "==============================================${NC}"
echo ""
echo "Services status:"
docker compose -f docker-compose.prod.yml ps
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Create Django superuser:"
echo "   docker compose -f docker-compose.prod.yml exec backend python manage.py createsuperuser"
echo ""
echo "2. Start nginx:"
echo "   systemctl start nginx"
echo "   systemctl enable nginx"
echo ""
echo "3. Configure domain (optional):"
echo "   - Setup DNS A-record: your-domain.com -> 72.56.83.95"
echo "   - Install SSL: apt install certbot python3-certbot-nginx"
echo "   - Run: certbot --nginx -d your-domain.com"
echo ""
echo "4. Setup Telegram webhook (after domain is ready):"
echo "   ./deploy/setup_webhook.sh"
echo ""
echo "5. Configure Bitrix24 integration (if using Supply module):"
echo "   - Add LLM API key to .env: OPENAI_API_KEY=sk-... or GEMINI_API_KEY=..."
echo "   - Restart: docker compose -f docker-compose.prod.yml restart backend celery-worker"
echo "   - Follow: docs/supply/BITRIX_SETUP.md"
echo ""
echo "6. Test deployment:"
echo "   curl http://localhost:8000/api/v1/"
echo "   curl http://localhost:3000/"
echo ""
echo -e "${GREEN}Logs: docker compose -f docker-compose.prod.yml logs -f [service]${NC}"
echo ""

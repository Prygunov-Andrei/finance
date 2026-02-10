#!/bin/bash
set -e

echo "=========================================="
echo "Server Preparation Script"
echo "=========================================="
echo ""

# Цвета для вывода
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}[1/7] Updating system packages...${NC}"
apt update && apt upgrade -y

echo -e "${GREEN}[2/7] Installing Docker Engine...${NC}"
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    systemctl enable docker
    systemctl start docker
    echo "Docker installed successfully"
else
    echo "Docker already installed"
fi

echo -e "${GREEN}[3/7] Installing Docker Compose plugin...${NC}"
if ! docker compose version &> /dev/null; then
    apt install -y docker-compose-plugin
    echo "Docker Compose installed successfully"
else
    echo "Docker Compose already installed"
fi

echo -e "${GREEN}[4/7] Configuring firewall (UFW)...${NC}"
if ! command -v ufw &> /dev/null; then
    apt install -y ufw
fi

# Разрешить SSH перед включением firewall
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp

# Включить firewall (если еще не включен)
echo "y" | ufw enable

echo -e "${GREEN}[5/7] Checking swap...${NC}"
SWAP_SIZE=$(free -m | grep Swap | awk '{print $2}')
if [ "$SWAP_SIZE" -lt 1024 ]; then
    echo -e "${YELLOW}Creating 2GB swap file...${NC}"
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    echo "Swap created successfully"
else
    echo "Swap already configured (${SWAP_SIZE}MB)"
fi

echo -e "${GREEN}[6/7] Installing additional tools...${NC}"
apt install -y git curl nano htop

echo -e "${GREEN}[7/7] Creating deployment directory...${NC}"
mkdir -p /opt/finans_assistant

echo ""
echo -e "${GREEN}=========================================="
echo "Server preparation completed!"
echo "==========================================${NC}"
echo ""
echo "Next steps:"
echo "1. Clone repository to /opt/finans_assistant"
echo "2. Create production .env file"
echo "3. Run docker compose up -d"
echo ""

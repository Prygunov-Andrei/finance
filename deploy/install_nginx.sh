#!/bin/bash
set -e

echo "=========================================="
echo "Nginx Installation and Configuration"
echo "=========================================="
echo ""

GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${GREEN}[1/4] Installing nginx...${NC}"
apt update
apt install -y nginx

echo -e "${GREEN}[2/4] Copying nginx configuration...${NC}"
cp /opt/finans_assistant/deploy/nginx_finans_assistant.conf \
    /etc/nginx/sites-available/finans_assistant

echo -e "${GREEN}[3/4] Enabling site...${NC}"
ln -sf /etc/nginx/sites-available/finans_assistant \
    /etc/nginx/sites-enabled/finans_assistant

# Remove default site
rm -f /etc/nginx/sites-enabled/default

echo -e "${GREEN}[4/4] Testing nginx configuration...${NC}"
nginx -t

echo ""
echo "Nginx configuration completed!"
echo ""
echo "To start nginx: systemctl start nginx"
echo "To reload nginx: systemctl reload nginx"
echo ""
echo "Next steps:"
echo "1. Configure DNS (point domain to 217.151.231.96)"
echo "2. Setup SSL with certbot: certbot --nginx -d your-domain.com"
echo ""

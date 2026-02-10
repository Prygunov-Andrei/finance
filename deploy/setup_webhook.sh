#!/bin/bash
set -e

echo "=========================================="
echo "Telegram Bot Webhook Setup"
echo "=========================================="
echo ""

BOT_TOKEN="8462412197:AAGyBinH5uYv1vTaum-4ry34gGCsGKLazaU"

# Read webhook URL from .env or ask user
if [ -f "/opt/finans_assistant/.env" ]; then
    WEBHOOK_URL=$(grep BOT_WEBHOOK_URL /opt/finans_assistant/.env | cut -d '=' -f2)
else
    read -p "Enter webhook URL (e.g., https://your-domain.com/bot/webhook): " WEBHOOK_URL
fi

echo "Setting webhook to: $WEBHOOK_URL"
echo ""

# Set webhook
curl -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
    -H "Content-Type: application/json" \
    -d "{\"url\": \"${WEBHOOK_URL}\"}"

echo ""
echo ""

# Get webhook info
echo "Current webhook info:"
curl -X GET "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo"

echo ""
echo ""
echo "Webhook setup completed!"
echo ""
echo "Important:"
echo "1. Update Mini App URL in @BotFather: /myapps"
echo "2. Set Web App URL to: https://your-domain.com/miniapp/"
echo ""

#!/bin/bash
set -e

echo "=========================================="
echo "Telegram Bot Webhook Setup"
echo "=========================================="
echo ""

ENV_FILE="/opt/finans_assistant/.env"

get_env_value() {
    local key="$1"
    local file="$2"

    if [ ! -f "$file" ]; then
        return 1
    fi

    # Get everything after the first '='; strip surrounding quotes if present.
    local raw
    raw="$(grep -E "^${key}=" "$file" | head -n 1 | cut -d '=' -f2-)"
    raw="${raw%\"}"
    raw="${raw#\"}"
    raw="${raw%\'}"
    raw="${raw#\'}"

    if [ -z "$raw" ]; then
        return 1
    fi

    printf "%s" "$raw"
}

BOT_TOKEN="$(get_env_value "TELEGRAM_BOT_TOKEN" "$ENV_FILE" || true)"
if [ -z "$BOT_TOKEN" ]; then
    read -p "Enter TELEGRAM_BOT_TOKEN: " BOT_TOKEN
fi

if [ -z "$BOT_TOKEN" ]; then
    echo "Error: TELEGRAM_BOT_TOKEN is required"
    exit 1
fi

# Read webhook URL from .env or ask user
if [ -f "$ENV_FILE" ]; then
    WEBHOOK_URL="$(get_env_value "BOT_WEBHOOK_URL" "$ENV_FILE" || true)"
else
    read -p "Enter webhook URL (e.g., https://your-domain.com/bot/webhook): " WEBHOOK_URL
fi

if [ -z "$WEBHOOK_URL" ]; then
    echo "Error: BOT_WEBHOOK_URL is required"
    exit 1
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

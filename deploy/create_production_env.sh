#!/bin/bash
set -e

echo "=========================================="
echo "Production Environment File Generator"
echo "=========================================="
echo ""

# Генерация безопасных паролей
generate_password() {
    openssl rand -base64 32 | tr -d "=+/" | cut -c1-25
}

generate_django_secret() {
    python3 -c "import secrets; print(''.join(secrets.choice('abcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*(-_=+)') for i in range(50)))"
}

DB_PASSWORD=$(generate_password)
MINIO_USER="minio_$(generate_password | cut -c1-12)"
MINIO_PASSWORD=$(generate_password)
DJANGO_SECRET=$(generate_django_secret)
BANK_ENCRYPTION_KEY=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")

# Запрос домена у пользователя
read -p "Enter your domain name (or press Enter for IP-only setup): " DOMAIN_NAME

if [ -z "$DOMAIN_NAME" ]; then
    DOMAIN_NAME="217.151.231.96"
    WEBHOOK_URL="http://217.151.231.96/bot/webhook"
    MINIAPP_URL="http://217.151.231.96/miniapp/"
    PUBLIC_URL="http://217.151.231.96"
    echo "Using IP-only setup (no HTTPS)"
else
    WEBHOOK_URL="https://${DOMAIN_NAME}/bot/webhook"
    MINIAPP_URL="https://${DOMAIN_NAME}/miniapp/"
    PUBLIC_URL="https://${DOMAIN_NAME}"
    echo "Using domain: ${DOMAIN_NAME}"
fi

# Создание .env файла
cat > /opt/finans_assistant/.env << EOF
# =============================================================================
# PRODUCTION Environment Variables
# Generated: $(date)
# =============================================================================

# --- PostgreSQL ---
DB_NAME=finans_assistant_prod
DB_USER=finans_user
DB_PASSWORD=${DB_PASSWORD}

# --- Kanban service DB (separate database in same postgres) ---
KANBAN_DB_NAME=finans_assistant_kanban_prod
KANBAN_SECRET_KEY=${DJANGO_SECRET}
KANBAN_SERVICE_TOKEN=

# --- MinIO ---
MINIO_ROOT_USER=${MINIO_USER}
MINIO_ROOT_PASSWORD=${MINIO_PASSWORD}

# --- Django ---
DEBUG=False
SECRET_KEY=${DJANGO_SECRET}
DJANGO_SETTINGS_MODULE=finans_assistant.settings
BANK_ENCRYPTION_KEY=${BANK_ENCRYPTION_KEY}
ERP_SERVICE_TOKEN=

# --- JWT (RS256) ---
# В production требуется задать пару ключей (PEM).
# JWT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
# JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
JWT_PRIVATE_KEY=
JWT_PUBLIC_KEY=
JWT_ISSUER=finans-assistant-erp
JWT_AUDIENCE=kanban-service

# --- Supply / LLM (заполните нужный ключ) ---
BITRIX_WEBHOOK_TIMEOUT=30
BITRIX_WEBHOOK_ENABLED=true
OPENAI_API_KEY=
GEMINI_API_KEY=

# --- Telegram Bot ---
TELEGRAM_BOT_TOKEN=8462412197:AAGyBinH5uYv1vTaum-4ry34gGCsGKLazaU
BOT_WEBHOOK_URL=${WEBHOOK_URL}
MINI_APP_URL=${MINIAPP_URL}

# --- ElevenLabs (transcription) ---
ELEVENLABS_API_KEY=sk_b7d766e2ff68578bd4af7670534f429991bf3838ee9425e4

# --- Sentry ---
SENTRY_DSN=https://637ea7a0734e1fedf97c76c688ecd65c@o4510856303673344.ingest.de.sentry.io/4510856306491472
SENTRY_ENVIRONMENT=production

# --- Public URLs (for client-side references) ---
PUBLIC_BACKEND_URL=${PUBLIC_URL}
PUBLIC_MINIAPP_URL=${PUBLIC_URL}/miniapp
WORKLOG_S3_PUBLIC_URL=${PUBLIC_URL}/media
EOF

echo ""
echo "✓ Production .env file created at /opt/finans_assistant/.env"
echo ""
echo "Generated credentials:"
echo "  PostgreSQL password: ${DB_PASSWORD}"
echo "  MinIO user: ${MINIO_USER}"
echo "  MinIO password: ${MINIO_PASSWORD}"
echo ""
echo "IMPORTANT: Save these credentials securely!"
echo ""

# 🚀 Production Deployment - Quick Reference

## Server Info
- **IP/Domain**: `SERVER_IP` / `PRODUCTION_DOMAIN` (текущий production: `72.56.111.111` / `avgust.prygunov.com`)
- **SSH**: `ssh root@SERVER_IP` (пример: `ssh root@72.56.111.111`)
- **Password**: `<ROOT_PASSWORD>` (не хранить в репозитории)

## ⚡ Quick Deploy

```bash
# 1. SSH в production сервер
ssh root@SERVER_IP

# 2. Запустить мастер-скрипт
cd /opt
git clone https://github.com/Prygunov-Andrei/finance.git finans_assistant
cd finans_assistant/deploy
chmod +x master_setup.sh
./master_setup.sh
```

## 📋 Что делает мастер-скрипт

1. ✅ Установка Docker + Docker Compose
2. ✅ Настройка firewall (ufw): открывает 22, 80, 443
3. ✅ Клонирование репозитория в `/opt/finans_assistant`
4. ✅ Генерация production `.env` с безопасными паролями
5. ✅ Установка nginx + production конфигурация
6. ✅ Сборка Docker образов (backend, bot, frontend, mini-app)
7. ✅ Запуск всех контейнеров (postgres, redis, minio, celery, etc.)
8. ✅ Миграции БД + создание суперпользователя Django
9. ✅ Настройка автоматических бэкапов (cron)

## 🌐 После установки

### 1. Настроить DNS/Cloudflare

- Добавить A-запись: `your-domain.com` → `SERVER_IP`
- Включить Cloudflare Proxy (оранжевое облако)
- SSL/TLS mode: **Full (Strict)**

### 2. Настроить SSL

**Вариант A: Let's Encrypt**
```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d your-domain.com
```

**Вариант B: Cloudflare Origin Certificate**
```bash
# Скачать из Cloudflare Dashboard
mkdir -p /etc/ssl/cloudflare
# Поместить .crt и .key файлы
# Обновить nginx config
systemctl reload nginx
```

### 3. Обновить .env с доменом

```bash
nano /opt/finans_assistant/.env
```

Изменить:
```env
BOT_WEBHOOK_URL=https://your-domain.com/bot/webhook
MINI_APP_URL=https://your-domain.com/miniapp/
PRODUCTION_DOMAIN=your-domain.com
```

Перезапустить:
```bash
cd /opt/finans_assistant
docker compose -f docker-compose.prod.yml restart
```

### 4. Настроить Telegram Webhook

```bash
cd /opt/finans_assistant/deploy
./setup_webhook.sh
```

### 5. Обновить BotFather

- Открыть @BotFather
- `/myapps` → @avgust_worklog_bot
- Web App URL: `https://your-domain.com/miniapp/`

### 6. Настроить модуль Снабжение (Bitrix24)

```bash
# 1. Добавить LLM API ключ в .env:
nano /opt/finans_assistant/.env
# Добавить: OPENAI_API_KEY=sk-... (или GEMINI_API_KEY=...)

# 2. Перезапустить сервисы:
cd /opt/finans_assistant
docker compose -f docker-compose.prod.yml restart backend celery-worker

# 3. Настроить интеграцию в ERP:
#    → Настройки → Битрикс24 → Добавить интеграцию
#    Подробная инструкция: docs/supply/BITRIX_SETUP.md
```

## 🧪 Тестирование

```bash
# Health check
curl https://your-domain.com/health

# API
curl https://your-domain.com/api/v1/

# Webhook status
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"

# Логи
docker compose -f docker-compose.prod.yml logs -f backend
```

## 🔧 Полезные команды

```bash
# Просмотр статуса
cd /opt/finans_assistant
docker compose -f docker-compose.prod.yml ps

# Рестарт сервиса
docker compose -f docker-compose.prod.yml restart backend

# Обновление кода
./deploy/deploy.sh

# Бэкап
./deploy/backup.sh

# Логи
docker compose -f docker-compose.prod.yml logs -f [service]
```

## 📚 Документация

- **Полное руководство**: [`deploy/README.md`](README.md)
- **Деплой (индекс)**: [`docs/deploy/README.md`](../docs/deploy/README.md)
- **Production guide**: [`docs/deploy/PRODUCTION.md`](../docs/deploy/PRODUCTION.md)

## 🆘 Troubleshooting

| Проблема | Решение |
|----------|---------|
| 502 Bad Gateway | `docker compose -f docker-compose.prod.yml restart backend` |
| Bot не отвечает | Проверить webhook: `./deploy/setup_webhook.sh` |
| Mini App не загружается | Проверить SSL и URL в BotFather |
| Database errors | `docker compose -f docker-compose.prod.yml logs -f postgres` |
| Celery tasks не выполняются | `docker compose -f docker-compose.prod.yml logs -f celery-worker` |
| Bitrix webhook не приходит | Проверить HTTPS доступность URL и токен в Битрикс24 |
| LLM не распознаёт счёт | Проверить OPENAI_API_KEY/GEMINI_API_KEY в .env |

## ⚠️ Важно

- **НЕ** коммитить `.env` файл в Git!
- **НЕ** использовать `docker compose down -v` (удалит volumes с данными!)
- **Всегда** делать бэкап перед обновлениями
- **Проверять** логи после деплоя

## 🔐 Credentials Storage

Все пароли генерируются автоматически при установке. Сохранить в надежное место:

- PostgreSQL password
- MinIO credentials
- Django SECRET_KEY
- BANK_ENCRYPTION_KEY
- LLM API ключи (OPENAI_API_KEY / GEMINI_API_KEY)

Вывод будет показан после выполнения `create_production_env.sh`.

---

**Status**: ✅ Ready for Production
**Last Updated**: 2026-02-14

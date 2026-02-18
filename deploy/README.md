# Production Deployment Guide

Полное руководство по развертыванию финансового ассистента на production сервере.

## Быстрый старт

**Сервер:** `SERVER_IP` / `PRODUCTION_DOMAIN` (SSH: `root@SERVER_IP`)

Текущий production:
- `SERVER_IP`: `72.56.111.111`
- `PRODUCTION_DOMAIN`: `avgust.prygunov.com`

### Автоматическая установка (рекомендуется)

```bash
ssh root@SERVER_IP
cd /opt
git clone https://github.com/Prygunov-Andrei/finance.git finans_assistant
cd finans_assistant/deploy
chmod +x *.sh
./master_setup.sh
```

Мастер-скрипт выполнит:
- ✅ Установку Docker и Docker Compose
- ✅ Настройку firewall (ufw)
- ✅ Генерацию production `.env` с безопасными паролями
- ✅ Установку nginx
- ✅ Сборку и запуск всех Docker контейнеров
- ✅ Миграции БД
- ✅ Настройку автоматических бэкапов

### Ручная установка (пошагово)

Если вы предпочитаете ручную настройку:

```bash
# 1. Подготовка сервера
./deploy/server_prep.sh

# 2. Генерация .env
./deploy/create_production_env.sh

# 3. Сборка и запуск
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d

# 4. Миграции
docker compose -f docker-compose.prod.yml exec backend python manage.py migrate
docker compose -f docker-compose.prod.yml exec backend python manage.py createsuperuser
docker compose -f docker-compose.prod.yml exec backend python manage.py collectstatic --noinput

# 5. Установка nginx
./deploy/install_nginx.sh
systemctl start nginx

# 6. Настройка бэкапов
crontab -e
# Добавить содержимое из deploy/crontab.example
```

---

## Структура deployment файлов

```
/opt/finans_assistant/
├── deploy/
│   ├── master_setup.sh              # Мастер-скрипт полной установки
│   ├── server_prep.sh               # Подготовка сервера (Docker, firewall)
│   ├── create_production_env.sh     # Генерация .env с паролями
│   ├── install_nginx.sh             # Установка и настройка nginx
│   ├── deploy.sh                    # Обновление кода и перезапуск
│   ├── backup.sh                    # Бэкап БД и MinIO
│   ├── setup_webhook.sh             # Настройка Telegram webhook
│   ├── nginx_finans_assistant.conf  # Nginx конфигурация
│   └── crontab.example              # Пример cron jobs
├── docker-compose.prod.yml          # Production Docker Compose
├── .env                             # Production environment variables (не в Git!)
└── docs/deploy/PRODUCTION.md         # Деплой-документация (индекс: docs/deploy/README.md)
```

---

## Настройка Cloudflare (обязательно для HTTPS)

### 1. Добавить домен в Cloudflare

- Купите домен (Namecheap, GoDaddy и т.д.)
- Добавьте домен в Cloudflare (бесплатный план)
- Измените nameservers у регистратора на Cloudflare nameservers

### 2. Создать DNS запись

В Cloudflare Dashboard → DNS:

```
Type: A
Name: @
IPv4 address: SERVER_IP
Proxy status: ☁️ Proxied (оранжевое облако)
TTL: Auto
```

Для поддоменов (опционально):
```
Type: A
Name: www
IPv4 address: SERVER_IP
Proxy status: ☁️ Proxied
```

### 3. Настроить SSL/TLS

Cloudflare Dashboard → SSL/TLS:
- **Encryption mode**: Full (Strict) ✅
- **Edge Certificates**: Auto (бесплатный SSL от Cloudflare)
- **Always Use HTTPS**: ✅ Включено

### 4. Настроить SSL сертификат на nginx

**Вариант A: Let's Encrypt (рекомендуется)**

```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d your-domain.com -d www.your-domain.com
```

Certbot автоматически:
- Получит SSL сертификат
- Обновит nginx конфигурацию
- Настроит auto-renewal (cron job)

**Вариант B: Cloudflare Origin Certificate**

1. В Cloudflare Dashboard: SSL/TLS → Origin Server → Create Certificate
2. Скачать `.crt` и `.key` файлы
3. Поместить на сервер:
   ```bash
   mkdir -p /etc/ssl/cloudflare
   nano /etc/ssl/cloudflare/origin.crt  # Вставить содержимое
   nano /etc/ssl/cloudflare/origin.key  # Вставить содержимое
   chmod 600 /etc/ssl/cloudflare/origin.key
   ```
4. Обновить `/etc/nginx/sites-available/finans_assistant`:
   ```nginx
   ssl_certificate /etc/ssl/cloudflare/origin.crt;
   ssl_certificate_key /etc/ssl/cloudflare/origin.key;
   ```
5. Перезапустить nginx:
   ```bash
   nginx -t
   systemctl reload nginx
   ```

---

## Настройка Telegram

### 1. Обновить .env с production URL

```bash
nano /opt/finans_assistant/.env
```

Изменить:
```env
BOT_WEBHOOK_URL=https://your-domain.com/bot/webhook
MINI_APP_URL=https://your-domain.com/miniapp/
```

### 2. Установить webhook

```bash
cd /opt/finans_assistant
./deploy/setup_webhook.sh
```

### 3. Обновить Mini App URL в BotFather

1. Открыть @BotFather в Telegram
2. `/myapps` → выбрать бота `@avgust_worklog_bot`
3. Изменить Web App URL на: `https://your-domain.com/miniapp/`
4. Сохранить

---

## Проверка работоспособности

### Внутренняя проверка (на сервере)

```bash
# Проверка контейнеров
docker compose -f docker-compose.prod.yml ps

# Проверка backend
curl http://localhost:8000/api/v1/

# Проверка frontend
curl http://localhost:3000/

# Проверка mini-app
curl http://localhost:3001/

# Логи
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f bot
```

### Внешняя проверка (через домен)

```bash
# Health check
curl https://your-domain.com/health

# API
curl https://your-domain.com/api/v1/

# Frontend (должен вернуть HTML)
curl https://your-domain.com/

# Mini App (должен вернуть HTML)
curl https://your-domain.com/miniapp/

# Webhook (должен вернуть 405 Method Not Allowed)
curl https://your-domain.com/bot/webhook
```

### Проверка Telegram webhook

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

Должен вернуть:
```json
{
  "ok": true,
  "result": {
    "url": "https://your-domain.com/bot/webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0,
    "last_error_date": 0
  }
}
```

---

## Обслуживание

### Просмотр логов

```bash
# Все сервисы
docker compose -f docker-compose.prod.yml logs -f

# Конкретный сервис
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f bot
docker compose -f docker-compose.prod.yml logs -f celery-worker

# Последние 100 строк
docker compose -f docker-compose.prod.yml logs --tail=100 backend
```

### Рестарт сервисов

```bash
# Все сервисы
docker compose -f docker-compose.prod.yml restart

# Конкретный сервис
docker compose -f docker-compose.prod.yml restart backend
docker compose -f docker-compose.prod.yml restart bot
```

### Обновление кода

```bash
cd /opt/finans_assistant
./deploy/deploy.sh
```

Или вручную:
```bash
git pull origin main
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml exec backend python manage.py migrate
docker compose -f docker-compose.prod.yml exec backend python manage.py collectstatic --noinput
```

### Backup

```bash
# Ручной бэкап
/opt/finans_assistant/deploy/backup.sh

# Автоматический бэкап (cron)
# Ежедневно в 3:00 AM
0 3 * * * /opt/finans_assistant/deploy/backup.sh >> /var/log/finans_backup.log 2>&1
```

Бэкапы сохраняются в `/opt/backups/finans_assistant/`:
- `postgres_backup_YYYYMMDD_HHMMSS.sql` — дамп PostgreSQL
- `minio_backup_YYYYMMDD_HHMMSS.tar.gz` — архив MinIO (медиа-файлы)
- `env_backup_YYYYMMDD_HHMMSS` — копия `.env` файла

### Восстановление из бэкапа

**PostgreSQL:**
```bash
cat /opt/backups/finans_assistant/postgres_backup_20260207_030000.sql | \
  docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U finans_user finans_assistant_prod
```

**MinIO:**
```bash
docker run --rm \
  -v finans_assistant_minio_data:/data \
  -v /opt/backups/finans_assistant:/backup \
  alpine tar xzf /backup/minio_backup_20260207_030000.tar.gz -C /data
```

---

## Мониторинг

### Sentry (ошибки)

Sentry уже настроен (SENTRY_DSN в `.env`). Ошибки автоматически отправляются в Sentry Dashboard.

- Dashboard: https://sentry.io/organizations/[your-org]/issues/
- Environment: `production`

### Системные метрики

```bash
# Использование ресурсов контейнерами
docker stats

# Использование диска
df -h
du -sh /var/lib/docker/volumes/

# Логи nginx
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

---

## Безопасность

### Checklist

- ✅ `.env` файл **НЕ** в Git (проверить `.gitignore`)
- ✅ Пароли PostgreSQL изменены с дефолтных
- ✅ MinIO credentials изменены
- ✅ `DEBUG=False` в production
- ✅ Firewall настроен (только 22, 80, 443 открыты)
- ✅ HTTPS включен (Cloudflare или Let's Encrypt)
- ✅ Secure cookies включены (`SESSION_COOKIE_SECURE=True`)
- ✅ HSTS включен
- ✅ Docker порты не пробрасываются наружу (только на `127.0.0.1`)
- ✅ Автоматические бэкапы настроены

### Обновление секретов

Если нужно изменить пароли:

```bash
# 1. Обновить .env
nano /opt/finans_assistant/.env

# 2. Пересоздать контейнеры
cd /opt/finans_assistant
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d

# 3. Для PostgreSQL - также обновить пароль в БД
docker compose -f docker-compose.prod.yml exec postgres psql -U postgres
ALTER USER finans_user WITH PASSWORD 'new_password';
\q
```

---

## Устранение неполадок

### Проблема: Telegram Mini App не загружается

**Симптомы:** ERR_SSL_PROTOCOL_ERROR или Mixed Content

**Решение:**
1. Проверить URL в BotFather (должен начинаться с `https://`)
2. Проверить nginx конфигурацию:
   ```bash
   nginx -t
   systemctl status nginx
   tail -f /var/log/nginx/error.log
   ```
3. Проверить SSL сертификат:
   ```bash
   openssl s_client -connect your-domain.com:443 -servername your-domain.com
   ```

### Проблема: Bot webhook не получает обновления

**Решение:**
1. Проверить webhook info:
   ```bash
   curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
   ```
2. Проверить логи бота:
   ```bash
   docker compose -f docker-compose.prod.yml logs -f bot
   ```
3. Проверить доступность webhook endpoint:
   ```bash
   curl -v https://your-domain.com/bot/webhook
   ```

### Проблема: Backend 502 Bad Gateway

**Решение:**
1. Проверить статус контейнера:
   ```bash
   docker compose -f docker-compose.prod.yml ps backend
   ```
2. Проверить логи:
   ```bash
   docker compose -f docker-compose.prod.yml logs -f backend
   ```
3. Проверить health check:
   ```bash
   curl http://localhost:8000/api/v1/
   ```
4. Рестарт backend:
   ```bash
   docker compose -f docker-compose.prod.yml restart backend
   ```

### Проблема: Database connection errors

**Решение:**
1. Проверить статус PostgreSQL:
   ```bash
   docker compose -f docker-compose.prod.yml ps postgres
   ```
2. Проверить credentials в `.env`
3. Проверить логи PostgreSQL:
   ```bash
   docker compose -f docker-compose.prod.yml logs -f postgres
   ```

---

## Контакты и поддержка

- **GitHub**: https://github.com/Prygunov-Andrei/finance
- **Документация**: `/opt/finans_assistant/docs/deploy/`
- **Логи**: `docker compose -f docker-compose.prod.yml logs -f`

---

## Дополнительные ресурсы

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Nginx Documentation](https://nginx.org/en/docs/)
- [Cloudflare SSL/TLS](https://developers.cloudflare.com/ssl/)
- [Let's Encrypt](https://letsencrypt.org/getting-started/)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Telegram Mini Apps](https://core.telegram.org/bots/webapps)

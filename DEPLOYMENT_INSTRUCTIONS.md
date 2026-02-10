# 🚀 Инструкция по развертыванию на сервере 72.56.83.95

## Шаг 1: Подключитесь к серверу

```bash
ssh root@72.56.83.95
```

Пароль: `hN9DVVo_pu6d_X`

---

## Шаг 2: Выполните одну команду для полного деплоя

```bash
curl -sSL https://raw.githubusercontent.com/Prygunov-Andrei/finance/main/deploy/one_command_deploy.sh | bash
```

**Эта команда автоматически:**
- ✅ Установит Docker и Docker Compose
- ✅ Настроит firewall (откроет порты 22, 80, 443)
- ✅ Создаст swap (2GB)
- ✅ Склонирует репозиторий в `/opt/finans_assistant`
- ✅ Сгенерирует production `.env` с безопасными паролями
- ✅ Установит и настроит nginx
- ✅ Соберет все Docker образы (backend, bot, frontend, mini-app)
- ✅ Запустит все контейнеры
- ✅ Выполнит миграции БД

**Время выполнения:** 5-10 минут

---

## Шаг 3: Создайте Django superuser (после завершения деплоя)

```bash
cd /opt/finans_assistant
docker compose -f docker-compose.prod.yml exec backend python manage.py createsuperuser
```

Введите:
- Username: `admin`
- Email: `ваш-email@example.com`
- Password: (придумайте безопасный пароль)

---

## Шаг 4: Запустите nginx

```bash
systemctl start nginx
systemctl enable nginx
```

---

## Шаг 5: Проверьте что все работает

```bash
# Проверка контейнеров
docker compose -f docker-compose.prod.yml ps

# Проверка API
curl http://localhost:8000/api/v1/

# Проверка frontend
curl -I http://localhost:3000/

# Проверка mini-app
curl -I http://localhost:3001/

# Внешний доступ (через nginx)
curl http://72.56.83.95/api/v1/
```

Все сервисы должны отвечать со статусом `200 OK`.

---

## Шаг 6: Настройка Telegram Bot (важно!)

### 6.1 Установите webhook

```bash
cd /opt/finans_assistant
./deploy/setup_webhook.sh
```

Скрипт автоматически установит webhook на `http://72.56.83.95/bot/webhook`.

### 6.2 Обновите Mini App URL в BotFather

1. Откройте @BotFather в Telegram
2. Отправьте команду: `/myapps`
3. Выберите бота: `@avgust_worklog_bot`
4. Нажмите "Edit Web App"
5. Введите URL: `http://72.56.83.95/miniapp/`
6. Сохраните

**ВАЖНО:** Пока работаем по HTTP (без SSL). Для production с доменом нужно настроить HTTPS (см. Шаг 7).

---

## Шаг 7: Настройка HTTPS (опционально, для production)

Если у вас есть домен и Cloudflare:

### 7.1 Настройте DNS в Cloudflare

- Создайте A-запись: `your-domain.com` → `72.56.83.95`
- Включите Cloudflare Proxy (оранжевое облако)
- SSL/TLS mode: **Full (Strict)**

### 7.2 Установите Let's Encrypt

```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d your-domain.com -d www.your-domain.com
```

### 7.3 Обновите .env с доменом

```bash
nano /opt/finans_assistant/.env
```

Измените:
```env
BOT_WEBHOOK_URL=https://your-domain.com/bot/webhook
MINI_APP_URL=https://your-domain.com/miniapp/
PUBLIC_BACKEND_URL=https://your-domain.com
PRODUCTION_DOMAIN=your-domain.com
```

### 7.4 Перезапустите контейнеры

```bash
docker compose -f docker-compose.prod.yml restart
```

### 7.5 Обновите webhook и BotFather URLs

```bash
./deploy/setup_webhook.sh
```

И в @BotFather измените Mini App URL на `https://your-domain.com/miniapp/`.

---

## 🎯 Проверка работы системы

### 1. ERP Frontend
Откройте в браузере: `http://72.56.83.95/`

Войдите с созданным superuser:
- Username: `admin`
- Password: (ваш пароль)

### 2. Django Admin
`http://72.56.83.95/admin/`

### 3. Telegram Bot
Откройте @avgust_worklog_bot в Telegram и отправьте `/start`

### 4. Mini App
В боте нажмите кнопку меню (слева от поля ввода) или откройте:
`http://72.56.83.95/miniapp/`

---

## 📊 Мониторинг

### Логи контейнеров

```bash
# Все логи
docker compose -f docker-compose.prod.yml logs -f

# Конкретный сервис
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f bot
docker compose -f docker-compose.prod.yml logs -f celery-worker
```

### Статус контейнеров

```bash
docker compose -f docker-compose.prod.yml ps
docker stats
```

### Nginx логи

```bash
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

---

## 🔧 Полезные команды

```bash
# Рестарт всех сервисов
docker compose -f docker-compose.prod.yml restart

# Рестарт конкретного сервиса
docker compose -f docker-compose.prod.yml restart backend

# Остановка всех сервисов
docker compose -f docker-compose.prod.yml stop

# Запуск
docker compose -f docker-compose.prod.yml start

# Пересборка после изменений кода
cd /opt/finans_assistant
git pull origin main
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml exec backend python manage.py migrate
```

---

## 🔒 Безопасность

- ✅ Порты Docker НЕ пробрасываются наружу (только через nginx)
- ✅ Firewall разрешает только 22, 80, 443
- ✅ `.env` файл НЕ в Git
- ✅ Безопасные пароли сгенерированы автоматически
- ✅ Sentry мониторинг включен

**СОХРАНИТЕ credentials из вывода скрипта в надежное место!**

---

## 🆘 Устранение неполадок

### Backend не отвечает

```bash
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml restart backend
```

### Bot не работает

```bash
docker compose -f docker-compose.prod.yml logs -f bot
./deploy/setup_webhook.sh  # Переустановить webhook
```

### База данных

```bash
docker compose -f docker-compose.prod.yml logs -f postgres
docker compose -f docker-compose.prod.yml exec postgres psql -U finans_user finans_assistant_prod
```

---

## 📦 Backup

Автоматический backup настроен через cron (выполняется ежедневно в 3:00):

```bash
# Ручной backup
/opt/finans_assistant/deploy/backup.sh

# Проверка cron jobs
crontab -l
```

Backups сохраняются в `/opt/backups/finans_assistant/`.

---

## 📚 Документация

- **Полное руководство**: `/opt/finans_assistant/deploy/README.md`
- **Техническая документация**: `/opt/finans_assistant/docs/work_logging/`

---

**Status**: ✅ Ready to deploy
**Server**: 72.56.83.95
**Last updated**: 2026-02-10

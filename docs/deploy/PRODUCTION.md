# Production Deployment Guide

Текущий production (актуально на сегодня):
- `PRODUCTION_DOMAIN`: `avgust.prygunov.com`
- `SERVER_IP`: `72.56.111.111`
- SSH: `root@72.56.111.111`

Важно:
- Пароли/токены/ключи не храним в git. Реальные значения держим локально в `docs/private/` (папка в `.gitignore`).
- Через Cloudflare nginx может отдавать `404` на `http://127.0.0.1/` без Host header; проверяй через `-H "Host: avgust.prygunov.com"` (см. `docs/deploy/NGINX.md`).

Переменные/плейсхолдеры:
- `SERVER_IP` — IP сервера (если деплой по IP)
- `PRODUCTION_DOMAIN` — домен (если деплой по домену)
- `TELEGRAM_BOT_TOKEN` — токен Telegram бота (не хранить в git)

## Вариант A: “one command deploy”

На сервере:

```bash
curl -sSL https://raw.githubusercontent.com/Prygunov-Andrei/finance/main/deploy/one_command_deploy.sh | bash
```

Скрипт:
- установит Docker/Docker Compose, настроит firewall, при необходимости создаст swap;
- склонирует репозиторий в `/opt/finans_assistant`;
- запустит `deploy/create_production_env.sh` (создаст `/opt/finans_assistant/.env`);
- установит nginx, соберет и запустит контейнеры, прогонит миграции.

После завершения:

```bash
cd /opt/finans_assistant
docker compose -f docker-compose.prod.yml exec backend python manage.py createsuperuser
systemctl start nginx
systemctl enable nginx
```

## Вариант B: мастер-скрипт (полу-автоматически)

```bash
cd /opt
git clone https://github.com/Prygunov-Andrei/finance.git finans_assistant
cd finans_assistant/deploy
chmod +x *.sh
sudo ./master_setup.sh
```

## Проверка после деплоя

На сервере:

```bash
cd /opt/finans_assistant
docker compose -f docker-compose.prod.yml ps

curl http://localhost:8000/api/v1/
curl -I http://localhost:3000/
curl -I http://localhost:3001/
```

Снаружи (через nginx):

```bash
curl http://SERVER_IP/api/v1/
curl -I http://SERVER_IP/
curl -I http://SERVER_IP/miniapp/
```

Если у тебя домен за Cloudflare, лучше проверять так (иначе легко поймать `404` на дефолтном vhost):

```bash
curl -I -H "Host: avgust.prygunov.com" http://127.0.0.1/
curl -I -H "Host: avgust.prygunov.com" http://127.0.0.1/api/v1/
```

## Telegram webhook

Убедись, что в `/opt/finans_assistant/.env` заполнены `TELEGRAM_BOT_TOKEN` и `BOT_WEBHOOK_URL`, затем:

```bash
cd /opt/finans_assistant
./deploy/setup_webhook.sh
```

Проверка:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

## HTTPS (если есть домен)

Для `PRODUCTION_DOMAIN`:
- DNS A record: `PRODUCTION_DOMAIN` -> `SERVER_IP`
- включить HTTPS (Cloudflare или Let's Encrypt)

Детали: `docs/deploy/CLOUDFLARE.md`.

## Low-RAM (2GB)

Если сервер маленький (2GB RAM, 2 CPU), используй `docker-compose.lowram.override.yml` и/или безопасный сценарий:
- `docs/deploy/LOW_RAM.md`
- `deploy/deploy_lowram_safe.sh`

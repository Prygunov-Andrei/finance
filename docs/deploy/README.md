# Деплой (production) — индекс

Принципы:
- Секреты не храним в репозитории. В документах используем плейсхолдеры: `SERVER_IP`, `PRODUCTION_DOMAIN`, `TELEGRAM_BOT_TOKEN`.
- Скрипты деплоя лежат в `deploy/`. Документация в этой папке — “что и зачем”, а не копия скриптов.

Документы:
- `PRODUCTION.md` — основной сценарий деплоя и проверка
- `LOW_RAM.md` — деплой на low-RAM (2GB) / безопасные настройки
- `NGINX.md` — nginx, виртуалхост, типовые 404/502 и диагностика
- `CLOUDFLARE.md` — DNS/SSL через Cloudflare
- `BACKUPS.md` — бэкапы и cron
- `TROUBLESHOOTING.md` — частые проблемы и команды

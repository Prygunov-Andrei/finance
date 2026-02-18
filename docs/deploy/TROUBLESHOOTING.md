# Troubleshooting (production)

## Быстрые команды диагностики

```bash
cd /opt/finans_assistant
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f --tail=200
docker stats
free -h
df -h
```

## Backend не отвечает

```bash
docker compose -f docker-compose.prod.yml logs -f backend --tail=200
docker compose -f docker-compose.prod.yml restart backend
```

## Bot не получает updates

```bash
./deploy/setup_webhook.sh
docker compose -f docker-compose.prod.yml logs -f bot --tail=200
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

## Nginx 502

```bash
sudo tail -n 200 /var/log/nginx/error.log
sudo nginx -t
sudo systemctl status nginx
```

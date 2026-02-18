# Nginx (production)

Конфиги nginx лежат в `deploy/`:
- `deploy/nginx_finans_assistant.conf`
- альтернативы: `deploy/nginx_cloudflare_ssl.conf`, `deploy/nginx_http_only.conf`

Установка/применение:

```bash
cd /opt/finans_assistant
sudo ./deploy/install_nginx.sh
sudo nginx -t
sudo systemctl reload nginx
```

## Типовые проблемы

### 404 на всех роутерах

Проверь:
- попадаешь ли в нужный vhost (Host header / домен / IP);
- что `sites-enabled/finans_assistant` включен;
- нет ли конфликта с `default` сайтом.

```bash
sudo nginx -T | grep -E "server_name|listen|finans_assistant" || true
sudo tail -n 200 /var/log/nginx/error.log
```

### 502 Bad Gateway

Проверь контейнеры и порты:

```bash
cd /opt/finans_assistant
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f backend --tail=200
```

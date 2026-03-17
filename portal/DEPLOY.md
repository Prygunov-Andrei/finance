# Деплой портала смет на hvac-info.com

## Архитектура

```
hvac-info.com (72.56.80.247)           ERP (72.56.111.111)
┌─────────────────────┐                ┌─────────────────────┐
│ nginx               │                │ docker-compose      │
│  /           → свой │                │   backend :8000     │
│  /smeta/     → ─────┼── proxy ──────→│   portal  :3002     │
│  /api/public/→ ─────┼── proxy ──────→│   celery-public     │
└─────────────────────┘                └─────────────────────┘
```

## На ERP сервере (72.56.111.111)

1. Env vars (добавить в .env):
```
PORTAL_DOMAIN=hvac-info.com
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=...
EMAIL_HOST_USER=...
EMAIL_HOST_PASSWORD=...
DEFAULT_FROM_EMAIL=noreply@hvac-info.com
```

2. Собрать и запустить:
```bash
docker compose up -d --build portal celery-public-worker backend
docker compose exec -T backend python manage.py migrate
```

3. Проверить порт 3002 доступен снаружи (или только для 72.56.80.247).

## На сервере hvac-info.com (72.56.80.247)

Добавить в nginx конфигурацию hvac-info.com:

```nginx
# Портал расчёта смет (SPA)
location /smeta/ {
    proxy_pass http://72.56.111.111:3002/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    add_header Referrer-Policy "no-referrer" always;
}

# API портала смет
location /api/public/ {
    proxy_pass http://72.56.111.111:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 200M;
    proxy_read_timeout 300s;
}
```

Перезагрузить nginx: `nginx -t && nginx -s reload`

## Проверка

1. https://hvac-info.com/smeta/ — открывается лендинг портала
2. OTP верификация → загрузка PDF → статус обработки → скачивание Excel
3. В ERP (72.56.111.111) — раздел "Портал смет" → видны запросы

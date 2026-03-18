# План миграции на единый сервер hvac-info.com

## Текущая ситуация

| Сервер | IP | Что работает |
|--------|-----|-------------|
| ERP | 72.56.111.111 | finans_assistant (Django + React + Celery + PostgreSQL + Redis + MinIO) |
| Портал | 72.56.80.247 | hvac-info.com (Django + фронтенд, новости климата) |

**Проблемы**: два сервера, два деплоя, proxy-цепочка, двойные затраты.

## Целевая архитектура

**Один сервер**, один Docker Compose, один домен `hvac-info.com`.

```
hvac-info.com (единый сервер)
│
│  nginx (единая точка входа, SSL)
│
├── /                     → hvac-info фронтенд (новости, статьи)
├── /smeta/               → портал расчёта смет (React SPA)
├── /erp/                 → ERP-интерфейс (React SPA, вход по логину)
│
├── /api/v1/              → ERP backend API (JWT-аутентификация)
├── /api/public/v1/       → Public API портала смет (без аутентификации)
├── /api/hvac/            → API hvac-info (статьи, новости)
│
├── /admin/               → Django admin (ERP)
├── /hvac-admin/          → Django admin (hvac-info)
└── /mini-app/            → Telegram mini-app
```

### Почему НЕ объединяем Django-проекты в один

Два отдельных Django-проекта (`finans_assistant` и `hvac-info`), каждый в своём контейнере, со своей БД:

- **Нет риска конфликтов миграций** — у каждого проекта своя схема
- **Независимые деплои** — обновление ERP не ломает hvac-info
- **Изоляция данных** — взлом одного не компрометирует другой
- **Простая миграция** — просто перенос контейнеров, не слияние кодовых баз

Общие ресурсы (PostgreSQL, Redis, MinIO, nginx) — шарятся через Docker network.

### Схема контейнеров

```
docker-compose.yml
│
│  ИНФРАСТРУКТУРА (общая)
├── postgres          — PostgreSQL 14 (две БД: finans_assistant + hvac_info)
├── redis             — Redis 7 (брокер Celery + кэш + OTP)
├── minio             — MinIO (buckets: worklog-media, product-media, portal-estimates, hvac-media)
├── nginx             — Единый reverse proxy + SSL (Let's Encrypt)
│
│  ERP (finans_assistant)
├── erp-backend       — Django + Gunicorn :8000
├── erp-celery        — Celery worker (внутренние задачи)
├── erp-celery-public — Celery worker (портал смет, queue=public_tasks)
├── erp-celery-beat   — Celery Beat (периодические задачи)
├── erp-frontend      — React SPA (ERP-интерфейс) :3000
├── portal            — React SPA (портал смет) :3002
│
│  HVAC-INFO
├── hvac-backend      — Django + Gunicorn :8001
├── hvac-celery       — Celery worker (если есть задачи)
├── hvac-frontend     — Фронтенд hvac-info :3003
│
│  ПРОЧЕЕ
├── bot               — Telegram бот :8081
└── mini-app          — Telegram mini-app :3001
```

## Характеристики сервера

### Минимальные (рабочие)

| Ресурс | Значение | Обоснование |
|--------|---------|-------------|
| **CPU** | 8 vCPU | PDF-рендеринг (PyMuPDF) CPU-intensive, + 2 Django + Celery workers |
| **RAM** | 16 GB | PostgreSQL 2GB + Redis 512MB + 2 Django по 500MB + 4 Celery workers по 1GB + MinIO 512MB + nginx + OS |
| **SSD** | 200 GB | PostgreSQL ~20GB + MinIO files ~50GB + Docker images ~30GB + логи + запас |
| **Сеть** | 1 Gbps, статический IP | Загрузка файлов до 200MB |

### Рекомендуемые (с запасом)

| Ресурс | Значение | Зачем запас |
|--------|---------|-------------|
| **CPU** | 12-16 vCPU | Параллельная обработка нескольких запросов на сметы |
| **RAM** | 32 GB | Запас для пиков нагрузки, PostgreSQL кэш |
| **SSD** | 500 GB | Рост файлов MinIO, PostgreSQL WAL |

### Провайдеры (примерные цены)

| Провайдер | Конфигурация | Цена/мес |
|-----------|-------------|---------|
| Hetzner CPX41 | 8 vCPU, 16GB, 240GB | ~€30 |
| Hetzner CCX33 | 8 vCPU, 32GB, 240GB | ~€55 |
| Selectel | 8 vCPU, 16GB, 200GB NVMe | ~4000₽ |
| Timeweb Cloud | 8 vCPU, 16GB, 200GB | ~4500₽ |

**Рекомендация**: 8 vCPU / 32GB RAM / 300GB SSD — оптимальный баланс.

## Этапы миграции

### Этап 1 — Подготовка нового сервера

- [ ] Заказать сервер (8+ vCPU, 16-32GB RAM, 200+ GB SSD)
- [ ] Установить: Docker, Docker Compose, git, certbot
- [ ] Настроить SSH, firewall (порты: 22, 80, 443)
- [ ] DNS: пока НЕ переключать hvac-info.com

### Этап 2 — Перенос ERP

- [ ] `git clone` репозитория finans_assistant
- [ ] Скопировать `.env` с текущего сервера (72.56.111.111)
- [ ] `docker compose up -d` — собрать все контейнеры
- [ ] **Дамп PostgreSQL** с 72.56.111.111:
  ```bash
  # На старом сервере
  docker compose exec -T postgres pg_dump -U postgres finans_assistant > erp_dump.sql

  # На новом сервере
  cat erp_dump.sql | docker compose exec -T postgres psql -U postgres finans_assistant
  ```
- [ ] **Дамп MinIO** (файлы):
  ```bash
  # На старом сервере
  docker compose exec -T minio mc mirror /data /tmp/minio-backup
  # Скопировать через rsync/scp на новый сервер
  ```
- [ ] Проверить: `curl http://localhost:8000/api/v1/health/`
- [ ] Проверить: Django admin, создание сметы, парсинг счёта

### Этап 3 — Перенос hvac-info

- [ ] `git clone` репозитория hvac-info
- [ ] Скопировать `.env`
- [ ] Создать БД `hvac_info` в PostgreSQL (тот же инстанс, другая БД):
  ```bash
  docker compose exec -T postgres psql -U postgres -c "CREATE DATABASE hvac_info;"
  ```
- [ ] **Дамп PostgreSQL** с 72.56.80.247:
  ```bash
  # На старом сервере hvac-info
  pg_dump -U ... hvac_info_db > hvac_dump.sql

  # На новом сервере
  cat hvac_dump.sql | docker compose exec -T postgres psql -U postgres hvac_info
  ```
- [ ] Добавить hvac-контейнеры в docker-compose.yml
- [ ] Проверить: hvac-info backend отвечает на :8001

### Этап 4 — Настройка nginx + SSL

- [ ] Единый nginx конфиг (см. ниже)
- [ ] Certbot: `certbot --nginx -d hvac-info.com -d www.hvac-info.com`
- [ ] Проверить все location'ы

### Этап 5 — Переключение DNS

- [ ] Сменить A-запись hvac-info.com → IP нового сервера
- [ ] Подождать 1-2 часа (DNS propagation)
- [ ] Проверить всё через домен:
  - [ ] `https://hvac-info.com/` — hvac-info работает
  - [ ] `https://hvac-info.com/smeta/` — портал смет
  - [ ] `https://hvac-info.com/erp/` — ERP (требует логин)
  - [ ] `https://hvac-info.com/api/v1/health/` → ok

### Этап 6 — Выключение старых серверов

- [ ] Убедиться что всё работает на новом (минимум 3 дня)
- [ ] Выключить 72.56.111.111 и 72.56.80.247
- [ ] Сделать финальный бэкап на всякий случай

## Nginx конфигурация (единая)

```nginx
server {
    listen 80;
    server_name hvac-info.com www.hvac-info.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name hvac-info.com www.hvac-info.com;

    ssl_certificate /etc/letsencrypt/live/hvac-info.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/hvac-info.com/privkey.pem;

    # =========================================================
    # HVAC-INFO — основной сайт (новости, статьи)
    # =========================================================
    location / {
        proxy_pass http://hvac-frontend:3003;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # API hvac-info
    location /api/hvac/ {
        proxy_pass http://hvac-backend:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Django admin hvac-info
    location /hvac-admin/ {
        proxy_pass http://hvac-backend:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # =========================================================
    # ПОРТАЛ СМЕТ — /smeta/
    # =========================================================
    location /smeta/ {
        proxy_pass http://portal:3002/;
        proxy_set_header Host $host;
        add_header Referrer-Policy "no-referrer" always;
    }

    # Public API (портал смет, без авторизации)
    location /api/public/ {
        proxy_pass http://erp-backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 200M;
        proxy_read_timeout 300s;
    }

    # =========================================================
    # ERP — /erp/ (по логину-паролю через JWT)
    # =========================================================
    location /erp/ {
        proxy_pass http://erp-frontend:3000/;
        proxy_set_header Host $host;
    }

    # ERP API (JWT-аутентификация)
    location /api/v1/ {
        proxy_pass http://erp-backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 100M;
    }

    # Django admin ERP
    location /admin/ {
        proxy_pass http://erp-backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # ERP static files (Django admin CSS/JS)
    location /static/ {
        proxy_pass http://erp-backend:8000;
    }

    # =========================================================
    # TELEGRAM
    # =========================================================
    location /bot/ {
        proxy_pass http://bot:8081;
        proxy_set_header Host $host;
    }

    location /mini-app/ {
        proxy_pass http://mini-app:3001/;
        proxy_set_header Host $host;
    }

    # =========================================================
    # SECURITY
    # =========================================================
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
}
```

## Что нужно изменить в коде

### ERP frontend — base path `/erp/`

```typescript
// frontend/vite.config.ts
export default defineConfig({
  base: '/erp/',
  ...
})

// frontend/main.tsx — BrowserRouter
<BrowserRouter basename="/erp">
```

### ERP backend — CORS + CSRF

```python
# settings.py
PRODUCTION_DOMAIN = 'hvac-info.com'  # вместо IP
PORTAL_DOMAIN = 'hvac-info.com'     # тот же домен
```

### hvac-info backend

Минимальные изменения — зависит от текущей конфигурации. Нужно убедиться что:
- PostgreSQL host = `postgres` (Docker internal)
- Redis URL = `redis://redis:6379/2` (отдельная БД Redis, не пересекается с ERP)

## Риски и митигация

| Риск | Митигация |
|------|-----------|
| Простой при переключении DNS | Подготовить всё заранее, переключать в ночное время |
| Потеря данных при дампе | Делать pg_dump с `--no-owner`, проверять restore |
| Конфликт портов | Каждый сервис на своём порту, nginx маршрутизирует |
| PostgreSQL shared: один падает — оба лежат | Разные БД, бэкапы по cron, pg_basebackup |
| Redis shared: flush одного ломает другой | Разные DB-номера (ERP = 0, hvac = 2, kanban = 1) |

## Чеклист решений

- [ ] Выбрать провайдера и конфигурацию сервера
- [ ] Согласовать дату миграции (downtime 30-60 мин)
- [ ] Получить доступ к git-репозиторию hvac-info
- [ ] Получить дамп PostgreSQL hvac-info
- [ ] Определить нужен ли hvac-info Celery worker

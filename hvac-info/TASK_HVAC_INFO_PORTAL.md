# Задание: Подключение раздела «Расчёт смет» на hvac-info.com

## Контекст

К порталу hvac-info.com добавляется новый раздел — автоматический расчёт строительных смет. Пользователь загружает проектную документацию (PDF/ZIP/Excel), система распознаёт спецификации, подбирает цены и выдаёт готовую смету в Excel.

Весь backend-функционал (API, обработка файлов, генерация Excel) работает на **отдельном сервере** (`72.56.111.111`). На стороне hvac-info.com нужно только **настроить проксирование** и, при желании, **встроить ссылку** в навигацию существующего портала.

## Что нужно сделать

### 1. Nginx — добавить два location

В конфигурацию nginx сервера hvac-info.com (`72.56.80.247`) добавить:

```nginx
# =============================================
# Портал расчёта смет — React SPA
# =============================================
location /smeta/ {
    proxy_pass http://72.56.111.111:3002/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Security: access_token в URL не должен утекать через Referer
    add_header Referrer-Policy "no-referrer" always;
}

# =============================================
# API для портала смет — проксируем на backend
# =============================================
location /api/public/ {
    proxy_pass http://72.56.111.111:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # Лимит на загрузку файлов (макс 200 МБ на запрос)
    client_max_body_size 200M;

    # Таймаут — обработка файлов может занять до 5 мин
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
}
```

**Расположение**: эти location'ы должны быть **внутри** существующего server-блока для `hvac-info.com`, не конфликтуя с остальными location'ами портала.

**Важно**: порядок location'ов в nginx — `/smeta/` и `/api/public/` не пересекаются с существующими путями.

### 2. Проверить что proxy_pass работает

После добавления:

```bash
# Проверить синтаксис
nginx -t

# Перезагрузить
nginx -s reload
```

Проверка:

```bash
# SPA должен ответить HTML
curl -I https://hvac-info.com/smeta/

# API должен ответить JSON
curl https://hvac-info.com/api/public/v1/verify-email/ \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"email": "test@test.com"}'
```

Ожидаемый результат:
- `/smeta/` → 200, HTML-страница
- `/api/public/v1/verify-email/` → 200 или 429 (rate limit), JSON

### 3. (Опционально) Ссылка в навигации hvac-info.com

Если нужно — добавить пункт в меню/навигацию существующего портала:

```
Расчёт сметы → /smeta/
```

Это обычная ссылка (не SPA-роутинг), т.к. `/smeta/` — отдельное React-приложение.

### 4. (Опционально) SSL

Если hvac-info.com уже на HTTPS (Let's Encrypt / Cloudflare) — ничего дополнительного не нужно, proxy_pass на HTTP-backend работает через nginx.

Если HTTPS ещё нет — рекомендуем настроить (Let's Encrypt / certbot).

## Чего НЕ нужно делать

- **Не нужно** устанавливать Node.js, Python или Docker на 72.56.80.247
- **Не нужно** менять код фронтенда hvac-info.com (кроме опциональной ссылки)
- **Не нужно** создавать базы данных или сервисы
- **Не нужно** открывать дополнительные порты на файрволе (только исходящий трафик на 72.56.111.111:3002 и :8000)

## Схема работы

```
Пользователь
     │
     ▼
hvac-info.com (72.56.80.247)
     │
     ├── /smeta/*         → nginx proxy_pass → 72.56.111.111:3002  (React SPA)
     ├── /api/public/*    → nginx proxy_pass → 72.56.111.111:8000  (Django API)
     └── остальные пути   → существующий портал hvac-info.com
```

## Контакты

При вопросах обращаться к ____________________ (ответственный за ERP-сервер 72.56.111.111).

## Чеклист выполнения

- [ ] Добавлен `location /smeta/` в nginx
- [ ] Добавлен `location /api/public/` в nginx
- [ ] `nginx -t` проходит без ошибок
- [ ] `nginx -s reload` выполнен
- [ ] `curl -I https://hvac-info.com/smeta/` → 200
- [ ] `curl https://hvac-info.com/api/public/v1/verify-email/ -X POST -H "Content-Type: application/json" -d '{"email":"test@test.com"}'` → JSON-ответ
- [ ] (Опционально) Ссылка «Расчёт сметы» добавлена в навигацию

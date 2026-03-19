# Публичный Портал Расчёта Смет — Полная Концепция

## Контекст

В рамках ERP-системы "Finans Assistant" уже реализованы мощные механизмы:
- LLM-парсинг документов (PDF/Excel/изображения) через GPT-4, Gemini, Grok
- Каталог товаров с 5-уровневым матчингом (точный → алиас → fuzzy → LLM → создание нового)
- Система смет (Estimate → Section → Subsection → Item) с двойным ценообразованием (закупка/продажа)
- Интеграции с поставщиками (Breez API, парсинг PDF-каталогов)
- Celery + Redis для асинхронной обработки

**Задача**: создать отдельный публичный портал на отдельном домене, где внешний пользователь загружает проектную документацию и получает готовую смету в Excel. Это потенциально самостоятельный SaaS-продукт.

---

## 1. Обзор системы

### Ключевые решения

- **Без регистрации**: пользователь загружает файлы, вводит email → получает ссылку на результат. Без пароля и личного кабинета (MVP).
- **Все типы документов**: PDF-спецификации (таблицы), полные проекты (чертежи + спецификации + ПЗ), Excel-ведомости.
- **Отдельный домен**: полностью независимый бренд и SSL. Фронтенд на отдельном домене, бэкенд — в текущем проекте.
- **RFQ-модели**: добавляются позже отдельной миграцией (Фаза 3).

### Воркфлоу: внешний пользователь

```
1. Заходит на hvac-info.com (отдельный домен)
2. Вводит email → получает OTP-код → подтверждает (верификация)
3. Загружает PDF/ZIP/Excel с проектной документацией
4. Вводит название проекта, компанию (БЕЗ регистрации)
5. Получает страницу статуса (/requests/{access_token})
   + email "Ваш запрос принят, ссылка на статус"
6. Видит прогресс обработки (адаптивный polling)
7. Получает email "Смета готова" (после проверки оператором или авто)
8. Скачивает Excel на странице статуса
9. Видит CTA "Хотите заказать? Оставьте заявку на звонок"
   → Оператор получает email → перезванивает
```

### Воркфлоу: оператор ERP

```
1. Получает email "Новый запрос на смету от ООО 'Строй' (3 файла)"
2. Система автоматически обрабатывает: парсинг → подбор → ценообразование
3. Получает email "Запрос #123 готов к проверке. 45 позиций, 30 точных, 10 аналогов, 5 не найдено"
4. Открывает запрос в ERP (раздел "Портал → Запросы")
5. Видит превью сметы (стандартный интерфейс Estimate в ERP):
   - Таблица позиций с match_status, confidence, ценами
   - Выделены аналоги (жёлтым) и не найденные (красным)
   - Может скорректировать: заменить товар, изменить цену, подобрать вручную
6. Нажимает "Подтвердить и отправить"
   → status = READY → Celery отправляет Excel + email клиенту → DELIVERED
7. (Опционально) Получает email "Клиент просит перезвонить по смете #123"
   → Звонит клиенту, обсуждает смету, оформляет заказ
```

### Что происходит внутри

```
Загрузка файлов
    │
    ▼
[1] Классификация документов (LLM)
    │   — Спецификация? Чертёж? Ведомость оборудования? ТЗ?
    │
    ▼
[2] Парсинг спецификаций (LLM Vision, постранично)
    │   — Извлечение: наименование, модель, бренд, ед.изм., кол-во, тех.характеристики
    │   — Результат: SpecificationItem (сырые данные из PDF, без цен)
    │
    ▼
[3] Создание внутренней сметы (Estimate)
    │   — SpecificationItem → Estimate → Section → Subsection → EstimateItem
    │   — EstimateItem = стандартная модель ERP, работает с существующим UI
    │
    ▼
[4] Подбор товаров (matcher = EstimateAutoMatcher(); matcher.match_prices(estimate))
    │   — Точные совпадения → основной раздел сметы
    │   — Аналоги (fuzzy/LLM) → раздел "Аналоги"
    │   — Не найдены → раздел "Требует уточнения"
    │
    ▼
[5] Подбор работ + ценообразование
    │   — matcher.match_works(estimate) → work_item + work_unit_price
    │   — material_unit_price = ЗАКУПОЧНАЯ цена (из SupplierProduct/ProductPriceHistory)
    │   — Наценка применяется при генерации Excel (см. 6.5), НЕ в модели
    │
    ▼
[6] Проверка оператором (настраиваемо: AUTO_APPROVE)
    │   — auto_approve=False (прод): status=REVIEW, оператор проверяет в ERP
    │   — auto_approve=True (dev): пропускаем, сразу к генерации
    │
    ▼
[7] Генерация Excel-сметы (из Estimate, не из SpecificationItem)
    │   — Наценка из PublicPricingConfig применяется ЗДЕСЬ (sale_price в Excel)
    │
    ▼
[8] Уведомление пользователя по email
    │
    ▼
[9] (Фаза 3) Запрос цен у поставщиков → обновление сметы
```

---

## 2. Архитектура

### 2.1 Разделение фронтенда и бэкенда

**Бэкенд остаётся в текущем проекте.** Новый Django-app НЕ создаётся — расширяем существующий `api_public`. Весь код бэкенда (модели, сервисы, Celery-задачи, API-эндпоинты) добавляется в `backend/api_public/`.

**Фронтенд портала интегрирован в основное Next.js приложение** (`frontend/app/public/`). Публичные страницы портала доступны через Next.js rewrites, API-запросы проксируются на бэкенд.

```
┌──────────────────────────────────────────────────────────────┐
│   Next.js 16 (frontend/)                                      │
│                                                               │
│   /erp/*          — ERP-панель (app/erp/)                     │
│   /smeta/*        — Публичный портал расчёта смет (app/public/)│
│                                                               │
│   Rewrites: /api/public/* → Django Backend                    │
└──────────┬───────────────────────────────────────┘
           │                                      │
           │ /api/public/v1/                      │ /api/v1/
           │ (nginx проксирует                    │
           │  на бэкенд ERP)                      │
           │                                      │
           ▼                                      ▼
┌──────────────────────────────────────────────────────────────┐
│              Django Backend (текущий проект)                   │
│              Один сервер, одна база данных                     │
│                                                               │
│  ┌──────────────┐  ┌──────────┐  ┌────────┐  ┌───────────┐  │
│  │ api_public   │  │ payments │  │catalog │  │ estimates  │  │
│  │ (расширяем)  │──│          │──│        │──│            │  │
│  └──────────────┘  └──────────┘  └────────┘  └───────────┘  │
│       │                                                       │
│  ┌────▼────┐  ┌──────────┐  ┌───────────────────────┐       │
│  │ Celery  │  │llm_serv. │  │supplier_integrations  │       │
│  │ Tasks   │──│(парсинг) │──│(каталоги поставщиков) │       │
│  └─────────┘  └──────────┘  └───────────────────────┘       │
│                                                               │
│  ┌──────────────────────────────────────────────────┐        │
│  │        PostgreSQL (единая база данных)            │        │
│  └──────────────────────────────────────────────────┘        │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 Принцип ERP-first

**ВСЯ бизнес-логика реализуется как сервисы в ERP-приложениях**, которые используются:
1. **Внутри ERP** — сметчиком/оператором при работе со сметами
2. **Публичным порталом** — через те же самые сервисы, без дублирования кода

| Сервис | Сигнатура | Где живёт в ERP | Кто использует |
|--------|-----------|-----------------|----------------|
| `EstimateAutoMatcher` | `matcher = EstimateAutoMatcher()` | `estimates/services/estimate_auto_matcher.py` | ERP + Портал |
| `matcher.match_prices(estimate)` | → Dict (matched, skipped) | там же | ERP + Портал |
| `matcher.match_works(estimate, price_list_id=None)` | → Dict | там же | ERP + Портал |
| `matcher.auto_fill(estimate, price_list_id=None)` | → Dict (prices + works) | там же | ERP + Портал |
| `ProductMatcher().find_or_create_product(name, unit, use_llm)` | → (Product, created) | `catalog/services/product_matcher.py` | ERP + Портал |
| `InvoiceService.recognize()` | | `payments/services.py` | ERP + RFQ ответы |
| `SpecificationParser` (НОВЫЙ) | | `llm_services/services/specification_parser.py` | ERP + Портал |
| `SpecificationItem` (НОВАЯ МОДЕЛЬ) | | `estimates/models.py` | ERP + Портал |
| `RFQService` (НОВЫЙ, Фаза 3) | | `estimates/services/` | ERP + Портал |
| `EstimateExcelExporter` (НОВЫЙ) | | `estimates/services/` | ERP + Портал |

**Портал добавляет только**: модели запроса (EstimateRequest, файлы, конфиги), API-эндпоинты, Celery-оркестратор, React-фронтенд. Модель `SpecificationItem` живёт в `estimates/` (не в `api_public/`), потому что используется и для внутреннего импорта спецификаций в ERP.

### 2.3 Почему именно так

| Вопрос | Решение | Причина |
|--------|---------|---------|
| Где бэкенд? | В текущем проекте | Нужен доступ ко всем моделям, сервисам, каталогу, ценам. Отдельный бэкенд = дублирование. |
| Где фронтенд? | Отдельный домен | Независимый бренд, не связан визуально с ERP. |
| Новый Django-app? | Нет, расширяем `api_public` | Уже есть заглушки: `APIKeyAuthentication`, `PublicProductSerializer`, URL-неймспейс. |
| Общая БД? | Да, PostgreSQL | Единый каталог товаров, единая история цен, единые поставщики. |
| Отдельные воркеры Celery? | Нет, общий пул | Один Redis, один набор воркеров. При необходимости — отдельная очередь `public_tasks`. |

### 2.4 Инфраструктура: nginx портала

```nginx
# nginx.conf для smeta-portal.ru
server {
    listen 80;
    server_name smeta-portal.ru;

    # Фронтенд (React SPA)
    location / {
        root /usr/share/nginx/html;
        try_files $uri $uri/ /index.html;
    }

    # API — проксируем на бэкенд ERP
    location /api/public/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Увеличенные лимиты для загрузки файлов
        client_max_body_size 200M;
        proxy_read_timeout 300s;
    }

    # Файлы: НЕ проксируем MinIO напрямую!
    # Скачивание идёт через Django-эндпоинт GET /api/public/v1/.../download/
    # который проверяет access_token и возвращает 302 redirect на presigned URL MinIO.
    # Presigned URL живёт 1 час, содержит подпись — без неё доступ невозможен.
    # MinIO порт 9000 НЕ открыт наружу (только внутренняя Docker-сеть).
}
```

### 2.5 Docker-сервисы (дополнение к docker-compose.yml)

```yaml
portal:
  build:
    context: ./portal
    dockerfile: Dockerfile
  ports:
    - "3002:80"
  depends_on:
    - backend
  environment:
    - API_BASE_URL=http://backend:8000
  restart: unless-stopped
```

### 2.6 CORS-настройки бэкенда

**ВАЖНО**: в текущих настройках `CORS_ALLOW_ALL_ORIGINS = True` (dev-режим). Это перебивает любой список `CORS_ALLOWED_ORIGINS`. Перед деплоем портала необходимо:

1. Убедиться, что на продакшене `CORS_ALLOW_ALL_ORIGINS = False`
2. Добавить домен портала в `CORS_ALLOWED_ORIGINS`

```python
# settings.py — ПРОДАКШЕН (CORS_ALLOW_ALL_ORIGINS = False!)
CORS_ALLOWED_ORIGINS = [
    f"https://{PRODUCTION_DOMAIN}",  # текущий ERP-фронтенд
    "https://smeta-portal.ru",       # публичный портал
    "http://localhost:3002",         # dev-режим портала
]
```

### 2.7 Файловое хранилище (MinIO/S3)

Файлы портала хранятся в MinIO (S3-совместимое хранилище).

**ВАЖНО**: НЕ менять `DEFAULT_FILE_STORAGE` — это сломает все существующие FileField в ERP (счета, каталоги, аватарки). Вместо этого — **отдельный storage backend** только для портала:

```python
# settings.py — НЕ трогаем DEFAULT_FILE_STORAGE!

# Отдельный storage для публичного портала
PORTAL_FILE_STORAGE = {
    'BACKEND': 'storages.backends.s3boto3.S3Boto3Storage',
    'OPTIONS': {
        'bucket_name': 'portal-estimates',
        'endpoint_url': 'http://minio:9000',
        'access_key': '...',
        'secret_key': '...',
        'default_acl': 'private',  # файлы НЕ публичные
        'querystring_auth': True,  # presigned URLs
        'querystring_expire': 3600,  # URL живёт 1 час
    },
}

# Использование в моделях портала:
from django.core.files.storage import storages

class EstimateRequestFile(TimestampedModel):
    file = models.FileField(
        upload_to='uploads/',
        storage=storages['portal'],  # <-- отдельный storage
    )

class EstimateRequest(TimestampedModel):
    result_excel_file = models.FileField(
        upload_to='results/',
        storage=storages['portal'],
        null=True, blank=True,
    )

# settings.py — STORAGES dict (Django 4.2+)
STORAGES = {
    'default': {
        'BACKEND': 'django.core.files.storage.FileSystemStorage',
    },
    'portal': PORTAL_FILE_STORAGE,
    'staticfiles': {
        'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage',
    },
}
```

**Зависимость**: `django-storages[boto3]` — **отсутствует** в текущем `requirements.txt`. Необходимо добавить:
```
# requirements.txt — добавить:
django-storages[boto3]>=1.14.0
```

**Примечание**: сейчас MinIO используется только для worklog через собственную реализацию (`WORKLOG_S3_*` настройки в settings.py, прямые вызовы boto3). Портал будет первым потребителем `django-storages`. Нужно проверить, что `django-storages` корректно работает с существующим MinIO-инстансом (тот же endpoint, но другой bucket).

Почему отдельный storage: при 200МБ на запрос и 10 запросов/день, локальный диск заполнится за месяц (60ГБ). MinIO масштабируется, поддерживает lifecycle-политики для автоудаления старых файлов. А существующие файлы ERP остаются на локальном диске без миграции.

### 2.8 Celery-очередь для публичных задач

Публичные запросы обрабатываются в **отдельной очереди** `public_tasks`, чтобы не блокировать внутренние задачи ERP.

**ВАЖНО**: текущий глобальный `CELERY_TASK_TIME_LIMIT = 300` (5 мин) недостаточен для публичных задач. Обработка 100 страниц PDF = 10-30 мин LLM-вызовов + матчинг. Таймаут задаётся **в декораторе задачи**, не меняя глобальный лимит:

```python
# settings.py — Celery routes
CELERY_TASK_ROUTES = {
    'api_public.tasks.*': {'queue': 'public_tasks'},
}

# НЕ менять CELERY_TASK_TIME_LIMIT — он остаётся 300 сек для внутренних задач ERP.
# Для публичных задач таймаут задаётся в декораторе:
#
# @shared_task(
#     bind=True, max_retries=2, queue='public_tasks',
#     soft_time_limit=3600,   # 60 мин — SoftTimeLimitExceeded (можно обработать)
#     time_limit=3900,        # 65 мин — жёсткий kill (запас на graceful shutdown)
# )

# Ограничение конкурентности: макс 2 одновременных задачи
# (чтобы не перегружать LLM API rate limits)
# celery -A finans_assistant worker -Q public_tasks --concurrency=2
```

### 2.9 Лимиты LLM-обработки

Обработка одной страницы = 1 LLM Vision вызов (классификация) + 1 вызов (извлечение). Стоимость: ~$0.05-0.10 за страницу.

| Параметр | Лимит | Причина |
|----------|-------|---------|
| Max страниц на запрос | 100 | Стоимость: 100 × $0.10 = $10 макс |
| Max файлов на запрос | 20 | Разумный объём проекта |
| Max размер одного файла | 50МБ | nginx + Django |
| Max суммарный размер | 200МБ | Защита от злоупотреблений |
| LLM-провайдер для портала | Gemini Flash (дешевле) | GPT-4 Vision = $0.10/стр, Gemini Flash = $0.01/стр |

Трекинг стоимости: в `EstimateRequest` добавить `llm_cost = DecimalField` — сумма стоимости всех LLM-вызовов для запроса.

### 2.10 Стратегия partial success при парсинге

Большой PDF (100 страниц) не должен падать целиком из-за ошибки на одной странице. Стратегия обработки ошибок — **пофайловая и постраничная**:

```
Обработка файлов
│
├── Файл 1 (30 стр.)
│   ├── Страница 1 — OK → SpecificationItem[]
│   ├── Страница 2 — LLM rate limit → retry 3 раза → OK
│   ├── Страница 3 — LLM timeout → retry 3 раза → SKIP
│   │   → EstimateRequestFile.parse_error += "Стр.3: timeout после 3 попыток\n"
│   ├── ...
│   └── Страница 30 — OK
│   → parse_status = PARTIAL (если были пропущенные страницы)
│   → parse_status = DONE (если все страницы OK)
│
├── Файл 2 — нераспознаваемый формат → parse_status = ERROR
│
└── Файл 3 — OK → parse_status = DONE

Итог:
  - Если хотя бы 1 файл с DONE/PARTIAL → продолжаем пайплайн (создание Estimate, матчинг)
  - Если ВСЕ файлы ERROR → status = ERROR, сообщение оператору
  - PARTIAL файлы помечаются в уведомлении оператору:
    "Файл 'spec_ov.pdf': распознано 28 из 30 страниц (стр. 3, 17 — пропущены)"
```

Добавить `ParseStatus.PARTIAL = 'partial', 'Частично обработан'` в `EstimateRequestFile.ParseStatus`.

### 2.11 Email-инфраструктура

**Проверить перед началом**: наличие SMTP-конфигурации в `settings.py`. Необходимо:
- `EMAIL_BACKEND` = `'django.core.mail.backends.smtp.EmailBackend'`
- `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`
- `DEFAULT_FROM_EMAIL` — адрес отправителя (например, `noreply@smeta-portal.ru`)

Если email сейчас работает только через Telegram-бот — это отдельная задача настройки SMTP до начала разработки портала.

---

## 3. Модели данных

**Размещение моделей** (принцип ERP-first):

| Модель | Файл | Почему здесь |
|--------|------|-------------|
| `SpecificationItem` | `estimates/models.py` | Используется и для внутреннего импорта спецификаций в ERP, и для портала |
| `EstimateRequest`, `EstimateRequestFile`, `EstimateRequestVersion` | `api_public/models.py` | Специфичны для портала |
| `PublicPortalConfig`, `PublicPricingConfig`, `CallbackRequest` | `api_public/models.py` | Специфичны для портала |
| RFQ-модели (Фаза 3) | `estimates/models.py` | Используются и для внутренних смет ERP |

Все наследуют `TimestampedModel`.

### 3.1 Модель пользователя — НЕ нужна (MVP без регистрации)

В MVP нет регистрации/авторизации. Пользователь просто вводит email при создании запроса. Email хранится в `EstimateRequest.email`. Это максимально снижает порог входа.

**В будущем** (Фаза 2+), если понадобится личный кабинет с историей запросов — добавим PublicUser отдельной миграцией.

**Rate limiting** реализуется на уровне IP + email через Django Throttling (без модели пользователя).

### 3.2 EstimateRequest — Запрос на расчёт сметы

```python
class EstimateRequest(TimestampedModel):
    """Публичный запрос на расчёт сметы. Создаётся при загрузке файлов на портале."""

    class Status(models.TextChoices):
        UPLOADED   = 'uploaded',   'Файлы загружены'
        PARSING    = 'parsing',    'Парсинг документов'
        MATCHING   = 'matching',   'Подбор товаров'
        REVIEW     = 'review',     'На проверке оператором'
        RFQ_SENT   = 'rfq_sent',   'Запросы поставщикам'
        READY      = 'ready',      'Смета готова'
        DELIVERED  = 'delivered',  'Отправлена клиенту'
        ERROR      = 'error',      'Ошибка'

    # Контакт (без регистрации)
    email = models.EmailField(verbose_name='Email заказчика')
    contact_name = models.CharField(max_length=255, blank=True, verbose_name='Контактное лицо')
    company_name = models.CharField(max_length=255, blank=True, verbose_name='Компания')
    phone = models.CharField(max_length=50, blank=True, verbose_name='Телефон')

    # Токен доступа (вместо авторизации)
    # Генерируется при создании: secrets.token_urlsafe(48)
    # Используется в URL: /requests/{access_token}/
    access_token = models.CharField(max_length=64, unique=True, db_index=True)

    # Проект
    project_name = models.CharField(max_length=255, verbose_name='Название проекта')
    project_description = models.TextField(blank=True, verbose_name='Описание проекта')

    # Статус
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.UPLOADED
    )
    error_message = models.TextField(blank=True, verbose_name='Сообщение об ошибке')

    # Связь с внутренней сметой ERP (создаётся в процессе обработки)
    estimate = models.ForeignKey(
        'estimates.Estimate', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='public_requests'
    )

    # Результат
    result_excel_file = models.FileField(
        upload_to='public_estimates/results/', null=True, blank=True
    )

    # Celery task tracking
    task_id = models.CharField(max_length=255, blank=True)

    # Статистика обработки (обновляется по мере работы пайплайна)
    total_files = models.PositiveIntegerField(default=0)
    processed_files = models.PositiveIntegerField(default=0)
    total_spec_items = models.PositiveIntegerField(default=0)
    matched_exact = models.PositiveIntegerField(default=0)
    matched_analog = models.PositiveIntegerField(default=0)
    unmatched = models.PositiveIntegerField(default=0)

    # Проверка оператором
    reviewed_by = models.ForeignKey(
        'auth.User', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='reviewed_public_requests',
        verbose_name='Проверил'
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)

    # Трекинг
    notification_sent = models.BooleanField(default=False)
    downloaded_at = models.DateTimeField(null=True, blank=True, verbose_name='Когда скачан')
    llm_cost = models.DecimalField(
        max_digits=8, decimal_places=4, default=0,
        verbose_name='Стоимость LLM-обработки ($)'
    )

    # Срок жизни ссылки
    expires_at = models.DateTimeField(null=True, blank=True)
    # По умолчанию = created_at + 30 дней

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Публичный запрос сметы'
        verbose_name_plural = 'Публичные запросы смет'

    def save(self, *args, **kwargs):
        if not self.access_token:
            import secrets
            self.access_token = secrets.token_urlsafe(48)
        if not self.expires_at:
            from django.utils import timezone
            from datetime import timedelta
            self.expires_at = timezone.now() + timedelta(days=30)
        super().save(*args, **kwargs)

    @property
    def is_expired(self):
        from django.utils import timezone
        return self.expires_at and timezone.now() > self.expires_at

    @property
    def progress_percent(self):
        """Монотонный прогресс обработки для отображения на фронте.

        Шкала:
          uploaded:  5%
          parsing:   5-40%  (по файлам)
          matching: 40-75%  (по позициям)
          review:   80%     (ждём оператора)
          ready:    100%
          delivered: 100%
        """
        if self.status == 'error':
            return 0
        if self.status in ('ready', 'delivered'):
            return 100
        if self.status == 'review':
            return 80
        if self.status == 'rfq_sent':
            return 85
        if self.status == 'parsing' and self.total_files > 0:
            file_progress = self.processed_files / self.total_files
            return int(5 + file_progress * 35)  # 5% — 40%
        if self.status == 'matching' and self.total_spec_items > 0:
            matched = self.matched_exact + self.matched_analog + self.unmatched
            match_progress = matched / self.total_spec_items
            return int(40 + match_progress * 35)  # 40% — 75%
        status_base = {
            'uploaded': 5, 'parsing': 5, 'matching': 40,
        }
        return status_base.get(self.status, 0)
```

### 3.3 EstimateRequestFile — Загруженный файл

```python
class EstimateRequestFile(TimestampedModel):
    """Отдельный файл в составе запроса на смету"""

    class FileType(models.TextChoices):
        SPECIFICATION = 'spec',    'Спецификация'
        EQUIPMENT     = 'equip',   'Ведомость оборудования'
        DRAWING       = 'drawing', 'Чертёж'
        EXCEL         = 'excel',   'Excel-ведомость'
        OTHER         = 'other',   'Другое'

    class ParseStatus(models.TextChoices):
        PENDING  = 'pending',  'Ожидает'
        PARSING  = 'parsing',  'Обрабатывается'
        DONE     = 'done',     'Готово'
        PARTIAL  = 'partial',  'Частично обработан'  # часть страниц пропущена (см. 2.10)
        SKIPPED  = 'skipped',  'Пропущен (не спецификация)'
        ERROR    = 'error',    'Ошибка'

    request = models.ForeignKey(
        EstimateRequest, on_delete=models.CASCADE, related_name='files'
    )
    file = models.FileField(upload_to='public_estimates/uploads/')
    original_filename = models.CharField(max_length=255)
    file_type = models.CharField(
        max_length=20, choices=FileType.choices, default=FileType.OTHER
    )
    file_size = models.PositiveIntegerField(default=0)  # bytes

    # Результат парсинга
    parsed_data = models.JSONField(null=True, blank=True)  # сырой вывод LLM
    parse_status = models.CharField(
        max_length=20, choices=ParseStatus.choices, default=ParseStatus.PENDING
    )
    parse_error = models.TextField(blank=True)
    pages_total = models.PositiveIntegerField(default=0)
    pages_processed = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['created_at']
        verbose_name = 'Файл запроса'
        verbose_name_plural = 'Файлы запросов'
```

### 3.4 SpecificationItem — Сырые данные из спецификации

**Размещение**: `backend/estimates/models.py` (НЕ в `api_public/`!). Причина: используется и для внутренней фичи ERP "Импорт из спецификации" (Неделя 1-2), и для публичного портала. Если разместить в `api_public`, ERP-фича будет зависеть от портального приложения — нарушение ERP-first.

**ВАЖНО**: SpecificationItem — это **временная staging-модель** для хранения сырых данных, извлечённых LLM из PDF/Excel. Она НЕ содержит цен и НЕ является источником для генерации Excel.

После парсинга данные из SpecificationItem **трансформируются** в стандартные `EstimateItem` (модель ERP) через создание `Estimate`. Вся дальнейшая работа (подбор товаров, ценообразование, корректировка оператором, Excel-экспорт) происходит с `EstimateItem`.

```python
class SpecificationItem(TimestampedModel):
    """Сырая позиция, извлечённая LLM из спецификации проекта.

    Жизненный цикл:
    1. Создаётся при парсинге PDF/Excel (этап [2])
    2. Дедупликация (группировка по name+model+brand, суммирование quantity)
    3. Трансформация в EstimateItem при создании Estimate (этап [3])
    4. После создания Estimate — используется только для аудита/отладки

    НЕ содержит цен — цены живут в EstimateItem.
    """

    # Cross-app FK: модель живёт в estimates, но ссылается на api_public.EstimateRequest
    request = models.ForeignKey(
        'api_public.EstimateRequest', on_delete=models.CASCADE, related_name='spec_items'
    )
    source_file = models.ForeignKey(
        'api_public.EstimateRequestFile', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='spec_items'
    )

    # Данные из спецификации (заполняются при парсинге LLM)
    name = models.CharField(max_length=500, verbose_name='Наименование')
    model_name = models.CharField(
        max_length=300, blank=True, verbose_name='Модель/артикул'
    )
    brand = models.CharField(max_length=255, blank=True, verbose_name='Бренд/производитель')
    unit = models.CharField(max_length=50, default='шт', verbose_name='Единица измерения')
    quantity = models.DecimalField(
        max_digits=14, decimal_places=3, default=1, verbose_name='Количество'
    )
    tech_specs_raw = models.TextField(
        blank=True, verbose_name='Тех. характеристики (из документа)'
    )
    section_name = models.CharField(
        max_length=255, blank=True,
        verbose_name='Раздел проекта',
        help_text='ОВ, ВК, ЭО, АР, КР и т.д.'
    )

    # Страница в документе (для отладки)
    page_number = models.PositiveIntegerField(default=0, verbose_name='Страница в документе')

    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['sort_order', 'created_at']
        verbose_name = 'Позиция спецификации (сырые данные)'
        verbose_name_plural = 'Позиции спецификации (сырые данные)'
```

### 3.5 Трансформация: SpecificationItem → Estimate → EstimateItem

Это ключевой этап пайплайна. После парсинга всех файлов создаётся внутренняя смета ERP.

**Размещение функции**: `backend/estimates/services/specification_transformer.py` — рядом с `estimate_auto_matcher.py`. Это ERP-сервис, не функция портала.

```python
def create_estimate_from_spec_items(request: EstimateRequest) -> Estimate:
    """
    Трансформирует сырые SpecificationItem в стандартную Estimate ERP.

    1. Создаёт Estimate (связывает с EstimateRequest)
    2. Группирует SpecificationItem по section_name → EstimateSection
    3. Создаёт EstimateSubsection (по умолчанию одна на секцию)
    4. Для каждого SpecificationItem → EstimateItem:
       - name → EstimateItem.name
       - model_name → EstimateItem.model_name
       - unit → EstimateItem.unit
       - quantity → EstimateItem.quantity
       - name → EstimateItem.original_name (сохраняем оригинал)
       - brand → EstimateItem.custom_data['brand']
       - tech_specs_raw → EstimateItem.custom_data['tech_specs']
    """
    estimate = Estimate.objects.create(
        name=f"Портал: {request.project_name}",
        customer_name=request.company_name or request.email,
        status='draft',
    )
    request.estimate = estimate
    request.save(update_fields=['estimate'])

    # Группировка по разделам
    sections = {}
    for item in request.spec_items.order_by('sort_order'):
        section_key = item.section_name or 'Общее'
        if section_key not in sections:
            sections[section_key] = EstimateSection.objects.create(
                estimate=estimate,
                name=section_key,
                sort_order=len(sections),
            )

        section = sections[section_key]
        subsection = section.subsections.first()
        if not subsection:
            subsection = EstimateSubsection.objects.create(
                section=section, name='Оборудование', sort_order=0,
            )

        EstimateItem.objects.create(
            estimate=estimate,
            section=section,
            subsection=subsection,
            name=item.name,
            model_name=item.model_name,
            unit=item.unit,
            quantity=item.quantity,
            original_name=item.name,
            custom_data={
                'brand': item.brand,
                'tech_specs': item.tech_specs_raw,
                'source_spec_item_id': item.id,
            },
        )

    return estimate
```

**После этого шага** все операции (подбор товаров, ценообразование, корректировка оператором, Excel-экспорт) работают со стандартными `EstimateItem` через существующие ERP-сервисы. Оператор видит смету в привычном интерфейсе ERP.

```
SpecificationItem (raw)          EstimateItem (рабочий)
┌──────────────────┐             ┌──────────────────────────────────┐
│ name             │──────────→  │ name, original_name              │
│ model_name       │──────────→  │ model_name                       │
│ brand            │──────────→  │ custom_data['brand']             │
│ unit, quantity   │──────────→  │ unit, quantity                   │
│ tech_specs_raw   │──────────→  │ custom_data['tech_specs']        │
│ section_name     │──────────→  │ section.name                     │
│                  │             │                                    │
│ (нет цен)        │             │ material_unit_price ← подбор      │
│ (нет product FK) │             │ work_unit_price    ← подбор      │
│ (нет work_item)  │             │ product FK         ← подбор      │
│                  │             │ work_item FK       ← подбор      │
│                  │             │ is_analog          ← подбор      │
│                  │             │ analog_reason      ← подбор      │
└──────────────────┘             └──────────────────────────────────┘
     staging                          единый источник правды
```

### 3.6 PublicPortalConfig — Настройки портала (singleton)

```python
class PublicPortalConfig(TimestampedModel):
    """Глобальные настройки публичного портала. Одна запись в БД (singleton)."""

    auto_approve = models.BooleanField(
        default=False,
        verbose_name='Автоматическая отправка',
        help_text='True = сметы отправляются клиенту без проверки оператором. '
                  'False = оператор проверяет перед отправкой.'
    )
    operator_emails = models.TextField(
        verbose_name='Email операторов',
        help_text='Через запятую. Все получают уведомления о новых запросах, ошибках, callback-заявках. '
                  'Пример: operator1@company.ru, operator2@company.ru'
    )

    @property
    def operator_email_list(self):
        """Список email операторов для send_mail."""
        return [e.strip() for e in self.operator_emails.split(',') if e.strip()]
    max_pages_per_request = models.PositiveIntegerField(
        default=100, verbose_name='Макс. страниц на запрос'
    )
    max_files_per_request = models.PositiveIntegerField(
        default=20, verbose_name='Макс. файлов на запрос'
    )
    link_expiry_days = models.PositiveIntegerField(
        default=30, verbose_name='Срок жизни ссылки (дней)'
    )
    company_phone = models.CharField(
        max_length=50, blank=True, verbose_name='Телефон компании (для CTA)'
    )

    class Meta:
        verbose_name = 'Настройки портала'
        verbose_name_plural = 'Настройки портала'

    def save(self, *args, **kwargs):
        # Singleton: всегда id=1
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def get(cls):
        """Получить или создать единственную запись конфигурации.

        Используем first() + create() вместо get_or_create(pk=1),
        чтобы защититься от случайного создания записи с pk!=1 через Django Admin.
        """
        obj = cls.objects.first()
        if not obj:
            obj = cls.objects.create(
                operator_emails='',
                auto_approve=False,
            )
        return obj
```

### 3.7 PublicPricingConfig — Настройки наценки

```python
class PublicPricingConfig(TimestampedModel):
    """Наценка для публичных смет.

    Можно задать наценку по умолчанию (category=NULL, is_default=True)
    и отдельные наценки для конкретных категорий.
    """
    category = models.ForeignKey(
        'catalog.Category', on_delete=models.CASCADE,
        null=True, blank=True, related_name='public_pricing_configs',
        verbose_name='Категория',
        help_text='NULL = наценка по умолчанию'
    )
    markup_percent = models.DecimalField(
        max_digits=5, decimal_places=2, default=30.00,
        verbose_name='Наценка (%)'
    )
    is_default = models.BooleanField(
        default=False,
        verbose_name='По умолчанию',
        help_text='Только одна запись может быть default'
    )

    class Meta:
        verbose_name = 'Настройка наценки'
        verbose_name_plural = 'Настройки наценок'
        constraints = [
            models.UniqueConstraint(
                fields=['category'],
                condition=models.Q(category__isnull=False),
                name='unique_category_pricing'
            ),
        ]

    @classmethod
    def get_markup(cls, category=None):
        """Получить наценку для категории. Каскад: категория → родитель → default."""
        if category:
            try:
                return cls.objects.get(category=category).markup_percent
            except cls.DoesNotExist:
                # Попробовать родительскую категорию
                if category.parent:
                    return cls.get_markup(category.parent)
        # Default
        try:
            return cls.objects.get(is_default=True).markup_percent
        except cls.DoesNotExist:
            return Decimal('30.00')
```

### 3.8 CallbackRequest — Заявка на звонок менеджера

```python
class CallbackRequest(TimestampedModel):
    """Заявка на обратный звонок от клиента портала.
    Создаётся через CTA 'Хотите заказать? Оставьте заявку на звонок'.
    """
    class Status(models.TextChoices):
        NEW       = 'new',       'Новая'
        IN_PROGRESS = 'in_progress', 'В работе'
        COMPLETED = 'completed', 'Обработана'
        CANCELLED = 'cancelled', 'Отменена'

    request = models.ForeignKey(
        EstimateRequest, on_delete=models.CASCADE,
        related_name='callbacks',
        verbose_name='Запрос на смету'
    )
    phone = models.CharField(max_length=50, verbose_name='Телефон')
    preferred_time = models.CharField(
        max_length=100, blank=True,
        verbose_name='Удобное время для звонка'
    )
    comment = models.TextField(blank=True, verbose_name='Комментарий')
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.NEW
    )
    processed_by = models.ForeignKey(
        'auth.User', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='processed_callbacks',
        verbose_name='Обработал'
    )
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Заявка на звонок'
        verbose_name_plural = 'Заявки на звонок'
```

### 3.9 Модели RFQ-системы (Фаза 3 — отдельная миграция)

**Размещение**: `backend/estimates/models.py` (НЕ в api_public!) — RFQ-система используется и для внутренних смет ERP, и для портала. Это ERP-сервис, не функция портала.

**Как поставщики реально отвечают**: в строительной отрасли поставщики не заполняют формы в портале — они **выставляют счёт**. Поэтому ответ поставщика = загруженный счёт (PDF), который парсится существующим `InvoiceService.recognize()`.

```python
class SupplierContact(TimestampedModel):
    """Контакт поставщика для автоматической отправки запросов.
    Привязан к существующей модели Counterparty (поставщик в ERP).
    """
    counterparty = models.OneToOneField(
        'accounting.Counterparty', on_delete=models.CASCADE,
        related_name='rfq_contact'
    )
    rfq_email = models.EmailField(verbose_name='Email для запросов')
    contact_person = models.CharField(max_length=255, blank=True)
    phone = models.CharField(max_length=50, blank=True)
    is_active = models.BooleanField(default=True)
    auto_send = models.BooleanField(
        default=False,
        verbose_name='Автоматическая отправка',
        help_text='Отправлять запросы автоматически без подтверждения оператором'
    )
    categories = models.ManyToManyField(
        'catalog.Category', blank=True,
        verbose_name='Категории товаров',
        help_text='Какие категории поставляет. Пустое = все.'
    )
    avg_response_hours = models.PositiveIntegerField(
        default=48, verbose_name='Среднее время ответа (часы)'
    )


class RFQRequest(TimestampedModel):
    """Запрос ценового предложения.
    Может быть создан:
    - Автоматически при обработке публичного запроса (NOT_FOUND позиции)
    - Вручную оператором ERP для любой сметы
    """
    class Status(models.TextChoices):
        DRAFT    = 'draft',   'Черновик'
        SENT     = 'sent',    'Отправлен'
        RESPONDED = 'responded', 'Получен ответ (счёт)'
        PROCESSED = 'processed', 'Обработан'
        EXPIRED  = 'expired', 'Истёк'
        CANCELLED = 'cancelled', 'Отменён'

    # Связь с заказом (одно из двух):
    estimate_request = models.ForeignKey(
        'api_public.EstimateRequest', on_delete=models.CASCADE,
        null=True, blank=True, related_name='rfqs',
        verbose_name='Публичный запрос'
    )
    estimate = models.ForeignKey(
        'estimates.Estimate', on_delete=models.CASCADE,
        null=True, blank=True, related_name='rfqs',
        verbose_name='Внутренняя смета ERP'
    )

    supplier = models.ForeignKey(
        SupplierContact, on_delete=models.CASCADE, related_name='rfqs'
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    deadline = models.DateTimeField(verbose_name='Крайний срок ответа')
    sent_at = models.DateTimeField(null=True, blank=True)
    message = models.TextField(blank=True, verbose_name='Сообщение поставщику')

    # Ответ поставщика — это СЧЁТ (Invoice)
    response_invoice = models.ForeignKey(
        'payments.Invoice', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='rfq_source',
        verbose_name='Счёт-ответ от поставщика'
    )


class RFQItem(TimestampedModel):
    """Позиция в запросе — что именно просим у поставщика"""
    rfq = models.ForeignKey(RFQRequest, on_delete=models.CASCADE, related_name='items')

    # Связь с позицией сметы
    # ТОЛЬКО EstimateItem — SpecificationItem является staging-моделью
    # и не участвует в RFQ-процессе
    estimate_item = models.ForeignKey(
        'estimates.EstimateItem', on_delete=models.CASCADE,
        null=True, blank=True,
        verbose_name='Позиция сметы'
    )

    # Данные для запроса
    name = models.CharField(max_length=500, verbose_name='Наименование')
    model_name = models.CharField(max_length=300, blank=True)
    brand = models.CharField(max_length=255, blank=True)
    unit = models.CharField(max_length=50, default='шт')
    quantity = models.DecimalField(max_digits=14, decimal_places=3)
    tech_specs = models.TextField(blank=True)

    # После обработки ответа (счёта)
    response_price = models.DecimalField(
        max_digits=14, decimal_places=2, null=True, blank=True,
        verbose_name='Цена из счёта поставщика'
    )
    response_invoice_item = models.ForeignKey(
        'payments.InvoiceItem', on_delete=models.SET_NULL,
        null=True, blank=True,
        verbose_name='Позиция в счёте-ответе'
    )
```

---

## 4. Парсинг спецификаций

### 4.1 Отличие от парсинга счетов

Существующий `DocumentParser` (`llm_services/services/document_parser.py`) извлекает из счетов: номер, дату, поставщика, ИНН, позиции с ценами. Спецификации проектной документации — принципиально другой формат:

| Параметр | Счёт (Invoice) | Спецификация (Specification) |
|----------|----------------|------------------------------|
| Поставщик/покупатель | Есть | Нет |
| Цены | Есть | Нет |
| Тех. характеристики | Редко | Всегда |
| Бренд/модель | Иногда | Часто |
| Объём | 1-5 страниц | 10-200+ страниц |
| Структура | Табличная | Таблицы + текст + чертежи |
| Разделы | Нет | ОВ, ВК, ЭО, АР, КР |

### 4.2 Новый сервис: SpecificationParser

Размещение: `backend/llm_services/services/specification_parser.py` — рядом с существующим `DocumentParser` (парсер счетов). Оба используют LLM Vision, LLMProvider, тот же паттерн постраничной обработки.

Переиспользует паттерн постраничной обработки из `estimates/tasks.py` (`process_estimate_pdf_pages`).

**Этап 1: Классификация страницы (LLM Vision)**

```
Определи тип страницы проектной документации:
- "specification" — таблица спецификации/ведомости оборудования
- "drawing" — чертёж (может содержать экспликацию)
- "title" — титульный лист
- "toc" — оглавление
- "text" — пояснительная записка
- "other" — прочее

Верни JSON: {"page_type": "...", "section_name": "...", "has_table": bool}
```

Зачем: пропуск чертежей и титульных листов экономит LLM-токены и убирает шум.

**Этап 2: Извлечение позиций (LLM Vision, только для specification/equipment страниц)**

```
Ты — эксперт по строительным спецификациям и ведомостям оборудования.
Извлеки ВСЕ позиции оборудования/материалов со страницы.

Для каждой позиции:
- name: полное наименование
- model_name: модель/артикул (если указан)
- brand: производитель (если указан)
- unit: единица измерения (шт, м.п., м², комплект)
- quantity: количество
- tech_specs: технические характеристики (мощность, размер, диаметр и т.д.)
- section_name: раздел/система (ОВ, ВК, ЭО, АР и т.д.)

НЕ извлекай расходники без конкретной марки (саморезы, дюбели и т.п.).

JSON: {"items": [...], "continued_from_previous": bool}
```

**Этап 3: Парсинг Excel-ведомостей**

Переиспользуем паттерн из `estimates/services/estimate_import_service.py`:
1. Открываем workbook через openpyxl
2. Автодетект заголовков (ключевые слова: наименование, кол-во, ед.изм.)
3. Извлекаем строки → создаём SpecificationItem

### 4.3 Обработка ZIP-архивов (Фаза 1 — базовая, Фаза 2 — рекурсивная)

```
ZIP загрузка
    │
    ▼
Валидация (макс 500МБ распаковано, макс 100 файлов)
    │
    ▼
Распаковка во временную директорию
    │
    ▼
Фильтрация по расширению (.pdf, .xlsx, .xls, .png, .jpg)
    │
    ▼
Для каждого файла → создание EstimateRequestFile
    │
    ▼
Классификация каждого файла (LLM)
    │
    ▼
Обработка только specification/equipment/excel файлов
```

### 4.4 Дедупликация позиций (Фаза 1 — точная, Фаза 2 — нечёткая кросс-файловая)

Одна и та же позиция может встретиться на нескольких страницах или в нескольких файлах. Стратегия:
- Группируем по `normalized_name + model_name + brand`
- Если совпадение → суммируем quantity
- Если конфликт в unit → предупреждение оператору

---

## 5. Подбор товаров и аналогов (ДЕТАЛЬНО)

### 5.0 Архитектурный принцип: ERP-first

**ВСЯ логика подбора реализуется в ERP как сервисы, которые используются:**
- Внутри ERP — при создании смет оператором/сметчиком
- Публичным порталом — через те же самые сервисы

Публичный портал НЕ дублирует логику. Он вызывает `EstimateAutoMatcher` из `estimates/services/estimate_auto_matcher.py` — тот же код, что использует сметчик в ERP.

**Поток данных**:
```
SpecificationItem (raw)
    ↓ create_estimate_from_spec_items(request)
Estimate → Section → Subsection → EstimateItem
    ↓ matcher = EstimateAutoMatcher()
    ↓ matcher.match_prices(estimate)
EstimateItem.product, material_unit_price заполнены (ЗАКУПОЧНАЯ цена)
    ↓ matcher.match_works(estimate, price_list_id)
EstimateItem.work_item, work_unit_price заполнены
    ↓ EstimateExcelExporter(estimate).export_public()
      (наценка из PublicPricingConfig применяется ЗДЕСЬ, при генерации Excel,
       НЕ сохраняется в EstimateItem — см. раздел 6.5)
Excel-файл
```

Нового `PublicProductMatcherService` НЕ создаём — используем существующий `EstimateAutoMatcher().auto_fill(estimate)`.

### 5.1 Существующие ERP-сервисы (переиспользуем без изменений)

**Класс `EstimateAutoMatcher`** создаётся без аргументов: `matcher = EstimateAutoMatcher()`. Estimate передаётся в каждый метод:

| Вызов | Что делает | Файл |
|-------|-----------|------|
| `matcher.match_prices(estimate)` → Dict | Подбор товаров (ProductMatcher) + закупочных цен (ProductPriceHistory) для EstimateItem | `estimates/services/estimate_auto_matcher.py` |
| `matcher.match_works(estimate, price_list_id=None)` → Dict | Подбор работ (3-ярусный каскад) + стоимости работ для EstimateItem | там же |
| `matcher.auto_fill(estimate, price_list_id=None)` → Dict | Полный авто-подбор (цены + работы) в одну кнопку | там же |
| `EstimateAutoMatcher.record_manual_correction(product, work_item)` | Обучение системы от ручных корректировок (staticmethod) | там же |
| `ProductMatcher().find_or_create_product(name, unit, use_llm)` | 5-уровневый каскад поиска товаров | `catalog/services/product_matcher.py` |
| `ProductCategorizer` | LLM-категоризация новых товаров | `catalog/categorizer.py` |

**Для портала**: после создания `Estimate` из `SpecificationItem`, вызываем:
```python
matcher = EstimateAutoMatcher()
matcher.auto_fill(estimate)
```
— тот же код, что использует сметчик в ERP.

**Идемпотентность**: `match_prices()` фильтрует `product__isnull=True` (пропускает уже подобранные). Необходимо убедиться, что `match_works()` аналогично фильтрует `work_item__isnull=True`. Если нет — добавить фильтр при реализации.

### 5.2 Подбор товаров — пошаговый алгоритм

Для каждой позиции спецификации выполняется каскадный поиск. Каждый уровень — это fallback, если предыдущий не нашёл:

```
Позиция: "Вентилятор канальный Systemair K 200 M"
         brand="Systemair", model="K 200 M"

  ┌─────────────────────────────────────────────────────────┐
  │ УРОВЕНЬ 0: Поиск по бренд + модель в каталогах          │
  │ поставщиков (НОВЫЙ, специфичен для спецификаций)         │
  │                                                          │
  │ SupplierProduct.objects.filter(                          │
  │     Q(title__icontains="K 200 M") |                     │
  │     Q(articul__icontains="K 200 M"),                    │
  │     is_active=True                                       │
  │ )                                                        │
  │                                                          │
  │ Если нашли → match_status = EXACT, confidence = 0.95    │
  │ Цена берётся из SupplierProduct.ric_price               │
  └──────────────────────┬──────────────────────────────────┘
                         │ не нашли
                         ▼
  ┌─────────────────────────────────────────────────────────┐
  │ УРОВЕНЬ 1: Точное совпадение в каталоге Product         │
  │                                                          │
  │ normalized = Product.normalize_name("Вентилятор...")     │
  │ Product.objects.filter(normalized_name=normalized)       │
  │                                                          │
  │ Если нашли → match_status = EXACT, confidence = 1.0     │
  └──────────────────────┬──────────────────────────────────┘
                         │ не нашли
                         ▼
  ┌─────────────────────────────────────────────────────────┐
  │ УРОВЕНЬ 2: Поиск по алиасам (ProductAlias)              │
  │                                                          │
  │ ProductAlias.objects.filter(normalized_alias=normalized) │
  │                                                          │
  │ Алиасы создаются автоматически при fuzzy-совпадениях.   │
  │ "Вентилятор K200M" → алиас → "Вентилятор K 200 M"     │
  │                                                          │
  │ Если нашли → match_status = EXACT, confidence = 0.95    │
  └──────────────────────┬──────────────────────────────────┘
                         │ не нашли
                         ▼
  ┌─────────────────────────────────────────────────────────┐
  │ УРОВЕНЬ 3: Fuzzy-поиск (fuzzywuzzy.token_set_ratio)    │
  │                                                          │
  │ Для КАЖДОГО Product в каталоге:                         │
  │   score = fuzz.token_set_ratio(normalized, product.name)│
  │   score / 100 → confidence (0.0 — 1.0)                 │
  │                                                          │
  │ Результат по порогам:                                    │
  │ ≥ 0.95 → EXACT (автосоздание ProductAlias)              │
  │ 0.80-0.95 → кандидат для LLM-подтверждения (см. ур.4)  │
  │ 0.60-0.80 → кандидат-аналог (см. ур.4)                 │
  │ < 0.60 → не совпадает                                   │
  └──────────────────────┬──────────────────────────────────┘
                         │ нашли кандидатов 0.60-0.95
                         ▼
  ┌─────────────────────────────────────────────────────────┐
  │ УРОВЕНЬ 4: LLM-подтверждение (семантическое сравнение) │
  │                                                          │
  │ Берём ТОП-5 кандидатов, отправляем в LLM:              │
  │ "Одинаковые ли это товары?"                              │
  │ → {is_same: bool, confidence: float}                    │
  │                                                          │
  │ LLM confidence ≥ 0.8 + is_same=True:                   │
  │   → match_status = EXACT, создаём ProductAlias          │
  │                                                          │
  │ LLM confidence 0.6-0.8 + is_same=False:                │
  │   → match_status = ANALOG                                │
  │   → analog_reason = LLM объясняет отличия:             │
  │     "Отличается мощность: запрошено 3000 м³/ч,         │
  │      предложено 3500 м³/ч. Остальные параметры совпад." │
  └──────────────────────┬──────────────────────────────────┘
                         │ ничего не подошло
                         ▼
  ┌─────────────────────────────────────────────────────────┐
  │ УРОВЕНЬ 5: Создание нового товара                       │
  │                                                          │
  │ Product.objects.create(                                  │
  │     name="Вентилятор канальный Systemair K 200 M",      │
  │     status=NEW,  # требует верификации                   │
  │ )                                                        │
  │                                                          │
  │ match_status = NOT_FOUND                                 │
  │ → Позиция попадает в раздел "Требует уточнения"         │
  │ → В будущем: автоматический запрос поставщикам (RFQ)    │
  └─────────────────────────────────────────────────────────┘
```

### 5.3 Что такое "аналог" и как он определяется

Аналог — это товар, который **похож, но не идентичен** запрошенному. Система определяет аналоги на уровнях 3-4 каскада:

**Примеры аналогов:**

| Запрошено | Предложено | analog_reason |
|-----------|------------|---------------|
| Вентилятор K 200 M | Вентилятор K 250 M | Другой типоразмер: 200 → 250 мм |
| Клапан КВР 400×200 | Клапан КВР 500×200 | Ширина отличается: 400 → 500 мм |
| Кондиционер Daikin FTXB35C | Кондиционер Daikin FTXB35CV1B | Другая модификация серии |
| Воздуховод L=1500 | Воздуховод L=2000 | Другая длина: 1500 → 2000 мм |

**Когда товар НЕ является аналогом (создаётся новый):**

| Запрошено | Почему не аналог |
|-----------|-----------------|
| Тепловая завеса Ballu BHC-L10 | В каталоге нет тепловых завес вообще |
| Контроллер Carel pCO5 | Совершенно другой тип оборудования |

**Поле `is_analog` в EstimateItem:**
- `True` — оператор/система явно пометила как аналог
- `analog_reason` — обязательное обоснование (заполняется LLM или оператором)
- `original_name` — исходное наименование из спецификации (сохраняется для отчёта)

### 5.4 Классификация результатов в смете

| Секция в Excel | Критерий | Описание |
|---|---|---|
| **Основное оборудование** | match_status = EXACT, confidence ≥ 0.90 | Точно найдено в каталоге, цена определена |
| **Аналоги** | match_status = ANALOG, confidence 0.60-0.90 | Подобран похожий товар с обоснованием отличий |
| **Требует уточнения** | match_status = NOT_FOUND | Не найден в каталоге, цена неизвестна |

---

## 6. Подбор работ и стоимости монтажа (ДЕТАЛЬНО)

### 6.0 Как это работает в ERP уже сейчас

В ERP уже реализована полная система подбора работ: `EstimateAutoMatcher.match_works()`. Каждому товару в смете система подбирает соответствующую работу (монтаж, установка, прокладка и т.д.) и рассчитывает стоимость.

**Ключевые сущности:**

```
PriceList (Прайс-лист работ)
├── grade_1_rate = 400 ₽/ч    — ставка разнорабочего
├── grade_2_rate = 500 ₽/ч    — ставка монтажника
├── grade_3_rate = 600 ₽/ч    — ставка специалиста
├── grade_4_rate = 750 ₽/ч    — ставка мастера
├── grade_5_rate = 900 ₽/ч    — ставка ведущего специалиста
│
├── PriceListItem (связь работа ↔ прайс)
│   ├── work_item = FK(WorkItem)
│   ├── hours_override          — переопределить часы
│   ├── coefficient_override    — переопределить коэффициент
│   ├── grade_override          — переопределить разряд (дробный: 3.65)
│   └── calculated_cost = hours × coefficient × rate_for_grade
│
WorkItem (Вид работы)
├── article = "V-001"
├── name = "Монтаж вентилятора канального"
├── section = FK(WorkSection)     — раздел (Вентиляция, Кондиционирование)
├── unit = "шт"
├── hours = 2.5                   — нормативное время
├── coefficient = 1.2             — коэффициент сложности
├── required_grade = 3.65         — требуемый разряд (дробный!)
│
ProductWorkMapping (ОБУЧАЕМАЯ СВЯЗЬ товар ↔ работа)
├── product = FK(Product)
├── work_item = FK(WorkItem)
├── confidence = 0.5...1.0
├── source = MANUAL | RULE | LLM
├── usage_count = 1...N           — сколько раз использовано
```

### 6.1 Подбор работы — 3-ярусный алгоритм

Для каждого товара в смете (у которого уже подобран product, но нет work_item):

```
Позиция: product = "Вентилятор K 200 M" (category: ventilation_fans)

  ┌────────────────────────────────────────────────────────────┐
  │ ЯРУС 1: История (ProductWorkMapping)                       │
  │ Самый надёжный — основан на прошлых решениях сметчика      │
  │                                                             │
  │ ProductWorkMapping.objects.filter(                          │
  │     product=product,                                        │
  │     usage_count__gte=2    ← МИНИМУМ 2 использования!       │
  │ ).order_by('-usage_count', '-confidence').first()           │
  │                                                             │
  │ Если нашли:                                                 │
  │   work_item = mapping.work_item  ("Монтаж вентилятора")    │
  │   confidence = 0.9                                          │
  │                                                             │
  │ Почему usage_count ≥ 2: защита от случайных ошибок.        │
  │ Если сметчик 2+ раза связал "Вентилятор" → "Монтаж вент.",│
  │ значит это правильная связь.                                │
  └──────────────────────┬─────────────────────────────────────┘
                         │ не нашли
                         ▼
  ┌────────────────────────────────────────────────────────────┐
  │ ЯРУС 2: Правила (категория товара → раздел работ)          │
  │                                                             │
  │ product.category.code = "ventilation_fans"                 │
  │ Берём первые 4 символа: "vent"                             │
  │                                                             │
  │ WorkItem.objects.filter(                                    │
  │     is_current=True,                                        │
  │     section__code__icontains="vent"                         │
  │ )[:20]                                                      │
  │                                                             │
  │ Для каждого кандидата — fuzzy-сравнение названий:          │
  │   fuzz.token_set_ratio("вентилятор k 200", "монтаж вент.")│
  │   score ≥ 0.5 → кандидат                                   │
  │                                                             │
  │ Лучший кандидат → confidence = 0.7                         │
  │ Создаётся ProductWorkMapping(source=RULE, usage_count=1)   │
  └──────────────────────┬─────────────────────────────────────┘
                         │ не нашли
                         ▼
  ┌────────────────────────────────────────────────────────────┐
  │ ЯРУС 3: LLM fallback (все работы)                          │
  │                                                             │
  │ Берём ТОП-20 всех WorkItem(is_current=True)                │
  │ Fuzzy-сравнение с названием товара                         │
  │                                                             │
  │ Лучший кандидат → confidence = 0.5                         │
  │ Создаётся ProductWorkMapping(source=LLM, usage_count=1)    │
  └────────────────────────────────────────────────────────────┘
```

### 6.2 Расчёт стоимости работы

После того как `work_item` подобран, стоимость рассчитывается через `PriceListItem`:

```
Формула:

  work_unit_price = hours × coefficient × rate_for_grade

  где:
    hours       = PriceListItem.hours_override   или  WorkItem.hours
    coefficient = PriceListItem.coeff_override    или  WorkItem.coefficient
    grade       = PriceListItem.grade_override    или  WorkItem.required_grade

    rate_for_grade — ставка из PriceList с ИНТЕРПОЛЯЦИЕЙ дробных разрядов:

    Пример для grade = 3.65:
      rate_3 = 600 ₽/ч
      rate_4 = 750 ₽/ч
      rate = rate_3 × (1 - 0.65) + rate_4 × 0.65
           = 600 × 0.35 + 750 × 0.65
           = 210 + 487.5
           = 697.50 ₽/ч

  Итого для позиции:
    work_unit_price = 2.5 ч × 1.2 × 697.50 ₽/ч = 2 092.50 ₽
    work_total      = quantity × work_unit_price
                    = 3 шт × 2 092.50 = 6 277.50 ₽
```

### 6.3 Обучаемая система (ProductWorkMapping)

Это ключевая особенность: система **учится** от решений сметчика.

```
Жизненный цикл ProductWorkMapping:

1. Первый автоподбор:
   product="Вентилятор K200" → work="Монтаж вентилятора"
   source=RULE, confidence=0.7, usage_count=1
   ↓ сметчик подтвердил в UI

2. Повторный автоподбор (другая смета, тот же товар):
   ProductWorkMapping найден, но usage_count=1 < 2
   → ЯРУС 1 пропускает, идёт на ЯРУС 2
   → Снова подбирает ту же работу
   → usage_count → 2

3. Третий и последующие автоподборы:
   ProductWorkMapping найден, usage_count=2 ≥ 2
   → ЯРУС 1 СРАБАТЫВАЕТ! confidence=0.9
   → Мгновенный подбор без fuzzy/LLM

4. Ручная корректировка:
   Сметчик меняет работу: "Монтаж вентилятора" → "Монтаж вентилятора осевого"
   → record_manual_correction() → source=MANUAL, confidence=1.0
   → Следующий раз: ЯРУС 1 с максимальным приоритетом
```

### 6.4 Стоимость работ для публичного портала

**Вопрос**: как рассчитать стоимость работ для внешнего клиента?

**Решение**: используем стандартный PriceList компании. В ERP всегда есть текущий активный прайс-лист работ (`status=ACTIVE`). Публичный портал использует его же.

**Для Excel-сметы, отправляемой клиенту:**
- Стоимость материалов — отдельная колонка
- Стоимость работ — отдельная колонка (рассчитана по PriceList)
- Итого по строке = материалы + работы

Клиенту НЕ показываются: разряды, часы, ставки, коэффициенты — только итоговая стоимость работы за единицу.

---

## 6.5 Ценообразование материалов (ДЕТАЛЬНО)

### Архитектурное решение: наценка НЕ сохраняется в EstimateItem

**Проблема**: `match_prices()` записывает в `EstimateItem.material_unit_price` закупочную цену (из ProductPriceHistory, SupplierProduct и т.д.). Если `apply_public_markup()` перезапишет `material_unit_price` наценённой ценой прямо в модели, то:
1. Оператор в ERP увидит продажную цену вместо закупочной — не сможет корректно оценить маржу
2. При пересчёте наценки (изменили % в PublicPricingConfig) придётся пересчитывать все EstimateItem
3. Нарушается принцип "EstimateItem = единый источник правды" — одна и та же модель будет хранить разные типы цен для разных контекстов

**Решение**: наценка применяется **только при генерации Excel** в `EstimateExcelExporter.export_public()`. `EstimateItem.material_unit_price` всегда хранит **закупочную** цену. Это согласуется с тем, как уже работает ERP (двойное ценообразование: закупка/продажа).

```python
# EstimateExcelExporter.export_public() — при генерации Excel:
def get_sale_price(item: EstimateItem) -> Optional[Decimal]:
    """Рассчитать продажную цену для публичной сметы.
    Закупочная цена берётся из EstimateItem.material_unit_price.
    Наценка — из PublicPricingConfig (каскад: категория → родитель → default).
    """
    if not item.material_unit_price:
        return None  # "Цена по запросу"

    category = item.product.category if item.product else None
    markup = PublicPricingConfig.get_markup(category)  # Decimal, напр. 30.00

    return item.material_unit_price * (1 + markup / 100)
```

**Для оператора в ERP**: он видит `material_unit_price` (закупочную) и может корректировать. При генерации Excel наценка всегда пересчитывается из актуального `PublicPricingConfig`.

### Источники цен (по приоритету)

`match_prices()` записывает в `EstimateItem.material_unit_price` **закупочную** цену каскадно:

```
Для каждого подобранного товара ищем цену каскадно:

  ┌──────────────────────────────────────────────────────┐
  │ 1. SupplierProduct.ric_price                         │
  │    (рекомендованная розничная из каталога поставщика) │
  │    material_unit_price = ric_price                   │
  │    Пример: Breez API → ric_price = 15 000 ₽          │
  │    → В Excel с наценкой 5%: 15 000 × 1.05 = 15 750 ₽│
  └─────────┬────────────────────────────────────────────┘
            │ нет ric_price
            ▼
  ┌──────────────────────────────────────────────────────┐
  │ 2. ProductPriceHistory (последний оплаченный счёт)   │
  │    Реальная закупочная из нашего опыта               │
  │    material_unit_price = price                       │
  │    Пример: 12 000 ₽                                  │
  │    → В Excel с наценкой 30%: 12 000 × 1.30 = 15 600 ₽│
  └─────────┬────────────────────────────────────────────┘
            │ нет истории счетов
            ▼
  ┌──────────────────────────────────────────────────────┐
  │ 3. SupplierProduct.base_price (оптовая)              │
  │    Базовая цена из каталога поставщика               │
  │    material_unit_price = base_price                  │
  │    Пример: 10 000 ₽                                  │
  │    → В Excel с наценкой 30%: 10 000 × 1.30 = 13 000 ₽│
  └─────────┬────────────────────────────────────────────┘
            │ нет цены вообще
            ▼
  ┌──────────────────────────────────────────────────────┐
  │ 4. "Цена по запросу"                                  │
  │    material_unit_price = NULL                         │
  │    В Excel: "Цена по запросу" вместо суммы           │
  │    → В будущем: автозапрос поставщикам (RFQ)         │
  └──────────────────────────────────────────────────────┘
```

### Формула наценки (при генерации Excel)

```
sale_price = material_unit_price × (1 + markup_percent / 100)

Где:
  material_unit_price — закупочная цена из EstimateItem (результат match_prices)
  markup_percent — из PublicPricingConfig (каскад: категория → родитель → default 30%)

Особый случай: ric_price
  Если источник цены = ric_price (уже розничная), наценка минимальная (5-10%).
  Определяется по: item.source_price_history IS NULL и item.supplier_product IS NOT NULL.
```

### Безопасность ценообразования

**Закупочные цены НИКОГДА не показываются внешнему пользователю:**
- `PublicProductSerializer` уже исключает поля purchase_price, base_price
- В Excel-смете — только `sale_unit_price` (рассчитанная при генерации)
- API портала не возвращает `material_unit_price`, `ProductPriceHistory`
- Ставки по разрядам из PriceList — не показываются
- `EstimateItem.material_unit_price` виден только оператору ERP через внутренний UI

---

## 7. Структура Excel-сметы

**Источник данных**: Excel генерируется из `Estimate` → `EstimateItem` (стандартная модель ERP), НЕ из `SpecificationItem`. Это гарантирует, что корректировки оператора отражены в Excel.

**Версионирование**: при каждой генерации Excel создаётся новая версия. Старые версии сохраняются для аудита. В MVP оператор проверяет смету один раз — версионирование реально понадобится в Фазе 3 (RFQ), когда цены обновляются после ответов поставщиков. Но модель создаём сразу — стоимость добавления минимальна, а позже мигрировать сложнее.

```python
class EstimateRequestVersion(TimestampedModel):
    """Версия сгенерированной сметы. Позволяет отслеживать историю изменений."""
    request = models.ForeignKey(EstimateRequest, on_delete=models.CASCADE, related_name='versions')
    version_number = models.PositiveIntegerField()
    excel_file = models.FileField(upload_to='public_estimates/results/')
    generated_by = models.CharField(max_length=50)  # 'auto' или username оператора
    changes_description = models.TextField(blank=True)  # "Оператор скорректировал 3 позиции"

    class Meta:
        ordering = ['-version_number']
        unique_together = ['request', 'version_number']
```

`EstimateRequest.result_excel_file` всегда указывает на последнюю версию.

### Лист 1: "Смета — Материалы и Работы"

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  СМЕТА                                                                                │
│  Проект: [название]                                         Дата: [дд.мм.гггг]       │
│  Заказчик: [компания]                                                                 │
├──────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                       │
│  РАЗДЕЛ 1: ОСНОВНОЕ ОБОРУДОВАНИЕ (точные совпадения)                                 │
│  ┌───┬──────────────┬────────┬────┬─────┬──────────┬──────────┬──────────┬──────────┐ │
│  │ # │ Наименование │ Модель │Ед. │Кол. │Материал  │Работа    │Мат.итого │Раб.итого │ │
│  │   │              │        │    │     │за ед., ₽ │за ед., ₽ │       ₽  │       ₽  │ │
│  ├───┼──────────────┼────────┼────┼─────┼──────────┼──────────┼──────────┼──────────┤ │
│  │ 1 │Вентилятор    │K 200 M │шт  │  3  │ 15 000   │ 2 093    │  45 000  │  6 278   │ │
│  │ 2 │Клапан возд.  │КВР 400 │шт  │  5  │  3 200   │   850    │  16 000  │  4 250   │ │
│  └───┴──────────────┴────────┴────┴─────┴──────────┴──────────┴──────────┴──────────┘ │
│                                                  Материалы:        61 000 ₽           │
│                                                  Работы:           10 528 ₽           │
│                                                  Итого раздел:     71 528 ₽           │
│                                                                                       │
│  РАЗДЕЛ 2: АНАЛОГИ                                                                   │
│  ┌───┬─────────┬─────────┬────────────────┬────┬─────┬──────┬──────┬─────────────────┐│
│  │ # │Запрошено│Предлож. │ Обоснование    │Ед. │Кол. │Мат.₽ │Раб.₽ │ Итого, ₽       ││
│  ├───┼─────────┼─────────┼────────────────┼────┼─────┼──────┼──────┼─────────────────┤│
│  │ 3 │K 250 M  │K 200 M  │Ближ.типоразмер│шт  │  2  │30 000│4 186 │         34 186 ││
│  └───┴─────────┴─────────┴────────────────┴────┴─────┴──────┴──────┴─────────────────┘│
│                                                                                       │
│  РАЗДЕЛ 3: ТРЕБУЕТ УТОЧНЕНИЯ (цены не определены)                                    │
│  ┌───┬──────────────────┬────────┬────┬──────┬─────────────────────────────────────┐  │
│  │ # │ Наименование     │ Модель │Ед. │Кол-во│ Примечание                          │  │
│  ├───┼──────────────────┼────────┼────┼──────┼─────────────────────────────────────┤  │
│  │ 4 │Контроллер Carel  │pCO5    │шт  │  1   │Нет в каталоге, цена по запросу      │  │
│  └───┴──────────────────┴────────┴────┴──────┴─────────────────────────────────────┘  │
│                                                                                       │
│  ──────────────────────────────────────────────────────────────────────────────────    │
│  Итого материалы:                                                    91 000 ₽         │
│  Итого работы:                                                       14 714 ₽         │
│  Итого (без НДС):                                                   105 714 ₽         │
│  НДС 20%:                                                            21 143 ₽         │
│  ИТОГО С НДС:                                                       126 857 ₽         │
│                                                                                       │
│  * Позиции раздела "Требует уточнения" не включены в итоговую сумму                   │
│  * Цены актуальны на дату составления сметы                                           │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Лист 2: "Подробности подбора"

```
┌───┬───────────────────┬───────────────────┬───────────┬───────────────┬───────────────┐
│ # │ Из спецификации   │ Подобрано          │Уверенность│ Источник цены │ Работа        │
├───┼───────────────────┼───────────────────┼───────────┼───────────────┼───────────────┤
│ 1 │Вентилятор K 200 M │Вентилятор K 200 M │  98%      │ Каталог Breez │Монтаж вент.   │
│ 2 │Клапан КВР 400×200 │Клапан КВР 400×200 │  95%      │ Счёт №145     │Монтаж клапана │
│ 3 │Вентилятор K 250 M │K 200 M (аналог)   │  72%      │ Каталог Breez │Монтаж вент.   │
│ 4 │Контроллер Carel   │ — не найден —     │   0%      │ —             │ —             │
└───┴───────────────────┴───────────────────┴───────────┴───────────────┴───────────────┘
```

Реализация на основе паттерна из `estimates/views.py` (export через openpyxl).

---

## 7.5 Запросы поставщикам — RFQ-процесс (ДЕТАЛЬНО)

### 7.5.0 Архитектурный принцип: ERP-first

RFQ-система реализуется **в ERP**, не в портале. Оператор ERP может отправлять запросы поставщикам как для публичных запросов, так и для внутренних смет. Публичный портал лишь триггерит создание RFQ.

### 7.5.1 Как это работает в реальности

В строительной отрасли поставщики **не заполняют формы** в каком-то портале. Реальный процесс:

```
1. Оператор/система формирует запрос → список позиций
2. Запрос отправляется по EMAIL поставщику (PDF/Excel)
3. Поставщик отвечает СЧЁТОМ (PDF) на email
4. Оператор загружает счёт в ERP
5. Счёт парсится InvoiceService.recognize() (уже реализовано!)
6. Цены из счёта переносятся в смету
```

Это означает, что **80% инфраструктуры уже существует**:
- `InvoiceService.recognize()` — парсинг счёта поставщика
- `ProductMatcher` — сопоставление позиций счёта с позициями запроса
- `ProductPriceHistory` — сохранение цен из счёта
- Email-отправка — Django `send_mail`

### 7.5.2 Полный пайплайн RFQ

```
Смета (внутренняя или публичная)
│
│ Позиции с match_status = NOT_FOUND
│ (нет в каталоге, нет цены)
│
▼
┌────────────────────────────────────────────────────────────┐
│ 1. ФОРМИРОВАНИЕ ЗАПРОСА                                    │
│                                                             │
│ Система группирует NOT_FOUND позиции по категориям:        │
│   Вентиляция: [Контроллер Carel, Датчик CO2]              │
│   Кондиционирование: [Чиллер Daikin EWAD210]               │
│                                                             │
│ Для каждой категории → SupplierContact с такой категорией: │
│   Вентиляция → ООО "ВентКомплект" (rfq_email, auto_send)  │
│   Кондиционирование → ООО "Климат Проф"                   │
│                                                             │
│ Создаётся RFQRequest + RFQItem для каждой позиции          │
│ status = DRAFT                                              │
└──────────────────────┬─────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────┐
│ 2. ОТПРАВКА (EMAIL)                                        │
│                                                             │
│ Генерируется Excel/PDF с запросом:                          │
│ ┌──────────────────────────────────────────────────┐       │
│ │ ЗАПРОС ЦЕНОВОГО ПРЕДЛОЖЕНИЯ                       │       │
│ │ От: ООО "Август"                                  │       │
│ │ Кому: ООО "ВентКомплект"                          │       │
│ │ Просим предоставить счёт на следующие позиции:   │       │
│ │                                                    │       │
│ │ # │ Наименование        │ Модель │ Ед. │ Кол-во │ │       │
│ │ 1 │ Контроллер Carel    │ pCO5   │ шт  │   1    │ │       │
│ │ 2 │ Датчик CO2          │ DPWQ   │ шт  │   3    │ │       │
│ │                                                    │       │
│ │ Ответ просим направить в виде счёта до ДД.ММ.ГГГГ│       │
│ └──────────────────────────────────────────────────┘       │
│                                                             │
│ Если SupplierContact.auto_send = True:                     │
│   → отправляется автоматически                              │
│ Если False:                                                 │
│   → status = DRAFT, оператор проверяет и отправляет        │
│                                                             │
│ status → SENT, sent_at = now()                              │
└──────────────────────┬─────────────────────────────────────┘
                       │
                       │  ... поставщик получает email ...
                       │  ... выставляет счёт (1-3 дня) ...
                       │  ... отправляет PDF счёта на email ...
                       │
                       ▼
┌────────────────────────────────────────────────────────────┐
│ 3. ПОЛУЧЕНИЕ ОТВЕТА (СЧЁТ)                                 │
│                                                             │
│ Два варианта получения:                                     │
│                                                             │
│ A. Оператор загружает счёт вручную в ERP:                  │
│    → Привязывает к RFQRequest                               │
│    → InvoiceService.recognize() парсит                     │
│                                                             │
│ B. (Будущее) Авто-парсинг входящей почты:                  │
│    → Email-интеграция ловит письма с вложениями            │
│    → По теме/отправителю сопоставляет с RFQRequest         │
│    → InvoiceService.recognize() парсит                     │
│                                                             │
│ Результат:                                                  │
│ - Создаётся Invoice (счёт) с InvoiceItem (позициями)       │
│ - RFQRequest.response_invoice = Invoice                    │
│ - status → RESPONDED                                        │
└──────────────────────┬─────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────┐
│ 4. ОБРАБОТКА ОТВЕТА                                        │
│                                                             │
│ Сопоставление позиций счёта с позициями запроса:           │
│                                                             │
│ RFQItem: "Контроллер Carel pCO5, 1 шт"                    │
│           ↕ ProductMatcher.find_similar()                   │
│ InvoiceItem: "Carel pCO5+ контроллер", цена: 45 000 ₽     │
│                                                             │
│ Если совпало:                                               │
│   RFQItem.response_price = 45 000 ₽                        │
│   RFQItem.response_invoice_item = InvoiceItem              │
│   → Создаётся ProductPriceHistory (цена сохраняется!)      │
│   → Product создаётся если не было                         │
│                                                             │
│ Для сметы (обновляем EstimateItem, НЕ SpecificationItem):   │
│   EstimateItem.material_unit_price = 45 000 × наценка      │
│   EstimateItem.product = Product                            │
│   EstimateItem.is_analog = False                            │
│                                                             │
│ status → PROCESSED                                          │
└──────────────────────┬─────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────┐
│ 5. ОБНОВЛЕНИЕ СМЕТЫ                                        │
│                                                             │
│ Перегенерация Excel-сметы:                                  │
│ - Позиция переносится из "Требует уточнения" → "Основное"  │
│ - Цена проставлена, работа подобрана                       │
│ - Новый Excel загружается в result_excel_file              │
│                                                             │
│ Email клиенту: "Ваша смета обновлена!"                     │
│ (со ссылкой на тот же access_token)                        │
└────────────────────────────────────────────────────────────┘
```

### 7.5.3 Контроль сроков

Celery Beat задача `check_rfq_deadlines()` — запускается ежедневно:

```python
# Для каждого RFQ с status=SENT и deadline < now():
#   - status → EXPIRED
#   - Уведомление оператору: "Поставщик X не ответил на запрос Y"
#
# Для каждого RFQ с status=SENT и deadline - 1 день:
#   - Напоминание оператору: "Завтра истекает срок запроса поставщику X"
```

### 7.5.4 Где настраиваются контакты поставщиков

В ERP, раздел "Поставщики" → карточка контрагента → вкладка "RFQ":
- Email для запросов
- Контактное лицо
- Категории товаров
- Автоматическая отправка (да/нет)
- Среднее время ответа (для оценки сроков клиенту)

---

## 8. Безопасность (без аутентификации)

### 8.1 Доступ к запросам

В MVP нет аутентификации. Доступ к результатам через **секретный токен** (64 символа, `secrets.token_urlsafe(48)`):

- Пользователь создаёт запрос → получает ссылку вида `/requests/{access_token}/`
- Эта же ссылка приходит на email
- Токен невозможно угадать (48 байт энтропии = 10^57 вариантов)
- Срок жизни ссылки: 30 дней (настраивается)

### 8.2 Защита от ботов

Публичная форма без защиты будет атакована ботами. Каждый спам-запрос = LLM-вызовы = реальные деньги.

**Уровень 1 (MVP)**: Honeypot-поле + rate limiting
```python
# Honeypot — скрытое поле, которое заполняют только боты
# В форме: <input type="text" name="company_website" style="display:none">
# На бэкенде: если поле заполнено → 400 (бот)
class EstimateRequestSerializer(serializers.Serializer):
    company_website = serializers.CharField(required=False, allow_blank=True)

    def validate_company_website(self, value):
        if value:  # Бот заполнил скрытое поле
            raise serializers.ValidationError("Bot detected")
        return value
```

**Уровень 2 (после запуска)**: hCaptcha (бесплатный, GDPR-совместимый)
```
# Фронтенд: hCaptcha виджет перед кнопкой "Рассчитать смету"
# Бэкенд: валидация токена через hCaptcha API
# Зависимость: django-hcaptcha
```

Почему hCaptcha, а не reCAPTCHA: не передаёт данные в Google, бесплатный для малого объёма.

### 8.3 Верификация email

Без верификации злоумышленник может указать чужой email, организовав спам от нашего домена (и портя репутацию отправителя).

**Подход**: OTP-код на email перед созданием запроса.

```
Пользовательский путь:
1. Вводит email → нажимает "Получить код"
2. POST /api/public/v1/verify-email/ → отправляем 6-цифровой код на email
3. Вводит код → POST /api/public/v1/verify-email/confirm/ → получает verification_token (JWT, 1 час)
4. Загружает файлы + передаёт verification_token → создаётся запрос

Модель не нужна — код хранится в Redis (TTL 10 мин):
  key: "email_otp:{email}" → value: "123456"
  Макс 3 попытки ввода, макс 5 отправок/день на email.

  ПРИМЕЧАНИЕ: Redis может перезапуститься (обновление, OOM) — код будет потерян.
  Для MVP это приемлемо: пользователь просто нажмёт "Получить код" повторно.
  Если в будущем будет критично — перенести OTP в PostgreSQL (отдельная таблица с TTL через cron).
```

**Фронтенд**: Кнопка "Получить код" рядом с полем email. После ввода кода — поле email блокируется, появляется галочка.

### 8.4 Валидация файлов: magic bytes (не только расширение)

Проверка расширения недостаточна — `malware.exe` переименованный в `spec.pdf` пройдёт валидацию. Необходима проверка **magic bytes** (сигнатуры файла):

```python
import magic  # python-magic (зависимость: libmagic)

ALLOWED_MIMES = {
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',  # .xlsx
    'application/vnd.ms-excel',  # .xls
    'application/zip',
    'image/png',
    'image/jpeg',
}

def validate_file_content(file):
    """Проверка MIME-типа по содержимому файла (magic bytes)."""
    mime = magic.from_buffer(file.read(2048), mime=True)
    file.seek(0)  # вернуть указатель для дальнейшей обработки
    if mime not in ALLOWED_MIMES:
        raise ValidationError(
            f'Тип файла "{mime}" не поддерживается. '
            f'Допустимые форматы: PDF, XLSX, XLS, ZIP, PNG, JPG.'
        )
```

Зависимость: `python-magic>=0.4.27` в requirements.txt + `libmagic` в Docker (apt-get install libmagic1).

### 8.5 Безопасная распаковка ZIP (streaming)

Проверка "макс 500МБ распаковано" должна быть **во время распаковки**, не после. Иначе zip-бомба (42.zip = 4.5 ПБ) заполнит диск до проверки:

```python
import zipfile

MAX_UNCOMPRESSED_SIZE = 500 * 1024 * 1024  # 500 МБ
MAX_FILES_IN_ZIP = 100

def safe_extract_zip(zip_path, target_dir):
    """Распаковка ZIP с проверкой лимитов ВО ВРЕМЯ распаковки."""
    with zipfile.ZipFile(zip_path, 'r') as zf:
        # Проверка количества файлов
        if len(zf.infolist()) > MAX_FILES_IN_ZIP:
            raise ValidationError(f'ZIP содержит более {MAX_FILES_IN_ZIP} файлов')

        # Проверка суммарного размера ДО распаковки (по заголовкам)
        total_size = sum(info.file_size for info in zf.infolist())
        if total_size > MAX_UNCOMPRESSED_SIZE:
            raise ValidationError(
                f'Размер распакованного архива ({total_size // (1024*1024)} МБ) '
                f'превышает лимит {MAX_UNCOMPRESSED_SIZE // (1024*1024)} МБ'
            )

        # Защита от path traversal (../../../etc/passwd)
        for info in zf.infolist():
            if info.filename.startswith('/') or '..' in info.filename:
                raise ValidationError(f'Небезопасное имя файла в архиве: {info.filename}')

        zf.extractall(target_dir)
```

### 8.6 Referrer-Policy для страницы статуса

`access_token` в URL (`/requests/{access_token}/`) попадает в:
- nginx access logs
- HTTP Referer при переходе по внешним ссылкам
- Web-аналитику (Google Analytics, Yandex Metrika)

Добавить заголовок на страницу статуса:
```
# nginx.conf портала
location /requests/ {
    add_header Referrer-Policy "no-referrer" always;
    # ... остальные настройки
}
```

И в React — meta-тег:
```html
<meta name="referrer" content="no-referrer" />
```

### 8.7 Сводная таблица мер безопасности (публичный сервис!)

| Мера | Реализация |
|------|------------|
| Защита от ботов | Honeypot (MVP) + hCaptcha (после запуска) |
| Верификация email | OTP-код на email перед созданием запроса |
| Rate limiting | 5 запросов/день на IP + email (DRF Throttling) |
| Размер файлов | Макс 50МБ на файл, 200МБ на запрос |
| Типы файлов | Белый список расширений + проверка magic bytes (python-magic) |
| CORS | Только домен портала (+ убедиться `CORS_ALLOW_ALL_ORIGINS = False` на проде) |
| Валидация ZIP | Streaming-проверка: макс 500МБ, макс 100 файлов, защита от path traversal |
| SQL injection | DRF ORM (стандарт Django) |
| XSS | React (автоэкранирование), CSP-заголовки |
| Изоляция данных | Доступ к запросу только по секретному access_token |
| Файлы MinIO | Presigned URLs (1 час), MinIO не открыт наружу |
| Срок жизни | Ссылка на результат живёт 30 дней, затем 410 Gone |
| nginx | `client_max_body_size 200M`, `proxy_read_timeout 300s` |
| Referrer-Policy | `no-referrer` — access_token не утекает через Referer |

---

## 9. API-эндпоинты

Все под `/api/public/v1/`:

### Верификация email (перед созданием запроса)
```
POST /verify-email/                               — Отправка OTP-кода на email (макс 5/день на email)
POST /verify-email/confirm/                        — Подтверждение кода → verification_token (JWT, 1 час)
```

### Запросы смет (доступ по access_token)
```
POST /estimate-requests/                          — Создание + загрузка файлов (multipart)
                                                    Требует: verification_token (из verify-email)
                                                    → Возвращает: { access_token, status_url }
GET  /estimate-requests/{access_token}/           — Детали запроса со статусом и статистикой
GET  /estimate-requests/{access_token}/status/    — Лёгкий polling (JSON: status, progress_percent, stats)
GET  /estimate-requests/{access_token}/download/  — Скачать Excel (302 redirect на presigned MinIO URL)
GET  /estimate-requests/{access_token}/spec-items/ — Просмотр распознанных позиций (из EstimateItem)
POST /estimate-requests/{access_token}/callback/  — Заявка на звонок менеджера → CallbackRequest
```

### Каталог (Фаза 2 — НЕ входит в MVP)

Эндпоинты публичного каталога не используются в пользовательском пути MVP (клиент загружает файлы и получает смету, каталог не просматривает). Отложены до Фазы 2:
```
GET /products/                — Публичный каталог (поиск, фильтры по категории)
GET /products/{id}/           — Детали товара (без purchase price)
```

### RFQ-эндпоинты для оператора ERP (Фаза 3, JWT-аутентификация)

Поставщики **не работают через портал** — они получают запросы по email и отвечают счетами (PDF). Все RFQ-эндпоинты предназначены для оператора ERP.

```
GET   /admin/rfqs/                     — Все RFQ-запросы (фильтры: status, supplier, deadline)
POST  /admin/rfqs/                     — Создать RFQ вручную (для конкретной сметы)
GET   /admin/rfqs/{id}/                — Детали RFQ с позициями и статусом ответа
POST  /admin/rfqs/{id}/send/           — Отправить запрос поставщику по email
POST  /admin/rfqs/{id}/attach-invoice/ — Привязать полученный счёт-ответ к RFQ
POST  /admin/rfqs/{id}/process/        — Обработать ответ: перенести цены в EstimateItem
```

### Админ-эндпоинты (для ERP-операторов, JWT-аутентификация ERP)
```
GET   /admin/requests/                 — Все публичные запросы (фильтры: status, date, email)
GET   /admin/requests/{id}/            — Детали с полной информацией + ссылка на Estimate в ERP
PATCH /admin/requests/{id}/            — Корректировка (статус, комментарий)
POST  /admin/requests/{id}/approve/    — Подтвердить и отправить клиенту (REVIEW → READY → email)
POST  /admin/requests/{id}/reject/     — Отклонить запрос (с причиной)
GET   /admin/pricing-config/           — Настройки наценок
PUT   /admin/pricing-config/           — Обновить наценки
GET   /admin/portal-config/            — Настройки портала (auto_approve, лимиты)
PUT   /admin/portal-config/            — Обновить настройки портала
GET   /admin/stats/                    — Статистика: запросы/день, конверсия, LLM-стоимость
GET   /admin/callbacks/                — Заявки на звонок от клиентов
```

---

## 10. Фронтенд портала

### 10.1 Технологии

Портал интегрирован в основное Next.js 16 приложение:
- Next.js 16 App Router (общий с ERP)
- shadcn/ui + Tailwind CSS (переиспользование `components/ui/`)
- TanStack Query
- TypeScript strict mode

### 10.2 Структура проекта

```
frontend/
  app/
    public/                           — Публичный портал (Next.js App Router)
      layout.tsx                      — Минималистичный layout (без ERP-сайдбара)
      page.tsx                        — Лендинг: Hero + HowItWorks + FileUpload
      requests/[token]/page.tsx       — Статус заявки, прогресс, скачивание
  components/
    public/                           — Компоненты портала
      layout/
        PortalLayout.tsx              — Шапка + футер
        Header.tsx                    — Логотип + навигация
        Footer.tsx                    — Контакты, ссылки
      estimate/
        EmailVerification.tsx         — Ввод email + OTP-код
        FileUploadZone.tsx            — Drag-and-drop зона загрузки файлов
        ContactForm.tsx               — Название проекта + компания
        RequestStatus.tsx             — Карточка статуса с прогресс-баром
        SpecPreview.tsx               — Таблица распознанных позиций
        ProgressTracker.tsx           — Прогресс-бар с этапами обработки
        CallbackForm.tsx              — CTA: "Заказать оборудование"
      landing/
        HeroSection.tsx               — Главный баннер: "Рассчитайте смету за минуту"
        HowItWorks.tsx                — "Как это работает" (3 шага)
        UploadCTA.tsx                 — Призыв к действию → скролл к форме
    ui/                               — shadcn/ui (общие с ERP)
  lib/
    api/                              — API-клиент (общий, /api/public/v1/)
  types/
    portal.ts                         — TypeScript-типы (EstimateRequest, SpecificationItem, etc.)
```

### 10.3 Пользовательский путь (без регистрации)

```
LandingPage (smeta-portal.ru)
┌─────────────────────────────────────────┐
│                                          │
│  [Логотип]              [О сервисе]      │
│                                          │
│  ┌─────────────────────────────────────┐│
│  │                                      ││
│  │   Рассчитайте смету                  ││
│  │   по проектной документации          ││
│  │                                      ││
│  │   Загрузите проект — получите        ││
│  │   готовую смету на email             ││
│  │                                      ││
│  └─────────────────────────────────────┘│
│                                          │
│  Как это работает:                       │
│  ① Загрузите файлы (PDF, ZIP, Excel)     │
│  ② Система распознает спецификацию       │
│  ③ Получите смету на email               │
│                                          │
│  ┌─────────────────────────────────────┐│
│  │                                      ││
│  │  ┌─────────────────────────────┐    ││
│  │  │  Перетащите файлы сюда      │    ││
│  │  │  PDF, ZIP, Excel             │    ││
│  │  │  до 50МБ на файл            │    ││
│  │  └─────────────────────────────┘    ││
│  │                                      ││
│  │  Email*: [_______________] [Код ✓] ││
│  │  (OTP: ввод кода из письма)         ││
│  │  Название проекта*: [_____________] ││
│  │  Компания: [______________________] ││
│  │                                      ││
│  │  [     Рассчитать смету      ]      ││
│  │                                      ││
│  └─────────────────────────────────────┘│
│                                          │
│  [Футер: контакты, © 2026]              │
└─────────────────────────────────────────┘

           │ Ввёл email → "Получить код" →
           │ POST /api/public/v1/verify-email/
           │ Получил код на почту → ввёл →
           │ POST /api/public/v1/verify-email/confirm/
           │ Получил verification_token
           │ Нажал "Рассчитать" →
           │ POST /api/public/v1/estimate-requests/ (+ verification_token)
           │ Получил access_token
           │ Redirect → /requests/{access_token}
           ▼

RequestStatusPage (/requests/{access_token})
┌─────────────────────────────────────────┐
│                                          │
│  Проект: "Жилой дом на ул. Ленина"      │
│                                          │
│  Статус: Обработка... 60%                │
│  ████████████░░░░░░░                     │
│                                          │
│  ┌──────────────────┬──────────────────┐│
│  │ Загружено файлов │        3         ││
│  │ Распознано позиц.│       45         ││
│  │ Подобрано         │    30 / 45       ││
│  └──────────────────┴──────────────────┘│
│                                          │
│  Ссылка на эту страницу отправлена       │
│  на your@email.com                       │
│                                          │
│  Можете закрыть страницу — мы пришлём    │
│  уведомление когда смета будет готова.   │
│                                          │
└─────────────────────────────────────────┘

        ... (через 30 мин — 2 дня) ...
        Polling: GET /status/ каждые 10 сек

RequestStatusPage (тот же URL, статус = ready)
┌─────────────────────────────────────────┐
│                                          │
│  Проект: "Жилой дом на ул. Ленина"      │
│                                          │
│  Смета готова!                           │
│                                          │
│  Найдено позиций: 45                     │
│  ├── Точных совпадений: 30               │
│  ├── Аналоги: 10                         │
│  └── Требует уточнения: 5               │
│                                          │
│  Итого: 1 250 000 руб. (без НДС)        │
│                                          │
│  [  Скачать смету (Excel)  ]            │
│                                          │
│  Ссылка действительна до 14.04.2026      │
│                                          │
│  ── Распознанные позиции ──              │
│  ┌───┬──────────┬────┬─────┬──────────┐ │
│  │ # │ Название │Ед. │Кол. │ Статус   │ │
│  │ 1 │ VTC 300  │шт  │ 2   │ Точный   │ │
│  │ 2 │ Решётка  │шт  │ 12  │ Аналог   │ │
│  └───┴──────────┴────┴─────┴──────────┘ │
│                                          │
└─────────────────────────────────────────┘
```

### 10.4 Polling-стратегия (адаптивная)

```typescript
// useEstimateRequest.ts
const { data } = useQuery({
  queryKey: ['estimate-request', token],
  queryFn: () => api.getRequestStatus(token),
  refetchInterval: (data) => {
    if (['uploaded'].includes(data?.status)) return 5_000;    // начало — быстро
    if (['parsing'].includes(data?.status)) return 30_000;    // парсинг долгий
    if (['matching'].includes(data?.status)) return 15_000;   // матчинг быстрее
    if (['review'].includes(data?.status)) return 120_000;    // оператор — не торопим
    if (['rfq_sent'].includes(data?.status)) return 300_000;  // ждём поставщиков
    return false; // ready/delivered/error — стоп
  },
});
```

### 10.5 CTA после скачивания — "Связаться с менеджером"

На странице RequestStatusPage (status=ready/delivered) после кнопки скачивания:

```
┌───────────────────────────────────────────┐
│  Смета готова!                             │
│                                            │
│  [ Скачать смету (Excel) ]                │
│                                            │
│  ─────────────────────────────────────     │
│  Хотите заказать оборудование?            │
│  Наш менеджер свяжется с вами             │
│                                            │
│  Телефон*: [__________________]           │
│  Удобное время: [______________]          │
│  Комментарий: [________________]          │
│                                            │
│  [ Оставить заявку ]                      │
│                                            │
│  Или позвоните: +7 (XXX) XXX-XX-XX        │
│  (из PublicPortalConfig.company_phone)     │
└───────────────────────────────────────────┘
```

При нажатии "Оставить заявку":
- `POST /api/public/v1/estimate-requests/{access_token}/callback/`
- Сохраняет телефон + комментарий
- Email оператору: "Клиент ООО 'Строй' просит перезвонить по смете 'Жилой дом'"
- Кнопка меняется на "Заявка отправлена!"

---

## 11. Celery-задачи

Все задачи в `backend/api_public/tasks.py`.

### process_public_estimate_request(request_id)
Главная задача-оркестратор. Вызывает остальные последовательно.

```python
@shared_task(
    bind=True, max_retries=2, queue='public_tasks',
    soft_time_limit=3600,   # 60 мин — SoftTimeLimitExceeded (graceful)
    time_limit=3900,        # 65 мин — жёсткий kill
)
def process_public_estimate_request(self, request_id):
    """
    Полный пайплайн обработки публичного запроса.

    Поток данных:
    SpecificationItem (raw) → Estimate → EstimateItem (рабочий) → Excel

    ИДЕМПОТЕНТНОСТЬ: каждый этап проверяет, был ли он уже выполнен.
    При retry (max_retries=2) не повторяем LLM-вызовы для уже распарсенных файлов.
    Это критически важно для экономии LLM-токенов.

    Чекпоинты:
    - EstimateRequestFile.parse_status in ('done', 'partial') → файл уже обработан, пропускаем
    - request.estimate is not None → Estimate уже создан, пропускаем
    - EstimateItem.product is not None → подбор для этой позиции уже выполнен

    PARTIAL SUCCESS: если часть файлов не распарсилась (rate limit, timeout),
    пайплайн продолжает работу с тем, что удалось распарсить.
    Оператор получает уведомление с деталями пропущенных страниц/файлов.
    """
    request = EstimateRequest.objects.get(id=request_id)
    config = PublicPortalConfig.get()

    try:
        # === ЭТАП: ПАРСИНГ (идемпотентный, partial success) ===
        request.status = 'parsing'
        request.save(update_fields=['status'])

        # parse_all_files пропускает файлы с parse_status in ('done', 'partial')
        parse_all_files(request)           # 1-3: ZIP → файлы → LLM → SpecificationItem
        deduplicate_spec_items(request)    # 4: группировка дублей (идемпотентно)

        # Проверка: есть ли что обрабатывать?
        has_parsed_items = request.spec_items.exists()
        all_files_error = not request.files.exclude(parse_status='error').exists()
        if not has_parsed_items or all_files_error:
            raise ValueError(
                'Не удалось извлечь позиции ни из одного файла. '
                'Проверьте, что загруженные файлы содержат спецификации оборудования.'
            )

        # === ЭТАП: ПОДБОР (идемпотентный) ===
        request.status = 'matching'
        request.save(update_fields=['status'])

        # 5: Создание Estimate — только если ещё не создан
        if not request.estimate:
            estimate = create_estimate_from_spec_items(request)
        else:
            estimate = request.estimate

        # 6-7: Подбор товаров + работ (наценка НЕ применяется к модели — см. раздел 6.5)
        matcher = EstimateAutoMatcher()
        matcher.auto_fill(estimate)  # match_prices(estimate) + match_works(estimate)

        # Обновляем статистику
        update_request_stats(request)

        # === ЭТАП: ПРОВЕРКА ИЛИ АВТОМАТИЧЕСКАЯ ОТПРАВКА ===
        if config.auto_approve:
            generate_and_deliver(request)
        else:
            # Останавливаемся на REVIEW — ждём оператора
            request.status = 'review'
            request.save(update_fields=['status'])
            send_operator_review_notification(request)

    except SoftTimeLimitExceeded:
        # Graceful timeout — сохраняем то, что успели
        request.status = 'error'
        request.error_message = (
            f'Превышено время обработки (60 мин). '
            f'Обработано файлов: {request.processed_files}/{request.total_files}. '
            f'Попробуйте загрузить меньше файлов.'
        )
        request.save(update_fields=['status', 'error_message'])
        send_error_notification(request, request.error_message)

    except Exception as e:
        request.status = 'error'
        request.error_message = str(e)
        request.save(update_fields=['status', 'error_message'])
        send_error_notification(request, e)
        raise


def generate_and_deliver(request, generated_by='auto'):
    """Генерация Excel + отправка клиенту. Вызывается автоматически или после approve оператора.

    Статусы:
    - READY = Excel сгенерирован, доступен для скачивания
    - DELIVERED = email отправлен клиенту
    Разделение: если email не отправится, клиент всё равно может скачать по ссылке.

    ВАЖНО: наценка из PublicPricingConfig применяется ЗДЕСЬ, при генерации Excel,
    а НЕ сохраняется в EstimateItem. EstimateItem всегда хранит закупочную цену.
    Это позволяет оператору видеть реальные закупочные цены в ERP
    и пересчитывать наценку без изменения EstimateItem.
    """
    estimate = request.estimate
    excel_file = EstimateExcelExporter(estimate).export_public()
    # export_public() внутри вызывает get_sale_price() для каждого EstimateItem
    # (см. раздел 6.5 — формула наценки)

    # Версионирование
    version = request.versions.count() + 1
    EstimateRequestVersion.objects.create(
        request=request, version_number=version,
        excel_file=excel_file, generated_by=generated_by,
    )
    request.result_excel_file = excel_file
    request.status = 'ready'
    request.save(update_fields=['result_excel_file', 'status'])

    # Email — отдельно, с обработкой ошибки
    try:
        send_estimate_ready_notification(request)
        request.status = 'delivered'
        request.notification_sent = True
        request.save(update_fields=['status', 'notification_sent'])
    except Exception as e:
        # Email не отправился, но смета готова — клиент может скачать по ссылке.
        # Оператор получает уведомление об ошибке отправки.
        logger.error(f"Email notification failed for request {request.id}: {e}")
        send_operator_email_failure_notification(request, e)
        # status остаётся 'ready' — не теряем работу из-за SMTP-сбоя
```

### parse_specification_file(file_id)
Парсинг одного файла спецификации (постранично через LLM Vision).

### match_specification_items(request_id)
Подбор товаров для всех позиций запроса.

### generate_public_estimate_excel(request_id)
Генерация Excel-сметы (openpyxl).

### send_estimate_ready_notification(request_id)
Email-уведомление клиенту со ссылкой на скачивание.

### check_rfq_deadlines() — Фаза 3, periodic
Celery Beat — проверка истёкших RFQ, обновление статусов.

---

## 12. Email-уведомления

Шаблоны в `backend/templates/api_public/`:

**Уведомления клиенту:**

| Шаблон | Когда | Содержание |
|--------|-------|------------|
| `estimate_accepted.html` | Запрос создан | Ссылка на статус, ориентировочное время |
| `estimate_ready.html` | Смета готова | Ссылка на скачивание, краткая статистика |
| `estimate_updated.html` | Смета обновлена (после RFQ) | "Смета обновлена, скачайте новую версию" |
| `estimate_error.html` | Ошибка обработки | Описание ошибки, контакт поддержки |

**Уведомления оператору** (на все адреса из `PublicPortalConfig.operator_email_list`):

| Шаблон | Когда | Содержание |
|--------|-------|------------|
| `operator_new_request.html` | Новый запрос | "Новый запрос на смету от ООО 'Строй' (3 файла)" |
| `operator_review_ready.html` | Обработка завершена, ждёт проверки | "Запрос #123 готов к проверке. 45 позиций, 30 точных, 10 аналогов" |
| `operator_error.html` | Ошибка обработки | "Ошибка в запросе #123: {error_message}" |
| `operator_callback.html` | Клиент запросил звонок | "Клиент ООО 'Строй' просит перезвонить: +7 XXX, по смете 'Жилой дом'" |
| `rfq_new_request.html` | Новый RFQ (Фаза 3) | Список позиций, дедлайн ответа |
| `rfq_response_received.html` | Ответ поставщика (Фаза 3) | Сводка по ценам |

Реализация через Django `send_mail` + HTML-шаблоны. SMTP-настройки уже есть в проекте.

**Трекинг**: `EstimateRequest.downloaded_at` обновляется при первом скачивании Excel (для статистики конверсии).

---

## 13. Существующие компоненты для переиспользования

| Компонент | Файл | Сигнатура / Как используется |
|-----------|------|------------------------------|
| `EstimateAutoMatcher` | `estimates/services/estimate_auto_matcher.py` | `matcher = EstimateAutoMatcher()` → `matcher.auto_fill(estimate)` — подбор товаров + работ |
| `ProductMatcher` | `catalog/services/product_matcher.py` | `ProductMatcher().find_or_create_product(name, unit, use_llm)` — 5-уровневый каскад |
| `ProductCategorizer` | `catalog/categorizer.py` | Категоризация новых товаров через LLM |
| `DocumentParser` | `llm_services/services/document_parser.py` | Паттерн LLM Vision парсинга (рядом будет SpecificationParser) |
| `LLMProvider` | `llm_services/models.py` | Провайдеры LLM (GPT-4, Gemini, Grok) |
| `process_estimate_pdf_pages` | `estimates/tasks.py` | Паттерн постраничного парсинга PDF (Redis-сессии, retry) |
| `EstimateImportService` | `estimates/services/estimate_import_service.py` | Паттерн Excel-импорта (автодетект заголовков) |
| `InvoiceService.recognize()` | `payments/services/invoice_service.py` | Парсинг счетов (для RFQ-ответов поставщиков, Фаза 3) |
| `Estimate, EstimateItem` | `estimates/models.py` | Стандартная смета ERP — единый источник правды. EstimateItem уже имеет: `custom_data`, `original_name`, `is_analog`, `analog_reason` |
| `PublicProductSerializer` | `api_public/serializers.py` | Сериализатор товаров без закупочных цен (заглушка, раскомментировать) |
| `Product`, `ProductAlias` | `catalog/models.py` | Каталог товаров с алиасами |
| `ProductPriceHistory` | `catalog/models.py` | История закупочных цен |
| `SupplierProduct` | `supplier_integrations/models.py` | Товары поставщиков с ценами (ric_price, base_price) |
| shadcn/ui компоненты | `frontend/components/ui/` | UI-компоненты — общие для ERP и портала |
| `ApiClient` паттерн | `frontend/lib/api/client.ts` | HTTP-клиент с JWT interceptors и retry |

**Зависимости для добавления в requirements.txt:**
- `django-storages[boto3]>=1.14.0` — S3/MinIO storage backend для файлов портала
- `python-magic>=0.4.27` — проверка MIME-типов файлов по magic bytes
- `libmagic1` — системная зависимость для python-magic (добавить в Dockerfile: `apt-get install libmagic1`)

---

## 14. Фазы реализации

### Общий план

| Фаза | Заходы | Срок | Статус |
|------|--------|------|--------|
| **Фаза 1** — MVP портала | Заходы 0-7 | 8-10 недель | ✅ Код готов, ожидает деплоя |
| **Фаза 2** — Улучшения | — | 2-3 недели | 🔲 Не начата |
| **Фаза 3** — RFQ-система | — | 3-4 недели | 🔲 Не начата |
| **Фаза 4** — SaaS-масштабирование | — | будущее | 🔲 Не начата |

**Оценка сроков Фазы 1**: 6 недель — оптимистичная оценка, предполагающая отсутствие блокеров. Реалистично — 8-10 недель, учитывая:
- SpecificationParser — принципиально новый LLM-парсер (другой формат vs счета)
- Excel-экспорт с 3 разными шаблонами секций
- 7+ API-эндпоинтов + OTP-верификация
- Новый React-проект с 12+ компонентами
- Интеграционное тестирование полного пайплайна

**Граф зависимостей заходов:**
```
Заход 0 (подготовка)
   │
   ▼
Заход 1 (модели + миграции)
   │
   ├──────────────────┐
   ▼                  ▼
Заход 2              Заход 4
(парсер)             (публичный API)
   │                  │
   ▼                  │
Заход 3              │
(Excel-экспорт)      │
   │                  │
   ├──────────────────┘
   ▼
Заход 5 (Celery-пайплайн)
   │
   ├──────────────────┐
   ▼                  ▼
Заход 6              Заход 7
(оператор ERP)       (фронтенд портала)
```

---

### Фаза 1 — ERP-сервисы + MVP портала

**Цель**: Сначала новые сервисы в ERP (парсинг спецификаций, Excel-экспорт). Затем модели портала + API + интерфейс оператора + фронтенд. Все сервисы доступны и внутри ERP.

---

#### Заход 0 — Подготовка инфраструктуры

> Предварительные проверки и настройки до начала кодирования.
> Без этого захода дальнейшая работа заблокирована.

- [x] Проверить/настроить SMTP для email-уведомлений (см. раздел 2.11)
- [x] Убедиться что `CORS_ALLOW_ALL_ORIGINS = False` на продакшене (см. раздел 2.6)
- [x] Добавить `django-storages[boto3]`, `python-magic` в `requirements.txt` (см. раздел 2.7)
- [x] Настроить `STORAGES` dict (Django 4.2+) с отдельным `portal` backend
- [x] Создать bucket `portal-estimates` в MinIO (docker-compose createbuckets)
- [x] Добавить `CELERY_TASK_ROUTES` для `public_tasks` очереди
- [x] Добавить `PORTAL_DOMAIN` в ALLOWED_HOSTS, CORS, CSRF

**Критерий готовности**: `python manage.py sendtestemail` отправляет письмо, `python -c "import magic"` работает, MinIO bucket `portal` создан.

---

#### Заход 1 — Модели + миграции

> Все модели данных для портала. Фундамент, на котором строятся все остальные заходы.

**Зависимости**: Заход 0
**Разделы плана**: 3 (Модели данных)

- [x] `SpecificationItem` модель в `estimates/models.py` — staging-модель сырых данных из PDF
- [x] Модели в `api_public/models.py`:
  - [x] `EstimateRequest` — запрос на смету (email, status, access_token)
  - [x] `EstimateRequestFile` — загруженный файл (parse_status, page_count)
  - [x] `EstimateRequestVersion` — версия сметы (version, excel_file)
  - [x] `PublicPortalConfig` — singleton настроек портала (auto_approve, лимиты)
  - [x] `PublicPricingConfig` — наценки по категориям
  - [x] `CallbackRequest` — заявка на звонок
- [x] Миграции: `python manage.py makemigrations estimates api_public`
- [ ] `python manage.py migrate` — без ошибок (на сервере)
- [x] Django admin регистрация всех моделей
- [x] `django-storages` + MinIO storage backend `portal` в settings.py

**Критерий готовности**: `makemigrations` + `migrate` проходят, все модели видны в Django admin, можно создать запись вручную.

---

#### Заход 0+1 — Тесты + Документация + Рефакторинг ✅

> **Выполнено.** 75 тестов, coverage api_public/models.py = 97.6%.

**pytest-автотесты** (`backend/api_public/tests/`, `backend/estimates/tests/`):

- [x] Тестовая инфраструктура:
  - [x] `conftest.py` — pytest-фикстуры (estimate_request, portal_config и т.д.)
  - [x] `factories.py` — factory_boy-фабрики для всех новых моделей
- [x] Модель `EstimateRequest`:
  - [x] Автогенерация `access_token` при создании (64 символа, уникальный)
  - [x] Автогенерация `expires_at` (created_at + 30 дней)
  - [x] `is_expired` — True после expires_at
  - [x] `progress_percent` — корректные значения для каждого статуса
  - [x] `progress_percent` — расчёт по файлам (parsing) и позициям (matching)
  - [x] Все статусы из `Status.choices` валидны
- [x] Модель `EstimateRequestFile`:
  - [x] Все `ParseStatus` choices валидны, включая `PARTIAL`
  - [x] Все `FileType` choices валидны
  - [x] FK на `EstimateRequest` с cascade delete
- [x] Модель `EstimateRequestVersion`:
  - [x] `unique_together` на (request, version_number)
  - [x] Ordering по `-version_number`
- [x] Модель `PublicPortalConfig`:
  - [x] Singleton: `save()` всегда ставит `pk=1`
  - [x] `get()` создаёт запись если нет, возвращает существующую если есть
  - [x] `operator_email_list` — парсинг строки через запятую
- [x] Модель `PublicPricingConfig`:
  - [x] `get_markup(category)` — каскад: категория → родитель → default → 30%
  - [x] `unique_category_pricing` constraint работает
- [x] Модель `CallbackRequest`:
  - [x] Все `Status` choices валидны
  - [x] FK на `EstimateRequest` с cascade delete
- [x] Модель `SpecificationItem` (estimates):
  - [x] Cross-app FK на `api_public.EstimateRequest`
  - [x] Дефолтные значения (unit='шт', quantity=1)
- [x] Конфигурация (settings.py):
  - [x] `STORAGES['portal']` backend настроен
  - [x] `CELERY_TASK_ROUTES` содержит `api_public.tasks.*`
  - [x] Email-настройки читаются из env vars

**Документация**:

- [x] Docstrings всех моделей
- [x] Обновлён MEMORY.md: секция про портал, STORAGES, portal bucket

**Рефакторинг**:

- [x] Ревью кода: naming conventions проверены
- [x] Миграции идемпотентны (нет data migration)

---

#### Заход 2 — SpecificationParser + management-команда ✅

> Выполнено. Parser, transformer, CLI-команда + 23 теста.

- [x] `SpecificationParser` в `llm_services/services/specification_parser.py`:
  - [x] Постраничный LLM Vision парсинг PDF
  - [x] Извлечение: наименование, модель, бренд, ед.изм., кол-во, тех.характеристики
  - [x] Page-level error handling (ошибка на одной странице не ломает весь документ)
  - [x] Статус `PARTIAL` при частичном парсинге
- [x] `create_estimate_from_spec_items()` в `estimates/services/specification_transformer.py`:
  - [x] SpecificationItem → Estimate → Section → Subsection → EstimateItem
  - [x] Группировка по секциям
  - [x] Маппинг полей (brand → custom_data, tech_specs → custom_data)
- [x] Management-команда `parse_specification <pdf_path>`

#### Заход 2 — Тесты ✅

- [x] `SpecificationParser` (мок LLM): 12 тестов — single page, multi-page, dedup, errors, partial, normalization
- [x] `create_estimate_from_spec_items()`: 11 тестов — sections, items, fields, empty, default section
- [x] Промпты определены как константы в specification_parser.py

---

#### Заход 3 — Excel-экспорт + ценообразование ✅

> Выполнено. EstimateExcelExporter + get_sale_price + 15 тестов.

- [x] `EstimateExcelExporter` в `estimates/services/estimate_excel_exporter.py`:
  - [x] 3 секции: основные / аналоги / требует уточнения
  - [x] `export()` и `export_public()` (с наценкой)
- [x] `get_sale_price(item)` — закупочная × (1 + наценка/100)
- [ ] Кнопка "Импорт из спецификации" в ERP UI (отложено до Захода 6 frontend)

#### Заход 3 — Тесты ✅

- [x] 15 тестов: get_sale_price (0, default, category), export (valid xlsx, 3 sections, markup/no markup, totals, empty, analog reason, unknown no prices, model not affected)

---

#### Заход 4 — Публичный API (бэкенд портала) ✅

> Выполнено. OTP, 7 endpoints, security module + 47 тестов.

- [x] OTP-верификация email через Redis: `otp.py` (send_otp, verify_otp, check_verification_token)
- [x] Эндпоинты в `views.py` + `urls.py` (`/api/public/v1/`):
  - [x] `POST verify-email/` + `POST verify-email/confirm/`
  - [x] `POST estimate-requests/` (файлы + verification_token → access_token)
  - [x] `GET estimate-requests/{token}/` + `/status/` + `/download/` + `POST /callback/`
- [x] Безопасность в `security.py`:
  - [x] Honeypot, magic bytes (fallback без libmagic), ZIP bomb/traversal защита
  - [x] Rate limiting (DRF Throttling), CORS (PORTAL_DOMAIN)

#### Заход 4 — Тесты ✅

- [x] `test_views.py`: 18 тестов — OTP, create, status, detail, download, callback
- [x] `test_security.py`: 25 тестов — magic bytes (4 skip без libmagic), extensions, file size, ZIP (valid/filter/traversal/bomb/nested), honeypot

---

#### Заход 5 — Celery-задача + полный пайплайн ✅

> Выполнено. tasks.py + emails.py + celery-public-worker в docker-compose + 11 тестов.

- [x] `process_public_estimate_request` в `tasks.py` (queue=`public_tasks`, soft_time_limit=3600, max_retries=2)
- [x] `_parse_all_files()` — идемпотентный, пропускает done/partial
- [x] `generate_and_deliver()` — Excel + версия + email (SMTP-сбой не роняет)
- [x] `_update_request_stats()` — подсчёт exact/analog/unmatched
- [x] 8 email-функций в `emails.py`: клиент (accepted, ready, error) + оператор (new, review, error, callback)
- [x] `celery-public-worker` в docker-compose (concurrency=2)

#### Заход 5 — Тесты ✅

- [x] `test_tasks.py`: 11 тестов — emails (7), stats, generate_and_deliver happy path + SMTP failure

---

#### Заход 6 — Интерфейс оператора в ERP ✅

> Выполнено. Backend: 10 admin API endpoints + 17 тестов. Frontend: 2 React-страницы + сайдбар.

- [x] Backend: `admin_views.py` + `admin_urls.py` (`/api/v1/portal/`):
  - [x] Список запросов с фильтрами (status, search)
  - [x] Детальная страница (файлы, версии, callbacks)
  - [x] Approve → generate_and_deliver → DELIVERED + email
  - [x] Reject → status=ERROR + email клиенту
  - [x] Config GET/PUT, Pricing CRUD, Callbacks list/update, Stats
- [x] Frontend:
  - [x] `PortalRequestsPage.tsx` — таблица, фильтры, статистика, детальная модалка, approve/reject
  - [x] `PortalCallbacksPage.tsx` — заявки на звонок, смена статуса
  - [x] Секция "Портал смет" в Layout.tsx сайдбаре
  - [x] Маршруты в Next.js App Router (`app/erp/portal/`)
  - [x] 13 API-методов в `lib/api/`

#### Заход 6 — Тесты ✅

- [x] `test_admin_views.py`: 17 тестов — list, filter, search, detail, approve, reject, config, pricing CRUD, callbacks, stats, auth required

---

#### Заход 7 — Фронтенд портала + деплой ✅

> Выполнено. Фронтенд портала интегрирован в основное Next.js приложение (`frontend/`). Архитектура: раздел hvac-info.com/smeta/.

- [x] Фронтенд портала в Next.js (TypeScript + TanStack Query + Tailwind)
- [x] LandingPage:
  - [x] Hero-секция + "Как это работает" (3 шага)
  - [x] OTP-верификация email (отправка → ввод кода → подтверждение)
  - [x] Drag-and-drop загрузка файлов (валидация расширения + размера)
  - [x] Поля: название проекта, компания
  - [x] Honeypot-поле (скрытое)
  - [x] Кнопка "Рассчитать смету"
- [x] RequestStatusPage (`/requests/{access_token}`):
  - [x] Адаптивный polling (5с → 30с → 15с → 120с → стоп)
  - [x] Прогресс-бар обработки
  - [x] Кнопка скачивания Excel
  - [x] CTA "Заказать" + форма callback
- [x] Docker:
  - [x] Multi-stage Dockerfile (node → nginx)
  - [x] Сервис `portal` в docker-compose (:3002)
  - [x] nginx.conf с SPA routing + Referrer-Policy
  - [x] `libmagic1` добавлен в backend Dockerfile
- [x] Архитектура деплоя:
  - [x] Портал — раздел `hvac-info.com/smeta/` (base path, basename)
  - [x] API проксируется через hvac-info.com → 72.56.111.111:8000
  - [x] `DEPLOY.md` — инструкция деплоя
  - [x] `TASK_HVAC_INFO_PORTAL.md` — задание для программистов hvac-info.com
- [ ] Деплой на продакшен:
  - [ ] `docker compose up -d --build` на 72.56.111.111
  - [ ] `python manage.py migrate` на сервере
  - [ ] Nginx конфигурация на 72.56.80.247 (задание: `docs/TASK_HVAC_INFO_PORTAL.md`)
  - [ ] E2E проверка: `hvac-info.com/smeta/` → OTP → PDF → Excel

#### Заход 7 — Тесты (частично)

- [ ] Jest/Vitest unit тесты (при необходимости, после деплоя)
- [ ] E2E Playwright (после деплоя)
- [x] Deployment guide: `docs/TASK_HVAC_INFO_PORTAL.md`
- [x] Задание для внешней команды: `docs/TASK_HVAC_INFO_PORTAL.md`

---

### Фаза 2 — Улучшения (2-3 недели)

- [ ] **Улучшенная** обработка ZIP (рекурсивные архивы, вложенные папки, фильтрация мусорных файлов)
- [ ] **Улучшенная** дедупликация (кросс-файловая: одна позиция в разных документах проекта, нечёткое сравнение)
- [ ] Улучшенная классификация документов (чертежи vs спецификации vs ведомости)
- [ ] Дашборд аналитики в ERP: запросы/день, % подбора, средний чек, LLM-стоимость, конверсия callback
- [ ] Личный кабинет на портале (PublicUser, история) — отдельная миграция
- [ ] Брендированный шаблон Excel (логотип, стили)

### Фаза 3 — RFQ-система (3-4 недели)

**Модели в `estimates/models.py`** (ERP-first), используются и для внутренних смет, и для портала.

- [ ] Модель `SupplierContact` — email/категории для контрагентов-поставщиков
- [ ] Модели `RFQRequest`, `RFQItem` — запросы ценовых предложений (отдельная миграция)
- [ ] UI в ERP: "Запросы поставщикам" — формирование, отправка, отслеживание
- [ ] Авто-генерация RFQ для NOT_FOUND позиций (EstimateItem без product)
- [ ] Отправка запроса по email (PDF/Excel с перечнем)
- [ ] Получение ответа: оператор загружает счёт → `InvoiceService.recognize()` → цены
- [ ] Сопоставление позиций счёта с позициями RFQ через `ProductMatcher`
- [ ] Перегенерация Excel (новая EstimateRequestVersion), уведомление клиенту
- [ ] Celery Beat: контроль сроков, напоминания

### Фаза 4 — SaaS-масштабирование (будущее)

- [ ] Мультитенантность (несколько компаний-продавцов)
- [ ] Биллинг и тарифные планы
- [ ] Публичный API (OpenAPI/Swagger)
- [ ] Интеграция с BIM (Revit, ArchiCAD)
- [ ] Авто-парсинг входящей почты (ответы поставщиков)
- [ ] Рейтинг поставщиков

---

## 15. Стратегия тестирования

### Принцип: тесты пишутся СРАЗУ после каждого захода

Каждый заход завершается обязательным шагом **"Тесты + Документация + Рефакторинг"** (описан в разделе 14 внутри каждого захода). Автотесты — не опциональны, это критерий готовности захода.

### Структура тестов

```
backend/
├── api_public/
│   └── tests/
│       ├── __init__.py
│       ├── conftest.py          # Фикстуры: estimate_request, portal_config, etc.
│       ├── factories.py         # factory_boy-фабрики для всех моделей
│       ├── test_models.py       # Заход 0+1: модели, валидация, бизнес-логика
│       ├── test_views.py        # Заход 4: API endpoints
│       ├── test_security.py     # Заход 4: honeypot, magic bytes, ZIP, rate limit
│       ├── test_otp.py          # Заход 4: OTP-верификация
│       ├── test_tasks.py        # Заход 5: Celery-задачи
│       └── test_emails.py       # Заход 5: email-уведомления
├── estimates/
│   └── tests/
│       ├── test_specification_item.py    # Заход 0+1: модель SpecificationItem
│       ├── test_specification_parser.py  # Заход 2: LLM-парсер (мок)
│       ├── test_transformer.py           # Заход 2: SpecificationItem → Estimate
│       └── test_excel_exporter.py        # Заход 3: Excel-экспорт + наценка
└── llm_services/
    └── tests/
        └── test_specification_parser.py  # Заход 2: парсер (LLM-моки)
```

### Инструменты

| Инструмент | Назначение |
|-----------|------------|
| `pytest` + `pytest-django` | Основной фреймворк |
| `factory_boy` | Фабрики для создания тестовых данных |
| `pytest-cov` | Измерение покрытия |
| `unittest.mock` / `pytest-mock` | Мок LLM, email, S3 |
| `Playwright` (Заход 7) | E2E тесты фронтенда |

### Требования к покрытию

| Заход | Область | Целевое покрытие |
|-------|---------|-----------------|
| 0+1 | Модели (api_public + SpecificationItem) | ≥ 90% |
| 2 | SpecificationParser + Transformer | ≥ 85% |
| 3 | ExcelExporter + ценообразование | ≥ 90% |
| 4 | API views + security | ≥ 90% |
| 5 | Celery tasks + emails | ≥ 85% |
| 6 | ERP views (backend) | ≥ 80% |
| 7 | Frontend (Vitest + Playwright) | ≥ 70% |

### Команда для запуска

```bash
# Все тесты портала
pytest backend/api_public/tests/ backend/estimates/tests/test_specification_item.py -v --cov=api_public --cov=estimates

# Конкретный заход
pytest backend/api_public/tests/test_models.py -v

# С покрытием
pytest --cov=api_public --cov-report=term-missing
```

### Интеграционные тестовые сценарии (ручная проверка после Захода 5+)

| Сценарий | Вход | Ожидаемый результат |
|----------|------|---------------------|
| Простая спецификация | PDF 3 страницы, 15 позиций | Excel за 5-10 мин, 80%+ exact |
| Большой проект | ZIP 50 файлов, 200 страниц | Excel за 1-2 часа, классификация файлов |
| Excel-ведомость | .xlsx с таблицей оборудования | Excel за 2-3 мин, автодетект колонок |
| Partial success | PDF 30 стр., LLM timeout на стр. 15, 17 | PARTIAL, 28/30 распознано |
| Все файлы ошибка | 3 нераспознаваемых файла | status=ERROR |
| SMTP-сбой | Email-сервер недоступен | status=ready (не error) |
| Celery timeout | Задача > 60 мин | SoftTimeLimitExceeded → error с инфо |
| E2E (Заход 7) | Браузер → email → OTP → PDF → Excel | Полный flow работает |

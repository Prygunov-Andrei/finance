# Парсинг каталогов поставщиков — Документация разработчика

## Архитектура

Система парсинга каталогов состоит из четырёх слоёв:

```
┌────────────────────────────────────────────────────────────┐
│  Frontend: SupplierCatalogsPage / SupplierCatalogDetail    │
│  Поллинг каждые 3 сек при активных задачах                 │
├────────────────────────────────────────────────────────────┤
│  API: SupplierCatalogViewSet (DRF)                         │
│  REST-эндпоинты для CRUD + действий (parse, import, ...)   │
├────────────────────────────────────────────────────────────┤
│  Tasks: Celery-задачи (parse_supplier_catalog_task, ...)   │
│  Асинхронное выполнение с прогрессом через модель          │
├────────────────────────────────────────────────────────────┤
│  Service: CatalogParserService                             │
│  TOC detection, batch parsing, category creation, import   │
│  Использует LLM vision через BaseLLMProvider               │
└────────────────────────────────────────────────────────────┘
```

---

## Модель `SupplierCatalog`

**Файл:** `backend/catalog/models.py`

Жизненный цикл статусов:

```
uploaded → detecting_toc → toc_ready → parsing → parsed → importing → imported
    │             │                        │                    │
    └─────────────┴────────────────────────┴────────────────────┘
                              error
```

Ключевые поля:
- `pdf_file` — FileField, загруженный PDF (`catalogs/suppliers/`)
- `json_file` — FileField, результат парсинга (генерируется автоматически)
- `sections` — JSONField, оглавление каталога (массив секций)
- `status` — TextChoices, текущий статус обработки
- Прогресс: `current_section`, `current_batch`, `total_batches`
- Результаты: `products_count`, `variants_count`, `imported_count`, `categories_created`
- `task_id` — ID Celery-задачи для отслеживания/отмены

---

## Сервис `CatalogParserService`

**Файл:** `backend/catalog/services/catalog_parser.py`

### Методы

#### `detect_toc(toc_pages=6) -> list`

Определяет оглавление каталога через LLM vision.

1. Извлекает первые `toc_pages` страниц PDF (через PyMuPDF)
2. Загружает все активные категории из БД
3. Формирует промпт `TOC_DETECTION_PROMPT` со списком категорий
4. Отправляет PDF + промпт через `provider.parse_with_prompt()`
5. Валидирует и нормализует секции
6. Сохраняет результат в `catalog.sections`

Каждая секция содержит:
```json
{
  "name": "Канальные вентиляторы",
  "pages": [10, 25],
  "category_code": "vent_fans",
  "is_new_category": false
}
```

Для новых категорий добавляются:
```json
{
  "is_new_category": true,
  "new_category_name": "Листовые кабельные лотки",
  "new_category_code": "electrical_trays_sheet",
  "parent_category_code": "electrical_trays"
}
```

#### `ensure_categories() -> int`

Создаёт категории, предложенные LLM (где `is_new_category=True`):
- Проверяет, не создана ли категория ранее
- Находит родительскую категорию по `parent_category_code`
- Создаёт `Category`, обновляет секцию (ставит `is_new_category=False`)
- Возвращает количество созданных категорий

#### `parse_all_sections(progress_callback=None) -> dict`

Парсит все секции батчами по `MAX_PAGES_PER_BATCH` (8) страниц:
1. Извлекает батч страниц из PDF
2. Отправляет в LLM с промптом `PRODUCT_PARSING_PROMPT`
3. Получает массив товаров с вариантами
4. Добавляет метаданные: `catalog_section`, `category_code`, `source_pages`, `supplier`
5. Вызывает `progress_callback` после каждого батча
6. Сохраняет итоговый JSON рядом с PDF

Формат результата:
```json
{
  "supplier": "wheil",
  "source_file": "wheil_duct_equipment.pdf",
  "total_products": 42,
  "total_variants": 380,
  "products": [
    {
      "name": "Воздуховод прямоугольного сечения",
      "description": "...",
      "default_unit": "м²",
      "catalog_section": "Воздуховоды",
      "category_code": "vent_ducts",
      "source_pages": "10-17",
      "supplier": "wheil",
      "variants": [
        {
          "name_suffix": "100x100 L=1500",
          "params": {"A_mm": 100, "B_mm": 100, "L_mm": 1500}
        }
      ]
    }
  ]
}
```

#### `import_to_db(catalog, reset=False) -> int`

Статический метод. Импортирует JSON в таблицу `Product`:
- Каждый вариант → отдельный `Product` (имя = `base_name + name_suffix`)
- Создаёт `ProductAlias` с базовым именем (для матчинга по счетам)
- Создаёт маркер `supplier:{name}` как алиас (для `--reset`)
- При `reset=True` удаляет все старые товары поставщика по маркеру

---

## Celery-задачи

**Файл:** `backend/catalog/tasks.py`

### `parse_supplier_catalog_task(catalog_id, detect_toc=True)`

Полный цикл парсинга:
1. TOC detection (если `detect_toc=True` и секции пусты)
2. Создание недостающих категорий (`ensure_categories`)
3. Парсинг всех секций батчами
4. Сохранение JSON

**Отмена:** перед каждым батчем проверяет `catalog.status`. Если статус изменился (пользователь нажал «Отменить»), бросает `InterruptedError`.

- `time_limit=7200` (2 часа) — для крупных каталогов
- `soft_time_limit=7000`
- `max_retries=0` — без автоповтора

### `import_catalog_to_db_task(catalog_id, reset=False)`

Импорт JSON в БД:
1. Создание недостающих категорий
2. Вызов `CatalogParserService.import_to_db()`

- `time_limit=600` (10 минут)

---

## API-эндпоинты

**Файлы:** `backend/catalog/views.py`, `backend/catalog/urls.py`

Базовый URL: `/api/v1/catalog/supplier-catalogs/`

| Метод | URL | Описание | Статусы |
|-------|-----|----------|---------|
| `GET` | `/` | Список каталогов | — |
| `POST` | `/` | Загрузка PDF (multipart/form-data) | → `uploaded` |
| `GET` | `/{id}/` | Детали + прогресс | — |
| `DELETE` | `/{id}/` | Удалить каталог | — |
| `POST` | `/{id}/detect-toc/` | Определить оглавление (синхронно) | `uploaded/toc_ready/error` → `toc_ready` |
| `PATCH` | `/{id}/update-sections/` | Ручное редактирование секций | — |
| `POST` | `/{id}/parse/` | Запустить парсинг (Celery) | → `parsing` → `parsed` |
| `POST` | `/{id}/import-to-db/` | Импорт в Products (Celery) | `parsed` → `imported` |
| `POST` | `/{id}/cancel/` | Отменить задачу | `parsing/importing` → `toc_ready/uploaded` |

### Загрузка (POST `/`)

Принимает `multipart/form-data`:
- `name` — название каталога
- `supplier_name` — код поставщика (латиницей)
- `pdf_file` — PDF-файл

При загрузке считает количество страниц через PyMuPDF.

### Определение оглавления (POST `/{id}/detect-toc/`)

Опциональный параметр `toc_pages` (по умолчанию 6) — количество первых страниц для анализа.

Выполняется **синхронно** (10–30 секунд), т.к. отправляется всего несколько страниц.

### Парсинг (POST `/{id}/parse/`)

Запускает Celery-задачу `parse_supplier_catalog_task`. Если секции не определены — сначала выполнит TOC detection.

Фронтенд поллит `GET /{id}/` каждые 3 секунды для получения прогресса.

---

## Management commands (CLI)

### `parse_supplier_catalog`

**Файл:** `backend/catalog/management/commands/parse_supplier_catalog.py`

```bash
# Автоматическое определение секций + парсинг
python manage.py parse_supplier_catalog catalog/data/suppliers/wheil/wheil_duct_equipment.pdf --supplier wheil

# С ручными секциями из JSON
python manage.py parse_supplier_catalog ... --supplier wheil --sections-json sections.json

# Только показать план (без API-вызовов)
python manage.py parse_supplier_catalog ... --supplier wheil --dry-run

# Парсить конкретные страницы
python manage.py parse_supplier_catalog ... --supplier wheil --pages 28-50

# Увеличить кол-во страниц для TOC
python manage.py parse_supplier_catalog ... --supplier wheil --toc-pages 10
```

Аргументы:
- `pdf_file` — путь к PDF (обязательный)
- `--supplier` / `-s` — код поставщика (обязательный)
- `--output` / `-o` — путь к выходному JSON (по умолчанию: `{pdf_stem}_products.json`)
- `--dry-run` — показать план без выполнения
- `--pages` — диапазон страниц (1-indexed)
- `--sections-json` — файл с готовыми секциями
- `--toc-pages` — количество страниц для TOC (по умолчанию 6)

Команда создаёт временную запись `SupplierCatalog` в БД и удаляет её после завершения.

### `import_supplier_catalog`

**Файл:** `backend/catalog/management/commands/import_supplier_catalog.py`

```bash
# Импорт JSON в БД
python manage.py import_supplier_catalog catalog/data/suppliers/galvent/galvent_products.json

# С удалением старых товаров
python manage.py import_supplier_catalog ... --reset

# Только показать план
python manage.py import_supplier_catalog ... --dry-run
```

---

## LLM-промпты

### TOC_DETECTION_PROMPT

Определяет секции каталога. Получает:
- PDF первых N страниц (обложка + оглавление)
- Полный список существующих категорий с кодами, именами и родителями

Возвращает JSON: `{"sections": [...]}`

Каждая секция содержит:
- Название раздела, диапазон страниц
- Код существующей категории ИЛИ предложение новой (код, название, родитель)

### PRODUCT_PARSING_PROMPT

Извлекает товары и варианты из страниц каталога. Ключевые правила:
- Каждая строка таблицы — отдельный вариант
- `name` — полное название БЕЗ размеров
- `name_suffix` — ТОЛЬКО размерная часть
- `params` — числовые параметры из таблицы (размеры, вес, площадь)
- Точность: не округлять числа, не пропускать строки

### Как модифицировать промпты

Промпты находятся в `backend/catalog/services/catalog_parser.py` (константы `TOC_DETECTION_PROMPT` и `PRODUCT_PARSING_PROMPT`).

При модификации:
1. Тестируйте на малом каталоге (40–60 страниц)
2. Используйте `--dry-run` для проверки TOC
3. Используйте `--pages 10-20` для парсинга отдельного диапазона
4. Проверяйте JSON на соответствие формату (валидный JSON, все поля заполнены)

---

## Батчинг

Константа `MAX_PAGES_PER_BATCH = 8` определяет максимальное количество страниц в одном LLM-вызове.

**Почему 8:**
- Большинство LLM vision моделей обрабатывают 8 страниц PDF за один вызов
- Слишком мало (2–3) — много вызовов, медленно и дорого
- Слишком много (15+) — LLM теряет точность, пропускает строки таблиц

Для изменения — отредактируйте константу в `catalog/services/catalog_parser.py`.

---

## Структура файлов каталогов

```
backend/catalog/data/suppliers/
├── galvent/
│   └── galvent_catalog_products.json      # Результат парсинга (Галвент)
└── wheil/
    ├── wheil_duct_equipment.pdf           # Канальное оборудование (117 стр.)
    ├── wheil_duct_equipment_products.json  # Результат парсинга
    ├── wheil_grilles.pdf                  # Вентиляционные решётки (40 стр.)
    ├── wheil_grilles_products.json
    ├── wheil_cable_trays.pdf              # Кабеленесущие системы (52 стр.)
    ├── wheil_cable_trays_products.json
    ├── wheil_accessories.pdf              # Комплектующие (60 стр.)
    └── wheil_accessories_products.json
```

Загруженные через UI каталоги хранятся в `backend/media/catalogs/suppliers/`.

---

## Подключение к `setup_clean_db`

**Файл:** `backend/core/management/commands/setup_clean_db.py`

Константа `SUPPLIER_CATALOGS` содержит пути к JSON-файлам, которые импортируются на шаге 5 команды `setup_clean_db`:

```python
SUPPLIER_CATALOGS = [
    Path(...) / 'catalog' / 'data' / 'suppliers' / 'galvent' / 'galvent_catalog_products.json',
    Path(...) / 'catalog' / 'data' / 'suppliers' / 'wheil' / 'wheil_duct_equipment_products.json',
    Path(...) / 'catalog' / 'data' / 'suppliers' / 'wheil' / 'wheil_grilles_products.json',
    Path(...) / 'catalog' / 'data' / 'suppliers' / 'wheil' / 'wheil_cable_trays_products.json',
    Path(...) / 'catalog' / 'data' / 'suppliers' / 'wheil' / 'wheil_accessories_products.json',
]
```

Для добавления нового поставщика:
1. Распарсите каталог через CLI или UI
2. Поместите `_products.json` в `catalog/data/suppliers/{supplier}/`
3. Добавьте путь в `SUPPLIER_CATALOGS`

---

## Добавление нового поставщика

### Через UI

1. Перейти в «Каталоги поставщиков» → «Загрузить каталог»
2. Указать новый код поставщика (латиницей, без пробелов)
3. Определить оглавление → проверить секции → запустить парсинг → импортировать

### Через CLI

```bash
# 1. Распарсить каталог
python manage.py parse_supplier_catalog path/to/catalog.pdf --supplier mynewsupplier

# 2. Проверить результат
python manage.py import_supplier_catalog path/to/catalog_products.json --dry-run

# 3. Импортировать в БД
python manage.py import_supplier_catalog path/to/catalog_products.json --reset
```

---

## Автоматическое создание категорий

При определении оглавления LLM получает полный список существующих категорий. Если для раздела каталога нет подходящей категории, LLM предлагает:
- Код новой категории (латиница, snake_case)
- Название на русском
- Родительскую категорию

Пример: каталог КНС содержит «Листовые лотки». В БД есть только `electrical_trays` (Кабельные лотки). LLM предложит:
- `electrical_trays_sheet` — «Листовые кабельные лотки» (parent: `electrical_trays`)
- `electrical_trays_wire` — «Проволочные кабельные лотки» (parent: `electrical_trays`)

Категории создаются:
- В Celery-задаче — автоматически перед парсингом
- В CLI — вызовом `service.ensure_categories()`
- В UI — пользователь видит жёлтые бейджи и может отредактировать перед подтверждением

---

## Troubleshooting

### Невалидный JSON от LLM

LLM иногда оборачивает JSON в markdown-блоки (\`\`\`json ... \`\`\`). Метод `parse_with_prompt()` в `BaseLLMProvider` уже обрабатывает этот случай — снимает markdown-обёртку перед `json.loads()`.

Если ошибка повторяется:
- Проверьте промпт — он должен явно указывать «Верни ТОЛЬКО валидный JSON без markdown-форматирования»
- Попробуйте другого LLM-провайдера (Gemini обычно стабильнее с JSON)

### Rate limiting

При парсинге крупного каталога (100+ страниц) возможно превышение лимитов LLM API. Решения:
- Увеличить `MAX_PAGES_PER_BATCH` (меньше вызовов, но возможна потеря точности)
- Добавить `time.sleep()` между батчами в `parse_all_sections()`
- Использовать LLM-провайдер с более высокими лимитами

### Ошибка «fitz not found»

PyMuPDF (`fitz`) должен быть установлен: `pip install PyMuPDF`.

### Пустой результат парсинга

- Убедитесь, что страницы содержат таблицы с данными (а не только изображения)
- Проверьте диапазоны страниц в секциях
- Попробуйте парсить отдельную секцию через CLI: `--pages 10-20`

### Дубликаты при повторном импорте

При повторном импорте без `--reset` / `reset=True` создаются дубликаты товаров. Всегда используйте reset при обновлении каталога поставщика.

---

## Используемые зависимости

- **PyMuPDF** (`fitz`) — работа с PDF (извлечение страниц, подсчёт)
- **Celery** — асинхронное выполнение задач
- **LLM Providers** (`llm_services/providers/`) — отправка PDF в нейросеть
  - `get_provider()` — фабрика для получения текущего провайдера
  - `BaseLLMProvider.parse_with_prompt()` — отправка файла + промпта в LLM

## Ключевые файлы

| Файл | Назначение |
|------|-----------|
| `catalog/models.py` | Модель `SupplierCatalog` |
| `catalog/services/catalog_parser.py` | Сервис парсинга, промпты |
| `catalog/tasks.py` | Celery-задачи |
| `catalog/views.py` | API (SupplierCatalogViewSet) |
| `catalog/serializers.py` | DRF-сериализаторы |
| `catalog/urls.py` | URL-маршруты |
| `catalog/management/commands/parse_supplier_catalog.py` | CLI: парсинг |
| `catalog/management/commands/import_supplier_catalog.py` | CLI: импорт |
| `core/management/commands/setup_clean_db.py` | Скрипт первоначального наполнения |
| `frontend/components/catalog/SupplierCatalogsPage.tsx` | Список каталогов |
| `frontend/components/catalog/SupplierCatalogDetail.tsx` | Детали каталога |
| `frontend/types/catalog.ts` | TypeScript-типы |
| `frontend/lib/api.ts` | API-методы |

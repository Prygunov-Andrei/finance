# Модуль Сметы (Estimates) — Документация разработчика

## Модели данных

```
Estimate (Смета)
├── EstimateSection (Раздел)  — FK estimate, sort_order, name
│   ├── EstimateSubsection    — FK section, суммы продаж/закупок
│   └── EstimateItem (Строка) — FK estimate + FK section, позиция с ценами
├── EstimateCharacteristic    — FK estimate, авто/ручные характеристики
└── MountingEstimate          — FK source_estimate, монтажная смета
```

### Ключевые модели

| Модель | Файл | Описание |
|--------|------|----------|
| `Estimate` | `models.py:~200` | Смета с версионированием, статусами, НДС |
| `EstimateSection` | `models.py:~594` | Раздел сметы (sort_order для порядка) |
| `EstimateItem` | `models.py:~712` | Строка сметы — товар/работа с количеством и ценами |
| `EstimateSubsection` | `models.py` | Подраздел (для ручных смет со сводной стоимостью) |
| `EstimateCharacteristic` | `models.py` | Характеристика (Материалы, Работы, Доставка и т.д.) |
| `MountingEstimate` | `models.py` | Монтажная смета (создаётся из обычной) |

### EstimateItem: ordering

```python
class Meta:
    ordering = ['section__sort_order', 'sort_order', 'item_number']
```

---

## API эндпоинты

### Сметы

| Метод | URL | Описание |
|-------|-----|----------|
| GET/POST | `/api/v1/estimates/` | Список / создание смет |
| GET/PATCH/DELETE | `/api/v1/estimates/{id}/` | Детали / обновление / удаление |
| POST | `/api/v1/estimates/{id}/create-version/` | Создать новую версию |
| POST | `/api/v1/estimates/{id}/create-mounting-estimate/` | Создать монтажную смету |
| GET | `/api/v1/estimates/{id}/versions/` | История версий |

### Разделы

| Метод | URL | Описание |
|-------|-----|----------|
| GET/POST | `/api/v1/estimate-sections/` | Список / создание разделов |
| GET/PATCH/DELETE | `/api/v1/estimate-sections/{id}/` | CRUD раздела |
| POST | `/api/v1/estimate-sections/{id}/demote-to-item/` | Снять раздел — превратить в строку |

### Строки сметы (Items)

| Метод | URL | Описание |
|-------|-----|----------|
| GET/POST | `/api/v1/estimate-items/` | Список / создание строк |
| GET/PATCH/DELETE | `/api/v1/estimate-items/{id}/` | CRUD строки |
| POST | `/api/v1/estimate-items/{id}/promote-to-section/` | Назначить строку заголовком раздела |
| POST | `/api/v1/estimate-items/import/` | Импорт из Excel/PDF (синхронный, preview) |
| POST | `/api/v1/estimate-items/import-rows/` | Сохранение строк из предпросмотра |
| POST | `/api/v1/estimate-items/import-pdf/` | Запуск постраничного импорта PDF (Celery) |
| POST | `/api/v1/estimate-items/import-project-file-pdf/` | Async-импорт PDF из файлов проекта (Celery) |
| GET | `/api/v1/estimate-items/import-progress/{session_id}/` | Polling прогресса PDF-импорта |
| POST | `/api/v1/estimate-items/import-cancel/{session_id}/` | Отмена PDF-импорта |
| POST | `/api/v1/estimate-items/auto-match/` | Автоподбор цен из каталога |
| POST | `/api/v1/estimate-items/start-work-matching/` | Запуск async подбора работ (Celery) |
| GET | `/api/v1/estimate-items/work-matching-progress/{session_id}/` | Polling прогресса подбора работ |
| POST | `/api/v1/estimate-items/cancel-work-matching/{session_id}/` | Отмена подбора работ |
| POST | `/api/v1/estimate-items/apply-work-matching/` | Применить подобранные работы |
| POST | `/api/v1/estimate-items/bulk-merge/` | Объединить выбранные строки в одну |
| POST | `/api/v1/estimate-items/bulk-update/` | Массовое обновление полей (whitelist, transaction.atomic) |
| POST | `/api/v1/estimate-items/bulk-set-markup/` | Массовая установка наценки (percent/fixed_price/fixed_amount/clear) |
| POST | `/api/v1/estimate-items/{id}/move/` | Переместить строку вверх/вниз или в другой раздел |
| POST | `/api/v1/estimate-items/bulk-move/` | Переместить группу строк на указанную позицию |
| GET | `/api/v1/estimates/{id}/export/` | Экспорт в Excel (?mode=internal\|external) |
| GET | `/api/v1/estimate-markup-defaults/` | Глобальные дефолтные наценки (синглтон) |

**Пагинация:** `page_size=200`, `page_size=all` отключает пагинацию.

---

## Сервисы

### `MarkupService` (`services/markup_service.py`)

Единый источник правды для расчёта продажных цен:

| Функция | Описание |
|---------|----------|
| `resolve_material_sale_price(purchase, markup_type, markup_value, section_pct, estimate_pct)` | Продажная цена материала за единицу |
| `resolve_work_sale_price(...)` | Продажная цена работы за единицу |
| `recalculate_subsections_for_items(item_ids)` | Пересчёт подразделов для затронутых строк |
| `recalculate_estimate_subsections(estimate_id)` | Пересчёт ВСЕХ подразделов сметы |
| `recalculate_section_subsections(section_id)` | Пересчёт подразделов одного раздела |
| `bulk_set_item_markup(item_ids, ...)` | Массовая установка наценки + пересчёт |

### `EstimateImportService` (`services/estimate_import_service.py`)

| Метод | Описание |
|-------|----------|
| `import_from_excel(file_content, filename)` | Парсинг Excel → `ParsedEstimate` |
| `import_from_pdf(file_content, filename)` | Парсинг PDF через LLM → `ParsedEstimate` (макс 15 стр.) |
| `save_imported_items(estimate_id, parsed)` | Сохранение из `ParsedEstimate` (bulk_create, @transaction.atomic) |
| `save_rows_from_preview(estimate_id, rows)` | Сохранение строк из JSON-предпросмотра |
| `promote_item_to_section(item_id)` | Превращает строку в раздел |
| `demote_section_to_item(section_id)` | Превращает раздел обратно в строку |
| `merge_items(item_ids)` | Объединение строк: конкатенация текста, удаление дублей, перенумерация |

### `ParsedEstimate` (`services/estimate_import_schemas.py`)

Pydantic-модель результата парсинга:
- `rows: List[EstimateImportRow]` — распознанные строки
- `sections: List[str]` — уникальные названия разделов
- `total_rows: int` — количество строк
- `confidence: float` — уверенность парсинга (0.0–1.0)
- `warnings: List[str]` — предупреждения (напр. "обработано 15 из 87 страниц")

---

## Импорт смет — архитектура

### Excel (синхронный)

```
Frontend                          Backend
POST /import/ (preview=true)  →   EstimateImportService.import_from_excel()
                              ←   {rows, sections, confidence, warnings}
POST /import-rows/            →   EstimateImportService.save_rows_from_preview()
                              ←   {created_count, item_ids}
```

Парсинг через `openpyxl`: детекция заголовков по HEADER_KEYWORDS, эвристический fallback.

### PDF (асинхронный, Celery + Redis)

```
Frontend                          Backend
POST /import-pdf/             →   create_import_session() → Redis + файл на диск
                              ←   {session_id, total_pages} (HTTP 202)

[Celery worker]                   process_estimate_pdf_pages(session_id)
                                  Для каждой страницы:
                                    1. Рендер PNG (PyMuPDF, DPI=100)
                                    2. POST в LLM (system prompt)
                                    3. Парсинг JSON-ответа
                                    4. Обновление Redis (rows, progress, errors)
                                  Статус: processing → completed/error

GET /import-progress/{id}/    →   get_session_data(session_id) → чтение Redis
                              ←   {status, current_page, rows, sections, errors}
(polling каждые 3 сек)

POST /import-cancel/{id}/     →   cancel_session() → status='cancelled' в Redis
                              ←   {status: 'cancelled'}

POST /import-rows/            →   save_rows_from_preview() — финальное сохранение
                              ←   {created_count, item_ids}
```

**Redis ключ:** `estimate_import:{session_id}` (hash), TTL = 3600 сек.
**Celery task:** `process_estimate_pdf_pages`, time_limit=3600, soft_time_limit=3400.
**Temp файлы:** `{MEDIA_ROOT}/tmp/estimate_imports/{session_id}.pdf` — удаляются после обработки.

### Валидация файлов (бэкенд)

- Максимальный размер: 50 МБ (`MAX_IMPORT_FILE_SIZE`)
- Проверка пустого файла: `file.size == 0`
- Расширение + MIME-type: `.xlsx`/`.xls` + `application/vnd.openxmlformats-...`, `.pdf` + `application/pdf`
- Валидация `rows` в `import-rows`: каждый элемент — dict с непустым `name`
- session_id в URL: строго `[a-f0-9]{16}`

### Фронтенд: EstimateImportDialog

**Компонент:** `frontend/components/erp/components/estimates/EstimateImportDialog.tsx`

Шаги (step machine): `upload → parsing/progressive → preview → done`

**Сворачиваемый режим (для PDF):**
- Состояние `isMinimized` — диалог сворачивается в floating chip (через `createPortal`)
- Polling продолжает работать в свёрнутом виде
- При закрытии диалога во время `progressive` → автосворачивание (не cancel)
- При завершении в свёрнутом виде: звуковой сигнал (`AudioContext` beep) + авторазворачивание + toast
- `beforeunload` warning при уходе со страницы во время импорта

**Защита от потери данных:**
- `AbortController` для отмены in-flight fetch при unmount
- `estimateIdRef` — стабильная ссылка на estimateId
- `previewDataRef` — для доступа к данным в catch без зависимости в useEffect
- Оптимизация: previewData обновляется только при изменении количества строк

---

## Promote / Demote — как работает

### Promote (строка → раздел)

1. Находит строку и её текущий раздел
2. Сдвигает sort_order всех последующих секций на +1
3. Создаёт новую секцию с `name = item.name`
4. Все строки той же секции с `sort_order > item.sort_order` переезжают в новую секцию
5. Исходная строка удаляется

### Demote (раздел → строка)

1. Находит предыдущую секцию (по sort_order)
2. Если предыдущей нет — создаёт «Основной раздел»
3. Создаёт новую строку с `name = section.name`, нулевыми ценами
4. Все строки удаляемой секции переезжают в предыдущую
5. Секция удаляется

Оба метода обёрнуты в `@transaction.atomic` и используют bulk `.update()`.

---

## Перемещение строк (Move)

### API

`POST /api/v1/estimate-items/{id}/move/`

Параметры (JSON body):
- `direction: "up" | "down"` — перемещение на одну позицию внутри секции
- `target_section_id: number` — перемещение в другой раздел (в конец)

Ответ: `{ "moved": true/false }`

### Оптимизация move_up / move_down

Для перемещения вверх/вниз используется **прямой swap** `sort_order` + `item_number` двух соседних строк. Полная перенумерация `_renumber_items()` **не вызывается** — это эквивалентно для соседних элементов и сокращает число SQL-запросов с 6+ до 4.

`_renumber_items()` по-прежнему вызывается при:
- `promote_item_to_section` / `demote_section_to_item`
- `move_item_to_section`
- `bulk_move_items`
- `merge_items`

---

## Фронтенд

### `EstimateItemsEditor.tsx`

Основной редактор строк сметы. Использует:

- **TanStack Table** — виртуализация, column resizing, row selection
- **TanStack Query** — кэширование, invalidation, optimistic updates
- **Смешанный список** — секции отображаются как виртуальные строки-заголовки (id = `-section.id`)

```
TableRow = EstimateItem & { _isSection?: boolean; _sectionId?: number }
```

Порядок строк: секции по `sort_order`, внутри каждой — items по `sort_order → item_number`.

### Optimistic updates для перемещения строк

`moveMutation` использует optimistic update для мгновенного отклика UI:
- `onMutate` — swap `sort_order` + `item_number` в кеше React Query (без ожидания сервера)
- `onError` — откат к snapshot + toast ошибки
- `onSettled` — фоновая инвалидация `estimate-items` для eventual consistency

### boundaryMap — мемоизация isFirst/isLast

Для кнопок вверх/вниз нужно знать, является ли строка первой/последней в секции. Вместо O(n²) вычислений (filter + sort + findIndex на каждую строку при каждом рендере) используется `useMemo` с `Map<itemId, {isFirst, isLast}>` — O(n) предрасчёт, O(1) lookup.

### Кнопка FolderOpen

- На обычной строке: назначить разделом (promote)
- На заголовке раздела: снять раздел (demote)
- Видна только при `!readOnly`

---

## Тестирование

```bash
# Все тесты модуля
cd backend && DB_PORT=5432 DB_PASSWORD=postgres python -m pytest estimates/tests/ -v --no-cov

# Только move
cd backend && DB_PORT=5432 DB_PASSWORD=postgres python -m pytest estimates/tests/test_api.py -k "Move" -v --no-cov

# Только promote/demote
cd backend && DB_PORT=5432 DB_PASSWORD=postgres python -m pytest estimates/tests/test_api.py -k "Promotion" -v --no-cov
```

> **Важно:** Для тестов используйте локальный postgres (порт 5432), а не SSH-туннель к проду (порт 15432).

*Последнее обновление: Март 2026*

# Mock ERP catalog API

Flask-приложение, эмулирующее API каталога и прайсов ERP (см. [`specs/02-api-contracts.md §4`](../../../specs/02-api-contracts.md)).

## Запуск

```bash
pip install flask
python server.py
# сервер на http://localhost:5002
```

## Endpoints

Все возвращают JSON.

- `GET /api/erp-catalog/v1/health` — проверка.
- `GET /api/erp-catalog/v1/products?cursor&modified_since` — товары (100 штук в фикстуре).
- `GET /api/erp-catalog/v1/products/{id}` — детали одного товара.
- `GET /api/erp-catalog/v1/products/{id}/price-history` — история цен товара.
- `GET /api/erp-catalog/v1/work-items?price_list_id&cursor` — расценки (238 штук).
- `GET /api/erp-catalog/v1/work-sections` — секции прайса (24).
- `GET /api/erp-catalog/v1/worker-grades?price_list_id` — грейды (5, со ставками).
- `GET /api/erp-catalog/v1/counterparties?q&limit` — контрагенты.
- `GET /api/erp-catalog/v1/legal-entities` — юр. лица.
- `GET /api/erp-catalog/v1/objects?q&cursor` — объекты.
- `GET /api/erp-catalog/v1/currency-rates` — текущие курсы ЦБР.
- `GET /api/erp-catalog/v1/events?since_event_id&limit` — polling fallback.

## Фикстуры

В `fixtures/`:
- `products.json` — 100 товаров;
- `work-items.json` — 238 расценок;
- `work-sections.json` — 24 секции;
- `worker-grades.json` — 5 грейдов со ставками;
- `counterparties.json` — контрагенты;
- `legal-entities.json` — юр. лица (3 как на проде);
- `objects.json` — 5 объектов;
- `currency-rates.json` — курсы на выбранную дату;
- `events.json` — массив событий для polling-симуляции.

## Заглушки вместо реальных фикстур

В скелете фикстуры — минимальные (по 3-5 элементов). Наполнение до production-уровня — в эпике E13 (со снимком реальных данных после анонимизации).

## Замечания

- Подпись webhook'ов не имитируется.
- Авторизация не проверяется.
- Rate limits не реализованы.

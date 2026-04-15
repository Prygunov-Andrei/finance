# Mock сервиса распознавания

Flask-приложение, эмулирующее API распознавания документов (см. [`specs/02-api-contracts.md §5`](../../../specs/02-api-contracts.md)).

## Запуск

```bash
pip install flask
python server.py
# сервер на http://localhost:5001
```

## Endpoints

- `POST /api/recognition/v1/sessions` — принимает multipart-файл, возвращает `{session_id, status:"pending"}`.
- `GET /api/recognition/v1/sessions/{id}` — статус.
- `GET /api/recognition/v1/sessions/{id}/result` — результат (фикстура из `fixtures/`).

## Фикстуры

| Файл | Содержит |
|---|---|
| `fixtures/vent-20.json` | распознанная спецификация на 20 строк, вентиляция |
| `fixtures/cond-50.json` | 50 строк, кондиционирование |
| `fixtures/mixed-200.json` | 200 строк, смешанная ОВиК+СС |

Mock выбирает фикстуру по имени загруженного файла (если содержит «vent» — отдаёт vent-20, и т.д.).

## Замечания

- 2 секунды задержки перед возвратом результата — имитация работы реального сервиса.
- Результат всегда "done" — сценарии частичного парсинга не эмулируются.
- Можно добавить свою фикстуру — положи JSON в `fixtures/` с именем `{pattern}.json`.

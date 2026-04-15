# Troubleshooting

Типовые проблемы и решения. Пополняется по мере появления.

## Локальный запуск

### `./dev-local.sh` падает с ошибкой «port already in use»

Портовой конфликт. Скорее всего, прошлый экземпляр не остановился.

```bash
./dev-stop.sh
# или вручную
lsof -ti :8001 | xargs kill -9   # ISMeta backend
lsof -ti :3001 | xargs kill -9   # ISMeta frontend
```

### `make ismeta-setup` падает на `createdb ismeta`

Postgres не запущен или роль `ismeta` не существует.

```bash
# Проверить, что Postgres запущен
pg_isready

# Создать роль (если нужно)
createuser -s ismeta

# Повторить
make ismeta-setup
```

### `psycopg: could not translate host name "..."`

В `.env.local` неправильный `DATABASE_URL` или `DB_HOST`. Сверься с `.env.example`.

## Интеграция с ERP

### `curl http://localhost:8000/api/erp-catalog/v1/health` — 404

ERP либо не запущен, либо ещё не закрыт E13. Альтернативы:
1. Запустить ERP: см. `../CLAUDE.md`.
2. Использовать mock: `make mock-erp-catalog`, затем в `backend/.env.local`:
   ```
   ERP_CATALOG_BASE_URL=http://localhost:5002
   ```
3. Спросить в `#erp-ismeta-sync`, дошёл ли E13 до стабильного состояния.

### Webhook от ERP не доходит до ISMeta

Порядок диагностики:
1. Проверить таблицу `erp.outbox` на стороне ERP: `SELECT * FROM erp.outbox WHERE sent_at IS NULL;` — есть накопившиеся?
2. Проверить воркер ERP: `celery -A <erp-project> inspect active` — жив ли он?
3. Логи ISMeta: `logs/ismeta-backend.log` — есть ли 4xx/5xx при приёме?
4. HMAC-подпись: отладить через `make test-webhook-signature`.

### «401 Unauthorized» при открытии виджета

Master-token разошёлся между `.env.local` ERP и ISMeta.

```bash
# В backend/.env.local (ERP)
ISMETA_MASTER_TOKEN=...

# В ismeta/backend/.env.local
ERP_MASTER_TOKEN=...   # должен совпадать
```

## LLM

### `openai.RateLimitError: 429`

Превышена квота OpenAI. Варианты:
1. Переключиться на cassette: `ISMETA_LLM_MODE=cassette make ismeta-backend-run`.
2. Переключиться на Gemini или Grok (если ключи в `.env.local`).
3. Подождать (rate limit обычно сбрасывается за 1 минуту).

### Стоимость токенов взлетает в тестах

Проверь:
- cassette не обновились? (не запускай в `real` режиме без необходимости)
- зацикленный агент (lоgs: много `tool_call` подряд для одного вопроса) — зафиксируй в issue.

### LLM-ответ не соответствует JSON Schema

Возможные причины:
- модель сменилась (проверь `LLM_MODEL_AGENT_CHAT` в `.env`);
- system prompt был обновлён без cassette-rewrite (обнови cassette);
- провайдер вернул недетерминированный ответ (temperature повышена?).

## Миграции БД

### `django.db.utils.IntegrityError: null value in column "workspace_id"`

Забыл `workspace_id` при создании объекта. Это не баг миграции, а баг бизнес-логики. Проверь код создания; обычно `workspace_id` должен браться из `request` через middleware.

### Миграция не откатывается

Если `RunPython` не имеет `reverse_code`:
```python
# неверно:
migrations.RunPython(forward)

# верно:
migrations.RunPython(forward, backward)
# или явно:
migrations.RunPython(forward, migrations.RunPython.noop)
```

## CI

### Локально проходит, в CI красный

Вероятные причины:
- не учтены env-переменные (в CI свой набор);
- race-condition в тестах (попробуй `pytest -p no:randomly`);
- рассинхрон версий (проверь `requirements.txt` и lock-файлы);
- pact-контракт разошёлся (обнови).

### Coverage упал

Найди недопокрытые строки: `make ismeta-test-backend` → отчёт в терминале; открой `htmlcov/index.html` для деталей.

## Production / Staging

В MVP коробки ещё нет. Для staging — см. `docs/admin/staging-runbook.md` (создастся в E23).

## Что делать, если решение не нашёл

1. Поиск по `#ismeta-dev` — возможно, кто-то уже сталкивался.
2. Поиск в closed issues таск-трекера.
3. Ping buddy или `#ismeta-dev`.
4. Если проблема типовая — добавь сюда PR после решения.

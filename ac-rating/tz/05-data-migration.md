# ТЗ Фазы 5 — Миграция данных (SQL-дамп Максима)

**Фаза:** 5 из 10
**Ветка:** `ac-rating/05-data-migration` (от `main`)
**Зависит от:** Фаза 4B (нужны таблицы ac_*, admin, scoring engine)
**Оценка:** 0.5 дня

## Контекст

Ф4B в main — вся инфраструктура готова (admin, API, scoring). Сейчас пишем **management command** `load_ac_rating_dump`, который парсит pg_dump Максима и загружает ~40-50 моделей кондиционеров + методику + отзывы + заявки в ERP-БД с маппингом имён таблиц.

Дамп: `~/Downloads/ac_rating_2026-04-18.sql` (647 KB, plain SQL от `pg_dump 16.13`). Содержит 31 таблицу (из них нас интересует 16, остальные — auth/django_system/legacy).

## ⚠️ КРИТИЧНО: Безопасность

**SSH-туннель (`localhost:15432`) ведёт в ПРОД-БД ERP.** Если ты запустишь команду против него — зальёшь данные в прод.

Правила:
1. **Тестирование команды — только на локальном Postgres** (не через туннель). Максимовский стенд уже крутит локальный PG на `:5432`, используй его: создай отдельную БД `finans_assistant_dev` через `createdb -p 5432 -U postgres finans_assistant_dev`, примени миграции ERP (`DATABASES.default.HOST='localhost', PORT=5432`), грузи туда.
2. **Прогон pytest на тестовой БД через туннель — ОК** (pytest-django создаёт `test_finans_assistant`, она пересоздаётся каждый раз, следа в проде нет). Это уже проверенный pattern в Ф2-4.
3. **В самой команде** — перед `TRUNCATE`/`INSERT` выводить `Target DB: HOST=X, NAME=Y` и требовать подтверждение через `--yes-i-am-sure` в non-dry-run режиме.
4. **Реальную загрузку в прод** — **НЕ делаешь ты**, это сделает Андрей отдельно через deploy-скрипт (Ф10). Твоя задача — написать и протестировать команду.

Зафиксируй в отчёте на каком хосте/БД тестировал (и что не через туннель).

## Что загружаем (маппинг таблиц)

Дамп содержит 31 CREATE TABLE. Грузим 16 (с переименованием), остальные скипаем.

### Переносим (с маппингом)

Порядок важен (от независимых → к зависимым, из-за FK):

| # | Источник (`public.*` в дампе) | Цель (`public.*` в ERP БД) |
|---|---|---|
| 1 | `brands_brandoriginclass` | `ac_brands_brandoriginclass` |
| 2 | `brands_brand` | `ac_brands_brand` |
| 3 | `catalog_equipmenttype` | `ac_catalog_equipmenttype` |
| 4 | `methodology_methodologyversion` | `ac_methodology_methodologyversion` |
| 5 | `methodology_criterion` | `ac_methodology_criterion` |
| 6 | `methodology_methodologycriterion` | `ac_methodology_methodologycriterion` |
| 7 | `catalog_acmodel` | `ac_catalog_acmodel` |
| 8 | `catalog_modelregion` | `ac_catalog_modelregion` |
| 9 | `catalog_acmodelphoto` | `ac_catalog_acmodelphoto` |
| 10 | `catalog_acmodelsupplier` | `ac_catalog_acmodelsupplier` |
| 11 | `catalog_modelrawvalue` | `ac_catalog_modelrawvalue` |
| 12 | `scoring_calculationrun` | `ac_scoring_calculationrun` |
| 13 | `scoring_calculationresult` | `ac_scoring_calculationresult` |
| 14 | `reviews_review` | `ac_reviews_review` |
| 15 | `submissions_acsubmission` | `ac_submissions_acsubmission` |
| 16 | `submissions_submissionphoto` | `ac_submissions_submissionphoto` |

### Скипаем

- `auth_*` (6 таблиц) — свои юзеры ERP
- `core_auditlog`, `core_page` — ERP использует свои
- `django_admin_log`, `django_content_type`, `django_migrations`, `django_session` — системные Django-таблицы, совпадение приведёт к конфликтам
- `methodology_criteriongroup` — deprecated, не переносили в Ф2
- `ratings_airconditioner`, `ratings_parametervalue` — legacy v1

### FK на User — обнуляем

У Максима `scoring_calculationrun.triggered_by_id`, `catalog_modelrawvalue.entered_by_id`, `catalog_modelrawvalue.approved_by_id` — FK на `auth_user` (Максимовские юзеры). В ERP это будут другие user_id. При загрузке **проставлять NULL** во все эти колонки (поля допускают NULL — проверь в Ф2-моделях).

## Задачи

### 1. Management command `load_ac_rating_dump`

Файл: `backend/ac_catalog/management/commands/load_ac_rating_dump.py`

Сигнатура:
```
manage.py load_ac_rating_dump <path-to-sql-file>
  [--truncate]          # TRUNCATE всех 16 ac_* таблиц перед загрузкой
  [--dry-run]           # Распарсить, вывести статистику, не писать в БД
  [--recalculate]       # После загрузки вызвать recalculate_all
  [--yes-i-am-sure]     # Без этого флага команда в non-dry-run требует подтверждения после показа target DB
```

### 2. Парсинг дампа

Формат дампа: plain SQL от `pg_dump`. Искать блоки `COPY public.<table> (col1, col2, ...) FROM stdin;\n<data>\n\\.\n`.

Алгоритм:
1. Прочитать весь файл (~647 KB — в память влезет).
2. Регуляркой найти все COPY-блоки: `r"COPY public\.(\w+) \(([^)]+)\) FROM stdin;\n(.*?)\n\\\.\n"` с флагом `re.DOTALL`.
3. Для каждого блока: если таблица в маппинге (п. «Переносим») — обработать, иначе пропустить.
4. Обработка:
   - Переименовать target table
   - Обнулить FK-колонки user-ов (`triggered_by_id`, `entered_by_id`, `approved_by_id`) — в данных заменить значение на `\N` (psql NULL-маркер)
   - Выполнить через `connection.cursor().copy_expert(...)` или сырой COPY
5. После всех COPY — обновить sequences:
   ```sql
   SELECT setval(pg_get_serial_sequence('ac_catalog_acmodel', 'id'), COALESCE(MAX(id), 1)) FROM ac_catalog_acmodel;
   ```
   для каждой таблицы с SERIAL PK.

### 3. Идемпотентность

- Без `--truncate`: если таблица не пустая — **отказ** с сообщением «таблица X уже содержит данные, используй --truncate». Не пытаемся merge — дамп содержит id-шки, которые пересекутся.
- С `--truncate`: `TRUNCATE ac_brands_brand, ac_brands_brandoriginclass, ..., ac_submissions_submissionphoto RESTART IDENTITY CASCADE;` (одним statement — все 16 таблиц, учитывая CASCADE от FK).

### 4. Транзакционность

Вся загрузка — в одной `transaction.atomic()`. Если COPY любой таблицы упал — откат всех предыдущих.

### 5. Пересчёт индексов

Если передан `--recalculate`:
- После успешной загрузки вызвать `from ac_scoring.engine import recalculate_all; recalculate_all()`.
- Вывести: «Пересчитано N моделей, total_index в диапазоне [min, max]».

### 6. Безопасность в самой команде

```python
db = settings.DATABASES["default"]
self.stdout.write(f"Target DB: HOST={db['HOST']}:{db.get('PORT','5432')}, NAME={db['NAME']}")
if not options["dry_run"] and not options["yes_i_am_sure"]:
    self.stdout.write(self.style.WARNING("Это запишет данные в указанную БД."))
    self.stdout.write("Если ты уверен — перезапусти с --yes-i-am-sure.")
    return
```

### 7. Тесты

**`ac_catalog/tests/test_load_dump.py`**:

1. **Parsing**: подготовь маленький synthetic-дамп-string в памяти с 2-3 COPY-блоками (1 нужный + 1 скипаемый), запусти парсер — проверь что нужный распознан, имя переименовано, колонки user-FK получили `\N`.
2. **Dry-run**: `call_command('load_ac_rating_dump', tmp_path, '--dry-run')` — в БД нет данных после, но в stdout есть статистика «N строк для таблицы X».
3. **Full load** (на тестовой БД через pytest-django):
   - Подготовь tmpfile с пачкой минимальных COPY-блоков для 4-5 таблиц (brand_origin, brand, equipment_type, methodology, acmodel, raw_value)
   - Выполни `call_command('load_ac_rating_dump', tmp, '--yes-i-am-sure')`
   - Через ORM проверь: `Brand.objects.count() == N`, `ACModel.objects.count() == M`, FK правильные
4. **Truncate**: загрузи, вызови повторно без `--truncate` → ошибка; с `--truncate` → переписано.
5. **Recalculate**: после `--recalculate` у ACModel.total_index > 0 (если в дампе есть raw_value + методика).

Synthetic dump можно сгенерировать через `pg_dump` из Django-ORM (создай фабрику + factory.create() + dumpdata), или руками собрать строку в формате pg_dump. Руками проще — COPY-блок состоит из заголовка + TAB-separated значений.

### 8. Документация

В docstring команды + в `docs/ac_rating/data-migration.md` (новый файл) описать процесс для Андрея:
1. Скачать дамп Максима в `~/Downloads/`
2. Создать локальную dev-БД ERP: `createdb -U postgres finans_assistant_dev` + `DJANGO_SETTINGS_MODULE=... DATABASE_URL=... python manage.py migrate`
3. `python manage.py load_ac_rating_dump ~/Downloads/ac_rating_2026-04-18.sql --truncate --recalculate --yes-i-am-sure`
4. `python manage.py runserver` → `http://localhost:8000/admin/ac_catalog/acmodel/` — должны быть модели
5. Media: скопировать из `ac-rating/review/backend/media/ac_rating/` в `backend/media/ac_rating/` (Docker volume `maksim_rating_review_backend_media` — через `docker cp` или `docker run --rm -v vol:/src -v ...`)
6. Проверить выборочно total_index по 3-5 моделям: сверить с продом Максима (`hvac-info.com` → rating) — расхождение < 0.1 ожидается.

## Приёмочные критерии

- [ ] `./venv/bin/python manage.py check` — 0 issues
- [ ] `./venv/bin/python manage.py makemigrations --dry-run` — No changes detected (моделей не добавлял)
- [ ] `./venv/bin/python -m pytest ac_*/tests/ --no-cov` — всё зелёное (175 + новые test_load_dump)
- [ ] `./venv/bin/python manage.py load_ac_rating_dump --help` — показывает все флаги
- [ ] `./venv/bin/python manage.py load_ac_rating_dump <dump> --dry-run` на реальном дампе `~/Downloads/ac_rating_2026-04-18.sql` — парсит без ошибок, выводит статистику по 16 таблицам (N строк для каждой)
- [ ] `docs/ac_rating/data-migration.md` — инструкция для Андрея
- [ ] Отчёт содержит: на какой БД тестировал, результаты dry-run на реальном дампе

## Ограничения

- **НЕ грузить** в ERP-прод через SSH-туннель (localhost:15432). Только локальный postgres или pytest test DB.
- **НЕ трогать** modelы ac_* — все таблицы/колонки уже совпадают с Максимом (Ф2 был 1-в-1).
- **НЕ переносить** media-файлы — это задача Андрея (Google Drive → `backend/media/ac_rating/`). Команда грузит только записи о файлах (`ac_rating/photos/xyz.jpg`), сами .jpg файлы Андрей кладёт руками.
- **НЕ коммитить** сам дамп в репо (он лежит в `~/Downloads/`, репо не трогаем).
- **НЕ редактировать** SQL-дамп Максима руками — команда должна работать на оригинале.
- Conventional Commits. Логические коммиты: (1) command + парсинг, (2) тесты, (3) docs.

## Формат отчёта

Положить в `ac-rating/reports/05-data-migration.md`:
1. Ветка + коммиты
2. Что сделано: команда + тесты + документация
3. Результаты проверок: pytest, check, dry-run на реальном дампе (какие таблицы, сколько строк на каждую, есть ли ворнинги)
4. **На какой БД тестировал** (HOST:PORT, имя БД) — явно подтвердить что не через туннель
5. Известные риски / сюрпризы
6. Ключевые файлы для ревью

## Подсказки от техлида

- **`\N` в COPY-формате** — это NULL. Именно это подставляй в user-FK колонки (заменяя исходное значение TAB-separated).
- **`copy_expert`** в psycopg2: `cursor.copy_expert(sql="COPY ac_catalog_acmodel (col1, col2) FROM stdin", file=StringIO(data))`. Это самый эффективный способ — минимум ворчаний с типами.
- **`ON CONFLICT`** не поддерживается с COPY. Для идемпотентности — только TRUNCATE+RESTART IDENTITY CASCADE.
- **Sequences** — Django по умолчанию создаёт `<table>_id_seq` для каждого auto-id. После COPY с id из дампа — sequences отстают, и следующий `INSERT` кинет `duplicate key`. Всегда обновляй `setval`.
- **Дамп содержит Максимовский `\restrict` pragma** в первых строках (видел в head). Скорее всего pg_dump 16.13 добавляет это для защиты от `pg_dump`-reverse. Пропарсить и проигнорировать — это не команда, которую psql должен выполнить.
- **Типы данных** — 99% совпадут (Ф2 перенос был 1-в-1). Возможная засада: `lab_status` TextField у Максима — у нас тоже. Если у Максима есть сложные constraint-ы (CheckConstraint), они уже есть в наших миграциях.
- **Media Docker volume:** `maksim_rating_review_backend_media` содержит все фотки. Для Андрея: `docker run --rm -v maksim_rating_review_backend_media:/src -v /Users/andrei_prygunov/obsidian/avgust/ERP_Avgust/backend/media:/dst alpine cp -a /src/. /dst/`. Структура совпадёт: media файлы у Максима лежат в `ac_rating/photos/...` и `ac_rating/submissions/...` — пути такие же, как у нас в upload_to.
- **Проверка схемы:** перед реальным dry-run можно сделать `psql -f dump.sql` в отдельную локальную БД (НЕ ERP!) — получишь исходную БД Максима. Поиграй в ней, посмотри как выглядят данные, потом уже грузи в ERP.
- **Для Ф10** в docs ниже — пусть Андрей запустит команду через тот же `dev-remote-db.sh` style, но на prod-сервере (через ssh), не через туннель с localhost. Подробности — в Ф10.

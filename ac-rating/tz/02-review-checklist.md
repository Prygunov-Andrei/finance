# Чек-лист ревью Фазы 2 — для себя

Когда Петя вернётся с моделями+миграциями, пройти по этому списку. Порядок — от дешёвых проверок к дорогим.

## 0. Быстрый sanity

- [ ] Имя ветки `ac-rating/02-models` (или `02-models-migrations`)
- [ ] `git log --oneline main..HEAD` — коммиты атомарные, Conventional Commits
- [ ] Нет огромных diff-файлов (migration-файлы > 500 строк — ОК, но если появилась «каша» в `signals.py` или `admin.py` — вопросы)
- [ ] Нет закомментированного кода, TODO без контекста, мусорных `.pyc`, `.DS_Store`

## 1. Конфликты имён (критично)

- [ ] `references.Brand` в ERP уже существует — `ac_brands.Brand` должен быть отдельной таблицей (разные `db_table`) и не пересекаться. Проверить:
  ```
  grep -rn "class Brand" backend/references/ backend/ac_brands/
  ```
  Это разные классы в разных apps — Django сам даст разные table names (`references_brand` vs `ac_brands_brand`). Но если Петя явно задал `Meta.db_table` — проверить что нет коллизии.
- [ ] В `backend/catalog/models.py` есть свой ERP-ный `catalog` (не рейтинговый). Убедиться что `ac_catalog.ACModel` НЕ пересекается по table name (`ac_catalog_acmodel` vs `catalog_*`).
- [ ] FK в новых моделях ссылаются на `ac_*` apps (не на `catalog.*`, `methodology.*`, `brands.*` от Максима). Грепнуть:
  ```
  grep -rE "ForeignKey\(['\"](catalog|methodology|brands|scoring|reviews|submissions)\." backend/ac_*/
  ```
  Должно быть пусто.

## 2. Правильная база

- [ ] `TimestampedModel` из `backend/core/models.py:14` — используется (через `class X(TimestampedModel)`). **НЕ** импортируется `TimestampMixin` из `core/mixins.py:314` (пустая заглушка).
  ```
  grep -rn "TimestampMixin\|TimestampedModel" backend/ac_*/
  ```
- [ ] FK на пользователя — через `settings.AUTH_USER_MODEL`, не через прямой импорт `User`. Проверить в `CalculationRun.triggered_by`:
  ```
  grep -n "triggered_by" backend/ac_scoring/models.py
  ```

## 3. Миграции

- [ ] Только новые файлы `0001_initial.py` в каждой `ac_*/migrations/`. Существующие миграции (в `backend/catalog/migrations/`, `backend/methodology/migrations/` и т.д. — ERP-ные) НЕ тронуты:
  ```
  git diff main..HEAD -- 'backend/*/migrations/*.py' | grep '^+++' | grep -v 'ac_'
  ```
  Результат: только `ac_*` пути.
- [ ] `./venv/bin/python manage.py makemigrations --dry-run` — `No changes detected`
- [ ] `./venv/bin/python manage.py migrate` на пустой БД — без ошибок (потребуется запуск `./dev-local.sh` для туннеля или создать локальный postgres — обсудим если Петя не смог)
- [ ] Ни одного `RunPython` в initial-миграциях (Ф2 чисто DDL, data-миграций тут быть не должно)

## 4. Модели

- [ ] Все 13 моделей из таблицы Ф2 перенесены (см. `plan.md` секция «Фаза 2»)
- [ ] `CriterionGroup` НЕ перенесена (deprecated по плану)
- [ ] Legacy `ratings/` app НЕ скопирован
- [ ] `upload_to`:
  - `ACModelPhoto.photo` → `'ac_rating/photos/'`
  - `SubmissionPhoto.photo` → `'ac_rating/submissions/'`
  - Логотипы брендов — `'ac_rating/brands/'`
- [ ] `clean()` валидаторы сохранены из исходника (особенно после фиксов e2de2de — валидации min ≤ median ≤ max, weight ≥ 0, `CheckConstraint` для `weight >= 0`)
- [ ] `__str__` везде (минимальное требование)

## 5. Factories + тесты

- [ ] `backend/ac_*/tests/factories.py` в каждой app с фабрикой для каждой модели (или единый файл в одной app — уточнить подход Пети)
- [ ] Минимум 1 тест на модель (проверка `str()`, если есть `clean()` — и его)
- [ ] `./venv/bin/python -m pytest ac_*/tests/ -v` — зелёный
- [ ] `./venv/bin/python -m pytest --collect-only` — без ImportError (сборка не сломана)

## 6. Django admin

- [ ] `admin.py` в `ac_*` **пустые** или только `default_auto_field` — регистрация моделей в admin это Ф4, не Ф2
- [ ] Если Петя всё-таки зарегистрировал что-то в admin — отправить обратно на доработку (отступ от скоупа)

## 7. Регрессии

- [ ] `./venv/bin/python manage.py check` — чисто
- [ ] `./venv/bin/python -m pytest -x --ff` на весь backend — зелёный (или хотя бы не хуже чем до Ф2)
- [ ] Если SSH-туннель не поднят — запустить `./dev-local.sh`. Не принимать merge без живого pytest — в Ф1 пропустили, потому что там было чисто аддитивно; в Ф2 уже модели с FK — регрессии возможны.

## 8. Документы

- [ ] Отчёт в `ac-rating/reports/02-models.md` (или `02-models-migrations.md` — как назовёт)
- [ ] В отчёте перечислены все 13 моделей с пометками что сделано
- [ ] Журнал прогресса в `plan.md` обновлён? — Если нет, обновить при мерже

## Что ожидаемо может не срастись

- **SSH-туннель и миграции** — Петя может не смочь прогнать `migrate` на живой БД. Тогда пусть хотя бы запустит с SQLite (временно сменить DATABASE_URL), или я прогоню перед мержем.
- **Конфликт с ERP `catalog`** — если Петя вдруг использовал `from catalog.models import X` вместо `from ac_catalog.models import X` где-то в тестах — это критичная ошибка. Первое место проверки.
- **Фабрики в tests/** — ERP использует модули `tests/factories.py` (см. `backend/catalog/tests/factories.py`). Если Петя сделал `factory.py` или `tests/factory.py` — поправим потом, не блокер.

## Решение

После прохода чек-листа — одно из:
- **MERGE** (все галочки ✅)
- **CHANGES REQUESTED** (конкретный список правок, назад Пете)
- **REJECT** (не бывает в нашей команде — если совсем плохо, делаю сам)

# 13. Релизный процесс, версионирование, rollback

**Версия:** 0.1. **Назначение:** как выпускаем новые версии ISMeta, как мигрируем БД, как откатываемся.

## 1. Принципы

- **Semver для API**, а не для приложения.
- **Миграции БД — обратимы**.
- **Rollback за 5 минут** для неповреждающих изменений; за 15 минут — с откатом миграций.
- **Ноль простоев** для фронтенда (staged deploy); downtime backend — только при тяжёлых миграциях.
- **Feature flags** для постепенной раскатки фич.

## 2. Версионирование

### 2.1 Номер версии приложения

Схема: `MAJOR.MINOR.PATCH-STAGE`:
- `MAJOR` — крупные изменения (этап продукта). Сейчас 0 (до первого cut-over), потом 1.
- `MINOR` — новая функциональность.
- `PATCH` — багфиксы.
- `STAGE` — суффикс: `alpha`, `beta`, `rc.N`, без суффикса — stable.

Пример: `1.0.0-rc.3`, `1.2.5`.

### 2.2 Версия API

- URL-префикс: `/api/v1/`, `/api/v2/`.
- Breaking change → новый major (v2).
- Non-breaking (новый опциональный параметр, новый endpoint, новое поле в ответе) → без bump, но в changelog.

### 2.3 Версия webhook-событий

- `schema_version: v1` в payload (см. `03-webhook-events.md §5`).
- Bump независимо от номера приложения.

### 2.4 Deprecation

- В ответах API старой версии — заголовок `Deprecation: true` и `Sunset: {date}` (RFC 8594).
- Срок deprecation — минимум 6 месяцев.
- Алерт в логах при использовании deprecated версии.

## 3. Ветки и окружения

Четыре окружения:

| Окружение | Ветка | Назначение | Стабильность | Данные |
|---|---|---|---|---|
| **Local** | `feature/*` | индивидуальная разработка | может ломаться | `make ismeta-seed` |
| **Dev/CI** | `main` | все feature branches merge'атся сюда, прогоняется CI | обычно зелёный | seed + тестовые |
| **Staging** | `staging` | staging-сервер для приёмки и интеграционных тестов | зелёный | анонимизированный снимок prod (обновляется раз в неделю) |
| **Production** | `production` | боевой сервер | зелёный, наблюдаемый | живые данные |

В `09-dev-setup.md` описаны только Local и Dev/CI (работа разработчика). Staging и Production — зона ответственности devops'а (см. `docs/TEAM.md`).

Каждая ветка имеет own `.env.*`:
- dev/staging: testing LLM-провайдеры, mock-сервисы доступны;
- production: реальные ключи, реальные провайдеры.

## 4. Процесс релиза

### 4.1 Feature branch → main

1. Разработчик открывает PR с `feature/xxx` в `main`.
2. Обязательные CI-чеки:
   - lint (bandit, ruff, prettier);
   - unit-tests (coverage ≥ 70% backend, ≥ 50% frontend);
   - pact-tests (consumer contracts);
   - OpenAPI-validation;
   - security (semgrep, npm-audit);
   - migrations check (forward + reverse).
3. Обязательный code review (минимум 1 человек, 2 при изменениях в security/migrations).
4. Merge squash в `main`.

### 4.2 Main → staging

1. Каждый merge в `main` → auto-merge в `staging`.
2. На staging — автодеплой, smoke-test, E2E Playwright.
3. Зелёный — staging обновлён.
4. Красный — PR автоматически откатывается.

### 4.3 Staging → production

1. Ручная команда `make release-to-production TAG=v1.2.3`.
2. Требования перед релизом:
   - все чекбоксы из `07-mvp-acceptance.md` для текущего этапа зелёные;
   - прошло минимум 24 часа после последнего push в staging без инцидентов;
   - changelog обновлён в `docs/ismeta/CHANGELOG.md`.
3. Процедура:
   - блокировка PR в `production` на время релиза;
   - снэпшот БД production;
   - выполнение миграций (см. §5);
   - деплой backend (rolling, per-instance);
   - деплой frontend (blue-green или staged);
   - пост-деплой smoke: health-check, ключевые endpoint'ы, webhook доставляется;
   - разблокировка PR.
4. Если любой шаг упал — rollback (см. §6).

### 4.4 Коробочный клиент

- Коробка обновляется не автоматически, а по решению клиента.
- Мы выпускаем `ismeta-bundle-vX.Y.Z.tar.gz` с инструкциями.
- Клиент (или мы при удалённом внедрении) разворачивает через `docker compose pull + up -d`.

## 5. Миграции БД

### 5.1 Обратимость

- **Каждая** Django-миграция со `RunPython` обязана иметь `reverse_code`.
- Миграции с `ALTER COLUMN DROP NOT NULL` и обратное `SET NOT NULL` — возможно только после backfill.
- Миграции, ломающие API (удаление столбца) — в отдельном релизе, после удаления использования в коде.

### 5.2 Шаблон безопасной миграции

```python
# ismeta/backend/estimate/migrations/XXXX_rename_foo.py
from django.db import migrations

def forward(apps, schema_editor):
    # 1. добавляем новую колонку
    # 2. backfill
    # 3. старая колонка остаётся (только новый код пишет в новую)
    pass

def backward(apps, schema_editor):
    # откатываем: если новая колонка заполнена — копируем обратно в старую
    pass

class Migration(migrations.Migration):
    dependencies = [...]
    operations = [
        migrations.RunPython(forward, backward),
    ]
```

Полное удаление старой колонки — отдельная миграция в следующем релизе после проверки, что код не ссылается на неё.

### 5.3 Check в CI

```bash
python manage.py makemigrations --check --dry-run   # нет незакоммиченных изменений
python manage.py migrate --plan                     # план миграций
python manage.py migrate && python manage.py migrate --fake XXXX_previous  # forward+reverse
```

### 5.4 Миграции данных

- Отдельные файлы от schema-миграций.
- Для крупных — через Celery-таск с прогрессом, а не блокирующая миграция.
- Пример: перенос существующих 0 строк с NULL в `row_id` на сгенерированные UUID — разовая задача.

## 6. Rollback

### 6.1 Типы rollback'ов

| Тип | Когда применяется | Процедура | Время |
|---|---|---|---|
| **Code-only** | Деплой сломал API, миграций не было | откат образа/деплоя к предыдущей версии | 5 минут |
| **Code + reverse migration** | Деплой с миграцией сломал что-то | откат кода + `python manage.py migrate estimate XXXX_previous` | 15 минут |
| **Restore from backup** | БД повреждена миграцией | восстановление из снапшота pre-release, повторный миграционный прогон | 2 часа |

### 6.2 Rollback-план каждого релиза

Перед запуском релиза в `production` формируется `rollback-plan.md` со списком шагов отката. Сохраняется в логах деплоя.

### 6.3 Что нельзя откатить автоматически

- Webhook'и, уже отправленные внешним системам.
- Emails, уже отправленные.
- Snapshot'ы, уже переданные в ERP (ERP-сторона неоткатываема нашей миграцией).
- Изменения, сделанные пользователями после релиза.

Для таких случаев — инцидент-реакция (см. `12-security.md §11`) и ручная коммуникация.

## 7. Feature flags

### 7.1 Механизм

- Таблица `FeatureFlag(workspace_id nullable, key, enabled, value JSONB)`.
- `workspace_id = null` — глобальный флаг.
- API `/api/v1/flags/{key}` → `{enabled, value}`.
- Фронтенд кеширует флаги на уровне страницы (TTL 1 минута).

### 7.2 Примеры флагов

| Флаг | Назначение |
|---|---|
| `llm_agent_enabled` | Включён ли чат агента в UI |
| `public_mode_enabled` | Включён ли публичный режим |
| `excel_fallback_match_enabled` | Fallback-match при потере row_id |
| `subsection_ui_visible` | Показывать ли подразделы в UI |
| `rag_search_enabled` | Доступен ли RAG-поиск агенту |
| `experimental_tier8` | Экспериментальный уровень подбора |

Флаги помечаются в коде комментарием `# FEATURE_FLAG:` + expected removal date.

## 8. Совместимость ERP ↔ ISMeta

### 8.1 Matrix

В `docs/ismeta/compatibility.md`:

| ISMeta | ERP API-version | Поддержка |
|---|---|---|
| 0.1.x | erp-api v1 | до 2026-12-31 |
| 0.2.x | erp-api v1, v2 | до 2027-06-30 |
| 1.0.x | erp-api v2 | текущий |

### 8.2 Процедура bump

1. ERP добавляет поддержку новой версии API (v2), сохраняя v1.
2. ISMeta переключается на v2 в коде, оставляя fallback на v1.
3. ISMeta релизится.
4. После 6 месяцев — v1 удаляется из ERP.
5. ISMeta ≥ X.Y не поддерживает ERP старше Z.

## 9. Changelog

Формат — Keep a Changelog (https://keepachangelog.com/ru/1.1.0/).

Секции: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.

Файл `docs/ismeta/CHANGELOG.md` обновляется при каждом merge в `main` (обязательный пункт PR-чеклиста).

## 10. Коммуникация релизов

### 10.1 Внутренняя (наш инстанс)

- Slack/Telegram-канал команды: автоматическое сообщение при релизе с версией и changelog diff'ом.
- В UI ISMeta для admin — баннер «Версия 1.2.3 развёрнута DD.MM».

### 10.2 Коробочная

- Email клиенту с changelog на русском, упрощённом.
- В UI ISMeta клиента — уведомление «доступно обновление», но установка — их решение.

## 11. Recovery-тесты

- Раз в квартал — repair drill: восстановление production-snapshot'а в staging, прогон smoke.
- Раз в полгода — полный disaster recovery: «отсутствует БД production, восстанавливаем из S3».
- Логируется timing каждого шага, улучшаем по итогам.

## 12. Запрет retroactive

- Уже опубликованные релизы (теги в git) — не переписываются. Только hotfix-версии (`1.2.3` → `1.2.4`).
- Миграции, уже применённые к production БД, — не правятся. Только follow-up миграции.

## 13. Deprecation FAQ

- «Хочу удалить поле прямо сейчас, оно нигде не используется» → 2 релиза: в первом `@deprecated`, во втором удалить. Даже если используется только внутри — защита от будущих сюрпризов.
- «Хочу поменять семантику поля, оставив имя» → создать новое поле с новой семантикой, deprecated старое, мигрировать пользователей.
- «Внешний клиент всё ещё использует v1 после sunset» → работа на уровне продаж, не инженерии.

## 14. Контрольный чек-лист релиза

- [ ] CI зелёный на `main` минимум 24 часа.
- [ ] Все чекбоксы этапа из `07-mvp-acceptance.md` зелёные.
- [ ] Changelog обновлён.
- [ ] Rollback-plan оформлен и приложен.
- [ ] Снапшот БД production снят.
- [ ] Секреты не изменены внезапно (или если изменены — ротация задокументирована).
- [ ] Уведомление команде за 1 час до релиза.
- [ ] После релиза — smoke-test успешен.
- [ ] После релиза — метрики не деградируют первые 30 минут.

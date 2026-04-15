# Как контрибьютить в ISMeta

Правила работы с кодом и документацией. Обязательно прочитать до первого PR.

## 1. Git flow

### 1.1 Ветки

| Ветка | Назначение | Кто мержит |
|---|---|---|
| `main` | текущая разработка; merge из feature | автор PR после review |
| `staging` | пред-продакшн; auto-merge из `main` после CI | CI |
| `production` | текущий prod-релиз | techlead вручную |
| `feature/<author>/<short-slug>` | твоя ветка | ты |

Пример feature-ветки: `feature/ivanov/e4-estimate-crud`, `feature/petrov/fix-excel-hash`.

### 1.2 Правило «один PR — одна задача»

- Большие эпики дробятся на подзадачи, каждая — отдельный PR.
- Смешанные PR («фикс + рефакторинг + новый функционал») не принимаются.
- Не переформатируй чужой код без согласования — это создаёт merge-конфликты и засоряет review.

### 1.3 Rebase vs merge

- Внутри feature-ветки — rebase к `main` (`git rebase main`).
- Merge PR в `main` — squash.
- `main` → `staging` — fast-forward.
- `staging` → `production` — merge commit (чтобы видеть точку релиза).

## 2. Pull Request

### 2.1 Шаблон PR

Используется файл [`.github/PULL_REQUEST_TEMPLATE.md`](./.github/PULL_REQUEST_TEMPLATE.md). Обязательные разделы:

- **Что:** короткое описание, что делает PR (1-3 предложения).
- **Зачем:** связанная задача/эпик (ссылка на issue).
- **Как тестировать:** шаги воспроизведения / какие автотесты добавлены.
- **Риски:** breaking changes, миграции, скрытые эффекты.
- **Чек-лист:** стандартный чек-лист внизу.

### 2.2 Чек-лист PR

- [ ] Тесты добавлены (unit, и/или integration, и/или e2e).
- [ ] Coverage не упал.
- [ ] Документация обновлена (если меняются API, модели, процессы).
- [ ] Миграции БД обратимы (`reverse_code` присутствует).
- [ ] OpenAPI обновлён, если менялись эндпоинты.
- [ ] Changelog обновлён, если фича пользовательская.
- [ ] Security: secrets не в коде, input validated, no SQL-injection.
- [ ] Multi-tenancy: `workspace_id` присутствует в query/filter.
- [ ] Я прогнал локально `make ismeta-ci-local` — зелёный.

### 2.3 Review

- Минимум 1 approve. Для PR в `security/`, `migrations/`, `integration/erp/` — минимум 2.
- Review SLA — 24 часа в рабочие дни.
- Комментарии — конструктивные; блокирующее отмечается как «Request changes», обсуждаемое — «Comment».
- Автор реагирует на все комментарии перед merge.

### 2.4 Merge

- После approve — автор делает squash-merge в `main`.
- Заголовок squash-коммита в формате `<тип>(<область>): <описание>` (см. 2.5).
- В теле squash-коммита — содержательное описание (не «fixup fixup fixup»).

### 2.5 Заголовки коммитов (Conventional Commits)

```
<тип>(<область>): <описание>

[необязательное тело]

[необязательные футеры]
```

Типы:
- `feat` — новая функциональность;
- `fix` — баг-фикс;
- `docs` — только документация;
- `test` — добавление/правка тестов;
- `refactor` — рефакторинг без новой функциональности;
- `perf` — оптимизация производительности;
- `build` — сборка, зависимости;
- `ci` — CI/CD;
- `chore` — всё остальное.

Области — модули проекта: `estimate`, `agent`, `excel`, `integration`, `workspace`, `web`, `widget`, `docs`, `infra`.

Примеры:
- `feat(estimate): add bulk-move endpoint for items`;
- `fix(excel): handle rows with missing row_id in fallback mode`;
- `docs(glossary): add Tier 0-7 terms`.

## 3. Code style

### 3.1 Backend (Python)

- Python 3.12.
- Форматирование: `ruff format` (pre-commit hook).
- Линтинг: `ruff check`, `mypy` (строгий для модулей с бизнес-логикой, нестрогий для тестов).
- Типизация: обязательна для публичных функций, сервисов, API-вьюшек.
- Docstrings — Google-style, обязательны для всех публичных функций.
- Длина строки — 100.
- Imports — отсортированы (`ruff check --select=I`).

### 3.2 Frontend (TypeScript)

- TypeScript strict mode.
- Форматирование: `prettier`.
- Линтинг: `eslint` с конфигом Next.js.
- Именование:
  - компоненты — `PascalCase`;
  - хуки — `camelCase` начинающиеся с `use`;
  - константы — `SCREAMING_SNAKE_CASE`;
  - API-функции — `camelCase` с описательным именем.
- Компоненты — функциональные, без классов.

### 3.3 Наименования в БД и API

- Таблицы — snake_case, множественное число: `estimate_items`, `chat_sessions`.
- Поля — snake_case: `workspace_id`, `created_at`.
- API-пути — kebab-case: `/estimates/{id}/match-works`.
- JSON-поля в API — snake_case (не camelCase): `{"workspace_id": "...", "created_at": "..."}`.
- UUID везде вместо int для новых сущностей.

## 4. Тесты

### 4.1 Обязательно к каждому PR

- Unit-тесты на новый код (сервисы, утилиты, serializers).
- Integration-тесты на новые API-эндпоинты.
- E2E Playwright — при изменениях в основных пользовательских сценариях.
- Multi-tenancy isolation-тест — при любом изменении моделей или queryset'ов.
- Cassette-тест — при изменениях промптов или tool'ов LLM.

### 4.2 Запуск

- `make ismeta-test` — все unit и integration.
- `make ismeta-test-e2e` — e2e.
- `make ismeta-test-golden` — golden set (долго, раз в неделю в CI).
- `make ismeta-ci-local` — полный CI локально перед PR.

### 4.3 Coverage

- Backend ≥ 70%; не падает по сравнению с main.
- Frontend ≥ 50%; не падает по сравнению с main.
- В CI проверка автоматическая.

## 5. Миграции БД

### 5.1 Обратимость

Каждая миграция со `RunPython` обязана иметь `reverse_code`. Подробно — в [`specs/13-release-process.md §5`](./specs/13-release-process.md).

### 5.2 Именование миграций

`{auto-number}_{verb}_{entity}_{details}.py`:
- `0012_add_row_id_to_estimate_item.py`;
- `0013_backfill_default_markups.py`.

### 5.3 Ревью миграций

Миграции — отдельный пункт PR-чеклиста. Обязательный вопрос от reviewer'а: «Пройдёт ли на production-size БД? Не блокирует ли она запись?»

## 6. Документация

### 6.1 Когда обновляется

- API меняется → OpenAPI и `specs/02-api-contracts.md`.
- Модель меняется → `specs/01-data-model.md`.
- Webhook добавляется/меняется → `specs/03-webhook-events.md`.
- Новый LLM-tool → `specs/04-llm-agent.md`.
- Новый термин → `GLOSSARY.md`.
- Принципиальное решение → новый ADR в `docs/adr/`.
- Изменился процесс → правим `CONTRIBUTING.md` (этот файл).

### 6.2 Как писать

- Русский язык для внутренних документов, английский для OpenAPI.
- Без маркетинговых слов («магия», «магический», «невероятный»).
- Примеры с реальными данными важнее описаний.
- Если что-то описано «как TBD» — создаём issue.

## 7. Review чужих PR

### 7.1 На что смотреть

- Соответствие ТЗ (ссылка на issue/эпик).
- Тесты (есть, покрывают рискованные ветви).
- Multi-tenancy (workspace_id везде).
- Производительность (no N+1, no SELECT *, индексы).
- Security (input validation, нет секретов, нет raw SQL).
- Обратимость миграций.
- Читаемость кода.

### 7.2 Как писать комментарии

- Конструктивно: «Предлагаю X, потому что Y» вместо «Это не так».
- Разделять критичное (`Request changes`) и желательное (`Comment`).
- `nit:` префикс для мелочей (cosmetic).
- `blocking:` префикс для критичного.

## 8. Что запрещено

- Пушить в `main` напрямую.
- Пушить в `production` без прогона в `staging`.
- Мержить свой же PR без review.
- Коммитить секреты (pre-commit hook `git-secrets` это ловит, но бывает обходит).
- Добавлять зависимости без согласования с techlead'ом.
- Делать `rm -rf` без понимания последствий.
- Использовать `--force push` в shared ветках (`main`, `staging`, `production`).

## 9. Эскалация

- Блокирует работу разработчика (сломан dev-стенд, не могу мержить, ERP-команда не отвечает) — пиши buddy, techlead'у, в `#ismeta-dev`.
- Нашёл security-уязвимость — напрямую techlead'у, не в публичном чате.
- Нашёл данные, которых не должно быть (чужой workspace в своём контексте) — немедленно techlead, остановить работу.

## 10. Специфические правила кода (обязательные)

### 10.1 JSONB поля — только через Pydantic-schemas

Каждое JSONB-поле (`settings`, `tech_specs`, `custom_data`, `external_ref`, `material_markup`, `work_markup`, `metadata` и др.) должно:

1. Иметь Pydantic-model в `<app>/schemas.py`.
2. Валидироваться перед записью.
3. Иметь размер ≤ 10 KB (или явно обосновано).
4. Не содержать произвольные поля (whitelist explicitly).

Пример:

```python
# estimate/schemas.py
from pydantic import BaseModel, Field

class MaterialMarkup(BaseModel):
    type: Literal["percent", "fixed_price", "fixed_amount"]
    value: Decimal = Field(..., ge=0)
    note: str | None = None

# estimate/serializers.py
class EstimateSerializer(serializers.ModelSerializer):
    def validate_material_markup(self, value):
        MaterialMarkup.model_validate(value)
        return value
```

**Запрещено:** класть любой JSON без валидации.

### 10.2 Data migrations — через management commands, НЕ RunPython

Schema migrations (structure changes): через Django migrations.
Data migrations (backfill, transformation): через отдельные management commands.

Пример bad:

```python
# migration.py
def forward(apps, schema_editor):
    Estimate = apps.get_model('estimate', 'Estimate')
    for estimate in Estimate.objects.all():
        estimate.new_field = compute_new_field(estimate)
        estimate.save()
# ПРОБЛЕМЫ: blocking migration, no chunking, нет retry, нет progress.
```

Пример good:

```python
# estimate/management/commands/backfill_new_field.py
class Command(BaseCommand):
    def handle(self, *args, **options):
        while True:
            batch = Estimate.objects.filter(
                new_field__isnull=True
            ).values_list('id', flat=True)[:1000]
            if not batch:
                break
            Estimate.objects.filter(id__in=batch).update(...)
            time.sleep(0.1)
```

Migration добавляет только nullable column. Data — отдельно через CLI.

### 10.3 Hardcoded model names запрещены

Плохо:

```python
response = openai.chat.completions.create(
    model="gpt-4o",  # hardcoded
    ...
)
```

Хорошо:

```python
from django.conf import settings
response = openai.chat.completions.create(
    model=settings.LLM_MODEL_AGENT_CHAT,  # from env
    ...
)
```

Все model names — через env variables:
- `LLM_MODEL_DEFAULT`
- `LLM_MODEL_AGENT_CHAT`
- `LLM_MODEL_MATCHING_SEMANTIC`
- `LLM_MODEL_MATCHING_WEB`
- `LLM_MODEL_RECOGNITION`

Или на уровень выше — через `LLMTaskConfig` в БД (см. `specs/04-llm-agent.md §4`).

## 11. Обновление правил

Этот документ не священный. Если правило мешает работе или появляется новая ситуация — PR с обсуждением.

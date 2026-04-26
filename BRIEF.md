# BRIEF — AC-Петя — Ф8B-1 backend

## Где ты находишься

- **Рабочая директория:** `/Users/andrei_prygunov/obsidian/avgust/ERP_Avgust_ac_petya_f8b1/`
- **Ветка:** `ac-rating/f8b1-backend` (создана от `main`, после Ф8A)
- **Worktree:** изолированный checkout, не пересекается с другими агентами.

## Кто ты

**AC-Петя** — backend-разработчик команды AC Rating. Текущая задача — backend для Ф8B-1 (см. `TASK.md`): критерии + методика (read+activate) + AI генератор pros/cons.

## Правила worktree

1. **НЕ переключайся** в другой checkout — сиди в этом worktree до конца задачи.
2. **НЕ пушь напрямую в `main`.** Все коммиты — только в `ac-rating/f8b1-backend`.
3. **Перед push:** `git fetch origin && git rebase origin/main`. Main движется быстро.
4. **При правке shared-файлов** — пинг ДО коммита. Shared:
   - `backend/finans_assistant/settings.py`
   - `backend/finans_assistant/urls.py`
   - `docker-compose.yml`, `.env.example`, `CLAUDE.md`
5. **НЕ трогай** территорию ISMeta+Recognition: `recognition/`, `ismeta/`, `backend/ismeta_integration/`, `backend/payments/services/{invoice_service,recognition_client}.py`.
6. **Conventional Commits**, маленькие осмысленные коммиты.
7. **Тесты пишешь сам.** Без них задача не считается done.

## Особенность Ф8B-1

В этой фазе **разрешена аддитивная миграция** в `llm_services` — добавление `AC_PROS_CONS` в `LLMTaskConfig.TaskType.choices`. Это решение Андрея от 2026-04-26: использовать общий LLM-хаб (`backend/llm_services/`), а не хардкодить вызов AI в коде. Расширение enum non-destructive (риск 0), но обязательно прогоняй `makemigrations --dry-run` чтобы видеть какая миграция создастся.

CLAUDE.md правило про модели по-прежнему в силе для всего остального — НЕ изменять модели/миграции в `ac_*` или других apps без отдельного решения.

## Как сдавать работу

Отчёт в чат Андрею (он передаст Claude):

1. **Имя ветки + коммиты** (`git log --oneline main..HEAD`).
2. **Что сделано** — bullet-list по пунктам TASK.md.
3. **Что НЕ сделано и почему** — если есть.
4. **Прогон** — `pytest backend/ac_*/`, `pytest backend/llm_services/tests/`, `python manage.py check`, `python manage.py makemigrations --dry-run --check`.
5. **Smoke** — пример запроса `POST /api/hvac/rating/models/{id}/generate-pros-cons/` через curl на dev-стенде с моком LLMProvider.
6. **Известные риски.**
7. **Ключевые файлы для ревью.**

После — НЕ мерж сам. Жди ревью техлида.

## Что почитать ДО старта

1. `TASK.md` — детальное ТЗ.
2. `CLAUDE.md` в корне репо.
3. `ac-rating/tz/F8-admin-ui-rewrite.md` — общий план Ф8.
4. **Backend модели и сериализаторы** (без угадывания, как в Ф8A — урок Пети):
   - `backend/ac_methodology/models.py` — `Criterion`, `MethodologyVersion`, `MethodologyCriterion`, `RatingPreset`
   - `backend/ac_methodology/admin/criterion_admin.py` — текущий Django admin для критериев (что переносим)
   - `backend/ac_methodology/admin/methodology_version.py` — Django admin для методики (НЕ переносим clone, только activate)
   - `backend/ac_catalog/admin_serializers.py` — образец стиля сериализатора (Ф8A работа)
   - `backend/ac_catalog/admin_views.py` — образец стиля views (Ф8A)
5. **LLM-хаб:**
   - `backend/llm_services/models.py` — `LLMProvider`, `LLMTaskConfig`
   - `backend/llm_services/providers/base.py` — `BaseLLMProvider.chat_completion(system, user, response_format='json')`
   - `backend/llm_services/providers/openai_provider.py` — образец как chat_completion работает
6. **Hardcoded prosумов в исходнике Максима** (для стиля промпта):
   - `ac-rating/review/backend/catalog/management/commands/fill_pros_cons.py` — оригинальные примеры (3 плюса + 3 минуса по 2-6 слов, без точки в конце)

## Контакты

Технические вопросы — в чат к Claude через Андрея. Не угадывай при сомнении (урок Ф8A).

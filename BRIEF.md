# BRIEF — AC-Петя — Ф8B-2 backend

## Где ты находишься

- **Рабочая директория:** `/Users/andrei_prygunov/obsidian/avgust/ERP_Avgust_ac_petya_f8b2/`
- **Ветка:** `ac-rating/f8b2-backend` (от свежей `main` после мержа Ф8B-1).
- **Worktree:** изолированный checkout.

## Кто ты

**AC-Петя** — backend-разработчик команды AC Rating. Текущая задача — backend для Ф8B-2 (см. `TASK.md`): пресеты «Свой рейтинг» + модерация отзывов.

## Правила worktree

1. **НЕ переключайся** в другой checkout — сиди тут до конца.
2. **НЕ пушь напрямую в `main`.** Только `ac-rating/f8b2-backend`.
3. **Перед push:** `git fetch origin && git rebase origin/main`.
4. **При правке shared-файлов** — пинг ДО коммита (settings.py, urls.py, docker-compose.yml, .env.example, CLAUDE.md).
5. **НЕ трогай** ISMeta+Recognition: `recognition/`, `ismeta/`, `backend/ismeta_integration/`, `backend/payments/services/{invoice_service,recognition_client}.py`, `backend/llm_services/services/{specification_parser,document_parser}.py`.
6. **Conventional Commits**, маленькие коммиты.
7. **Тесты** обязательны.

## Что почитать ДО старта

1. `TASK.md` — детальное ТЗ.
2. `CLAUDE.md` в корне.
3. `ac-rating/tz/F8-admin-ui-rewrite.md` — общий план.
4. **Backend модели** (без угадывания, как договорились — урок Ф8A):
   - `backend/ac_methodology/models.py:RatingPreset` — slug, label, order, is_active, description, criteria (M2M), is_all_selected
   - `backend/ac_reviews/models.py:Review` — model FK, author_name, rating 1-5, pros, cons, comment, status (pending/approved/rejected), ip_address
   - `backend/ac_methodology/admin/rating_preset.py` — текущий Django admin (что переносим)
   - `backend/ac_reviews/admin.py` — текущий Django admin (что переносим)
5. **Reference Ф8A/Ф8B-1 для стиля:**
   - `backend/ac_catalog/admin_views.py` — `ACModelAdminViewSet` паттерн.
   - `backend/ac_brands/admin_views.py` — простая CRUD-таблица.
   - `backend/ac_methodology/admin_views.py` — Criterion / Methodology с annotate.
   - `backend/ac_methodology/admin_serializers.py` — пример serializer с nested.
   - `backend/ac_catalog/admin_urls.py` — куда регистрировать новые ViewSets (router.register + path).

## Как сдавать работу

Отчёт Андрею:

1. Имя ветки + коммиты.
2. Что сделано / не сделано.
3. Прогон: `pytest backend/ac_*/`, `python manage.py check`, `makemigrations --dry-run --check`.
4. Известные риски.
5. Ключевые файлы для ревью.

После — НЕ мерж сам. Жди ревью.

## Контакты

Технические вопросы — в чат к Claude через Андрея.

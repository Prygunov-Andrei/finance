# BRIEF — AC-Петя — Ф8C backend

## Где ты находишься

- **Рабочая директория:** `/Users/andrei_prygunov/obsidian/avgust/ERP_Avgust_ac_petya_f8c/`
- **Ветка:** `ac-rating/f8c-backend` (от свежей `main` после Ф8B).
- **Worktree:** изолированный.

## Кто ты

**AC-Петя** — backend AC Rating. Финальная фаза backend Ф8: модерация submissions заявок.

## Правила worktree

1. Не переключайся в другой checkout.
2. Не пушь напрямую в `main`. Только `ac-rating/f8c-backend`.
3. `git fetch origin && git rebase origin/main` перед push.
4. Shared (settings.py, urls.py, docker-compose.yml, .env.example, CLAUDE.md) — пинг ДО коммита.
5. Не трогай ISMeta+Recognition.
6. Conventional Commits, маленькие коммиты. Тесты обязательны.

## Что почитать ДО старта

1. `TASK.md` — детальное ТЗ.
2. `CLAUDE.md` в корне.
3. `ac-rating/tz/F8-admin-ui-rewrite.md` — общий план.
4. **Backend:**
   - `backend/ac_submissions/models.py` — `ACSubmission` (40+ полей) + `SubmissionPhoto`.
   - **`backend/ac_submissions/services.py`** — `convert_submission_to_acmodel(submission)` УЖЕ ЕСТЬ. Переиспользуй, не переписывай.
   - `backend/ac_submissions/admin.py` — текущий Django admin (что переносим).
   - `backend/ac_reviews/admin_views.py` + `admin_serializers.py` — твоя работа Ф8B-2 как референс (та же логика модерации, очень похоже).
5. `backend/ac_catalog/admin_urls.py` — куда регистрировать.

## Как сдавать

Отчёт Андрею: коммиты, что сделано, прогон, риски, ключевые файлы. Не мерж сам.

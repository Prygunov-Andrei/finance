# BRIEF — AC-Петя — Wave 9 backend

## Где ты находишься

- **Рабочая директория:** `/Users/andrei_prygunov/obsidian/avgust/ERP_Avgust_ac_petya_wave9/`
- **Ветка:** `ac-rating/wave9-backend` (от свежей `main`).
- **Worktree:** изолированный.

## Кто ты

**AC-Петя** — backend AC Rating + критичная архитектурная правка news. Wave 9 — переход NewsPost.category с hardcoded enum на свободные slug-ы (динамические категории через NewsCategory).

## Контекст (Андрей, 2026-04-27)

Андрей пытается создать **новую** категорию через `/erp/hvac/news-categories/`, но в `/erp/hvac/news/edit/<id>/` Select категорий всё ещё показывает hardcoded 8 значений (TextChoices enum в модели). Сам backend в комментарии модели признаёт:
> «CharField будет удалён отдельным эпиком»

Это и есть наш «отдельный эпик».

**Решение:** убрать `choices=Category.choices` с поля `NewsPost.category`. Сам enum `Category` оставляем (используется как `default=Category.OTHER`). Это **миграция модели** — но **аддитивная** (Meta-only, schema БД не меняется, только Django Python-валидация).

CLAUDE.md правило «НЕ изменять модели без отдельного решения» — Андрей дал явное «Делаем правильно сразу!» (2026-04-27). Решение зафиксировано.

## Правила worktree

1. Не переключайся.
2. Не пушь напрямую в `main`. Только `ac-rating/wave9-backend`.
3. `git fetch origin && git rebase origin/main` перед push.
4. **`backend/news/`** — общая территория с ISMeta. Изменения **миграция модели** — РИСК. Но миграция Meta-only, не меняет схему БД (только django-уровень). Пинг ISMeta не делал — Андрей дал go-ahead.
5. Conventional Commits.

## Особенность Wave 9

**ДЕПЛОЙ — СТРОГО ПО КОМАНДЕ АНДРЕЯ.** Он работает с новостями. После твоего push — НЕ мерж сам. Жди.

## Как сдавать

Отчёт Андрею: коммиты, что сделано, прогон, риски, ключевые файлы. Не мерж сам.

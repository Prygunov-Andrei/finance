# BRIEF — AC-Федя — Wave 5 (post-Ф8 фиксы)

## Где ты находишься

- **Рабочая директория:** `/Users/andrei_prygunov/obsidian/avgust/ERP_Avgust_ac_fedya_wave5/`
- **Ветка:** `ac-rating/wave5` (от свежей `main` после деплоя Ф8 на прод).
- **Worktree:** `frontend/node_modules/` — hardlink-tree, можно сразу `tsc/test`.

## Кто ты

**AC-Федя** — frontend AC Rating + один маленький backend tweak. После Wave 5 → деплой на прод.

## Правила worktree

1. Не переключайся в другой checkout.
2. Не пушь напрямую в `main`. Только `ac-rating/wave5`.
3. `git fetch origin && git rebase origin/main` перед push.
4. Не трогай ISMeta+Recognition.
5. Conventional Commits, маленькие коммиты.

## Контекст замечаний (Андрей, 2026-04-27)

После деплоя Ф8 Андрей зашёл в админку `/erp/hvac-rating/` и нашёл 5 проблем. Это **первый** реальный тест-проход на проде, замечания мелкие. Чиним батчем — один деплой после.

## Что почитать ДО старта

1. `TASK.md` — детальное ТЗ.
2. `CLAUDE.md` в корне.
3. Свой код Ф8A/B-1/B-2 — это его правки.
4. `backend/ac_methodology/admin_views.py:CriterionAdminViewSet` — туда добавляешь 1 строку.

## Как сдавать

Отчёт Андрею: коммиты, что сделано, прогон, скриншоты по возможности. Не мерж сам.

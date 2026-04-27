# BRIEF — AC-Федя — Wave 6

## Где ты находишься

- **Рабочая директория:** `/Users/andrei_prygunov/obsidian/avgust/ERP_Avgust_ac_fedya_wave6/`
- **Ветка:** `ac-rating/wave6` (от свежей `main` после Wave 5).
- **Worktree:** `frontend/node_modules/` — hardlink-tree.

## Кто ты

**AC-Федя** — frontend AC Rating + 1 backend fix. Wave 6 — критичный (фото-баг + UX-полировка).

## Контекст замечаний (Андрей, 2026-04-27, после Wave 5)

После hard-refresh Андрей всё ещё **не видит фото** в админке (ни логотипов брендов, ни моделей). Я диагностировал — это mixed-content баг: backend возвращает `http://hvac-info.com/...` (HTTP), страница работает на HTTPS, браузер блокирует.

Заодно Андрей подсветил:
- Sidebar баг: одновременно активны `HVAC-новости` и `HVAC-Рейтинг`.
- Click по строке должен открывать редактирование на всех таблицах (как в Brands), edit-иконки лишние.

## Правила worktree

1. Не переключайся в другой checkout.
2. Не пушь напрямую в `main`. Только `ac-rating/wave6`.
3. `git fetch origin && git rebase origin/main` перед push.
4. Conventional Commits, маленькие коммиты.

## Как сдавать

Отчёт Андрею: коммиты, что сделано, прогон, скриншоты.
После — НЕ мерж сам.

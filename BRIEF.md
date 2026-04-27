# BRIEF — AC-Федя — Wave 7

## Где ты находишься

- **Рабочая директория:** `/Users/andrei_prygunov/obsidian/avgust/ERP_Avgust_ac_fedya_wave7/`
- **Ветка:** `ac-rating/wave7` (от свежей `main` после Wave 6).
- `frontend/node_modules/` — hardlink-tree.

## Кто ты

**AC-Федя** — frontend + 1 backend endpoint. Wave 7 — управление featured-новостью + sidebar для категорий.

## Контекст (Андрей, 2026-04-27)

После Ф8D (cleanup Django admin) Андрей не может управлять FeaturedNewsSettings через `/admin/` — только через `/hvac-admin/` backup. Нужен ERP UI для админа.

Также в sidebar нет пункта «Категории новостей» (хотя страница NewsCategoriesPage существует и доступна прямой ссылкой).

## Правила worktree

1. Не переключайся в другой checkout.
2. Не пушь напрямую в `main`. Только `ac-rating/wave7`.
3. `git fetch origin && git rebase origin/main` перед push.
4. **`backend/news/`** — общая территория с ISMeta. Изменения АДДИТИВНЫЕ (новые view + serializer + url + UI Card), миграций нет, риск минимальный — пинг ISMeta не обязателен. Если будешь править существующий код news/views.py — пинг.
5. Conventional Commits, маленькие коммиты.

## Как сдавать

Отчёт Андрею: коммиты, что сделано, прогон, скриншоты. Не мерж сам.

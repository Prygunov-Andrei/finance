# BRIEF — AC-Федя — Ф8B-1 frontend

## Где ты находишься

- **Рабочая директория:** `/Users/andrei_prygunov/obsidian/avgust/ERP_Avgust_ac_fedya_f8b1/`
- **Ветка:** `ac-rating/f8b1-frontend` (от свежей `main` после Ф8B-1 backend).
- **Worktree:** изолированный checkout. `frontend/node_modules/` — hardlink-tree, можно сразу `tsc/test/lint`.

## Кто ты

**AC-Федя** — frontend-разработчик команды AC Rating. Текущая задача — UI Ф8B-1 (см. `TASK.md`): страницы критериев и методики + AI-кнопка в редакторе модели.

## Правила worktree

1. **НЕ переключайся** в другой checkout — сиди в этом worktree до конца задачи.
2. **НЕ пушь напрямую в `main`.** Все коммиты — только в `ac-rating/f8b1-frontend`.
3. **Перед push:** `git fetch origin && git rebase origin/main`.
4. **При правке shared-файлов** — пинг ДО коммита. Shared:
   - `frontend/components/erp/components/Layout.tsx` — sidebar (нужно дополнить).
   - `frontend/app/globals.css` — НЕ трогай.
   - `frontend/lib/api/services/rating.ts`, `frontend/lib/api/types/rating.ts` — публичный клиент, НЕ для админки.
5. **НЕ трогай** территорию ISMeta+Recognition: `recognition/`, `ismeta/`, `frontend/app/(ismeta)/...`.
6. **Conventional Commits**, маленькие коммиты.
7. **Тесты** — пиши минимум для каждой новой страницы (рендер + happy path).

## Что почитать ДО старта

1. `TASK.md` — детальное ТЗ.
2. `CLAUDE.md` в корне.
3. `ac-rating/tz/F8-admin-ui-rewrite.md` — общий план Ф8.
4. **Backend (main, после мержа Ф8B-1):**
   - `backend/ac_methodology/admin_serializers.py` — точные поля для Criterion + MethodologyVersion + nested MethodologyCriterion.
   - `backend/ac_methodology/admin_views.py` — endpoint поведение, фильтры.
   - `backend/ac_catalog/admin_views.py:GenerateProsConsView` — формат response для AI кнопки.
   - `backend/ac_catalog/admin_urls.py` — точные URL пути.
5. **Frontend reference** (твоя же работа из Ф8A):
   - `frontend/components/hvac/services/acRatingService.ts` — расширяешь его.
   - `frontend/components/hvac/services/acRatingTypes.ts` — добавляешь типы.
   - `frontend/components/hvac/pages/ACBrandsPage.tsx` — образец простой CRUD-таблицы (для ACCriteriaPage).
   - `frontend/components/hvac/pages/ACBrandEditor.tsx` — образец edit-формы с photo upload (для ACCriterionEditor).
   - `frontend/components/hvac/pages/ACModelEditor.tsx` строка 907-934 — там placeholder «Кнопка появится в Ф8B» во вкладке Pros/Cons. Заменишь.
6. `frontend/components/erp/components/Layout.tsx` — твой же sidebar entry «HVAC-Рейтинг» из Ф8A. Добавишь 2 children: Критерии, Методика.

## Как сдавать работу

Отчёт Андрею:

1. Имя ветки + коммиты.
2. Что сделано / не сделано.
3. Прогон: `npx tsc --noEmit`, `npm test`, при возможности скриншоты через Playwright MCP (страницы критерии/методика + screenshot AI-кнопки).
4. Известные риски.
5. Ключевые файлы для ревью.

После — НЕ мерж сам. Жди ревью.

## Контакты

Технические вопросы — в чат к Claude через Андрея.

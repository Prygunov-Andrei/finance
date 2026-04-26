# BRIEF — AC-Федя — Ф8A frontend

## Где ты находишься

- **Рабочая директория:** `/Users/andrei_prygunov/obsidian/avgust/ERP_Avgust_ac_fedya_f8a/`
- **Ветка:** `ac-rating/f8a-frontend` (создана от `main` после мержа Ф8A backend Пети)
- **Worktree:** изолированный checkout. `frontend/node_modules/` — hardlink-tree из основного checkout, можно сразу `npm test`/`tsc --noEmit`/`npm run lint`.

## Кто ты

**AC-Федя** — frontend-разработчик команды AC Rating. Next.js 16 + React 19 + TypeScript strict + shadcn/ui. Текущая задача — UI Ф8A (см. `TASK.md`).

## Правила worktree

1. **НЕ переключайся** в другой checkout — сиди в этом worktree до конца задачи.
2. **НЕ пушь напрямую в `main`.** Все коммиты — только в свою ветку `ac-rating/f8a-frontend`.
3. **Перед push:** `git fetch origin && git rebase origin/main` (main движется быстро — ISMeta команда работает параллельно).
4. **При правке shared-файлов** — пинг в чат к Claude (техлид) ДО коммита. Shared:
   - `frontend/components/erp/components/Layout.tsx` — sidebar (нужно правишь, см. TASK)
   - `frontend/app/globals.css` — НЕ трогай (shadcn tokens)
   - `frontend/app/layout.tsx` корневой — НЕ трогай
   - `frontend/lib/api/types/rating.ts`, `frontend/lib/api/services/rating.ts` — это **публичный** клиент рейтинга (для hvac-info.com); для ERP-админки **НЕ используй**, заведи свой service в `frontend/components/hvac/services/`
5. **НЕ трогай** территорию ISMeta+Recognition: `recognition/`, `ismeta/`, `frontend/app/(ismeta)/...`.
6. **Conventional Commits:** `feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`. Маленькие осмысленные коммиты.
7. **Тесты пишешь сам** где имеет смысл (формы, валидация, фильтры). Без них задача не считается done.
8. **Code style:** см. CLAUDE.md в корне репо (Path aliases `@/*` → `./frontend/*`, primitive UI из `@/components/ui/`).

## Reference-стиль

Образцы для подражания (ВНИМАТЕЛЬНО прочитай и сохрани стиль):

- `frontend/components/hvac/pages/NewsList.tsx` — листинг с фильтрами, bulk-actions, AlertDialog для confirm. Главный референс для `ACModelsPage`.
- `frontend/components/hvac/pages/BrandsPage.tsx` — простой CRUD-список с inline-form. Главный референс для `ACBrandsPage`.
- `frontend/components/hvac/pages/NewsEditor.tsx` — большая форма редактирования (табы, медиа, inline-секции). Главный референс для `ACModelEditor`.
- `frontend/components/hvac/services/newsService.ts` — service-pattern: использует `apiClient.ts` (axios + JWT + auto-refresh).

## Как сдавать работу

После завершения — отчёт в чат Андрею (он передаст Claude):

1. **Имя ветки + коммиты** (`git log --oneline main..HEAD`).
2. **Что сделано** — bullet-list по пунктам TASK.md.
3. **Что НЕ сделано и почему** — если есть. Не молчи о пропусках.
4. **Прогон**:
   - `cd frontend && npx tsc --noEmit` — должно быть чисто
   - `cd frontend && npm test` — твои новые тесты + регрессия зелёные
   - `cd frontend && npm run lint` — чисто
5. **Скриншоты ключевых страниц** — листинг моделей, edit-форма, список брендов. Можно через Playwright MCP.
6. **Известные риски** — что может сломаться у других агентов / на проде.
7. **Ключевые файлы** для ревью — пути, чтобы Claude быстро прошёл diff.

После отчёта — НЕ мерж сам. Claude проведёт ревью; если ОК → смержит сам с `--no-ff` от имени Андрея.

## Что почитать ДО старта

1. `TASK.md` (рядом с этим файлом) — детальное ТЗ.
2. `CLAUDE.md` в корне — правила проекта.
3. `ac-rating/tz/F8-admin-ui-rewrite.md` — общий план Ф8 (зачем переписываем).
4. **Backend API:**
   - `backend/ac_catalog/admin_urls.py` — все endpoints
   - `backend/ac_catalog/admin_serializers.py` — точные поля моделей
   - `backend/ac_brands/admin_serializers.py` — поля брендов
   - **ОЧЕНЬ ВАЖНО:** не угадывай схему моделей по памяти. Иди в admin_serializers.py за фактом — это уроком прошлой фазы (Петя нашёл 6 расхождений с моим черновиком; на этот раз сразу читай код).
5. `frontend/components/hvac/services/apiClient.ts` — axios-клиент с JWT.
6. `frontend/components/erp/components/Layout.tsx` — sidebar (нужно дополнить, см. TASK).
7. `frontend/components/hvac/pages/{NewsList,BrandsPage,NewsEditor}.tsx` — образцы.

## Контакты

Технические вопросы — в чат к Claude через Андрея. **Не угадывай** при сомнении: ТЗ может оказаться устаревшим / противоречивым (это уже бывало — Петя нашёл расхождения в моём backend TASK). Лучше переспроси через Андрея.

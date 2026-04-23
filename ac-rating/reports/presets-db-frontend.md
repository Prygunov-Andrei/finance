# Polish-3 Frontend: Пресеты «Своего рейтинга» из БД

**Исполнитель:** AC-Федя
**Ветка:** `ac-rating/presets-db-frontend`
**Дата:** 2026-04-22
**ТЗ:** `ac-rating/tz/polish-3-presets-db.md` (секция Frontend)

## Что сделано

Пресеты таба «Свой рейтинг» (6 чипов: «Август-климат», Тишина, Сибирь, Бюджет, Частный дом, Аллергики) теперь приходят из `methodology.presets` в API, а не строятся клиентски из substring-эвристики по `criterion.code` + `criterion.name_ru`.

### Изменённые файлы

| Файл | Суть |
|---|---|
| `frontend/lib/api/types/rating.ts` | +`RatingMethodologyPreset`, `RatingMethodology.presets: RatingMethodologyPreset[]` |
| `frontend/lib/api/services/rating.ts` | `getRatingMethodology()` теперь async + defaulting `presets ?? []` на случай, если backend-часть Пети ещё не смержена |
| `frontend/app/(hvac-info)/ratings/_components/CustomRatingTab.tsx` | Удалены `PRESET_TAGS` (82 строки), `matches()`, `buildPresetsFromCriteria()` + его export. `presetDefs` берётся из `methodology.presets` (sort по `order`, map в `{id: slug, label, codes: criteria_codes}`). `detectPreset()` оставлен без изменений (matching-логика не изменилась). |
| `frontend/app/(hvac-info)/ratings/page.tsx` | Fallback-методика при 500 получила `presets: []` |
| `frontend/app/(hvac-info)/ratings/methodology/page.tsx` | Аналогично |
| `frontend/app/(hvac-info)/ratings/_components/CustomRatingTab.test.ts` → `.test.tsx` | Переименован, переписан. Было 7 unit-тестов (4 на `computeIndex` + 3 на `buildPresetsFromCriteria`). Стало 8 тестов: все 4 на `computeIndex` остались + 4 новых render-тестов на `CustomRatingTab`: (1) чипы из API, (2) сортировка по `order`, (3) клик по пресету выставляет ровно `criteria_codes`, (4) пустой `methodology.presets` → 0 чипов, grid работает. |
| `frontend/app/(hvac-info)/ratings/_components/specs.test.ts` | Fixture-хелпер `methodology()` получил `presets: []` — TypeScript-требование |

### Git состояние

```
deleted:    frontend/app/(hvac-info)/ratings/_components/CustomRatingTab.test.ts
new file:   frontend/app/(hvac-info)/ratings/_components/CustomRatingTab.test.tsx
modified:   frontend/app/(hvac-info)/ratings/_components/CustomRatingTab.tsx
modified:   frontend/app/(hvac-info)/ratings/_components/specs.test.ts
modified:   frontend/app/(hvac-info)/ratings/methodology/page.tsx
modified:   frontend/app/(hvac-info)/ratings/page.tsx
modified:   frontend/lib/api/services/rating.ts
modified:   frontend/lib/api/types/rating.ts
```

## Верификация

- `npx tsc --noEmit`: clean
- `npx vitest run --dir 'app/(hvac-info)/ratings'`: 117 passed (baseline был 116, заменили 3 substring-теста на 4 render-теста, net +1)
- `npx vitest run` (весь фронт): 359 passed
- Manual QA: visual diff BEFORE vs AFTER-with-mock см. скриншоты ниже.

## Скриншоты

### BEFORE — пресеты строятся клиентски из `buildPresetsFromCriteria`
`presets-db-frontend-BEFORE.png` (main до наших изменений, прод-API без `presets` в ответе, но frontend сам генерирует 6 чипов)

### AFTER-empty-api — текущее промежуточное состояние
`presets-db-frontend-AFTER-empty-api.png` (наш worktree, прод-API без `presets` → defaulting `?? []` → 0 чипов в UI, но блок «ПРЕСЕТ:» остаётся; всё остальное работает)

### AFTER-with-mock-presets — **ожидаемое** состояние после мержа backend-части Пети
`presets-db-frontend-AFTER-with-mock-presets.png` (worktree + временный мок в `getRatingMethodology()` — имитирует API, возвращающий те же 6 пресетов) — **визуально идентично BEFORE**: 6 чипов в том же порядке, активен «Август-климат», layout/grid неизменны.

Мок для этого скриншота был вставлен в `frontend/lib/api/services/rating.ts` только для снятия screenshot'а и **удалён перед коммитом**. В коммите `getRatingMethodology()` возвращает `raw.presets ?? []`.

## Blockers / Stop-signs

- **Backend Пети пока не смержен.** Текущий прод-API не возвращает `presets` → в UI 0 чипов. Это ожидаемое **промежуточное** состояние: после мержа backend-части и деплоя визуал вернётся к BEFORE (см. AFTER-with-mock-presets).
- **Не мержу ветку до мержа бекенда Пети** (явное требование ТЗ). После мержа: `git fetch origin && git rebase origin/main`, финальный QA против реального API, только потом merge в main.
- **Stop-sign из ТЗ:** если после мержа backend'а один из 6 пресетов выбирает ДРУГОЙ набор критериев, чем BEFORE — это расхождение между substring-списками в data-migration Пети и старыми `PRESET_TAGS`. Нужен пинг Пете на правку `include_substrings`/`exclude_substrings` в `0005_seed_initial_presets.py`.

## Архитектурные заметки

- `getRatingMethodology()` после backend-мержа может либо оставить защиту `?? []` как graceful fallback на случай, если админ случайно деактивирует все пресеты в Django Admin, либо упростить до прямого возврата `ratingFetch`. Рекомендую оставить — стоит минимум, защищает от degenerate случая.
- `detectPreset(active, presets)` не тронут: алгоритм «активный сет == codes пресета» работает одинаково, независимо от источника `codes`. Поэтому подсветка активного чипа при клике на «Тишина» → автосбрасывается при toggle-е любого критерия — поведение сохранено.
- `RatingMethodologyPreset.is_all_selected` и `description` в типах есть, но пока на фронте не используются (`is_all_selected` обрабатывает backend — возвращает `criteria_codes = все активные критерии`; `description` пригодится под tooltip-ом в будущем).

# ТЗ для AI-программистов

Здесь лежат задания для Пети (backend) и Феди (frontend) — AI-программистов, работающих в отдельных Claude-сессиях.

## Как это работает

1. **Claude (tech lead)** формирует ТЗ — см. файлы в этой папке.
2. **Андрей (PO)** открывает агенту worktree + отдельную Claude-сессию, копирует туда **стартовый промпт** (секция «Start-prompt …» в конце каждого ТЗ).
3. Стартовый промпт говорит агенту прочитать `ONBOARDING.md` (единый контекст для всех ТЗ) → потом собственно ТЗ.
4. **Агент** работает в своей ветке (`recognition/NN-...`, `ismeta/...`), коммитит, пушит в свою ветку, пишет отчёт по формату из ТЗ.
5. **PO** приносит отчёт → **Claude-лид** ревьюит (diff, тесты, стиль). При проблемах — новая итерация агента.
6. **Claude-лид** мержит в `main` после прохождения ревью.

**Обязательный онбординг** (читает каждый агент при старте): [ONBOARDING.md](./ONBOARDING.md).

## Соглашения

- **Ветки** — префикс фичи: `recognition/01-skeleton`, `ismeta/ui-resizable-panels`, `ismeta/e15-integration-client` и т.д.
- **Формат ТЗ** — контекст, задача, приёмочные критерии, ограничения, формат отчёта, чек-лист.
- **Приёмка** — ВСЕ замечания ревью блокирующие. Не «для MVP ок» (см. `memory/feedback_strict_review.md`).
- **Тесты** — обязательны. Coverage ≥ 80% на новом коде.
- **Type check + lint** — обязательны в чистом виде.

## Активные задачи

| Файл | Кому | Статус | Ветка |
|---|---|---|---|
| [E17-quote-xlsx-parser-petya.md](./E17-quote-xlsx-parser-petya.md) | Петя | 🟡 **DRAFT** — не стартовать без явного go PO | (pending) |
| [E18-1-recognition-llm-profile-headers-petya.md](./E18-1-recognition-llm-profile-headers-petya.md) | Петя | 🟡 **DRAFT** (E18 LLM-профили + cost) — старт после захода 4/10 | (pending) |
| [E18-2-backend-llm-profile-model-petya.md](./E18-2-backend-llm-profile-model-petya.md) | Петя | 🟡 **DRAFT** — старт после E18-1 в main | (pending) |
| [E18-3-frontend-llm-profile-ui-fedya.md](./E18-3-frontend-llm-profile-ui-fedya.md) | Федя | 🟡 **DRAFT** — старт после E18-1+E18-2 в main | (pending) |
| [E19-1-recognition-async-callbacks-petya.md](./E19-1-recognition-async-callbacks-petya.md) | Петя | 🟡 **DRAFT** (E19 background jobs) — старт после E18 | (pending) |
| [E19-2-backend-recognition-jobs-petya.md](./E19-2-backend-recognition-jobs-petya.md) | Петя | 🟡 **DRAFT** — старт после E19-1 в main | (pending) |
| [E19-3-frontend-jobs-panel-fedya.md](./E19-3-frontend-jobs-panel-fedya.md) | Федя | 🟡 **DRAFT** — старт после E19-1+E19-2 в main | (pending) |

**Примечание:**
- E17 в draft — scope проектировался до обсуждения с PO. Workflow КП в ERP — отдельная продуктовая тема (см. `ismeta/docs/OPEN-QUESTIONS-procurement-ux.md`). Backend-расширение Recognition полезно само по себе, но запускаем только по явному согласию.
- **E18** — фича переключения LLM-моделей через UI + отображение стоимости каждого распознавания. Master spec: [`ismeta/specs/16-llm-profiles.md`](../specs/16-llm-profiles.md). Декомпозирован на 3 sequential task'а (E18-1 → E18-2 → E18-3). Старт строго после захода 4/10 цикла QA.
- **E19** — background jobs: сметчик загружает PDF и продолжает работать, прогресс в шапке, toast при готовности. Master spec: [`ismeta/specs/17-background-recognition-jobs.md`](../specs/17-background-recognition-jobs.md). Декомпозиция: E19-1 → E19-2 → E19-3. Зависимость: E18 в main (для интеграции `LLMProfile` в `RecognitionJob`). Старт после явного go PO.

## Выполнено

| Файл | Ветка | Merged |
|---|---|---|
| E15-01-recognition-skeleton-petya.md | `recognition/01-skeleton-and-spec-parser` | 2026-04-20 |
| UI-01-resizable-sections-panel-fedya.md | `ismeta/ui-resizable-panels` | 2026-04-20 |
| E15.02a/02b Recognition clients | `recognition/02-*`, `recognition/03-*` | 2026-04-20/21 |
| E15.03 hybrid text-layer parser | `recognition/04-hybrid-text-layer-parser` | 2026-04-21 (main `1701b91`) |
| UX-PDF-PROGRESS | `ismeta/ux-pdf-import-progress` | 2026-04-21 (main `1701b91`) |
| E15-03-hotfix-dedup-varchar-petya.md | `recognition/05-hotfix-dedup-varchar` | 2026-04-21 (main `cd18905`) |
| UI-04-model-comments-columns-fedya.md | `ismeta/ui-04-model-comments-columns` | 2026-04-21 (main `2e442e5`) |
| E15-04-column-aware-llm-normalization-petya.md | `recognition/06-column-aware-llm-normalization` | 2026-04-21 (main `28a5550`) |
| E15-05-it1-prompt-sections-petya.md | `recognition/07-e15.05-it1-prompt-sections` | 2026-04-22 (main `f471d5f`) |
| UI-06-merge-rows-fedya.md | `ismeta/ui-06-merge-rows` | 2026-04-22 (main `39f4377`) |
| UI-07-search-fedya.md | `ismeta/ui-07-items-search` | 2026-04-22 (main `539ea7b`) |
| E15-05-it2-multiline-manufacturer-petya.md | `recognition/08-e15.05-it2-bbox-multimodal` | 2026-04-22 (main `dbb0a9b`) |
| E16-it1-invoice-hybrid-petya.md | `recognition/09-e16-it1-invoice-hybrid` | 2026-04-22 (main `a5518d7`) |
| TD-01-tech-debt-batch-petya.md | `recognition/10-td-01-tech-debt-batch` | 2026-04-23 (main `4ce08ca`) |
| UI-08-column-widths-resize-persist-fedya.md | `ismeta/ui-08-column-widths` | 2026-04-23 (main `f2b01cc`) |
| UI-09-sections-move-merge-fedya.md | `ismeta/ui-09-sections-operations` | 2026-04-23 (main `aedf80b`) |
| E15-06-spec-robustness-petya.md | `recognition/11-e15-06-spec-robustness` | 2026-04-23 (main `49ee1be`) |
| E15-06-it2-vision-safety-net-petya.md | `recognition/12-e15-06-it2-vision` | 2026-04-23 (main `a88b3f4`) |
| UI-10-suspicious-pages-warning-fedya.md | `ismeta/ui-10-suspicious-pages` | 2026-04-24 (main `b323bf7`) |
| TD-02-excel-note-suspicious-petya.md | `ismeta/td-02-excel-note-suspicious` | 2026-04-24 (main `1c56835`) |
| UI-12-estimate-note-sticker-fedya.md | `ismeta/ui-12-estimate-note-sticker` | 2026-04-24 (main `6b3fbf3`) |
| TD-03-recognition-backend-polish-petya.md | `recognition/13-td-03-polish` | 2026-04-24 (main `9661475`) |
| UI-13-inline-edit-tech-specs-fedya.md | `ismeta/ui-13-inline-edit-tech-specs` | 2026-04-24 (main `7ba5ec1`, только regression тесты) |
| UI-14-import-result-types-split-fedya.md | `ismeta/ui-14-import-result-types` | 2026-04-24 (main `6013d81`) |
| TD-04-seed-min-items-adr-ci-petya.md | `recognition/14-td-04-polish` | 2026-04-24 (main `a85e248`) |

## История

- **2026-04-20** — созданы первые два ТЗ (Recognition Service skeleton, Resizable sidebar).
- **2026-04-21** — E15.03 hybrid + UX-progress замержены. QA-сессия 2 на golden выявила 21 активную проблему → 9 root causes. Созданы ТЗ: E15.03-hotfix (R3 dedup + R8 varchar), E15.04 Вариант B (text-layer + LLM normalization, решает R1+R2+R4+R5+R7), UI-04 (R6 столбцы модели+примечания). Все три замержены. Live-QA E15.04 на golden: 147/152 = 96.7% recall.
- **2026-04-22 утро** — QA-сессия 3 на новом golden `spec-aov.pdf` (29 позиций, Автоматика/Кабели/Лотки). Выявлено 9 находок (#26–#34) → 5 новых root causes (R17 ext, R18, R19, R20, R21, R22). Главный блокер — LLM **сдвиг колонок** (model/brand/unit/qty перемешаны для items 1-15). Bbox-парсер работает корректно — баг только в промпте. План: E15.05 две итерации — сначала prompt+sections+stamp+numeric prefix, потом multi-line+manufacturer.
- **2026-04-22 день** — E15.05 it1 замержен (R17 ext/R19/R20/R21 закрыты). Live-QA dual golden: spec-ov2 149/152=98%, spec-aov 29/29=100%.
- **2026-04-22 день** — QA-сессия 4 на третьем golden `spec-tabs-116-ov.pdf` (9 стр, ~150 позиций, Вентиляция/Кондиционирование/БТП). 185 items распарсено, но все с `model_name=""` (R23 — multi-row header ЕСКД не детектируется). Плюс штампы в pos (R25), лишние пробелы в числах (R24), дубли секций `"X :"` (R26), multi-line split на 3 items (R18 слабо). Решение Андрея — гибрид bbox-hardening + multimodal Vision fallback. Цель: ≥95% качество на любых документах, cost/speed не блокер. E15.05 it2 расширен: R18/R22/R23/R24/R25/R26/R27 + переход на gpt-4o full. Параллельно UI-06 (Merge Rows) + UI-07 (Search) для Феди.
- **2026-04-22 вечер** — E15.05 it2 + UI-06 + UI-07 замержены. Live-QA: spec-ov2 98%, spec-aov 100% с manufacturer, spec-tabs 87% model на 195 items. Гибрид для Spec документов закрыт. Андрей: «Запускаем работу над полным гибридом» — перенос архитектуры на Invoice (Счета) и Quote (КП). **E16 стартует**. Фаза 1 (it1) — Invoice hybrid, 2 golden'а (ГалВент 4 items, ЛУИС+ 15 items), схема расширяется (vat_rate, contract_ref, project_ref, lead_time_days, notes). Фаза 2 (it2) — Quote hybrid после мержа it1.

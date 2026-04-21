# ТЗ для AI-программистов

Здесь лежат задания для Пети (backend) и Феди (frontend) — AI-программистов, работающих в отдельных Claude-сессиях.

## Как это работает

1. **Claude (tech lead)** формирует ТЗ в формате промпта — см. файлы в этой папке.
2. **Андрей (PO)** копирует содержимое ТЗ в отдельную Claude-сессию (Пете или Феде).
3. **Агент** работает в своей ветке (`recognition/NN-...`, `ismeta/ui-...`), коммитит, возвращает отчёт.
4. **Claude** ревьюит: diff, тесты, стиль. При проблемах — новая итерация.
5. **Claude** мержит в `main` после прохождения ревью.

## Соглашения

- **Ветки** — префикс фичи: `recognition/01-skeleton`, `ismeta/ui-resizable-panels`, `ismeta/e15-integration-client` и т.д.
- **Формат ТЗ** — контекст, задача, приёмочные критерии, ограничения, формат отчёта, чек-лист.
- **Приёмка** — ВСЕ замечания ревью блокирующие. Не «для MVP ок» (см. `memory/feedback_strict_review.md`).
- **Тесты** — обязательны. Coverage ≥ 80% на новом коде.
- **Type check + lint** — обязательны в чистом виде.

## Активные задачи

| Файл | Кому | Статус | Ветка |
|---|---|---|---|
| [E15-03-hotfix-dedup-varchar-petya.md](./E15-03-hotfix-dedup-varchar-petya.md) | Петя | 🔴 Hotfix — выдать первым | `recognition/05-hotfix-dedup-varchar` |
| [E15-04-column-aware-llm-normalization-petya.md](./E15-04-column-aware-llm-normalization-petya.md) | Петя | 🟠 После hotfix | `recognition/06-column-aware-llm-normalization` |
| [UI-04-model-comments-columns-fedya.md](./UI-04-model-comments-columns-fedya.md) | Федя | 🟢 Параллельно, можно сразу | `ismeta/ui-04-model-comments-columns` |

## Выполнено

| Файл | Ветка | Merged |
|---|---|---|
| E15-01-recognition-skeleton-petya.md | `recognition/01-skeleton-and-spec-parser` | 2026-04-20 |
| UI-01-resizable-sections-panel-fedya.md | `ismeta/ui-resizable-panels` | 2026-04-20 |
| E15.02a/02b Recognition clients | `recognition/02-*`, `recognition/03-*` | 2026-04-20/21 |
| E15.03 hybrid text-layer parser | `recognition/04-hybrid-text-layer-parser` | 2026-04-21 (main `1701b91`) |
| UX-PDF-PROGRESS | `ismeta/ux-pdf-import-progress` | 2026-04-21 (main `1701b91`) |

## История

- **2026-04-20** — созданы первые два ТЗ (Recognition Service skeleton, Resizable sidebar).
- **2026-04-21** — E15.03 hybrid + UX-progress замержены. QA-сессия 2 на golden выявила 21 активную проблему → 9 root causes. Созданы ТЗ: E15.03-hotfix (R3 dedup + R8 varchar), E15.04 Вариант B (text-layer + LLM normalization, решает R1+R2+R4+R5+R7), UI-04 (R6 столбцы модели+примечания).

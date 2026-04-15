# 08. Граф зависимостей эпиков Этапа 1

**Версия:** 0.1. **Назначение:** порядок работ этапа 1 (MVP), критический путь, возможности параллельного исполнения.

## 1. Эпики этапа 1

Каждый эпик — это один связный кусок работы, закрепляемый за ответственным. Эпики не равны спринтам: один эпик может потребовать нескольких спринтов, несколько эпиков могут идти параллельно.

| ID | Эпик | Владелец (профиль) | Артефакт-опора |
|---|---|---|---|
| E1 | Инфраструктура и скелеты проектов | devops + backend | `09-dev-setup.md` |
| E2 | Модели БД ISMeta | backend | `01-data-model.md` |
| E3 | OpenAPI-контракты и pact-тесты | backend + QA | `02-api-contracts.md` |
| E4 | Core API ISMeta: CRUD смет, разделов, строк, наценок | backend | `02`, optimistic locking |
| E5 | Миграция движка подбора работ (Tier 0-5) + agents для Tier 6-7 | backend + LLM | `06-migration-plan.md §3.2` |
| E6 | Миграция движка наценок и Excel-экспорта | backend | `06`, `05-excel-schema.md` |
| E7 | Excel-импорт с diff-preview | backend + frontend | `05-excel-schema.md §6` |
| E8 | LLM-агент MVP: 2 инструмента, чат | LLM + backend | `04-llm-agent.md` |
| E9 | Frontend: редактор сметы | frontend | `02` (core) |
| E10 | Frontend: диалог подбора работ/материалов | frontend | `02 §1.5` |
| E11 | Frontend: виджет `@ismeta/widget` | frontend | `02 §1`, widget API |
| E12 | ERP: endpoint приёма snapshot'ов | backend ERP | `02 §2`, `06 §6.1` |
| E13 | ERP: catalog API v1 + outbox webhook'и | backend ERP | `02 §4`, `03-webhook-events.md §4` |
| E14 | ERP: JWT issuer для ISMeta | backend ERP | `02 §6`, `12-security.md` |
| E15 | Recognition: выделить `SpecificationParser` в app `recognition/` | backend ERP | `02 §5` |
| E16 | LLM-шлюз в ERP: учёт токенов (MVP) | backend ERP | `11-metrics.md` |
| E17 | Webhook receiver ISMeta + idempotency | backend | `03`, `01 §8.3` |
| E18 | Snapshot transmission с retry | backend | `01 §8.5`, `02 §2` |
| E19 | ProductKnowledge sync + .md файлы per workspace | backend | `01 §5.1`, `04 §3.2` |
| E20 | Golden set (10 смет) + cassette-tests | QA + LLM | `14-golden-set.md` |
| E21 | E2E-сценарии Playwright | QA + frontend | `07-mvp-acceptance.md §3.1` |
| E22 | Multi-tenancy isolation tests | QA + backend | `01`, `04.5 CONCEPT §4.5` |
| E23 | Бэкапы, rollback, observability | devops | `12-security.md`, `13-release-process.md` |
| E24 | Developer / User / Admin docs стартовые версии | весь состав | `docs/ismeta/` |

## 2. Граф зависимостей

```
E1 (инфраструктура)
 │
 ├────► E2 (модели БД)
 │        │
 │        ├────► E4 (Core API)
 │        │        │
 │        │        ├────► E9 (Frontend редактор)
 │        │        │        │
 │        │        │        ├────► E11 (Widget)
 │        │        │        └────► E21 (E2E)
 │        │        │
 │        │        ├────► E10 (Frontend matching UI)
 │        │        │        └── требует E5 (pipeline)
 │        │        │
 │        │        ├────► E6 (Excel-экспорт, наценки)
 │        │        │        └── требует E2 моделей
 │        │        │
 │        │        └────► E7 (Excel-импорт с diff)
 │        │                 └── требует E6 (схема экспорта)
 │        │
 │        ├────► E5 (движок подбора)
 │        │        │
 │        │        ├── нужен: E13 (ERP catalog API для live-запросов)
 │        │        ├── нужен: E16 (LLM-шлюз для учёта токенов)
 │        │        └────► E8 (LLM-агент)
 │        │                  └── нужен: E16, E5
 │        │
 │        ├────► E17 (webhook receiver)
 │        │        └── нужен: E13 (outbox в ERP)
 │        │
 │        ├────► E18 (snapshot transmission)
 │        │        └── нужен: E12 (ERP receiver)
 │        │
 │        └────► E19 (ProductKnowledge sync)
 │
 ├────► E3 (OpenAPI + pact)  — стартует рано, обновляется параллельно всему
 │
 ├────► E12 (ERP snapshot receiver) — параллельно E4
 ├────► E13 (ERP catalog API + outbox) — параллельно E2-E4, БЛОКИРУЕТ E5 и E17
 ├────► E14 (JWT issuer) — параллельно E1, нужен к E11
 ├────► E15 (Recognition service) — параллельно, нужен к E7/E9
 ├────► E16 (LLM-шлюз) — параллельно, нужен к E5 и E8
 │
 ├────► E20 (Golden set) — стартует после первой рабочей версии E5
 ├────► E21 (E2E) — после E9+E10+E11
 ├────► E22 (isolation tests) — после E2, растёт с развитием
 ├────► E23 (observability) — параллельно, финализируется перед cut-over
 └────► E24 (docs) — параллельно всем, финализируется перед cut-over
```

## 3. Критический путь

Самая длинная цепочка:

```
E1 → E2 → E4 → E9 → E10 → E21 → cut-over
        ↘
          E5 → E8 → E21
          ↑
          E13 (блокер)
```

**Критичны для сдачи MVP:**
- E1 (инфра) — блокирует всё.
- E2 (модели) — блокирует всю разработку backend ISMeta.
- E13 (ERP catalog API + outbox) — блокирует E5 (подбор) и E17 (webhook). **Это работа в ERP, её надо начать одновременно с E1.**
- E5 (pipeline) — блокирует E10 (frontend matching UI) и E8 (агент).
- E12 (ERP receiver) — блокирует cut-over, но не E2E до него.

## 4. Что можно делать параллельно

### Группа A: Начинается сразу после E1
- E2 (ISMeta модели) — backend ISMeta
- E12 (ERP snapshot receiver) — backend ERP
- E13 (ERP catalog API + outbox) — backend ERP
- E14 (JWT issuer) — backend ERP
- E15 (Recognition service) — backend ERP
- E16 (LLM-шлюз учёт токенов) — backend ERP
- E24 (docs — стартовые версии) — весь состав

### Группа B: После E2
- E4 (Core API) — backend ISMeta
- E3 (OpenAPI) — backend + QA (параллельно E4)
- E6 (Excel-экспорт, наценки) — backend
- E19 (Knowledge sync) — backend

### Группа C: После E4
- E5 (подбор работ) — backend + LLM, ПРИ УСЛОВИИ E13 готов
- E7 (Excel-импорт) — backend + frontend, после E6
- E9 (Frontend редактор) — frontend
- E17 (webhook receiver) — backend, ПРИ УСЛОВИИ E13 готов
- E18 (transmission) — backend, ПРИ УСЛОВИИ E12 готов

### Группа D: После E5
- E8 (LLM-агент) — LLM + backend, ПРИ УСЛОВИИ E16 готов
- E10 (Frontend matching UI) — frontend
- E20 (Golden set) — QA + LLM

### Группа E: Финализация
- E11 (Widget) — после E9
- E21 (E2E) — после E9+E10
- E22 (isolation) — постоянно, но финализируется перед cut-over
- E23 (observability) — перед cut-over
- E24 (docs финал) — перед cut-over

## 5. Распределение по профилям команды (минимум)

| Профиль | Эпики (основная нагрузка) |
|---|---|
| Backend ISMeta senior | E2, E4, E5, E6, E7, E17, E18, E19 |
| Backend ERP senior | E12, E13, E14, E15, E16 |
| Frontend senior | E9, E10, E11 |
| LLM-инженер | E5 (Tier 6-7), E8, E20 |
| QA / тестирование | E3 (pact), E20, E21, E22 |
| DevOps | E1, E23 |
| Продакт / техписатель | E24 (консолидация и ревью документов) |

## 6. Риски расписания

| Риск | Возможный эффект | Митигация |
|---|---|---|
| E13 (ERP catalog API) откладывается | Блокирует E5, E17 → весь критический путь | Начинать E13 одновременно с E1; иметь готовый mock в `tools/mocks/` |
| E15 (Recognition) откладывается | Блокирует реальные E2E через распознавание | Mock для разработки, реальный сервис к E21 |
| Рефакторинг работы matching оказывается сложнее | Блокирует E8, E10 | Итеративный подход: сначала Tier 0-5 через live-API, затем Tier 6-7 |
| Multi-tenancy баги при позднем обнаружении | Переписывание многих мест | E22 стартует рано (после E4), регресс на каждый PR |
| Excel-импорт с diff сложнее ожидаемого | Задержка E7 → задержка E21 | Разбить: сначала happy path, потом conflict resolution |

## 7. Контрольные точки

Неделя отсчитывается **от kickoff-даты этапа 1** (дня после закрытия чекбоксов этапа 0, см. [`07-mvp-acceptance.md §2`](./07-mvp-acceptance.md)).

| Точка | Что должно быть готово |
|---|---|
| Конец E1 (неделя 4-6 после kickoff) | dev-стек работает, CI запускается, два workspace |
| Конец E2+E12+E13 (неделя 8-10) | модели ISMeta, ERP принимает snapshot, ERP catalog API отвечает |
| Конец E4 (неделя 12) | Core API работает, фронтенд может CRUD'ить |
| Конец E5+E8+E9 (неделя 16-20) | полный цикл: создал → подбор → правка → Excel → LLM-tool |
| Конец E20+E21 (неделя 22-24) | golden set + E2E прошли, staging готов |
| Cut-over | 2 недели успешной работы staging, все 3.1-3.3 из `07-mvp-acceptance.md` |

Указанные недели — грубая прикидка, не план. Реальный план составляется командой после ознакомления с документами. Kickoff-дата фиксируется в [`../docs/TEAM.md`](../docs/TEAM.md) сразу после закрытия этапа 0.

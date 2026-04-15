# Исследование состояния смет в ERP для продукта ISMeta

**Рабочее имя продукта:** ISMeta (айсмета).
**Дата:** 2026-04-15.

---

## Часть 1. Текущий код ERP

### 1.1 Backend (`backend/estimates/`)
- ~16 000 LOC. Модели: Estimate, EstimateSection, EstimateSubsection, EstimateItem, EstimateCharacteristic, MountingEstimate, Project, ProjectFile, ProjectFileType, ProjectNote, ColumnConfigTemplate, EstimateMarkupDefaults, SpecificationItem.
- **Внешние FK:** Object, LegalEntity/Counterparty, PriceList/WorkItem, Product/ProductPriceHistory, SupplierProduct, EstimateRequest/EstimateRequestFile, User.
- **Services:** markup_service, estimate_import_service (Excel+PDF), estimate_excel_exporter, specification_transformer, ditto_resolver, redis_session, work_matching/ (5 модулей).
- **Celery:** process_estimate_pdf_pages, process_work_matching, recover_stuck_work_matching, sync_knowledge_md_task.
- **Миграции:** 11, включая data-migration 0010.

### 1.2 Work matching pipeline
- 8 уровней: Default → History (ProductWorkMapping) → PriceList fuzzy → Knowledge (ProductKnowledge) → Category → Full fuzzy → LLM batch → LLM+WebSearch.
- Двухпроходная архитектура: Pass 1 sync (tier 0–5), Pass 2 async LLM (tier 6–7).
- База знаний: ProductKnowledge (БД) + `data/knowledge/products/*.md`.
- Отдельный pipeline для материалов: EstimateAutoMatcher (preview_matches).

### 1.3 Frontend (`frontend/`)
- ~10 500 LOC, 31 компонент, 44 типа, 81 API-метод, 8 маршрутов.
- Готов injection-паттерн: `estimate-api-context.tsx` — компоненты параметризуются API-клиентом.
- Уникальные зависимости: xlsx, @tanstack/react-table, @tanstack/react-virtual, @hello-pangea/dnd.
- Шаринг: сметы не импортируют из других UI-модулей; Contracts/TKP/Objects/Supply импортируют типы estimates.

### 1.4 Интеграции смет с ERP
| Модуль | Связь | Направление |
|---|---|---|
| TKP (proposals) | `TKP.estimates` M2M, копирование в TKP-снимок | смета → ТКП |
| Contracts | `ContractEstimate.source_estimate`, копирование при подписании | смета → контракт |
| Payments | `Invoice.estimate` (счёт как «исследование») | двусторонняя |
| Catalog | `EstimateItem.product`, ProductKnowledge, ProductWorkMapping | двусторонняя |
| Pricelists | `Estimate.price_list`, `EstimateItem.work_item` | двусторонняя |
| Supplier integrations | `EstimateItem.supplier_product`, RFQ | двусторонняя |
| Objects | обязательная привязка Estimate/Project/MountingEstimate | смета → объект |
| Accounting | `Estimate.legal_entity`, `MountingEstimate.agreed_counterparty` | привязка |
| api_public | EstimateRequest.estimate, Estimate.external_user | двусторонняя |
| Marketing | `Vacancy.attachment_estimate` (для MountingEstimate) | read-only |

### 1.5 LLM-инфраструктура
- Провайдеры: OpenAI, Google Gemini (web search), xAI Grok. Anthropic не реализован.
- LLMTaskConfig: маршрутизация по задачам (invoice_parsing, estimate_import, work_matching_semantic, work_matching_web, product_matching).
- OCR: не отдельный сервис — Vision у LLM. PyMuPDF для PDF→PNG.
- Кэш парсинга: ParsedDocument с SHA256.
- Supplier integrations: 1 поставщик (Breez). RFQ есть, email-синхронизации ответов нет.
- Чат-интерфейс, нормативные документы, векторная БД — отсутствуют.
- Мониторинг LLM: только Django logger, нет дашбордов/учёта токенов.

---

## Часть 2. Жизнь сметы после заключения договора

**Ключевой вывод для границ ISMeta:** в ERP уже есть зрелый механизм работы со сметой после договора. Он автономен от estimates/ и живёт в contracts/. Значит, ISMeta **не** занимается пост-договорной обработкой — это остаётся в ERP.

### 2.1 Что уже есть в `backend/contracts/`
- **Contract:** Status PLANNED → AGREED → ACTIVE → COMPLETED/SUSPENDED/TERMINATED.
- **ContractEstimate:** снимок сметы при подписании. Статусы: DRAFT → AGREED → SIGNED. Версионирование: `version_number`, `parent_version`, `amendment` (FK на ContractAmendment). Метод `create_from_estimate(estimate, contract)` копирует разделы и строки.
- **ContractEstimateItem:** типы REGULAR | CONSUMABLE | ADDITIONAL. Поле `source_item` — backup на оригинальный EstimateItem. Поля для аналогов: `is_analog`, `analog_reason`.
- **ContractAmendment:** допсоглашение, инициирует новую версию ContractEstimate.
- **EstimatePurchaseLink:** связывает InvoiceItem с ContractEstimateItem. Поля: `quantity_matched`, `match_type` (EXACT/ANALOG/SUBSTITUTE), `price_exceeds`, `quantity_exceeds`.
- **Act (КС-2/КС-3):** создаётся через `Act.create_from_accumulative(contract_estimate, items_data)`. Статусы: DRAFT → AGREED → SIGNED.
- **Сервисы:**
  - `EstimateComplianceChecker.check_invoice(invoice)` — проверка соответствия счёта смете.
  - `EstimateComplianceChecker.auto_link_invoice(invoice)` — автосвязывание покупок.
  - `AccumulativeEstimateService.get_accumulative / get_remainder / get_deviations / export_to_excel`.
- **API endpoints:** `/contract-estimates/from-estimate/`, `/contract-estimates/{id}/create-version/`, `/contract-estimates/{id}/split/`, `/acts/from-accumulative/`, `/estimate-purchase-links/*`.

### 2.2 Граница ISMeta vs ERP
| Ответственность | ISMeta | ERP (contracts) |
|---|---|---|
| Создание сметы, расчёт, редактирование до подписания | ✓ | — |
| Подбор работ/материалов (LLM, fuzzy, knowledge) | ✓ | — |
| Версии «в переговорах с клиентом» | ✓ (`version_number`) | — |
| Снимок при подписании договора | → отдаёт данные | ContractEstimate.create_from_estimate() |
| Версии после договора (через ДОП) | — | ContractEstimate.create_new_version(amendment=) |
| Точечные правки (consumable, additional, аналоги закупки) | — | ContractEstimateItem, EstimatePurchaseLink |
| Накопительная, остатки, отклонения | — | AccumulativeEstimateService |
| Акты КС-2 | — | Act.create_from_accumulative() |

---

## Часть 3. Публичный портал (уже существующий flow)

`backend/api_public/` содержит ПОЛНЫЙ автоматический flow, это прототип «магии» для посетителя сайта.

### 3.1 Быстрая оценка без регистрации
```
Email + OTP → загрузка PDF/Excel → POST /api/public/v1/estimate-requests/
  → Celery: process_public_estimate_request()
     1. SpecificationParser.parse_pdf()  (LLM Vision, постраничный)
     2. create_estimate_from_spec_items()  (SpecificationItem → EstimateItem)
     3. EstimateAutoMatcher.auto_fill()  (цены из каталога/истории)
     4. generate_and_deliver()  (Excel + email)
  → status: UPLOADED → PARSING → MATCHING → READY/REVIEW → DELIVERED
```
- Автоапрув через `PublicPortalConfig.auto_approve`.
- Наценка для публичных смет: отдельная (`PublicPricingConfig.markup_percent` по категориям), применяется при экспорте, не в БД.
- Ссылка доступа на 30 дней по `access_token`.

### 3.2 Кабинет с регистрацией
- `ExternalUser`: OTP-логин, сессия 7 дней, **не более 1 активной сметы** (`public_source=True`).
- Cabinet API (`/api/public/v1/cabinet/...`) повторяет CRUD сметы, work-matching, export.
- Rate limit: 100 req/hour, 500 строк на смету.

### 3.3 Что важно для концепции ISMeta
- Есть готовый `SpecificationParser` в `backend/llm_services/services/specification_parser.py` — это как раз кандидат на выделение в «сервис распознавания».
- Есть готовый `create_estimate_from_spec_items()` в `backend/estimates/services/specification_transformer.py` — точка входа в ISMeta для создания сметы из распознанных данных.
- Есть готовые модели `SpecificationItem`, `EstimateRequestFile` — основа контракта между «распознаванием» и «сметами».

---

## Часть 4. Решения руководителя (первый раунд, 2026-04-15)

### 4.1 Стратегия
- Первый клиент — ERP Август. Параллельно публичный портал и коробочный продукт.
- **Качество > скорость.** Не хотим переделывать.
- Документация — сразу как для внешнего продукта.
- Монетизация сейчас неважна, индивидуальные внедрения.
- **УТП:** замена живого сметчика, рост скорости x2–x3, сокращение штата сметчиков на 50%.

### 4.2 Границы продукта
- **ТКП:** остаётся в ERP.
- **MountingEstimate:** остаётся в ERP. ERP сам нарезает её из сметы, полученной от ISMeta.
- **Проекты (Project):** не нужны в ISMeta. Смета получает готовые данные от внешнего «механизма распознавания».
- **Распознавание спецификаций — отдельный механизм/сервис**, ISMeta вызывает его по API или принимает готовые данные.
- **Публичный портал:** заявка от посетителя падает в ERP, сметчик дорабатывает; при этом посетитель видит демонстрацию автоматики.

### 4.3 Данные и мастер-данные
- **Каталог товаров:** склоняется к отдельному сервису «Каталог» (обслуживает ERP, ISMeta, публичный портал). Учитывать мультирыночность (ОВиК, двери, окна — разные каталоги у клиентов).
- **Прайс-листы работ:** приходят в ISMeta как готовые данные по API. Универсальная структура: наименование / квалификация / время / ставка.
- **«Мозг» знаний (ProductKnowledge):** живёт в ISMeta. При внедрении к клиенту — копия, которая у клиента дальше «расходится» с исходной.
- **Единицы, НДС, валюты, курсы ЦБР:** всё из ERP.
- **Объекты:** открытая развилка. Возможно, ISMeta нуждается в собственной иерархии группировки смет, но привязка к конкретному «объекту» — на стороне ERP.
- **Контрагенты:** всё по API, ISMeta не хранит копии.

### 4.4 Интеграция с ERP
- Протокол: на усмотрение архитектора (предлагаю REST + webhooks).
- Авторизация: как можно проще, подключил — работает. Сметчик в ERP = сметчик в ISMeta.
- Встраивание фронта: на усмотрение архитектора.
- **ERP получает от ISMeta ВСЁ:** полную смету со строками, ценами, прибыльностью, человеко-часами, поставщиками.
- Ключевая развилка: точечные правки после договора (аналоги, изменение кабеля и т.п.) — делаются в ERP-модуле «обработки смет», вне ISMeta.

### 4.5 Фронтенд и UX
- Стек — на усмотрение архитектора. Масштабируемость до 10 000 строк, визуальная современность. SEO не важно.
- Режимы — требуют уточнения (см. вопросы второго раунда).
- Excel/Google Sheets: сценарий «push → открыть Excel → pull» — обсуждаем.
- Мобильный доступ не нужен. Только десктоп, часто с двумя мониторами.

### 4.6 LLM-агент
- Скоуп: и чат, и набор автоматизаций.
- Автономность: по умолчанию — с подтверждением, настройкой можно ослаблять.
- Память агента: должен помнить беседы со сметчиком, всегда иметь контекст текущей сметы.
- **MVP-инструмент:** выбирает архитектор (предлагаю ниже).
- Нормативная база: не внутри ISMeta. Должна быть в ERP как отдельная RAG-база знаний (пока отсутствует).

### 4.7 Workflow
- Артефакт клиенту: PDF достаточно для начала.
- Версионирование: линейное, как сейчас.
- Коллаборация: одна смета — один сметчик; один сметчик — много смет.

### 4.8 Отрасли и масштаб
- Старт: ОВиК + СС (слаботочные системы).
- Страна: Россия. Мультивалютность — только для номинации оборудования в USD/EUR/CNY.
- Размер смет: средний 2–4 тыс. строк, максимум 10 000.

### 4.9 Тестирование
- Дашборд: максимум метрик.
- Исторические данные: ~8–9 тыс. товаров из 2–3 тыс. счетов в ERP сейчас.
- Golden set: 10 смет на старт, начинаем со сметы в 20 строк.

### 4.10 Миграция и инфраструктура
- ERP не в проде — делаем быстро, без обратной совместимости.
- Инфраструктура: по нарастающей, нет ограничений.
- Риски: «пусть всё ломается — починим».

---

## Часть 6. Реальные цифры с прода (снято 2026-04-15)

PostgreSQL 14.22, режим read-only. Туннель открыт и закрыт.

### Сметы и иерархия
| Сущность | Total | Заметка |
|---|---|---|
| Estimate | **4** | все DRAFT, все март-апрель 2026 |
| Estimate.file (Excel-исходник) | **0** | ни у одной нет |
| EstimateSection | 8 | |
| **EstimateSubsection** | **0** | **подразделы не используются вообще** |
| EstimateCharacteristic | 8 | |
| EstimateItem | 2 606 | средне 651.5 на смету |
| Item с product_id | **0** | подбор не запускался |
| Item с work_item_id | **0** | подбор не запускался |
| Item с supplier_product_id | **0** | |

### Прайс работ — компактный и чистый
| Сущность | Total |
|---|---|
| PriceList | 1 (active, «Прайс-лист 2026», v1) |
| PriceListItem | 238 |
| WorkItem | **238** |
| WorkSection | 24 (В, К, СИА и подсекции) |
| WorkerGrade | 5 (ставки 500/650/800/950/1100 ₽/ч) |

Формула: `cost = hours × coefficient × grade.rate` (с учётом override'ов в PriceListItem, фактически override'ов нет).

Никаких overrides не используется — прайс «плоский».

### Каталог и знания
| Сущность | Total | Деталь |
|---|---|---|
| Product | 9 498 | verified=7093, new=2405 |
| ProductPriceHistory | 5 208 | |
| **ProductKnowledge** | **582** | **все pending**, verified=0, rejected=0 |
| **ProductWorkMapping** | **0** | таблица пустая, Tier 1 history бесполезен |
| Source знаний | llm=348, web=234 | |
| Топ usage | 67 (клапан противопожарный, conf 0.76) | |

### Закупки
| Сущность | Total |
|---|---|
| Invoice | 4 869 |
| Invoice с распознанными items | 1 984 (40.7%) |
| Invoice с parsed_document | 2 078 (42.7%) |
| InvoiceItem | 7 953 |
| Counterparty | 244 (vendor=243, customer=1) |
| LegalEntity | 3 |

### Поставщики
- SupplierIntegration: **1** (Breez)
- SupplierProduct: 3 055 (все is_active)

### Downstream — пусто
| Сущность | Total |
|---|---|
| Contract | 0 |
| ContractEstimate | 0 |
| ContractEstimateItem | 0 |
| MountingEstimate | 0 |
| TechnicalProposal / TKP* | 0 |
| ExternalUser | 0 |
| EstimateRequest | 0 |
| SpecificationItem | 0 |

### LLM
- 3 провайдера: OpenAI (default, gpt-4o), Gemini (gemini-3-flash-preview), Grok (grok-4-fast-non-reasoning).
- 5 задач включены, ни к одной не привязан явный provider — все используют default OpenAI.

### Ключевые выводы из реальных данных (важно для архитектуры)

1. **ERP действительно не эксплуатируется по сметам.** 4 сметы DRAFT, ни одного запуска подбора. Все downstream-модули пустые.
2. **EstimateSubsection не используется** — реальная иерархия = Section → Item. Можно упростить модель ISMeta до 2 уровней (введём 3-й уровень позже, если потребуется).
3. **WorkItem всего 238** — fuzzy-поиск по всему списку в реал-тайме бесплатный (~1 мс). **Локальный кеш WorkItem в ISMeta не критичен**, можно дёргать по API напрямую (упрощение архитектуры).
4. **Excel-исходники сметы не сохраняются.** В ISMeta файл-источник = обязательное поле сметы (для аудита и переоткрытия).
5. **ProductKnowledge есть, но все pending** — никто не верифицирует. В ISMeta нужен явный батч-review-режим, иначе «мозг» не накопится.
6. **ProductWorkMapping = 0** — Tier 1 history в pipeline сейчас всегда возвращает None. Это нормально на старте, но архитектура подбора должна корректно работать без него.
7. **Golden set придётся собирать с нуля.** Существующие 4 сметы — единственный pilot batch.
8. **Pipeline LLM-распознавания счетов работает** (40.7% Invoice распознаны) — есть реальная инфраструктура, на которую можно опереться при выделении сервиса распознавания.
9. **LLMTaskConfig без явного маппинга на провайдер** — нет смысла отделять локальный LLM-настройщик в ISMeta, можно использовать тот же механизм.
10. **Subsections = 0 — двусмысленный сигнал.** Может быть, фича не нужна, а может быть, сметчики просто не дошли. Решение — оставить субсекции в схеме, но не показывать в UI MVP. Включится по галочке «расширенная иерархия».

---

## Часть 5. Открытые развилки и мнение архитектора (для второго раунда)

1. **Распознавание спецификаций** — внутри ERP как отдельное Django-приложение или полноценный микросервис вне ERP. Сейчас это `backend/llm_services/services/specification_parser.py` и `backend/api_public/tasks.process_public_estimate_request()`. Склоняюсь: отдельное приложение в ERP с HTTP-контрактом, чтобы ISMeta вообще не зависел от распознавания и брал из него готовый JSON (`SpecificationItem`-совместимый).
2. **Каталог** — живёт в ERP (мастер), ISMeta использует по API. Отдельный «сервис Каталог» не нужен для MVP. В коробке клиент использует свою реализацию (простейшая — CSV/REST).
3. **Прайсы работ** — ISMeta хранит собственный нормализованный кэш (таблица WorkItem в своей БД), обновляет из ERP по расписанию или webhook'ом. Иначе fuzzy-подбор по всему каталогу будет невозможен офлайн.
4. **Объекты и иерархия в ISMeta** — предлагаю ввести `Workspace` (организация/арендатор) → `Folder` (опциональная папка для группировки) → `Estimate`. Каждая смета имеет `external_ref` (id/название объекта на стороне ERP) — но ISMeta эту сущность не валидирует.
5. **MVP LLM-инструмент** — **«Переподбор аналога по ТТХ».** Конкретная, измеримая ценность: «Вентилятор MOB2600/45-3a отсутствует на складе — найди аналог по мощности, производительности, напряжению из доступного каталога». Обкатаем: tool use, цепочка LLM-вызовов, human-in-the-loop, логирование.
6. **Стек бэкенда ISMeta** — Django 5 + DRF + Celery + PostgreSQL + Redis. Основания: переиспользование 90% кода smetа, зрелость, скорость разработки. Пересмотрим на FastAPI только если упрёмся в производительность.
7. **Стек фронтенда ISMeta** — Next.js 16 (как в ERP) + TanStack Query + TanStack Table + Virtual + Shadcn UI. Отдельное приложение, не монорепа с ERP. Публикуем npm-пакет `@ismeta/widget` для встраивания в ERP и сторонние сайты.
8. **Коробочный формат** — `docker-compose.yml` с backend + frontend + postgres + redis. Готовый скрипт `install.sh`. Все URL'ы и ключи через `.env`. Можно запустить у клиента за полчаса.
9. **Распределение «мозга» знаний** — базовый набор ProductKnowledge + .md отправляется в дистрибутиве коробки. Клиент у себя накапливает. Обновления базового набора публикуются как git tag / npm version, клиент сам решает обновляться или нет (ручной merge).
10. **Окружение (соседние сервисы)** — в рамках концепции нужно зафиксировать, какие ещё сервисы понадобятся ERP для работы с ISMeta: «распознавание документов», «RAG-база знаний норм», «интеграции с поставщиками». ISMeta их не содержит, но зависит от их существования.

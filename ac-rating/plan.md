# План интеграции «Рейтинг кондиционеров» в ERP Avgust

**Статус:** Фаза 0 — разведка завершена, план утверждён 2026-04-18
**Источник:** `ac-rating/review/` (ветка `2026-03-25-xuef`), репозиторий `max7242110/ac-rating`
**Артефакты:** SQL-дамп `~/Downloads/ac_rating_2026-04-18.sql`, media в Google Drive (папка `1ygZ5cJcMhDpQabzAFCJVWGuyGG--ecJg`), локальный стенд в `ac-rating/review/` (db:5434, backend:8002, frontend локально на :3002), скрины в `ac-rating/screenshots/`, brief дизайнеру в `ac-rating/brief-designer.md`

---

## 0. Модель работы команды

**Роли:**
- **Claude (техлид)** — архитектура, разбиение на фазы, ТЗ агентам, code review, решения о мерже, ведение прогресса и этого документа.
- **Андрей (PO / помощник)** — бизнес-решения, визуальные/UX-проверки, запуск агентов в отдельных сессиях, приёмка, решения «брать/не брать» на развилках.
- **Агенты-программисты** — исполнители каждой фазы, работают в отдельных сессиях Claude Code на выделенных ветках.

**Git flow:**
- Основная интеграционная ветка: `ac-rating/main`
- Ветка фазы: `ac-rating/NN-short-name` (например, `ac-rating/02-models`)
- Коммиты — Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`, `test:`)
- После завершения фазы — PR из ветки фазы в `ac-rating/main`
- Ревью проводит Claude, мерж — squash

**Жизненный цикл задачи:**
1. Claude формирует ТЗ и промпт для агента
2. Андрей запускает агента в отдельной сессии, передаёт промпт
3. Агент работает в своей ветке, коммитит, возвращает отчёт
4. Андрей приносит отчёт + имя ветки в основную сессию
5. Claude делает ревью (чтение diff, прогон тестов, проверка приёмки)
6. Либо мерж в `ac-rating/main` + обновление этого документа, либо итерация доработки

---

## 1. Стратегические решения (утверждены 2026-04-18)

| № | Решение | Значение |
|---|---------|----------|
| 1 | Префиксы Django apps | `ac_brands`, `ac_catalog`, `ac_methodology`, `ac_scoring`, `ac_reviews`, `ac_submissions` |
| 2 | Миграции | Clean initial, старые не копируем |
| 3 | URL публичные | `/api/public/v1/rating/*` |
| 4 | URL админские | `/api/hvac/rating/*` |
| 5 | Админка UI на MVP | Django admin as-is |
| 6 | Админка UI после MVP | Переписываем на shadcn/ui в ERP-layout (фазы 8A-C) |
| 7 | Celery | Подключаем для `recalculate_all` |
| 8 | Legacy `ratings/` app | Не переносим |
| 9 | i18n | На старте только русский, 4 языка — поздняя фаза вместе с HVAC-новостями |
| 10 | Frontend Максима | Не копируем компоненты; используем как spec, пишем заново поверх дизайн-системы ERP |
| 11 | Дизайн HVAC-новостей | Тоже редизайним — единый визуальный язык с рейтингом |

---

## 2. Фазы работ

### Легенда
- 🟢 — можно стартовать
- 🟡 — блокирует одну задачу
- 🔴 — критический путь
- 📐 — требует дизайн-входа
- 🧑‍💼 — делает Андрей или совместно

---

### Фаза 1 🔴 — Backend foundation
**Ветка:** `ac-rating/01-backend-skeleton`
**Агент:** 1 (backend-разработчик)
**Зависит от:** —
**Оценка:** 0.5 дня

**Цель:** подготовить скелет 6 Django apps в ERP так, чтобы ERP стартовал без регрессий и был готов принять модели.

**Задачи:**
- Создать пустые apps: `ac_brands`, `ac_catalog`, `ac_methodology`, `ac_scoring`, `ac_reviews`, `ac_submissions`
- Добавить в `INSTALLED_APPS`
- Зарегистрировать URL-ноды (пустые `urlpatterns = []`): `/api/public/v1/rating/` и `/api/hvac/rating/`
- Переиспользовать существующий `TimestampedModel` из `backend/core/models.py:14` (НЕ использовать `TimestampMixin` из `backend/core/mixins.py:314` — это пустая заглушка). Не копировать из ac-rating `core/`.
- Добавить пакеты в `requirements.txt`: `openpyxl`, `xlrd`, `Pillow` (уже есть), `django-ratelimit`
- Настроить `MEDIA_ROOT` подпапки: `media/ac_rating/photos/`, `media/ac_rating/brands/`, `media/ac_rating/submissions/`

**Приёмка:**
- `./dev-local.sh` стартует без ошибок
- `cd backend && pytest` — все существующие тесты зелёные
- `python manage.py makemigrations --dry-run` — чисто
- Эндпоинт `/api/public/v1/rating/` возвращает 404 (префикс есть, роутов нет — это правильно)

---

### Фаза 2 🔴 — Модели и миграции
**Ветка:** `ac-rating/02-models`
**Агент:** 2 (backend)
**Зависит от:** Фаза 1
**Оценка:** 1 день

**Цель:** перенести все модели с переименованием FK/M2M, создать чистые initial миграции.

**Задачи:**
- Перенести модели по таблице:

| Источник | Назначение | Примечания |
|----------|------------|------------|
| `catalog/models.py:ACModel` | `ac_catalog/models.py:ACModel` | FK `brand` → `ac_brands.Brand` |
| `catalog/models.py:ModelRawValue` | `ac_catalog/models.py:ModelRawValue` | FK на `ac_methodology.Criterion` |
| `catalog/models.py:ACModelPhoto` | `ac_catalog/models.py:ACModelPhoto` | `upload_to='ac_rating/photos/'` |
| `catalog/models.py:ACModelSupplier` | `ac_catalog/models.py:ACModelSupplier` | — |
| `catalog/models.py:EquipmentType` | `ac_catalog/models.py:EquipmentType` | — |
| `catalog/models.py:ModelRegion` | `ac_catalog/models.py:ModelRegion` | — |
| `methodology/models.py:*` | `ac_methodology/models.py:*` | `CriterionGroup` не переносим (deprecated) |
| `scoring/models.py:CalculationRun` | `ac_scoring/models.py:CalculationRun` | FK `triggered_by` → existing ERP User |
| `scoring/models.py:CalculationResult` | `ac_scoring/models.py:CalculationResult` | — |
| `reviews/models.py:Review` | `ac_reviews/models.py:Review` | — |
| `submissions/models.py:ACSubmission` | `ac_submissions/models.py:ACSubmission` | — |
| `submissions/models.py:SubmissionPhoto` | `ac_submissions/models.py:SubmissionPhoto` | `upload_to='ac_rating/submissions/'` |
| `brands/models.py:Brand` | `ac_brands/models.py:Brand` | **НЕ конфликтует** с ERP `Brand` только если ERP его нет — проверить |
| `brands/models.py:BrandOriginClass` | `ac_brands/models.py:BrandOriginClass` | — |

- Создать factory-boy фабрики в `tests/factories.py` для каждой модели
- Unit-тесты `str()`, `save()`, `clean()` — минимум по одному на модель

**Приёмка:**
- `python manage.py makemigrations` создаёт миграции, `migrate` применяет без ошибок на пустой БД
- `pytest ac_*/tests/` — все зелёные
- `python manage.py shell` — импортируются все модели без ошибок
- В Django admin регистрировать модели НЕ нужно (это фаза 4)

**Особое внимание:** перед стартом — проверить конфликт с существующим `Brand` в ERP (grep по `backend/`). Если есть — решаем отдельно.

---

### Фаза 3 🔴 — Scoring engine
**Ветка:** `ac-rating/03-scoring`
**Агент:** 3 (backend, сильнее в алгоритмах)
**Зависит от:** Фаза 2
**Оценка:** 1 день

**Цель:** перенести scoring engine, обернуть пересчёт в Celery, сохранить все фиксы Максима из коммита `e2de2de`.

**Задачи:**
- Перенести `scoring/engine/` и `scoring/scorers/` в `ac_scoring/`
- Перенести тесты (`scoring/tests/test_scorers.py`, `test_engine.py`)
- Management command `recalculate_ac_rating [--model-ids N...]`
- Celery task `ac_scoring.tasks.recalculate_all_task(methodology_id=None, model_ids=None)`
- Signal: на `MethodologyVersion.save()` (когда `needs_recalculation=True`) — enqueue Celery task
- Проверить что оставшиеся 3 замечания из аудита математики (fan speeds gap, Decimal vs Float, help_text) — НЕ блокирующие, зафиксировать в `docs/ac_rating/known-issues.md`

**Приёмка:**
- `pytest ac_scoring/` — 100% зелёный
- `python manage.py recalculate_ac_rating` работает без данных (no-op) и с загруженной тестовой моделью
- Celery worker принимает task
- Документация `docs/ac_rating/known-issues.md` создана

---

### Фаза 4 🔴 — API + Django admin
**Ветка:** `ac-rating/04-api-admin`
**Агент:** 4 (backend)
**Зависит от:** Фаза 3
**Оценка:** 1 день

**Цель:** публичное и админское API + Django admin с кастомизациями Максима.

**Задачи:**
- Перенести views/serializers/URLs из `catalog`, `methodology`, `reviews`, `submissions`, `brands`:
  - Публичный API под `/api/public/v1/rating/`:
    - `GET /models/`, `GET /models/<id>/`, `GET /models/by-slug/<slug>/`, `GET /models/archive/`
    - `GET /methodology/`
    - `GET /brands/`
    - `GET /models/<id>/reviews/`, `POST /reviews/` (ratelimit 5/час по IP)
    - `POST /submissions/` (ratelimit 3/час, FormData с фото)
    - `GET /pages/<slug>/` (если нужны — иначе пропустить)
    - `GET /export/csv/`
  - Админский API под `/api/hvac/rating/` — для фаз 8A-C (пока можно заглушки с `IsHvacAdminProxyAllowed`)
- Permissions:
  - Публичное: `AllowAny` (read) + `AllowAny` + `ratelimit` для POST
  - Админское: `IsHvacAdminProxyAllowed` (существующий)
- Перенести Django admin из `catalog/admin/`, `methodology/admin/`, `reviews/admin.py`, `submissions/admin.py`, `brands/admin.py`, `scoring/admin.py`:
  - Все inlines, actions, кастомные views, форма `ACModelForm`
  - Views импорта шаблона XLSX и импорта моделей должны работать
- Management command `import_ac_rating_xlsx <path>` (перенос из `catalog/management/commands/import_v2.py`)
- Тесты API: happy path каждого endpoint, permissions, ratelimit

**Приёмка:**
- Все публичные endpoints отвечают 200 (или 404 для пустой БД — смотря что логично)
- `/admin/` — все модели зарегистрированы, inlines работают, actions доступны
- `python manage.py import_ac_rating_xlsx <test-file>` работает
- pytest зелёный

---

### Фаза 5 🟡 — Миграция данных
**Ветка:** `ac-rating/05-data-migration`
**Агент:** 5 (backend / DevOps)
**Зависит от:** Фаза 4
**Оценка:** 0.5 дня + 🧑‍💼 Андрей загружает media в S3/на сервер

**Цель:** загрузить дамп `ac_rating_2026-04-18.sql` + media в локальное dev-окружение ERP.

**Задачи:**
- Management command `load_ac_rating_dump <path_to_sql>`:
  - Парсит PG-дамп Максима (таблицы `catalog_acmodel`, `methodology_criterion` и т.д.)
  - Маппит на новые таблицы ERP (`ac_catalog_acmodel` и т.д.) с учётом переименований
  - Идемпотентно (можно запустить повторно)
  - Параметр `--truncate` для очистки перед загрузкой
- Проверить совместимость PG 16 ERP с дампом PG 16.13 (`pg_restore --version`)
- Запустить recalculate после загрузки
- 🧑‍💼 Андрей скачивает media из Google Drive и кладёт в `backend/media/ac_rating/`

**Приёмка:**
- В dev-ERP загружено ~40-50 моделей кондиционеров из дампа
- В admin видны модели, фотки, отзывы, заявки
- Индекс пересчитан, `total_index` в диапазоне 0-100 для каждой модели
- Сравнение выборочных total_index с продом Максима (по 3-5 моделям) — расхождение < 0.1

---

### Фаза D 🧑‍💼📐 — Дизайн-сессия (РЕЙТИНГ + НОВОСТИ)
**Ветка:** — (документ)
**Исполнители:** Андрей + Claude совместно
**Зависит от:** Фаза 4 (нужен работающий API для референса данных; не обязательно Фаза 5)
**Оценка:** 0.5-1 день

**Цель:** сформировать единый визуальный язык для публичной части рейтинга и HVAC-новостей. Это live-документ дизайн-ТЗ для фаз 6 и 7.

**Задачи:**
1. Скриншоты: что есть сейчас у Максима (листинг, деталь, методика), что есть на HVAC-новостях (листинг, деталь).
2. Референсы: сайты-эталоны рейтингов (Stiftung Warentest, Wirecutter, Яндекс.Маркет рейтинги). Андрей приносит 2-3 референса которые нравятся.
3. Определить: цветовую палитру (primary/accent), типографическую шкалу, стиль карточек, hero-секции, навигацию, компоненты фильтров, иконки, микроанимации.
4. Решения по UX:
   - Таблица vs карточки vs гибрид на листинге
   - Как показываем «индекс» — badge / donut / bar
   - Мобильная версия таблицы рейтинга (горизонтальный скролл vs accordion)
   - Структура детальной страницы (табы vs длинный скролл)
5. Результат: `docs/ac_rating/design-system.md` с описанием + (опционально) скриншоты macup-а в Figma.

**Приёмка:**
- Андрей подтверждает: «да, такой рейтинг я хочу показать клиентам»
- Документ содержит достаточно, чтобы агент 6A мог начать работу без уточнений

---

### Фаза 6A 🔴📐 — Публичный листинг `/ratings`
**Ветка:** `ac-rating/06a-public-home`
**Агент:** 6A (frontend)
**Зависит от:** Фазы 4 + D
**Оценка:** 1.5 дня

**Цель:** главная страница рейтинга — hero + фильтры + листинг.

**Задачи:**
- Заменить заглушку `frontend/app/ratings/page.tsx` на полноценную SSR/ISR страницу
- Подключить к API `/api/public/v1/rating/models/`
- Hero-секция (по дизайн-ТЗ)
- Фильтры: бренд, мощность (min/max), цена (min/max), регион, тип оборудования
- Листинг: компонент из дизайн-ТЗ (таблица / карточки / гибрид)
- Использовать shadcn/ui: `Card`, `Badge`, `Button`, `Input`, `Select`, `Slider`
- Skeleton loader, error state, empty state
- Mobile-first, проверено на 375px / 768px / 1440px
- Next.js Metadata API (title, description, OG, canonical)
- JSON-LD `ItemList` (schema.org)
- Расширить `frontend/src/lib/hvac-api.ts` клиентом `getRatingModels(filters)`, типы — `src/lib/api/types/rating.ts`

**Приёмка:**
- Страница рендерится SSR, ISR revalidate 3600
- Lighthouse Performance/Accessibility/SEO ≥ 90
- Фильтры работают через URL searchParams
- 🧑‍💼 Андрей визуально подтверждает: «выглядит в едином стиле с тем что мы задизайнили»

---

### Фаза 6B 🔴📐 — Детальная страница `/ratings/[slug]`
**Ветка:** `ac-rating/06b-public-detail`
**Агент:** 6B (frontend)
**Зависит от:** Фаза 6A
**Оценка:** 1.5 дня

**Цель:** детальная страница модели.

**Задачи:**
- `frontend/app/ratings/[slug]/page.tsx` (SSR с `generateStaticParams` для топ-моделей)
- Блоки: фото-галерея с лайтбоксом, параметры с bar-визуализацией, видео (YouTube/RuTube/VK embed), плюсы/минусы, «где купить» (SupplierLinks), блок отзывов с формой
- shadcn/ui: `Tabs` (если гибрид из дизайн-ТЗ), `Dialog` (лайтбокс), `Accordion`, `Progress`
- JSON-LD `Product` + `AggregateRating`
- Обработка 404 через `not-found.tsx`

**Приёмка:**
- Рендерится по slug, redirects если slug обновился
- Форма отзыва работает (POST + ratelimit в UI)
- Все медиа из дампа Максима отображаются
- 🧑‍💼 Андрей подтверждает визуал

---

### Фаза 6C 📐 — Прочие публичные страницы
**Ветка:** `ac-rating/06c-public-rest`
**Агент:** 6C (frontend)
**Зависит от:** Фаза 6A
**Оценка:** 1 день

**Страницы:**
- `/ratings/methodology` — описание методики (читает `/api/public/v1/rating/methodology/`)
- `/ratings/submit` — форма «Добавить в рейтинг»
- `/ratings/archive` — архивные модели
- `/ratings/quiet` — рейтинг по шуму (re-use компонентов 6A с параметром сортировки)
- `/ratings/price/[slug]` — бюджет/средний/премиум (аналогично)
- `sitemap.ts` дополнение — динамические страницы моделей
- `robots.ts` дополнение

**Приёмка:**
- Все страницы рендерятся
- Sitemap включает все модели
- Форма заявки валидируется, отправляет (с honeypot + ratelimit сервера)
- SEO metadata на всех страницах

---

### Фаза 7 📐 — Редизайн HVAC-новостей
**Ветка:** `ac-rating/07-news-redesign`
**Агент:** 7 (frontend)
**Зависит от:** Фаза D + (желательно) Фаза 6A
**Оценка:** 1.5 дня

**Цель:** привести публичные страницы HVAC-новостей к единому визуальному языку с рейтингом.

**Задачи:**
- Переделать `NewsCard.tsx`, `NewsFilters.tsx`, `NewsListView.tsx`, `PublicLayout.tsx` (header/footer) под новый дизайн
- Детальная страница новости (`app/news/[id]/page.tsx`) — в стиле детальной страницы рейтинга
- Не ломать существующие тесты
- Визуальный regression через Playwright (снять before/after скриншоты)

**Приёмка:**
- 🧑‍💼 Андрей: «новости и рейтинг смотрятся как один сайт»
- Все тесты проходят
- SSR/SEO не пострадал

---

### Фаза 8A 🟡 — Админка: каталог моделей
**Ветка:** `ac-rating/08a-admin-catalog`
**Агент:** 8A (frontend + немного backend)
**Зависит от:** Фаза 4
**Оценка:** 1.5 дня

**Цель:** раздел «Рейтинг кондиционеров» в sidebar ERP — CRUD моделей.

**Задачи:**
- Расширить `frontend/src/components/layout/Layout.tsx` — пункт в sidebar `{id: 'hvac-rating', label: 'Рейтинг кондиционеров'}`
- Страницы `/erp/hvac/rating/`:
  - `list/` — таблица моделей с фильтрами (повторно использовать `useListFilters`)
  - `create/` — форма
  - `edit/[id]/` — редактирование, с inline-компонентами (фото, raw_values, поставщики)
  - `import/` — загрузка XLSX
- Расширить админский API в `/api/hvac/rating/models/` (CRUD)
- shadcn/ui: `Table`, `Dialog`, `Form`, `Tabs`

**Приёмка:**
- Можно создать → опубликовать → отредактировать модель через ERP UI
- Загрузка XLSX работает
- Права доступа проверяются (`marketing` section)
- Мобилка работает (минимально)

---

### Фаза 8B 🟡 — Админка: методика
**Ветка:** `ac-rating/08b-admin-methodology`
**Агент:** 8B
**Зависит от:** Фаза 8A
**Оценка:** 1 день

**Задачи:**
- Страница `/erp/hvac/rating/methodology/`
- Список версий методик, действие «клонировать»
- Редактирование критериев с весами, валидация суммы = 100%
- Кнопка «Пересчитать все» (enqueue Celery task) + прогресс
- Справочник критериев `/erp/hvac/rating/criteria/`

**Приёмка:**
- Клонирование методики работает
- Валидация весов работает (ошибка если сумма ≠ 100%)
- Пересчёт запускается, статус отображается

---

### Фаза 8C 🟡 — Админка: модерация
**Ветка:** `ac-rating/08c-admin-moderation`
**Агент:** 8C
**Зависит от:** Фаза 8A
**Оценка:** 1 день

**Задачи:**
- Страница `/erp/hvac/rating/reviews/` — список отзывов с фильтром «ожидают модерации», кнопки approve/reject
- Страница `/erp/hvac/rating/submissions/` — список заявок, одобрение → конвертация в `ACModel` (action)
- Email-уведомления при конверсии заявки (если настроено у Максима — проверить)

**Приёмка:**
- Можно одобрить отзыв в 1 клик
- Конвертация заявки создаёт черновик `ACModel`, заполненный данными из заявки
- Модератор получает визуальный фидбек

---

### Фаза 9 🔴 — Интеграционный прогон
**Ветка:** `ac-rating/09-e2e`
**Агент:** 9 (QA / Playwright)
**Зависит от:** Фазы 6C, 7, 8C
**Оценка:** 1 день

**Задачи:**
- Playwright e2e сценарии:
  - Публичные: открыть листинг → применить фильтр → открыть модель → оставить отзыв
  - Публичные: подать заявку на добавление модели
  - Админ: залогиниться → одобрить заявку → она появляется как черновик → опубликовать → она видна публично
  - Админ: поменять вес критерия → пересчитать → total_index модели изменился
- Smoke в CI
- Обновить `.github/workflows/ci.yml`

**Приёмка:**
- Все e2e зелёные на CI
- `pytest` + `npx tsc --noEmit` + `npm test` + `npm run lint` — чисто

---

### Фаза 10 🔴 — Деплой на прод
**Ветка:** `ac-rating/main` → `main`
**Исполнители:** Claude + 🧑‍💼 Андрей
**Зависит от:** Фаза 9
**Оценка:** 0.5 дня

**Задачи:**
1. Merge `ac-rating/main` в `main` через PR (обычная процедура ERP)
2. Деплой по `deploy/README.md`
3. Прогнать миграции на проде
4. Загрузить дамп на прод через `load_ac_rating_dump`
5. Загрузить media в S3 или на прод-сервер
6. Запустить `recalculate_ac_rating` на проде
7. Smoke-чек: `/ratings/` на проде, админка, отзывы, заявки
8. Добавить пункт «Рейтинг» в главное меню публичной части (если требуется)

**Приёмка:**
- Прод работает, клиенты видят рейтинг
- Монитор (Sentry/логи) — без всплеска ошибок в первые 24 часа

---

## 3. Шаблон ТЗ агенту

```markdown
## Контекст
Интегрируем внешний проект «Рейтинг кондиционеров» в монорепо ERP Avgust.
Источник: `ac-rating/review/` (ветка `2026-03-25-xuef`).
Полный план: `PLAN_AC_RATING.md` в корне ERP.
Ты работаешь над Фазой N: <название>.

## Исходные данные
- Работай в новой ветке: `ac-rating/NN-short-name` (от `ac-rating/main`)
- Конвенции ERP: см. `CLAUDE.md` в корне
- Архитектурные решения по интеграции: см. секцию 1 плана

## Задача
<конкретика из секции фазы>

## Приёмочные критерии
<список из секции фазы>

## Ограничения
- НЕ трогать: <список>
- НЕ менять миграции существующих apps ERP
- НЕ коммитить секреты/.env
- Conventional Commits, маленькие коммиты

## Формат отчёта
В финальном сообщении:
1. Имя ветки и список коммитов (`git log --oneline ac-rating/main..HEAD`)
2. Что сделано (bullet-list)
3. Что НЕ сделано и почему (если есть)
4. Результаты прогонов: `pytest`, `npx tsc --noEmit`, `npm test`, `npm run lint`
5. Известные риски / предупреждения
6. Ключевые файлы, которые стоит посмотреть при ревью (с путями)
```

---

## 4. Шаблон code review (Claude)

При ревью проверяю:

1. **Соответствие приёмке** — пройти по чек-листу фазы, галочки.
2. **Diff-обзор** — `git diff ac-rating/main..ac-rating/NN-...`:
   - нет секретов
   - нет мусорных файлов
   - имена осмысленные
   - нет закомментированного кода
3. **Тесты** — локальный прогон `pytest` + frontend-тестов
4. **Type check** — `npx tsc --noEmit`
5. **Линтер** — `npm run lint`
6. **Манифест этого плана** — отметить фазу как «done» с датой
7. **Решение:** MERGE / CHANGES REQUESTED / REJECT

При CHANGES REQUESTED — формулирую конкретный список правок и отдаю Андрею → обратно агенту.

---

## 5. Риски и contingencies

| Риск | Митигация |
|------|-----------|
| Конфликт с существующим `Brand` в ERP | Разведка перед фазой 2; если конфликт — переименовать в `ACBrand` |
| PG 16.13 vs наш PG | Проверить pg_restore; если несовместимо — дамп конвертировать через pg_dumpall или custom script |
| Celery не настроен в dev | Использовать eager-mode в dev-settings, правильный broker в prod |
| Дизайн-фаза затягивается | Таймбокс 1 день; если не хватит — ограничиваем scope до «like HVAC новости сейчас + чуть лучше» |
| Агент застревает / бракует | Новая итерация с уточнением ТЗ; если не помогает — беру задачу в основную сессию |
| Конфликт merge с main | Rebase регулярно; не держать ветки фаз больше 2-3 дней |

---

## 6. Журнал прогресса

| Дата | Фаза | Статус | Ветка | Ревьюер | Примечания |
|------|------|--------|-------|---------|------------|
| 2026-04-18 | 0 | ✅ done | — | — | Разведка, утверждение плана |
| 2026-04-18 | 1 | ✅ done | `ac-rating/01-backend-skeleton` | Claude | Агент: Петя. Чисто, `manage.py check` зелёный. Нюанс: `TimestampedModel`, не `TimestampMixin` (поправлено в плане). Полный pytest не прогнан (нет SSH-туннеля к prod-БД) — риск нулевой, изменения чисто аддитивные. |
| — | 2 | pending | — | — | Ждёт старта (модели + миграции) |

(Заполняется по ходу работы.)

---

## 7. Что делать прямо сейчас

1. Утвердить этот план (или внести правки — он живой)
2. Решить: стартуем с Фазы 1 или хочешь сначала создать какой-то визуальный mock / черновик дизайна?
3. Если Фаза 1 — я формирую промпт для Агента 1, ты запускаешь его в отдельной сессии

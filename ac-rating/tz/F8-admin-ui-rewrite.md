# Ф8 — Перенести админку рейтинга в ERP (shadcn) + почистить Django-admin

**Источник:** `ac-rating/plan.md` пункт 6 + диалог Андрея/Claude от 2026-04-26.
**Статус:** ✅ решения зафиксированы, готов к декомпозиции на TASK.md.

---

## Финальные решения (Андрей, 2026-04-26)

| № | Решение | Значение |
|---|---|---|
| 1 | **Sidebar location** | Новый блок `HVAC-Рейтинг` рядом с `HVAC-новости` (тот же section: dashboard). Path-prefix: `/hvac-rating/...` (не пересекается с `/hvac/rating-settings` для рейтинга новостей) |
| 2 | **AI generate_pros_cons** | Переносим в новую админку (кнопка в карточке модели в Ф8B) |
| 3 | **XLSX import** | Только management command (`import_ac_rating_xlsx`). UI **не делаем** — Максим импортирует редко, через нас |
| 4 | **MethodologyVersionAdmin clone** | Остаётся в Django `/admin/` как advanced-функция (1-2 раза в год). В новой админке — только просмотр методик и активация |
| 5 | **Celery для recalculate** | НЕ подключаем сейчас. Sync-расчёт продолжает работать. Celery — отдельный эпик когда станет реально медленно |
| 6 | **Auth.User / auth.Group** | Остаются в Django `/admin/` (управление пользователями) |
| 7 | **Django-admin cleanup (Ф8D)** | Скрыть **всё ERP-шное** (договоры, сметы, и т.д.). Оставить: AC Rating (только то что не в новой админке) + auth + LogEntry |

---

## Структура раздела «HVAC-Рейтинг»

Sidebar entry:
```ts
{
  id: 'hvac-rating',
  label: 'HVAC-Рейтинг',
  icon: <BarChart className="w-5 h-5" />,
  path: '/hvac-rating',
  section: 'dashboard',
  children: [
    { id: 'hvac-rating-models',       label: 'Модели',          path: '/hvac-rating/models'      },
    { id: 'hvac-rating-brands',       label: 'Бренды',          path: '/hvac-rating/brands'      },
    { id: 'hvac-rating-criteria',     label: 'Критерии',        path: '/hvac-rating/criteria'    },
    { id: 'hvac-rating-methodology',  label: 'Методика',        path: '/hvac-rating/methodology' },
    { id: 'hvac-rating-presets',      label: 'Пресеты «Свой»',  path: '/hvac-rating/presets'     },
    { id: 'hvac-rating-reviews',      label: 'Отзывы',          path: '/hvac-rating/reviews'     },
    { id: 'hvac-rating-submissions',  label: 'Заявки',          path: '/hvac-rating/submissions' },
  ],
}
```

Backend admin API: `/api/hvac/rating/` (уже зарезервирован в `backend/ac_catalog/admin_urls.py`, пустой каркас).

---

## Декомпозиция на фазы

### Ф8A — Каталог моделей + бренды
**Бэкенд:** Петя (~1 день).
**Фронт:** Федя (~1.5 дня) — последовательно после Пети.

**Backend:**
- DRF ViewSets под `/api/hvac/rating/` для:
  - `ACModel` — list/create/retrieve/update/destroy + фильтры + photos M2M + suppliers + raw_values inline
  - `Brand` — list/create/retrieve/update/destroy + logo + logo_dark
  - `EquipmentType`, `ModelRegion` — read-only справочники
- Permission: `IsHvacAdminProxyAllowed` (существующий).
- Сериализаторы (extends публичные, но с writable полями для admin).
- Тесты CRUD happy-path + permission denied (anonymous → 401, regular user → 403).

**Frontend:**
- `/hvac-rating/models/` — таблица моделей (brand, series, total_index, status), фильтры (brand multi, status, region), bulk-actions (publish/draft/delete с confirm).
- `/hvac-rating/models/create/` + `/hvac-rating/models/edit/[id]/` — форма с табами: «Основное», «Фото» (drag-drop reorder, 6 max), «Поставщики» (inline), «Параметры» (raw_values inline).
- `/hvac-rating/brands/` — таблица + edit со светлым/тёмным лого + кнопка «Normalize logos».
- Sidebar entry в `Layout.tsx` (см. выше).
- Reference-стиль: `frontend/components/hvac/pages/NewsList.tsx`, `BrandsPage.tsx`, `NewsEditor.tsx`.

**Приёмка:** через `/hvac-rating/` редактируется модель (создать → опубликовать → отредактировать), pytest зелёный, `tsc --noEmit` чисто.

---

### Ф8B — Критерии + методика + presets + AI + reviews
**Бэкенд:** Петя (~1.5 дня).
**Фронт:** Федя (~2 дня).

**Backend:**
- ViewSets для `Criterion`, `MethodologyVersion` (read + activate), `MethodologyCriterion` (через nested), `RatingPreset`, `Review`.
- Endpoint `POST /api/hvac/rating/models/<id>/generate-pros-cons/` — переносит `generate_pros_cons` action в API-вызов с loading-state.
- Recalculate trigger при изменении весов критериев (sync, без Celery).

**Frontend:**
- `/hvac-rating/criteria/` — CRUD (включая photo, group, is_key_measurement).
- `/hvac-rating/methodology/` — список версий (view-only + кнопка «Активировать»). Кнопки клонирования НЕТ → ссылка «Клонировать в Django-admin» открывает старую страницу в новой вкладке.
- `/hvac-rating/presets/` — CRUD пресетов «Свой рейтинг» (label/slug/key/criteria_weights JSON-editor).
- `/hvac-rating/reviews/` — модерация (filter status, bulk approve/reject).
- В карточке модели — кнопка «Сгенерировать плюсы/минусы (ИИ)» с лоадером + error toast.

**Приёмка:** Максим может настроить методику через ERP, AI-кнопка работает, отзывы модерируются.

---

### Ф8C — Submissions модерация
**Бэкенд:** Петя (~0.5 дня).
**Фронт:** Федя (~1 день).

**Backend:**
- ViewSet `ACSubmission` (list + retrieve + update status + action `convert-to-acmodel/`).
- При конверсии — копировать поля submission → ACModel + photos, оставлять submission в архиве.

**Frontend:**
- `/hvac-rating/submissions/` — таблица с filter status, photo-gallery preview.
- Кнопка «Скопировать в каталог» (открывает edit-страницу новой модели с pre-fill полями из submission).
- Reject с причиной.

**Приёмка:** Максим может одобрить заявку → создать модель в 1 клик.

---

### Ф8D — Очистка Django-admin
**Backend:** Петя (~0.5 дня). Делается **после** Ф8C.

**Что оставить в `hvac-info.com/admin/`:**
- `ac_methodology` (только `MethodologyVersion` + `MethodologyCriterion` через inline) — для клонирования
- `auth.User`, `auth.Group` — управление пользователями
- `admin.LogEntry` — аудит (read-only)

**Что скрыть** (всё, что не в списке выше):
- ERP: `accounting`, `banking`, `catalog`, `contracts`, `estimates`, `marketing`, `objects`, `payments`, `personnel`, `pricelists`, `proposals`, `supply` и т.д.
- HVAC-новости: `news`, `news_categories`, `manufacturers`, `brands` (HVAC) и т.д.
- AC Rating уже покрыт новой админкой: `ac_brands`, `ac_catalog` (ACModel/Brand/Criterion), `ac_reviews`, `ac_submissions`, `ac_scoring` — скрыть.
- Ismeta: тоже скрыть (если зарегистрировано в admin).

**Технический подход:** custom `AdminSite` через подкласс с фильтром `_registry` по списку allowed app_label. Один файл `backend/finans_assistant/admin_site.py` + замена в `urls.py`.

**Приёмка:**
- `hvac-info.com/admin/` показывает только: Methodology, Users, Groups, LogEntries.
- Все ссылки внутри работают.
- Django-admin для остальных моделей — 404 при прямом обращении.

---

## Порядок исполнения

Последовательно: **Ф8A backend → Ф8A frontend → Ф8B backend → Ф8B frontend → Ф8C → Ф8D**.

Не параллелим backend↔frontend в рамках одной фазы — иначе frontend пишется на моках, потом переписывается.
Параллелим только **разные эпики** если они независимы (Ф8A frontend + Ф8B backend, например).

---

## Дальше

1. ✅ Финализирован этот документ (решения + декомпозиция).
2. ➡️ Создать детальное ТЗ Ф8A backend → `ac-rating/tz/F8A-admin-catalog.md`.
3. Создать worktree для Пети (Ф8A backend).
4. Когда Петя сдаст — Федя в новом worktree (Ф8A frontend).
5. И так далее по фазам.

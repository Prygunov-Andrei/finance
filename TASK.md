# TASK — Wave 6 — фото-баг + sidebar + click-by-row

## 1. КРИТИЧНО: Backend mixed-content баг с фото

### Симптом
Админский API возвращает `logo_url` / `image_url` / `photo_url` как `http://hvac-info.com/media/...`. Страница ERP работает на `https://`. Браузер блокирует mixed content → фото не показываются.

### Диагностика (моя)
```
>>> request.build_absolute_uri('/media/brands/aqua.png')
'http://hvac-info.com/media/brands/aqua.png'  # ← HTTP, не HTTPS
```

Backend за BFF proxy (`/api/ac-rating-admin/[...path]/route.ts`), proxy не пробрасывает `X-Forwarded-Proto: https` → Django считает request не-secure → `build_absolute_uri` собирает `http://`.

Публичный API не страдает: там нет `build_absolute_uri`, возвращает относительный `/media/brands/...?v=mtime`. Браузер сам делает absolute с current scheme (HTTPS).

### Фикс
Поменять функции `_absolute_url` в админских сериализаторах — возвращать **относительный** URL `obj.url` (без build_absolute_uri). Браузер сам соберёт правильный absolute.

**Файлы:**
- `backend/ac_brands/admin_serializers.py:_absolute_url`
- `backend/ac_catalog/admin_serializers.py:_absolute_url`
- `backend/ac_submissions/admin_serializers.py` — проверь, возможно тоже есть
- `backend/ac_methodology/admin_serializers.py` — проверь, photo_url для критериев

В каждом — заменить:
```python
def _absolute_url(request, file_field) -> str:
    if not file_field:
        return ""
    url = file_field.url
    if request is not None:
        return request.build_absolute_uri(url)
    return url
```
на
```python
def _file_url(file_field) -> str:
    """Относительный URL медиа-файла (например `/media/brands/aqua.png`).
    
    НЕ используем `request.build_absolute_uri` — за BFF proxy
    (/api/ac-rating-admin/[...]/) Django видит HTTP и собирает
    `http://...`, что блокируется браузером как mixed content
    на HTTPS-странице. Возвращаем относительный — браузер сам
    соберёт `https://hvac-info.com/media/...`.
    """
    if not file_field:
        return ""
    return file_field.url
```

И обновить вызывающий код — убрать `self.context.get('request')` параметр, он больше не нужен:
```python
# Было:
def get_logo_url(self, obj):
    return _absolute_url(self.context.get("request"), obj.logo)

# Стало:
def get_logo_url(self, obj):
    return _file_url(obj.logo)
```

**Тесты:** в существующих `test_admin_views.py` где есть assertions на logo_url / image_url / photo_url — убедись что они проверяют относительный URL (или просто `assert "/media/" in url`). Если тест ассертил `http://...` или absolute — поправить.

**Регресс-чек:** после фикса прогни `pytest backend/ac_*/tests/` — должно быть зелёное.

---

## 2. Sidebar — одновременно активны HVAC-новости и HVAC-Рейтинг

### Симптом
На странице `/hvac-rating/models` в sidebar активны и `HVAC-новости` (path=`/hvac`), и `HVAC-Рейтинг` (path=`/hvac-rating`).

### Диагностика
`frontend/components/erp/components/Layout.tsx:621`:
```tsx
const isActive = location.pathname === item.path || 
                (item.path !== '/' && item.path !== '' && location.pathname.startsWith(item.path)) ||
                isAnyChildActive;
```

`'/hvac-rating/models'.startsWith('/hvac')` → `true` ✗ (для блока HVAC-новости).

### Фикс
Добавь `'/'` к конкатенации, чтобы префикс был отделён:

```tsx
const isActive = location.pathname === item.path || 
                (item.path !== '/' && item.path !== '' && 
                 location.pathname.startsWith(item.path + '/')) ||
                isAnyChildActive;
```

Аналогично проверь логику `isAnyChildActive` (строка 615) — если там тоже startsWith с child.path и есть подпути типа `/hvac-rating/models/edit/[id]/`, тоже добавить `+ '/'` или оставить только `===`. Решай по обстоятельствам — главное не сломать active-state на edit-страницах (там pathname глубже чем child.path).

Лучше:
```tsx
const isAnyChildActive = item.children?.some(child => 
  location.pathname === child.path ||
  location.pathname.startsWith(child.path + '/')
) || false;
```

### Проверка
- `/hvac/news` → активен ТОЛЬКО `HVAC-новости`.
- `/hvac-rating/models` → активен ТОЛЬКО `HVAC-Рейтинг`.
- `/hvac-rating/models/edit/5` → активен `HVAC-Рейтинг` + child `Модели`.

---

## 3. Click по строке = редактирование (пять таблиц)

### Контекст
В ACBrandsPage уже работает: click по строке открывает edit (нет необходимости в edit-иконке). Андрей хочет так же на всех остальных таблицах:

- `ACModelsPage` — click по строке → `/hvac-rating/models/edit/{id}/`. Сейчас кликабельно только название.
- `ACCriteriaPage` — click по строке → edit.
- `ACPresetsPage` — click по строке → edit.
- `ACReviewsPage` — click по строке → открыть Dialog с деталями (это уже есть через «View» иконку — теперь это вся строка).
- `ACSubmissionsPage` — click по строке → Dialog с деталями (то же).

### Реализация
В каждой странице на `<TableRow>` добавь:
```tsx
<TableRow
  className="cursor-pointer hover:bg-muted/50"
  onClick={() => navigate(`/hvac-rating/models/edit/${m.id}`)}
>
```

**Важно:** click внутри `<Checkbox>` колонки и кнопок действий **не должен** триггерить row click. Используй `onClick={(e) => e.stopPropagation()}` на checkbox cell и action-buttons cell:

```tsx
<TableCell onClick={(e) => e.stopPropagation()}>
  <Checkbox ... />
</TableCell>
...
<TableCell onClick={(e) => e.stopPropagation()}>
  <Button ...>Удалить</Button>
</TableCell>
```

Reference — посмотри как в `ACBrandsPage.tsx` сделано (Андрей сказал там работает правильно).

### Убрать «лишние» edit-иконки

Если на ACModelsPage / ACCriteriaPage / ACPresetsPage / etc. есть колонка «Действия» с кнопкой Edit (карандаш) — её можно убрать (вся строка теперь кликабельна для edit). Оставить только Delete и специфические actions (например Recalc на ACModelsPage, Approve/Reject на ACReviewsPage).

ACReviewsPage / ACSubmissionsPage — там есть «View» (Eye-иконка) для открытия Dialog. Click по строке должен открывать Dialog. View-иконку можно убрать.

---

## 4. Прогон

```bash
cd frontend
npx tsc --noEmit              # чисто
npm test -- --run AC          # все AC* зелёные
```

Backend:
```bash
cd backend
pytest ac_*/tests/ --no-cov -k "admin"   # admin-тесты зелёные после правки _file_url
```

---

## 5. Известные нюансы

1. **Mixed content** — после backend-фикса URL будут относительные (`/media/...`). Браузер собирает absolute с current scheme — на HTTPS странице запросит `https://hvac-info.com/media/...`. ✓
2. **Static URL alternative** — если решишь фиксить через `SECURE_PROXY_SSL_HEADER` в settings.py + проброс `X-Forwarded-Proto` через BFF proxy — это **shared file** (settings), пинг ISMeta. Простое решение — относительные URL.
3. **Click vs. checkbox** — обязательно `stopPropagation` на checkbox/buttons, иначе клик по чекбоксу будет одновременно открывать edit-страницу.
4. **Тесты ACModelsPage и других** — после добавления click-by-row проверь что bulk-actions через checkbox всё ещё работают (mock-тесты могут дёрнуть весь row).

---

## 6. Формат отчёта

```
Отчёт — Wave 6 (AC-Федя)

Ветка: ac-rating/wave6 (rebased на origin/main)
Коммиты: <git log --oneline main..HEAD>

Что сделано:
- ✅ Backend _file_url() возвращает относительный путь (4 файла)
- ✅ Sidebar fix: active state collision /hvac vs /hvac-rating (Layout.tsx)
- ✅ Click-by-row + убрал лишние edit-иконки (5 таблиц)
- ✅ <N> backend тестов + <M> frontend тестов

Прогон:
- npx tsc --noEmit: ok
- npm test: <X> passed
- pytest backend/ac_*/: <Y> passed

Известные риски: ...

Ключевые файлы:
- backend/ac_brands/admin_serializers.py
- backend/ac_catalog/admin_serializers.py
- backend/ac_methodology/admin_serializers.py
- backend/ac_submissions/admin_serializers.py
- frontend/components/erp/components/Layout.tsx
- frontend/components/hvac/pages/ACModelsPage.tsx
- frontend/components/hvac/pages/ACCriteriaPage.tsx
- frontend/components/hvac/pages/ACPresetsPage.tsx
- frontend/components/hvac/pages/ACReviewsPage.tsx
- frontend/components/hvac/pages/ACSubmissionsPage.tsx
```

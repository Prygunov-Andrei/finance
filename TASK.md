# TASK — Wave 9 backend — переход на динамические категории новостей

## Контекст

Сейчас в `backend/news/models.py:NewsPost.category` — CharField с hardcoded `choices=Category.choices` (8 значений: business/industry/market/regulation/review/guide/brands/other).

Параллельно есть динамическая `NewsCategory` table + FK `NewsPost.category_ref`. Они синхронизируются в `NewsPost.save()`.

**Проблема:** при создании нового slug в NewsCategory — DRF/Django валидация `NewsPost.category` отвергает его (не в TextChoices).

**Решение:** убрать `choices=Category.choices` с поля. Категории становятся свободными string slug'ами. Динамический список — из `NewsCategory` через API. Старые 8 значений из enum остаются как defaults / preset (для seed-новостей).

---

## 1. Снять `choices=` с NewsPost.category

**Файл:** `backend/news/models.py`

Сейчас (строки 214-220):
```python
category = models.CharField(
    _("Category"),
    max_length=20,
    choices=Category.choices,
    default=Category.OTHER,
    help_text=_("Категория новости. Показывается как eyebrow-label и chip-filter в ленте."),
)
```

Стало:
```python
category = models.CharField(
    _("Category"),
    max_length=20,
    default=Category.OTHER,
    help_text=_(
        "Slug категории новости. Свободная строка — справочник динамический "
        "(см. NewsCategory). Старый TextChoices enum остаётся как defaults "
        "для legacy-новостей и seed."
    ),
)
```

**Что сохраняем:**
- `Category` enum (TextChoices) — остаётся как Python-helper. `default=Category.OTHER` ('other') — рабочее.
- `get_category_display()` — будет возвращать значение из enum для legacy-категорий, slug-as-is для новых. Не страшно — на фронте будем использовать `category_object.name` (через category_ref).

**Что убираем:**
- `choices=Category.choices` — снимаем валидацию.

### Важно про max_length

`NewsCategory.slug` — `SlugField(max_length=64)`. `NewsPost.category` — `CharField(max_length=20)`. **Конфликт!** Если Андрей создаст категорию с slug длиннее 20 — sync `category=cat.slug` упадёт.

Варианты:
- (a) Расширить `NewsPost.category` до `max_length=64`. Это **schema migration** — изменяет БД. Аддитивно (расширение).
- (b) Оставить max_length=20 и принять ограничение.

**Я рекомендую (a)** — single source of truth для slug длины. Миграция auto, низкий риск (расширение без потери данных).

Также проверь `category_ref_slug` (db_column для FK): это `SlugField` на FK — наследует длину от NewsCategory.slug=64. Уже не 20.

```python
category = models.CharField(
    _("Category"),
    max_length=64,  # было 20 — синхронизируем с NewsCategory.slug
    default=Category.OTHER,
    help_text=_("..."),
)
```

---

## 2. Миграция

```bash
cd backend
python manage.py makemigrations news
```

Должна сгенериться 1 миграция:
- `AlterField` на `category` (max_length 20→64, choices убраны)

**Проверь dry-run:**
```bash
python manage.py makemigrations --dry-run
```

Имя миграции типа `news/migrations/00XX_alter_newspost_category.py`. Прокомментируй в commit-сообщении что миграция аддитивная (расширение поля + снятие choices, без потери данных).

---

## 3. Сериализаторы

Проверь `backend/news/serializers.py`:

- `NewsPostSerializer.category_display = CharField(source='get_category_display', read_only=True)` — продолжает работать. Для новых slug возвращает slug as-is. Это OK; на фронте предпочтительнее `category_object.name` (через FK).
- `NewsPostWriteSerializer.fields = (..., 'category', ...)` — без явных `extra_kwargs`. После снятия choices DRF автоматически перестанет валидировать через choices. Принимает любую строку.
- `_sync_category_ref` (твоя работа Wave 8) — продолжает работать.

Тестов на сериализатор:
- POST `{"category": "analytics", ...}` где `analytics` — НЕ в legacy enum, но **создан** в NewsCategory. → 201, обе колонки заполнены.
- PATCH `{"category": "analytics"}` → 200, sync проходит.
- POST `{"category": "nonexistent"}` где slug **НЕ** в NewsCategory → серилизатор принимает (нет choices), но `_sync_category_ref` поставит `category_ref=None`. Проверь это поведение и если нужно — валидация вернёт 400 с сообщением «slug не найден в NewsCategory».

**Решение по последнему:** простое поведение — принимать любую строку, `category_ref` будет None если не нашли. Это не ломает БД (CharField+nullable FK). На UI Максим сам видит что category_ref пуст.

ИЛИ строгое — требовать чтобы slug был в NewsCategory:
```python
def validate_category(self, value):
    if value and not NewsCategory.objects.filter(slug=value).exists():
        raise serializers.ValidationError(f"Категория со slug '{value}' не найдена. Создай её в /erp/hvac/news-categories/.")
    return value
```

**Я рекомендую строгий режим** — лучше ранний 400 с понятным сообщением, чем тихий desync.

---

## 4. Тесты

В `backend/news/tests/test_writer_category_sync.py` (твой файл из Wave 8) добавь:
- Тест: POST новости с category=новый slug (созданный в NewsCategory с длиной >20) → 201, оба поля заполнены, длина 64 OK.
- Тест: PATCH category на slug, которого нет в NewsCategory → 400 с понятным сообщением (если ввёл строгий режим).
- Тест: API-валидация принимает все 8 legacy enum slugs (regression).

В `backend/news/tests/test_models.py` (или новый) — модель:
- NewsPost(category='custom_slug').save() работает после снятия choices.
- get_category_display() для нового slug возвращает slug as-is (не падает).

---

## 5. Прогон

```bash
pytest backend/news/tests/ --no-cov
pytest backend/ --no-cov -k "news or category"
python manage.py check
python manage.py makemigrations --dry-run --check    # должна показать одну миграцию news, после применения — No changes
python manage.py migrate news    # применить локально
```

---

## 6. Что НЕ делаем

- ❌ Не удаляем `Category` enum (TextChoices) — остаётся как Python-helper, `default=Category.OTHER`.
- ❌ Не трогаем `NewsCategory` модель — она уже динамическая.
- ❌ Не трогаем `category_ref` FK — он работает.
- ❌ Не трогаем frontend — это Федя.
- ❌ Не делаем data-migration существующих новостей — у них category='other' (legacy), валидно.

---

## 7. Известные нюансы

1. **`category_display`** через `get_category_display()` для НОВЫХ slug возвращает slug. Для legacy 8 — возвращает русский label из enum. Frontend будет использовать `category_object.name` (через FK на NewsCategory).
2. **Django admin** для NewsPost — после снятия choices Select станет text input. Это OK, мы скрыли news из admin (Ф8D). В `/hvac-admin/` (backup) Select-from-choices был, теперь будет text input.
3. **Bulk-update** view (строки 557-593 в views.py) уже работает с любыми slugs (берёт slug из NewsCategory.objects.get).
4. **Миграция аддитивная** — поле расширяется (20→64) и снимается Python-валидация. Существующие записи (1423 со 'other') продолжают работать.

---

## 8. Формат отчёта

```
Отчёт — Wave 9 backend (AC-Петя)

Ветка: ac-rating/wave9-backend (rebased на origin/main)
Коммиты: <git log --oneline main..HEAD>

Что сделано:
- ✅ NewsPost.category: max_length 20→64, choices убраны
- ✅ Миграция news/migrations/00XX_alter_newspost_category.py
- ✅ NewsPostWriteSerializer.validate_category — строгая проверка
  существования slug в NewsCategory (если выбрал строгий режим)
- ✅ <N> тестов

Прогон:
- pytest backend/news/: <X> passed
- check / makemigrations: ok

После деплоя:
- migrate news (применит миграцию автоматически в deploy.sh).

Известные риски:
- ...

Ключевые файлы:
- backend/news/models.py
- backend/news/migrations/00XX_alter_newspost_category.py (новый)
- backend/news/serializers.py (если ввёл validate_category)
- backend/news/tests/...
```

# TASK — Ф8B-1 backend — критерии + методика (read+activate) + AI генератор

## Цель

Расширить admin API под `/api/hvac/rating/`:
1. CRUD для `Criterion` (справочник параметров)
2. Read + activate для `MethodologyVersion` (без clone — clone остаётся в Django)
3. Endpoint AI-генерации pros/cons для модели через общий LLM-хаб

**Ф8B-2** (presets + reviews) — отдельная фаза после, не в этом TASK.

---

## ⚠️ Урок Ф8A (Петино ревью моделей)

Перед написанием **каждого** сериализатора — открой соответствующую модель и сверь поля. Не угадывай по памяти. В Ф8A твоё ревью спасло меня от 6 расхождений — продолжаем тот же стандарт.

Главные модели для этого TASK:
- `backend/ac_methodology/models.py:Criterion` — 30+ полей (i18n, photo, group, is_key_measurement, ...)
- `backend/ac_methodology/models.py:MethodologyVersion` — 9 полей (version, name, tab_descriptions, is_active, ...)
- `backend/ac_methodology/models.py:MethodologyCriterion` — 25+ полей (вес, scoring_type, кастомные шкалы, региональный scope, ...)
- `backend/llm_services/models.py:LLMTaskConfig`, `LLMProvider`

Если найдёшь расхождение TASK ↔ код — пинг в чат, не угадывай.

---

## 1. Criterion CRUD

**Endpoint:** `/api/hvac/rating/criteria/` под существующим `app_name = "ac_rating_admin"`.

```
GET    /api/hvac/rating/criteria/                — list (фильтры)
POST   /api/hvac/rating/criteria/                — create
GET    /api/hvac/rating/criteria/{id}/           — retrieve
PUT    /api/hvac/rating/criteria/{id}/           — update
PATCH  /api/hvac/rating/criteria/{id}/           — partial update
DELETE /api/hvac/rating/criteria/{id}/           — delete
```

**Файлы:**
- `backend/ac_methodology/admin_views.py` (новый) — `CriterionAdminViewSet`
- `backend/ac_methodology/admin_serializers.py` (новый) — `AdminCriterionSerializer`, `AdminCriterionListSerializer`
- `backend/ac_methodology/admin_urls.py` (новый) — DRF router
- В `backend/ac_catalog/admin_urls.py` — добавь `path('', include(('ac_methodology.admin_urls', 'ac_methodology_admin')))` или просто `register` в существующий router.

**list-сериализатор (краткий):** id, code, name_ru, photo_url, unit, value_type, group, is_active, is_key_measurement, methodologies_count.

**detail/edit-сериализатор:** все поля Criterion + read-only `photo_url` (полный URL через `request.build_absolute_uri`).

**Photo upload** — multipart через стандартный DRF `ImageField` в сериализаторе (как у Brand в Ф8A). Никаких отдельных endpoint'ов — `PATCH /criteria/{id}/` с multipart payload справится.

**Permission:** `hvac_bridge.permissions.IsHvacAdminProxyAllowed` на ViewSet.

**Filters в querystring:**
- `value_type=numeric|binary|categorical|...`
- `group=climate|compressor|acoustics|...`
- `is_active=true|false`
- `is_key_measurement=true|false`
- `search=<q>` — по `code`, `name_ru`, `name_en`
- `ordering=<field>` — `code`, `created_at`

**Query optim:** `methodologies_count` через annotate Count (или просто `.methodologies.count()` — таблица маленькая, не критично).

**Особенность `is_key_measurement`:** если поменяли — Django-admin Максима пишет messages.warning что флаг работает только для критериев в активной методике (см. `KEY_MEASUREMENT_NOTE` в `criterion_admin.py`). В новой админке UI-предупреждение делает **frontend** (Федя в Ф8B-1 frontend) — у тебя в API пишешь обычный update, без предупреждений в response.

---

## 2. MethodologyVersion — list / retrieve / activate

**Endpoint:** `/api/hvac/rating/methodologies/`.

```
GET    /api/hvac/rating/methodologies/             — list всех версий с counters
GET    /api/hvac/rating/methodologies/{id}/        — retrieve полная версия + nested methodology_criteria
POST   /api/hvac/rating/methodologies/{id}/activate/  — сделать активной (сброс is_active у других)
```

**НЕ делаем:**
- `POST /methodologies/` — создание новой версии (только через clone в Django)
- `PUT/PATCH /methodologies/{id}/` — update методики целиком (только activate; clone — Django)
- `DELETE` — пока без удаления (риск потерять историю расчётов)

**list-сериализатор:** id, version, name, is_active, criteria_count (annotate Count активных), weight_sum (annotate Sum), needs_recalculation, created_at, updated_at.

**detail-сериализатор:** все поля `MethodologyVersion` + nested `methodology_criteria` (read-only). Каждый methodology_criterion в nested содержит:
```python
class AdminMethodologyCriterionReadSerializer(ModelSerializer):
    criterion = AdminCriterionListSerializer(read_only=True)  # nested критерий
    
    class Meta:
        model = MethodologyCriterion
        fields = (
            'id', 'criterion',
            'scoring_type', 'weight',
            'min_value', 'median_value', 'max_value',
            'is_inverted', 'median_by_capacity',
            'custom_scale_json', 'formula_json',
            'is_required_lab', 'is_required_checklist', 'is_required_catalog',
            'use_in_lab', 'use_in_checklist', 'use_in_catalog',
            'region_scope', 'is_public', 'display_order', 'is_active',
        )
        read_only_fields = fields
```

**`POST /methodologies/{id}/activate/`:**
- Просто ставит `is_active=True` на эту версию.
- `MethodologyVersion.save()` уже атомарно сбрасывает is_active у остальных (см. `models.py:47-58`).
- В ответе вернуть detail-сериализатор.
- Edge case: если уже активна — вернуть 200 с no-op (не считай это ошибкой).

**Permission:** `IsHvacAdminProxyAllowed`.

---

## 3. AI-генератор pros/cons через LLM-хаб

**Endpoint:** `POST /api/hvac/rating/models/{id}/generate-pros-cons/`.

Лежит в `ac_catalog/admin_views.py` (рядом с другими model-actions из Ф8A).

### Логика

1. Загрузить модель + brand + raw_values + criterion (для контекста).
2. Получить активную методику и для каждого критерия — pre-computed score (через `ac_scoring.engine`-функцию или прямо из `raw_value.numeric_value` + методика → норма 0-100).
3. Сформировать список **HIGH** (norm ≥ 80) и **LOW** (norm ≤ 25) параметров.
4. Получить provider через `LLMTaskConfig.get_provider_for_task('ac_pros_cons')`.
5. Получить экземпляр провайдера: `provider.get_provider_instance()` (или эквивалент — посмотри как делает `entity_matcher.py` в `llm_services`).
6. Вызов: `instance.chat_completion(system_prompt, user_prompt, response_format='json')`.
7. Распарсить ответ `{"pros": [...3 строки...], "cons": [...3 строки...]}`.
8. Сохранить:
   ```python
   model.pros_text = "\n".join(pros)
   model.cons_text = "\n".join(cons)
   model.save(update_fields=['pros_text', 'cons_text'])
   ```
9. Вернуть обновлённую модель через `AdminACModelDetailSerializer`.

### Промпт

**System prompt:**
```
Ты — редактор технического обзора бытовых сплит-кондиционеров.
Твоя задача — сгенерировать **3 плюса** и **3 минуса** конкретной модели
кондиционера на основе её характеристик и оценок по критериям.

Стиль:
- 3 плюса + 3 минуса
- Каждая строка 2–6 слов
- С заглавной буквы, БЕЗ точки в конце
- Конкретно и по существу: называй параметры и числа
- Без маркетинговой воды («лучший», «премиум», «инновационный»)
- Без сравнения с другими моделями

Примеры формулировок (стиль для подражания):
- «Класс энергоэффективности А+++»
- «Подогрев поддона дренажа»
- «Гарантия семь лет от бренда»
- «Пульт без русского меню»
- «Бренд совсем новый»
- «Без датчика присутствия»

Верни ТОЛЬКО валидный JSON: {"pros": ["...", "...", "..."], "cons": ["...", "...", "..."]}
Никакого markdown, комментариев или текста до/после JSON.
```

**User prompt:** строится как структурированный список. Пример:
```
Модель: {brand.name} {model.series} {model.inner_unit} / {model.outer_unit}
Номинальная мощность: {model.nominal_capacity} Вт
Бренд: {brand.name}, год начала продаж в РФ: {brand.sales_start_year_ru}

ВЫСОКИЕ оценки (≥80 из 100):
- Класс энергоэффективности (efficiency_class): A+++
- Замер минимального шума (noise_min): 18 дБ
- Гарантия (warranty_years): 7 лет
...

НИЗКИЕ оценки (≤25 из 100):
- Управление со смартфона (wifi_control): нет
- Датчик присутствия (occupancy_sensor): нет
...

Контекст по интересным критериям:
- ionizer_type: Нет
- uv_lamp: Мелкие светодиоды
- compressor_brand: Toshiba
```

(Точный формат строки — на твой вкус. Главное: модель видит достаточно контекста чтобы написать полезные плюсы/минусы.)

### Ответ endpoint'a

**Success (200):**
```json
{
  "model": { ...AdminACModelDetailSerializer... },
  "generated": {
    "pros": ["...", "...", "..."],
    "cons": ["...", "...", "..."]
  },
  "provider": "OpenAI: gpt-4o-mini"
}
```

**Errors:**
- `400` — модель без активной методики, или нет raw_values для расчёта scores → `{"detail": "Не удалось вычислить scoring..."}`
- `503` — LLM провайдер недоступен или вернул невалидный JSON → `{"detail": "AI временно недоступен", "error": "<краткое описание>"}`. Не падай 500 — это плохой UX.
- Логируй детали в Django logger `ac_pros_cons` для разбора.

**Timeout:** разумный (30-60 сек), не блокируй request надолго.

---

## 4. Аддитивная миграция: `AC_PROS_CONS` task_type

**Файл:** `backend/llm_services/models.py:LLMTaskConfig.TaskType` — добавить:

```python
class TaskType(models.TextChoices):
    INVOICE_PARSING = 'invoice_parsing', 'Распознавание счетов'
    PRODUCT_MATCHING = 'product_matching', 'Подбор товаров'
    WORK_MATCHING_SEMANTIC = 'work_matching_semantic', 'Подбор работ (semantic)'
    WORK_MATCHING_WEB = 'work_matching_web', 'Подбор работ (web search)'
    ESTIMATE_IMPORT = 'estimate_import', 'Импорт сметы из PDF'
    AC_PROS_CONS = 'ac_pros_cons', 'AC Rating: плюсы/минусы (AI)'  # НОВЫЙ
```

**Миграция:** `python manage.py makemigrations llm_services` — Django сгенерит `AlterField` для choices. Non-destructive.

**Имя файла:** `backend/llm_services/migrations/00XX_add_ac_pros_cons_task_type.py` (XX = next number).

**НЕ создавай** запись `LLMTaskConfig(task_type='ac_pros_cons')` через data-migration — Андрей сам настроит провайдера через Django-admin (выберет OpenAI gpt-4o-mini или другой). Если запись отсутствует, `LLMTaskConfig.get_provider_for_task('ac_pros_cons')` сделает fallback на default LLMProvider — это и есть нужное поведение.

---

## 5. Регистрация URL

В `backend/ac_catalog/admin_urls.py` — добавь:

```python
from ac_methodology import admin_views as methodology_admin_views

router.register(r'criteria', methodology_admin_views.CriterionAdminViewSet, basename='criterion')
router.register(r'methodologies', methodology_admin_views.MethodologyAdminViewSet, basename='methodology')

urlpatterns = [
    # ...existing action endpoints...
    path('models/<int:pk>/generate-pros-cons/', admin_views.GeneratePosConsView.as_view(), name='model-generate-pros-cons'),
    # ...
    path('', include(router.urls)),
]
```

Действие `activate` на MethodologyAdminViewSet — через DRF `@action(detail=True, methods=['post'])`:

```python
class MethodologyAdminViewSet(ReadOnlyModelViewSet):
    permission_classes = [IsHvacAdminProxyAllowed]
    queryset = MethodologyVersion.objects.all().annotate(...)
    serializer_class = AdminMethodologyDetailSerializer  # для retrieve
    
    def get_serializer_class(self):
        if self.action == 'list':
            return AdminMethodologyListSerializer
        return AdminMethodologyDetailSerializer
    
    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        version = self.get_object()
        version.is_active = True
        version.save()  # save() атомарно сбрасывает is_active у остальных
        serializer = AdminMethodologyDetailSerializer(version, context={'request': request})
        return Response(serializer.data)
```

URL получится `POST /api/hvac/rating/methodologies/{id}/activate/` — то что нам нужно.

---

## 6. Тесты

**Файлы:**
- `backend/ac_methodology/tests/test_admin_views.py` (новый) — Criterion CRUD + Methodology read/activate.
- `backend/ac_catalog/tests/test_admin_pros_cons.py` (новый) — generate-pros-cons endpoint.

### Criterion tests
- Permission denied (anon, regular user без marketing).
- CRUD happy path (create без photo, create с photo через multipart).
- Filter `?is_key_measurement=true` возвращает только key.
- Update is_key_measurement с false на true.
- methodologies_count считается правильно (создай 2 методики, 1 связь — count=1).

### Methodology tests
- list возвращает counters (criteria_count, weight_sum).
- retrieve возвращает nested methodology_criteria с весами.
- activate переключает is_active (предыдущая активная стала inactive).
- activate уже-активной → 200, no-op.
- Нет POST/PUT/DELETE endpoint'ов (405).

### Generate-pros-cons tests
**Mock LLM провайдера через unittest.mock:**

```python
def test_generate_pros_cons_happy_path(api_client, ac_model_with_scores, monkeypatch):
    # Мокаем chat_completion возвращающий валидный JSON
    fake_provider = Mock()
    fake_provider.chat_completion.return_value = {
        'pros': ['Тихий компрессор', 'Сильный обогрев', 'Длинная гарантия'],
        'cons': ['Без WiFi', 'Тяжёлый блок', 'Шумит на максимуме']
    }
    monkeypatch.setattr('ac_catalog.admin_views.get_pros_cons_provider', lambda: fake_provider)
    
    response = api_client.post(f'/api/hvac/rating/models/{model.id}/generate-pros-cons/')
    
    assert response.status_code == 200
    assert response.data['generated']['pros'] == [...]
    model.refresh_from_db()
    assert 'Тихий компрессор' in model.pros_text
```

**Edge cases:**
- LLM возвращает невалидный JSON → 503.
- Модель без raw_values / без активной методики → 400.
- LLM таймаут (raise) → 503.
- Permission denied (regular user) → 403.

---

## 7. Приёмка

1. `pytest backend/ac_methodology/tests/test_admin_views.py` — все зелёные.
2. `pytest backend/ac_catalog/tests/test_admin_pros_cons.py` — все зелёные.
3. `pytest backend/ac_*/` — без регрессий.
4. `pytest backend/llm_services/tests/` — без регрессий (миграция не должна ломать).
5. `python manage.py check` — чисто.
6. `python manage.py makemigrations --dry-run --check` — должна показать одну новую миграцию `llm_services` (для choices), и НИЧЕГО для других apps.
7. `python manage.py migrate llm_services` — миграция применяется на пустой dev БД.
8. **Smoke** (curl на dev-стенде с настроенным LLMProvider или mock):
   ```bash
   curl -X POST -H "Authorization: Bearer <staff-jwt>" \
     http://localhost:8000/api/hvac/rating/models/1/generate-pros-cons/
   ```

---

## Что НЕ делаем

- ❌ Presets, Reviews — Ф8B-2 (отдельная фаза после ревью этого).
- ❌ Submissions — Ф8C.
- ❌ Clone методики — остаётся в Django (Q-F8.4 решение Андрея).
- ❌ Update методики целиком (PUT/PATCH /methodologies/{id}/).
- ❌ Frontend — задача Феди после твоего мержа.

---

## Известные нюансы

1. **`ac_scoring.engine`** — там есть утилиты для computing нормированных значений. Найти существующую функцию для score per-criterion-per-model или собрать вручную из `MethodologyCriterion` + `ModelRawValue`. НЕ переписывай scorer'ы — переиспользуй.
2. **LLM-хаб method для получения instance провайдера** — посмотри как `entity_matcher.py` или `document_parser.py` это делают (они уже используют `LLMTaskConfig.get_provider_for_task(...)`). Скопируй паттерн.
3. **OpenAI provider** обычно ждёт ENV переменную (см. `LLMProvider.env_key_name`) — если её нет, `get_api_key()` бросит ValueError. На тестах мокай `chat_completion` целиком, не пытайся реально вызывать OpenAI.
4. **Recalculate trigger** при PATCH `MethodologyVersion` — сейчас работает sync через signal (см. Ф8A). Не трогай эту логику в этой фазе.
5. **`/methodologies/` vs `/methodology/`** — публичный endpoint `/api/public/v1/rating/methodology/` (singular). Админский делаем `/methodologies/` (plural), чтобы DRF ViewSet работал стандартно. Расхождение допустимо — публичный отдаёт активную версию (одну), админский отдаёт список всех версий.
6. **photo_url в response** — `Criterion.photo` это ImageField с `upload_to='ac_rating/criteria/'`. Возвращай полный URL через `request.build_absolute_uri(obj.photo.url)` (как у Brand в Ф8A).

---

## Формат отчёта

```
Отчёт — Ф8B-1 backend (AC-Петя)

Ветка: ac-rating/f8b1-backend (rebased на origin/main).
Коммиты:
  <git log --oneline main..HEAD>

Что сделано:
- ✅ Criterion CRUD endpoints (с photo upload) + N тестов
- ✅ Methodology list/retrieve/activate + N тестов
- ✅ Generate-pros-cons endpoint через LLMTaskConfig + N тестов
- ✅ AC_PROS_CONS task_type в enum + миграция (non-destructive)

Что НЕ сделано:
- (если есть)

Прогон:
- pytest backend/ac_methodology/tests/test_admin_views.py: <N> passed
- pytest backend/ac_catalog/tests/test_admin_pros_cons.py: <N> passed
- pytest backend/ac_*/: <N> passed (без регрессий)
- pytest backend/llm_services/tests/: <N> passed
- python manage.py check: ok
- python manage.py makemigrations --dry-run: 1 миграция в llm_services (ожидаемо)

Smoke (с mock LLM): generate-pros-cons вернул JSON, model.pros_text/cons_text обновились.

Известные риски:
- ...

Ключевые файлы для ревью:
- backend/ac_methodology/admin_views.py
- backend/ac_methodology/admin_serializers.py
- backend/ac_methodology/admin_urls.py
- backend/ac_catalog/admin_views.py (добавлен GeneratePosConsView)
- backend/llm_services/migrations/XXXX_add_ac_pros_cons_task_type.py
- backend/ac_methodology/tests/test_admin_views.py
- backend/ac_catalog/tests/test_admin_pros_cons.py
```

# ТЗ Фазы M4 — Backend-поля под DetailA (editorial + specs + supplier enrichment)

**Фаза:** M4 (maintenance, параллельно Ф6B1)
**Ветка:** `ac-rating/m4-detail-content-fields` (от `main`)
**Зависит от:** M3 (в main)
**Оценка:** 1-1.5 дня

## Контекст

Федя стартует Ф6B1 — публичная детальная страница `/ratings/[slug]/`. Дизайн (DetailA
в `ac-rating/design/wf-screens.jsx:5-889` + MobileDetailA `:1894+`) требует данные,
которых сейчас нет в моделях:

1. **Editorial-обзор редакции** — lede (вводный абзац), body (основной long-form),
   quote (цитата главреда), quote_author. Без этого секция «Обзор» хардкодит placeholder.
2. **Габариты и вес блоков** — «850 × 295 × 189 мм · 10 кг» для inner/outer unit в hero.
3. **Supplier enrichment** — текущая модель содержит только `name + url + order`. Дизайн
   показывает цену, город, рейтинг, наличие, note. Без этого секция «Где купить» —
   голый список ссылок.
4. **Criterion group** — для секции «Характеристики» (42 параметра в 5 группах: Климат,
   Компрессор, Акустика, Управление, Габариты). Сейчас `Criterion` не имеет group-поля.

Ф6B1 **не ждёт** M4 — использует graceful fallback на пустые поля. Но Ф6B2 требует все 4
блока. M4 мержится параллельно Ф6B1 (оба стартуют от main одновременно).

## Задачи

### 1. Editorial-поля на `ACModel` (M4.1)

**Файл:** `backend/ac_catalog/models.py` (модель `ACModel`).

Добавить 4 поля:

```python
class ACModel(models.Model):
    # ... existing fields ...

    editorial_lede = models.TextField(
        blank=True, default="",
        help_text="Вводный абзац редакторского обзора (editorial lede). "
                  "Показывается первым абзацем в секции «Обзор» на детальной странице.",
    )
    editorial_body = models.TextField(
        blank=True, default="",
        help_text="Основной текст редакторского обзора. Markdown не поддерживается — "
                  "plain text c разделителями абзацев \\n\\n. Фронт рендерит через "
                  "split и <p>. Длина ≤5000 символов.",
    )
    editorial_quote = models.TextField(
        blank=True, default="",
        help_text="Цитата-выноска редактора (pull quote). Показывается отдельным "
                  "блоком со стилизованным border-left.",
    )
    editorial_quote_author = models.CharField(
        max_length=200, blank=True, default="",
        help_text="Автор цитаты, напр. «А. Петров, главред».",
    )
```

**Валидатор длины** для `editorial_body` — `MaxLengthValidator(5000)` в `validators=`.

**Миграция** — обычная `AddField`, без data-миграции (все поля default пустые).

### 2. Габариты и вес блоков (M4.2)

**Файл:** тот же `ACModel`.

Добавить 4 поля:

```python
inner_unit_dimensions = models.CharField(
    max_length=100, blank=True, default="",
    help_text="Габариты внутреннего блока: «850 × 295 × 189 мм» или свободная форма.",
)
inner_unit_weight_kg = models.DecimalField(
    max_digits=5, decimal_places=1, null=True, blank=True,
    help_text="Вес внутреннего блока в кг (например 10.0).",
)
outer_unit_dimensions = models.CharField(
    max_length=100, blank=True, default="",
    help_text="Габариты наружного блока.",
)
outer_unit_weight_kg = models.DecimalField(
    max_digits=5, decimal_places=1, null=True, blank=True,
    help_text="Вес наружного блока в кг.",
)
```

Все поля опциональные. Фронт рендерит «—» при пустых значениях.

### 3. Supplier enrichment (M4.3)

**Файл:** `backend/ac_catalog/models.py`, модель `ACModelSupplier`.

Добавить 5 полей:

```python
class ACModelSupplier(models.Model):
    model = models.ForeignKey(...)
    name = models.CharField(max_length=200)
    url = models.URLField()
    order = models.PositiveSmallIntegerField(default=0)

    # NEW (M4.3):
    price = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True,
        help_text="Цена у магазина в рублях. null = не известна.",
    )
    city = models.CharField(
        max_length=100, blank=True, default="",
        help_text="Город склада / магазина, напр. «Москва».",
    )
    rating = models.DecimalField(
        max_digits=3, decimal_places=1, null=True, blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(5)],
        help_text="Рейтинг магазина 0-5.0.",
    )
    availability = models.CharField(
        max_length=20,
        choices=[
            ("in_stock", "В наличии"),
            ("low_stock", "Осталось мало"),
            ("out_of_stock", "Нет в наличии"),
            ("unknown", "Не известно"),
        ],
        default="unknown",
    )
    note = models.CharField(
        max_length=200, blank=True, default="",
        help_text="Короткая пометка: «с монтажом · 2 дня», «самовывоз · завтра» и т.п.",
    )
```

Импорт `MinValueValidator`, `MaxValueValidator` — если ещё не импортированы.

### 4. Criterion group (M4.4)

**Файл:** `backend/ac_methodology/models.py`, модель `Criterion`.

Добавить 1 поле:

```python
class Criterion(models.Model):
    # ... existing fields ...

    GROUP_CHOICES = [
        ("climate", "Климат"),
        ("compressor", "Компрессор и контур"),
        ("acoustics", "Акустика"),
        ("control", "Управление и датчики"),
        ("dimensions", "Габариты и комплектация"),
        ("other", "Прочее"),
    ]
    group = models.CharField(
        max_length=20, choices=GROUP_CHOICES, default="other",
        help_text="Группа параметра в таблице «Характеристики» на детальной странице. "
                  "«other» — без группы, показывается последним.",
    )
```

**Data-миграция** (отдельная `0XXX_populate_criterion_group.py`) — присвоить реальным
критериям группы на основе их `code`/`name_ru`:

```python
def forward(apps, schema_editor):
    Criterion = apps.get_model("ac_methodology", "Criterion")

    CODE_TO_GROUP = {
        # climate
        "cooling_capacity": "climate",
        "heating_capacity": "climate",
        "seer": "climate",
        "scop": "climate",
        "energy_class_cool": "climate",
        "energy_class_heat": "climate",
        "refrigerant": "climate",
        "cold_reserve_8c": "climate",
        "heater_mode": "climate",
        # compressor
        "heat_exchanger_inner": "compressor",
        "heat_exchanger_outer": "compressor",
        "compressor_power": "compressor",
        "inverter_compressor": "compressor",
        "evi_compressor": "compressor",
        "erv_valve": "compressor",
        "drip_tray_heater": "compressor",
        "max_pipe_length": "compressor",
        "max_height_drop": "compressor",
        "outer_fan_speed_control": "compressor",
        # acoustics
        "noise": "acoustics",
        "noise_level": "acoustics",
        "outer_noise": "acoustics",
        "vibration": "acoustics",
        "fan_speeds": "acoustics",
        # control
        "wifi": "control",
        "alice_support": "control",
        "ir_sensor": "control",
        "russified_remote": "control",
        "ionizer": "control",
        "uv_lamp": "control",
        "fresh_air_intake": "control",
        "aromatizer": "control",
        "auto_freeze_clean": "control",
        "temp_sterilization": "control",
        "filters_count": "control",
        "remote_holder": "control",
        "remote_backlight": "control",
        "louver_direction_control": "control",
        # dimensions
        "warranty": "dimensions",
        "brand_age_ru": "dimensions",
    }
    for c in Criterion.objects.all():
        c.group = CODE_TO_GROUP.get(c.code, "other")
        c.save(update_fields=["group"])

def backward(apps, schema_editor):
    Criterion = apps.get_model("ac_methodology", "Criterion")
    Criterion.objects.update(group="other")
```

**Проверь у себя** — имена `code` в Максимовской БД могут отличаться. После применения
миграции — `pytest` + `manage.py shell -c "from ac_methodology.models import *; from
collections import Counter; print(Counter(Criterion.objects.values_list('group', flat=True)))"`.
Ожидается распределение по 5 группам с несколькими `other`.

**Если mapping не покрыл 5+ кодов** — допиши в словаре или оставь `other` с пометкой в отчёте.

### 5. Сериализаторы (M4.5)

**Файл:** `backend/ac_catalog/serializers.py`.

Добавить новые поля в:

- `ACModelDetailSerializer.fields` — `editorial_lede`, `editorial_body`, `editorial_quote`,
  `editorial_quote_author`, `inner_unit_dimensions`, `inner_unit_weight_kg`,
  `outer_unit_dimensions`, `outer_unit_weight_kg`.
- `ACModelSupplierSerializer.fields` — `price`, `city`, `rating`, `availability`, `note`
  (уже существующие поля сохранить).

**ACModelListSerializer НЕ менять** — новые поля только в detail. Список остаётся слим.

В `ac_methodology/serializers.py`:

- `MethodologyCriterionSerializer` (или аналог, который отдаёт criteria array в
  `/methodology/` endpoint) — добавить `group` в fields.

### 6. Admin (M4.6)

**Файл:** `backend/ac_catalog/admin.py`.

В `ACModelAdmin`:
- Добавить секцию fieldset `("Редакторский обзор", {"fields": (
  "editorial_lede", "editorial_body", "editorial_quote", "editorial_quote_author"),
  "classes": ("collapse",)})`.
- Добавить фильдсет `("Габариты блоков", {"fields": (
  ("inner_unit_dimensions", "inner_unit_weight_kg"),
  ("outer_unit_dimensions", "outer_unit_weight_kg")), "classes": ("collapse",)})`.

В `ACModelSupplierInline` (если есть inline) — добавить `price`, `city`, `rating`,
`availability`, `note` в fields. Поля читаемые прямо в inline-form.

В `CriterionAdmin` — добавить `group` в `list_display`, `list_filter`.

### 7. Тесты (M4.7)

`backend/ac_catalog/tests/test_api.py`:

- `test_detail_includes_editorial_fields` — создать модель с `editorial_lede = "L"`,
  `editorial_body = "B"`, проверить что detail endpoint возвращает их.
- `test_detail_includes_unit_dimensions_and_weight` — аналогично для 4 новых полей.
- `test_supplier_serializer_includes_enrichment` — supplier с price=100500, city="Москва",
  в detail response выводится.

`backend/ac_methodology/tests/test_models.py` (или аналог):
- `test_criterion_group_default_is_other` — Criterion без group получает `other`.
- `test_criterion_group_choices_valid` — невалидное значение падает.

`backend/ac_methodology/tests/test_migrations.py` (новый или в существующем):
- `test_populate_criterion_group_mapping` — после data-миграции все «известные» коды
  получают правильную группу, «неизвестные» → `other`.

## Приёмочные критерии

- [ ] `manage.py check` + `makemigrations` — чисто
- [ ] `manage.py migrate` — без ошибок на чистой БД + на БД с `load_ac_rating_dump`
- [ ] `pytest ac_*/tests/ --no-cov` — зелёный (201 + ~5 новых = ~206 passed)
- [ ] `curl /api/public/v1/rating/models/<id>/ | jq '.editorial_lede, .inner_unit_dimensions, .suppliers[0].price, .suppliers[0].city'` — поля присутствуют (null/«» для пустых)
- [ ] `curl /api/public/v1/rating/methodology/ | jq '.criteria[0].group'` — приходит group
- [ ] Admin: в `/admin/ac_catalog/acmodel/<id>/change/` видны секции «Редакторский обзор», «Габариты блоков»
- [ ] Data-миграция для `Criterion.group`: после миграции у Максимовских данных большинство критериев разложено по 5 группам (распределение в отчёте)

## Ограничения

- **НЕ трогать** scoring engine, `ModelRawValue`, `MethodologyCriterion` (только Criterion)
- **НЕ менять** существующие поля и их semantic
- **НЕ добавлять** M2M, через-модели — только 13 простых полей на 3 моделях
- **НЕ реализовывать** admin-форму для ввода editorial (ручной ввод через обычный Django-admin
  TextField достаточен — потом можно сделать WYSIWYG отдельным эпиком)
- **НЕ трогать** фронтовые типы `frontend/lib/api/types/rating.ts` — это территория
  Феди, он обновит в Ф6B1/B2 (сейчас он работает параллельно)
- Conventional Commits, по коммиту на каждую M4.N подзадачу (всего 7 коммитов). Один
  итоговый `--no-ff` merge в main.

## Формат отчёта

`ac-rating/reports/m4-detail-content-fields.md`:
1. Коммиты
2. Что сделано (7 подзадач)
3. Smoke curl «до / после» для detail + methodology endpoints
4. pytest result + распределение Criterion.group после data-миграции
5. Ключевые файлы
6. Что Федя должен подтянуть в типах после merge (list для ТЗ Ф6B2)

## Подсказки от техлида

- **Критично: код-маппинг** для `CODE_TO_GROUP` в data-миграции — коды критериев могут
  отличаться от того что я предположил. Перед запуском миграции — `manage.py shell` →
  `from ac_methodology.models import Criterion; [c.code for c in Criterion.objects.all()]`
  и сверь с моим mapping'ом. Если нашёл отличия — правь словарь перед миграцией.
- **Миграции**: data-миграция для group — **отдельный файл** от schema-миграции. Сперва
  AddField(group, default="other") — schema. Потом RunPython populate — data. Так foundr
  не захлопнет transaction в одной миграции.
- **Supplier price как Decimal, не Float** — строгая монета, избегаем плавающей точки.
- **`editorial_body` — plain text, не markdown.** Фронт делает `body.split('\n\n').map(p => <p>{p}</p>)`. Если позже захотим markdown — добавим `format` поле и прогресс.
- **`photo` на Criterion** — уже существует. При желании admin-редактор может загрузить
  фото параметра для tooltip'а в дизайне (`?` кружочек в DetailA line 312). Не трогаем,
  пока Федя не попросит.
- **Не создавай новую модель `CriterionGroup`** — enum-choices достаточно. Если в
  будущем появятся свойства группы (icon, description, sort-order) — сделаем refactor
  в Ф10.
- **`MaxLengthValidator` для editorial_body** — не `max_length`-атрибут TextField (у
  TextField его нет). Это validator, работает в full_clean().
- **После merge M4 — пинг Феде через Андрея:** «M4 в main, pull & rebase, новые поля в
  detail доступны». Федя использует их в T2 (hero dimensions) и T4 (Overview editorial).

## Запуск

```bash
cd /Users/andrei_prygunov/obsidian/avgust/ERP_Avgust
git fetch origin
git worktree add -b ac-rating/m4-detail-content-fields \
    ../ERP_Avgust_ac_petya_m4 origin/main
cd ../ERP_Avgust_ac_petya_m4
# править + коммит по подзадаче + тесты + data-migration
# rebase + merge --no-ff + push
# remove worktree
```

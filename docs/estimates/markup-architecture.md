# Архитектура системы наценок — для разработчиков

## Схема данных

```
EstimateMarkupDefaults (синглтон pk=1)
├── material_markup_percent     (30.00)
└── work_markup_percent         (300.00)

Estimate
├── default_material_markup_percent  (30.00)
├── default_work_markup_percent      (300.00)
└── sections → EstimateSection
    ├── material_markup_percent      (nullable → inherit from estimate)
    ├── work_markup_percent          (nullable → inherit from estimate)
    └── subsections → EstimateSubsection
        ├── materials_purchase       (агрегат из items)
        ├── works_purchase           (агрегат из items)
        ├── materials_sale           (агрегат из items с наценкой)
        └── works_sale               (агрегат из items с наценкой)

EstimateItem
├── material_unit_price              (закупочная цена)
├── work_unit_price                  (закупочная цена)
├── material_markup_type             (nullable: percent|fixed_price|fixed_amount)
├── material_markup_value            (nullable)
├── work_markup_type                 (nullable)
└── work_markup_value                (nullable)
```

## Каскад наценок

```python
def resolve_material_sale_price(item):
    purchase = item.material_unit_price

    # 1. Собственная наценка строки
    if item.material_markup_type == 'percent':
        return purchase * (1 + item.material_markup_value / 100)
    elif item.material_markup_type == 'fixed_price':
        return item.material_markup_value
    elif item.material_markup_type == 'fixed_amount':
        return purchase + item.material_markup_value

    # 2. Наценка раздела
    if item.section.material_markup_percent is not None:
        return purchase * (1 + section.material_markup_percent / 100)

    # 3. Дефолт сметы
    return purchase * (1 + estimate.default_material_markup_percent / 100)
```

## Поток данных

```
EstimateItem save/delete
    ↓ (signal: update_subsection_from_items)
EstimateSubsection update (4 поля: purchase + sale)
    ↓ (signal: update_estimate_characteristics)
Estimate.update_auto_characteristics()
    ↓
EstimateCharacteristic (Материалы / Работы)
```

## Пересчёт при изменении наценки на уровне сметы/раздела

Изменение `Estimate.default_*_markup_percent` или `EstimateSection.*_markup_percent` не триггерит сигнал (сигнал срабатывает только на EstimateItem). Вместо этого `perform_update()` в ViewSet вызывает сервис:

```
PATCH /estimates/{id}/ (с новой наценкой)
    → EstimateViewSet.perform_update()
    → recalculate_estimate_subsections(estimate_id)
    → bulk_update всех подразделов
    → update_auto_characteristics()
```

**Файл**: `estimates/services/markup_service.py`

## API endpoints

| Endpoint | Метод | Назначение |
|----------|-------|-----------|
| `/estimates/{id}/` | PATCH | Изменить дефолтные наценки сметы |
| `/estimate-sections/{id}/` | PATCH | Изменить наценку раздела |
| `/estimate-items/bulk-set-markup/` | POST | Массовая наценка на строки |
| `/estimate-markup-defaults/` | GET/PATCH | Глобальные дефолты |
| `/estimates/{id}/export/?mode=internal\|external` | GET | Экспорт Excel |

## Ключевые файлы

- `estimates/models.py` — модели, свойства, сигнал
- `estimates/services/markup_service.py` — пересчёт подразделов
- `estimates/serializers.py` — API-поля наценок + вычисляемые поля
- `estimates/views/estimate_views.py` — perform_update, bulk-set-markup
- `estimates/services/estimate_excel_exporter.py` — экспорт internal/external
- `estimates/column_defaults.py` — builtin-колонки с наценками
- `estimates/tests/test_markup.py` — 19 тестов

## Миграции

- `0009_markup_system` — схема: новые поля + EstimateMarkupDefaults
- `0010_markup_data_migration` — данные: дефолтные наценки для существующих смет

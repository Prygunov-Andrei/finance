# Архитектура наценок ISMeta

**Версия:** 0.1. **Дата:** 2026-04-17.

Адаптация markup system из ERP Август для ISMeta. Основана на `backend/estimates/services/markup_service.py` (ERP), упрощена под архитектуру ISMeta (без подразделов, JSONB конфиги, explicit recalc).

## Схема данных

```
Estimate
├── default_material_markup   JSONB  {"type":"percent","value":30}
├── default_work_markup       JSONB  {"type":"percent","value":300}
├── total_equipment           Decimal (агрегат)
├── total_materials           Decimal (агрегат)
├── total_works               Decimal (агрегат)
├── total_amount              Decimal (агрегат)
├── man_hours                 Decimal (агрегат)
├── profitability_percent     Decimal (computed)
├── advance_amount            Decimal (computed)
└── estimated_days            Integer (computed)

EstimateSection
├── material_markup           JSONB  (nullable → inherit from estimate)
├── work_markup               JSONB  (nullable → inherit from estimate)
└── (агрегаты не хранятся — вычисляются при запросе или экспорте)

EstimateItem (partitioned)
├── equipment_price           Decimal (закупочная)
├── material_price            Decimal (закупочная)
├── work_price                Decimal (закупочная)
├── equipment_total           Decimal = equipment_price × quantity
├── material_total            Decimal = sale_price(material) × quantity
├── work_total                Decimal = sale_price(work) × quantity
├── total                     Decimal = equipment_total + material_total + work_total
├── material_markup           JSONB  (nullable → inherit)
├── work_markup               JSONB  (nullable → inherit)
└── man_hours                 Decimal
```

## Каскад наценок (3 уровня)

Приоритет: **строка → раздел → смета**. `null` = наследовать от уровня выше.

### MarkupConfig (Pydantic)

```python
class MarkupConfig(BaseModel):
    type: Literal["percent", "fixed_price", "fixed_amount"]
    value: Decimal  # >= 0
    note: str | None = None
```

### Формулы

```python
def resolve_sale_price(purchase: Decimal, item_markup, section_markup, estimate_markup) -> Decimal:
    """Единая функция для material и work."""
    markup = item_markup or section_markup or estimate_markup
    if not markup or not purchase:
        return Decimal('0')
    
    config = MarkupConfig.model_validate(markup)
    match config.type:
        case 'percent':
            return (purchase * (1 + config.value / 100)).quantize(Decimal('0.01'))
        case 'fixed_price':
            return config.value
        case 'fixed_amount':
            return (purchase + config.value).quantize(Decimal('0.01'))
```

### Equipment: без наценки

`equipment_total = equipment_price × quantity` — оборудование продаётся по закупочной (наценка на оборудование не применяется в процессе Августа; при необходимости — добавить `equipment_markup` позже).

## Отличия от ERP

| Аспект | ERP | ISMeta |
|---|---|---|
| Промежуточный уровень | EstimateSubsection (агрегаты) | Нет. Section — группировка, агрегаты на Estimate |
| Формат наценки | Отдельные поля: `*_markup_type`, `*_markup_value` | JSONB `MarkupConfig` |
| Cascade trigger | Django signals (`post_save` на Item) | Explicit `recalc_totals()` в service layer |
| Equipment | Не выделено (часть materials) | Отдельные поля: `equipment_price`, `equipment_total` |
| Глобальный дефолт | `EstimateMarkupDefaults` (синглтон) | `WorkspaceSettings.default_markups` (per workspace) |

## Service API

```python
# apps/estimate/services/markup_service.py

def resolve_material_sale_price(
    purchase: Decimal,
    item_markup: dict | None,
    section_markup: dict | None,
    estimate_markup: dict,
) -> Decimal:
    """Продажная цена материала за единицу."""

def resolve_work_sale_price(
    purchase: Decimal,
    item_markup: dict | None,
    section_markup: dict | None,
    estimate_markup: dict,
) -> Decimal:
    """Продажная цена работы за единицу."""

def recalc_item_totals(item_data: dict, section, estimate) -> dict:
    """Пересчитать totals одной строки. Возвращает dict с computed полями."""
    qty = item_data['quantity']
    return {
        'equipment_total': item_data['equipment_price'] * qty,
        'material_total': resolve_material_sale_price(...) * qty,
        'work_total': resolve_work_sale_price(...) * qty,
        'total': equipment_total + material_total + work_total,
    }

def recalc_estimate_totals(estimate_id: uuid, workspace_id: uuid):
    """Пересчитать агрегаты Estimate из всех строк.

    SQL:
        SELECT
            SUM(equipment_total),
            SUM(material_total),
            SUM(work_total),
            SUM(equipment_total + material_total + work_total),
            SUM(man_hours)
        FROM estimate_item
        WHERE estimate_id = %s AND workspace_id = %s AND is_deleted = FALSE
    """

def recalc_after_markup_change(estimate_id, workspace_id, scope='estimate'):
    """Пересчитать все строки после изменения наценки на уровне сметы/раздела.

    scope='estimate' — пересчитать ВСЕ строки без собственной наценки.
    scope='section:{id}' — пересчитать строки одного раздела без собственной наценки.
    """

def bulk_set_item_markup(item_ids, workspace_id, material_markup=None, work_markup=None):
    """Массовая установка наценки. None = не менять, 'clear' = сбросить к наследованию."""
```

## Поток данных

```
Создание/редактирование EstimateItem
    → EstimateService.create_item() / update_item()
    → recalc_item_totals()                          ← вычисляет totals строки
    → INSERT/UPDATE estimate_item (raw SQL)
    → recalc_estimate_totals()                       ← SUM агрегаты
    → UPDATE estimate SET total_* = ...

Изменение наценки на уровне сметы
    → EstimateService.update_estimate_markup()
    → recalc_after_markup_change(scope='estimate')   ← пересчёт ВСЕХ строк
    → recalc_estimate_totals()

Изменение наценки на уровне раздела
    → EstimateService.update_section_markup()
    → recalc_after_markup_change(scope='section:X')  ← пересчёт строк раздела
    → recalc_estimate_totals()
```

## Формулы агрегатов Estimate

```python
total_equipment = SUM(item.equipment_total) WHERE NOT is_deleted
total_materials = SUM(item.material_total) WHERE NOT is_deleted
total_works = SUM(item.work_total) WHERE NOT is_deleted
total_amount = total_equipment + total_materials + total_works
man_hours = SUM(item.man_hours) WHERE NOT is_deleted

# Вычисляемые (E25: аванс + сроки)
total_purchase = SUM(item.equipment_price * qty + item.material_price * qty + item.work_price * qty)
profitability_percent = ((total_amount - total_purchase) / total_purchase * 100) if total_purchase > 0 else 0
advance_amount = total_equipment * 0.7 + total_materials * 0.2 + total_works * 0.2  # формула Августа, в WorkspaceSettings
estimated_days = CEIL(man_hours / 8 / brigade_size)  # brigade_size из WorkspaceSettings
```

## Edge cases

1. **Нулевая закупочная цена** → sale_price = 0 (не применяем наценку к нулю).
2. **`fixed_price` при qty > 1** → sale_price = fixed_price (цена ЗА ЕДИНИЦУ, total = fixed_price × qty).
3. **Изменение дефолта сметы** → пересчёт ВСЕХ строк без собственной наценки. Может быть медленным на 2000 строк → Celery task.
4. **Удалённые строки** (`is_deleted=True`) → НЕ участвуют в агрегатах.
5. **Наценка 0%** vs **null** → 0% = явно задано (sale = purchase), null = наследовать. Различие важно.
6. **`equipment_price` без наценки** → equipment_total = equipment_price × qty. Если позже потребуется наценка на оборудование → добавить `equipment_markup` JSONB.

## Коэффициенты Августа (WorkspaceSettings)

Из интервью (Оля): слаботочка 3.5 и 1.3, вентиляция 3.2. Это material_markup percent:

- Материалы слаботочка: `{"type": "percent", "value": 250}` (× 3.5 = +250%)
- Материалы вентиляция: `{"type": "percent", "value": 220}` (× 3.2 = +220%)
- Работы: `{"type": "percent", "value": 30}` (× 1.3 = +30%)

Хранятся в `WorkspaceSettings.default_markups` per section type — детализация в E25.

## Связанные документы

- [ERP markup-architecture.md](../../../docs/estimates/markup-architecture.md) — исходная реализация
- [ADR-0022](../adr/0022-semi-boxed-product.md) — коэффициенты в WorkspaceSettings
- [02-api-contracts.md §1.4](../../specs/02-api-contracts.md) — API endpoints
- [EPICS.md E4/E6](../EPICS.md) — эпики реализации

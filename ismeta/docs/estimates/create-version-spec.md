# Спецификация: create-version (глубокое копирование сметы)

**Версия:** 0.1. **Дата:** 2026-04-17.

## Назначение

`POST /api/v1/estimates/{id}/create-version` — создаёт новую версию сметы с полной копией всех дочерних сущностей. Используется:
- перед передачей в ERP (ADR-0007: переданная версия = read-only навсегда);
- при крупных правках («хочу откатиться»);
- при корректировках для заказчика (v1 → v2 → v3).

## Алгоритм

```
1. Загрузить Estimate (source)
2. Проверить: status != 'transmitted' (нельзя копировать заблокированную)
3. BEGIN TRANSACTION
4. Создать новый Estimate:
   - Новый UUID
   - parent_version = source.id
   - version_number = source.version_number + 1
   - status = 'draft'
   - Скопировать: name, folder_name, workspace, default_*_markup, created_by
   - НЕ копировать: totals, man_hours, profitability (пересчитаются)
5. Для каждой Section (ordered by sort_order):
   - Создать новую Section:
     - Новый UUID
     - parent_version_section = source_section.id
     - estimate = new_estimate
     - Скопировать: name, sort_order, material_markup, work_markup
6. Для каждого Item (WHERE is_deleted = FALSE):
   - INSERT через raw SQL (managed=False):
     - Новый UUID
     - source_item = source_item.id  (ссылка на оригинал)
     - section_id = new_section.id (маппинг old_section → new_section)
     - estimate_id = new_estimate.id
     - row_id = source_item.row_id  (СОХРАНЯЕТСЯ — для Excel round-trip, ADR-0013)
     - Скопировать ВСЕ: name, unit, quantity, prices, markups, tech_specs, custom_data,
       is_key_equipment, procurement_status, man_hours, match_source
     - version = 1 (новая цепочка версий)
     - sort_order = source sort_order
7. recalc_estimate_totals(new_estimate)
8. COMMIT
9. Вернуть new Estimate
```

## Маппинг секций

```python
section_map: dict[UUID, UUID] = {}  # old_section_id → new_section_id

for old_section in source.sections.order_by('sort_order'):
    new_section = EstimateSection.objects.create(
        estimate=new_estimate,
        workspace=source.workspace,
        name=old_section.name,
        sort_order=old_section.sort_order,
        parent_version_section=old_section,
        material_markup=old_section.material_markup,
        work_markup=old_section.work_markup,
    )
    section_map[old_section.id] = new_section.id
```

## Копирование Items (batch INSERT)

Для производительности — один `INSERT ... SELECT` вместо построчного:

```sql
INSERT INTO estimate_item (
    id, section_id, estimate_id, workspace_id, row_id,
    sort_order, name, unit, quantity,
    equipment_price, material_price, work_price,
    equipment_total, material_total, work_total, total,
    version, source_item_id, match_source,
    material_markup, work_markup, tech_specs, custom_data,
    is_deleted, is_key_equipment, procurement_status, man_hours
)
SELECT
    gen_random_uuid(),
    CASE section_id
        WHEN 'old-sec-1'::uuid THEN 'new-sec-1'::uuid
        WHEN 'old-sec-2'::uuid THEN 'new-sec-2'::uuid
        ...
    END,
    %(new_estimate_id)s,
    workspace_id,
    row_id,  -- сохраняем для Excel round-trip
    sort_order, name, unit, quantity,
    equipment_price, material_price, work_price,
    equipment_total, material_total, work_total, total,
    1,  -- version reset
    id, -- source_item_id = оригинальный id
    match_source,
    material_markup, work_markup, tech_specs, custom_data,
    FALSE, is_key_equipment, procurement_status, man_hours
FROM estimate_item
WHERE estimate_id = %(source_estimate_id)s
  AND workspace_id = %(workspace_id)s
  AND is_deleted = FALSE
```

Для динамического CASE — собирать из `section_map` в Python, параметризовать.

## Edge cases

1. **Смета без строк** → копируется только Estimate + Sections. Totals = 0.
2. **Смета с deleted items** → deleted items НЕ копируются (WHERE is_deleted = FALSE).
3. **Concurrent create-version** → optimistic lock: проверить `version` Estimate перед копированием.
4. **2000+ строк** → batch INSERT (один запрос). Не использовать ORM по одной строке.
5. **source_item ссылка** → НЕ является FK constraint (PostgreSQL partitioned table limitation). Проверка на уровне приложения.

## Response

```json
{
  "id": "new-uuid",
  "name": "Вентиляция корпус А",
  "version_number": 2,
  "parent_version": "source-uuid",
  "status": "draft",
  "total_amount": 1250000.00,
  ...
}
```

## Связанные документы

- [ADR-0007](../adr/0007-readonly-after-transmission.md) — read-only после передачи
- [ADR-0013](../adr/0013-excel-roundtrip.md) — row_id сохраняется при копировании
- [ADR-0015](../adr/0015-version-link-ismeta-erp.md) — VersionLink

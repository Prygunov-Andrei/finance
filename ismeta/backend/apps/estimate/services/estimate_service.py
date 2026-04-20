"""Service layer для EstimateItem (managed=False → raw SQL) и агрегатов Estimate."""

import json
import uuid
from decimal import Decimal

from django.db import connection

from apps.estimate.models import Estimate, EstimateItem, EstimateSection
from apps.estimate.services.markup_service import recalc_estimate_totals, recalc_item_totals


class OptimisticLockError(Exception):
    """Версия записи не совпадает — кто-то обновил раньше."""

    pass


class EstimateService:
    @staticmethod
    def _to_json_str(val) -> str:
        """Конвертировать dict/list в JSON-строку для psycopg3 raw SQL."""
        if isinstance(val, str):
            return val
        if val is None:
            return "{}"
        return json.dumps(val, default=str)

    @staticmethod
    def create_item(section: EstimateSection, estimate: Estimate, workspace_id, data: dict) -> EstimateItem:
        """INSERT через cursor (managed=False), возвращает ORM-объект."""
        item_id = uuid.uuid4()
        row_id = uuid.uuid4()
        _j = EstimateService._to_json_str

        # Пересчитать totals через markup cascade
        totals = recalc_item_totals(data, section, estimate)
        data.update(totals)

        with connection.cursor() as cur:
            cur.execute(
                """
                INSERT INTO estimate_item (
                    id, section_id, estimate_id, workspace_id, row_id,
                    sort_order, name, unit, quantity,
                    equipment_price, material_price, work_price,
                    equipment_total, material_total, work_total, total,
                    version, match_source, tech_specs, custom_data,
                    is_deleted, is_key_equipment, procurement_status, man_hours
                ) VALUES (
                    %s, %s, %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s, %s, %s,
                    1, %s, %s::jsonb, %s::jsonb,
                    FALSE, %s, %s, %s
                )
                """,
                [
                    item_id,
                    section.id,
                    estimate.id,
                    workspace_id,
                    row_id,
                    data.get("sort_order", 0),
                    data["name"],
                    data.get("unit", "шт"),
                    data.get("quantity", 0),
                    data.get("equipment_price", 0),
                    data.get("material_price", 0),
                    data.get("work_price", 0),
                    data.get("equipment_total", 0),
                    data.get("material_total", 0),
                    data.get("work_total", 0),
                    data.get("total", 0),
                    data.get("match_source", "unmatched"),
                    _j(data.get("tech_specs", "{}")),
                    _j(data.get("custom_data", "{}")),
                    data.get("is_key_equipment", False),
                    data.get("procurement_status", "none"),
                    data.get("man_hours", 0),
                ],
            )
        recalc_estimate_totals(estimate.id, workspace_id)
        return EstimateItem.all_objects.get(id=item_id)

    # Whitelist колонок, допустимых для UPDATE (защита от SQL injection).
    UPDATABLE_COLUMNS = frozenset({
        "name", "unit", "quantity", "sort_order",
        "equipment_price", "material_price", "work_price",
        "equipment_total", "material_total", "work_total", "total",
        "match_source", "is_deleted", "is_key_equipment", "procurement_status", "man_hours",
        "tech_specs", "custom_data", "material_markup", "work_markup",
    })
    JSONB_COLUMNS = frozenset({"tech_specs", "custom_data", "material_markup", "work_markup"})

    @staticmethod
    def update_item(item_id, workspace_id, version: int, data: dict) -> EstimateItem:
        """UPDATE с optimistic lock: WHERE id=%s AND workspace_id=%s AND version=%s."""
        set_clauses = []
        params = []
        _j = EstimateService._to_json_str
        for key, val in data.items():
            if key not in EstimateService.UPDATABLE_COLUMNS:
                continue
            if key in EstimateService.JSONB_COLUMNS:
                set_clauses.append(f"{key} = %s::jsonb")
                params.append(_j(val))
            else:
                set_clauses.append(f"{key} = %s")
                params.append(val)

        if not set_clauses:
            return EstimateItem.all_objects.get(id=item_id)

        set_clauses.append("version = version + 1")
        set_clauses.append("updated_at = NOW()")

        sql = f"UPDATE estimate_item SET {', '.join(set_clauses)} WHERE id = %s AND workspace_id = %s AND version = %s"
        params.extend([item_id, workspace_id, version])

        with connection.cursor() as cur:
            cur.execute(sql, params)
            if cur.rowcount == 0:
                raise OptimisticLockError(f"EstimateItem {item_id} version conflict (expected {version})")

        item = EstimateItem.all_objects.get(id=item_id)
        recalc_estimate_totals(item.estimate_id, workspace_id)
        return item

    @staticmethod
    def soft_delete_item(item_id, workspace_id, version: int) -> bool:
        """SET is_deleted=True с optimistic lock."""
        with connection.cursor() as cur:
            cur.execute(
                "UPDATE estimate_item SET is_deleted = TRUE, version = version + 1, updated_at = NOW() "
                "WHERE id = %s AND workspace_id = %s AND version = %s AND is_deleted = FALSE",
                [item_id, workspace_id, version],
            )
            if cur.rowcount == 0:
                raise OptimisticLockError(f"EstimateItem {item_id} version conflict or already deleted")
        return True

    @staticmethod
    def recalc_totals(estimate_id, workspace_id):
        """Пересчитать агрегаты Estimate из строк."""
        with connection.cursor() as cur:
            cur.execute(
                """
                SELECT
                    COALESCE(SUM(equipment_total), 0),
                    COALESCE(SUM(material_total), 0),
                    COALESCE(SUM(work_total), 0),
                    COALESCE(SUM(total), 0),
                    COALESCE(SUM(man_hours), 0)
                FROM estimate_item
                WHERE estimate_id = %s AND workspace_id = %s AND is_deleted = FALSE
                """,
                [estimate_id, workspace_id],
            )
            row = cur.fetchone()

        Estimate.objects.filter(id=estimate_id).update(
            total_equipment=row[0],
            total_materials=row[1],
            total_works=row[2],
            total_amount=row[3],
            man_hours=row[4],
        )

    @staticmethod
    def create_version(estimate: Estimate, workspace_id) -> Estimate:
        """Копирует estimate + sections + items → новая версия."""
        _j = EstimateService._to_json_str
        new_est = Estimate.objects.create(
            workspace_id=workspace_id,
            folder_name=estimate.folder_name,
            name=estimate.name,
            status="draft",
            version_number=estimate.version_number + 1,
            parent_version=estimate,
            default_material_markup=estimate.default_material_markup,
            default_work_markup=estimate.default_work_markup,
            created_by=estimate.created_by,
        )

        section_map = {}
        for sec in EstimateSection.objects.filter(estimate=estimate):
            old_id = sec.id
            new_sec = EstimateSection.objects.create(
                estimate=new_est,
                workspace_id=workspace_id,
                name=sec.name,
                sort_order=sec.sort_order,
                parent_version_section=sec,
                material_markup=sec.material_markup,
                work_markup=sec.work_markup,
            )
            section_map[old_id] = new_sec

        items = EstimateItem.objects.filter(estimate=estimate, workspace_id=workspace_id)
        for item in items:
            new_section = section_map.get(item.section_id)
            if not new_section:
                continue
            with connection.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO estimate_item (
                        id, section_id, estimate_id, workspace_id, row_id,
                        sort_order, name, unit, quantity,
                        equipment_price, material_price, work_price,
                        equipment_total, material_total, work_total, total,
                        version, source_item_id, match_source,
                        material_markup, work_markup,
                        tech_specs, custom_data,
                        is_deleted, is_key_equipment, procurement_status, man_hours
                    ) VALUES (
                        gen_random_uuid(), %s, %s, %s, %s,
                        %s, %s, %s, %s,
                        %s, %s, %s,
                        %s, %s, %s, %s,
                        1, %s, %s,
                        %s::jsonb, %s::jsonb,
                        %s::jsonb, %s::jsonb,
                        FALSE, %s, %s, %s
                    )
                    """,
                    [
                        new_section.id, new_est.id, workspace_id, item.row_id,
                        item.sort_order, item.name, item.unit, item.quantity,
                        item.equipment_price, item.material_price, item.work_price,
                        item.equipment_total, item.material_total, item.work_total, item.total,
                        item.id, item.match_source,
                        _j(item.material_markup) if item.material_markup else None,
                        _j(item.work_markup) if item.work_markup else None,
                        _j(item.tech_specs) if item.tech_specs else "{}",
                        _j(item.custom_data) if item.custom_data else "{}",
                        item.is_key_equipment, item.procurement_status, item.man_hours,
                    ],
                )

        return new_est

    # ------------------------------------------------------------------
    # Bulk operations (E4.2)
    # ------------------------------------------------------------------

    MAX_BULK_SIZE = 500

    @staticmethod
    def bulk_create_items(
        section: EstimateSection, estimate: Estimate, workspace_id, items_data: list[dict]
    ) -> int:
        """Batch INSERT через один SQL INSERT ... VALUES. Возвращает count."""
        if not items_data:
            return 0
        _j = EstimateService._to_json_str

        values_parts = []
        params = []
        for data in items_data:
            totals = recalc_item_totals(data, section, estimate)
            data.update(totals)
            item_id = uuid.uuid4()
            row_id = uuid.uuid4()
            values_parts.append(
                "(%s,%s,%s,%s,%s, %s,%s,%s,%s, %s,%s,%s, %s,%s,%s,%s, "
                "1,%s,%s::jsonb,%s::jsonb, FALSE,%s,%s,%s)"
            )
            params.extend([
                item_id, section.id, estimate.id, workspace_id, row_id,
                data.get("sort_order", 0), data["name"], data.get("unit", "шт"), data.get("quantity", 0),
                data.get("equipment_price", 0), data.get("material_price", 0), data.get("work_price", 0),
                data.get("equipment_total", 0), data.get("material_total", 0),
                data.get("work_total", 0), data.get("total", 0),
                data.get("match_source", "unmatched"),
                _j(data.get("tech_specs", "{}")), _j(data.get("custom_data", "{}")),
                data.get("is_key_equipment", False), data.get("procurement_status", "none"),
                data.get("man_hours", 0),
            ])

        sql = """
            INSERT INTO estimate_item (
                id, section_id, estimate_id, workspace_id, row_id,
                sort_order, name, unit, quantity,
                equipment_price, material_price, work_price,
                equipment_total, material_total, work_total, total,
                version, match_source, tech_specs, custom_data,
                is_deleted, is_key_equipment, procurement_status, man_hours
            ) VALUES """ + ", ".join(values_parts)

        with connection.cursor() as cur:
            cur.execute(sql, params)

        return len(items_data)

    @staticmethod
    def bulk_update_items(workspace_id, items: list[dict]) -> dict:
        """Batch UPDATE per item с optimistic lock. Returns {updated, errors}."""
        updated = 0
        errors = []
        _j = EstimateService._to_json_str

        for item_data in items:
            item_id = item_data.get("id")
            version = item_data.get("version")
            if not item_id or version is None:
                errors.append(f"Item missing id or version")
                continue

            set_clauses = []
            params = []
            for key, val in item_data.items():
                if key not in EstimateService.UPDATABLE_COLUMNS:
                    continue
                if key in EstimateService.JSONB_COLUMNS:
                    set_clauses.append(f"{key} = %s::jsonb")
                    params.append(_j(val))
                else:
                    set_clauses.append(f"{key} = %s")
                    params.append(val)

            if not set_clauses:
                continue

            set_clauses.append("version = version + 1")
            set_clauses.append("updated_at = NOW()")
            sql = f"UPDATE estimate_item SET {', '.join(set_clauses)} WHERE id = %s AND workspace_id = %s AND version = %s"
            params.extend([item_id, workspace_id, version])

            with connection.cursor() as cur:
                cur.execute(sql, params)
                if cur.rowcount == 0:
                    errors.append(f"Item {item_id}: version conflict (expected {version})")
                else:
                    updated += 1

        return {"updated": updated, "errors": errors}

    @staticmethod
    def bulk_delete_items(workspace_id, item_ids: list[str], versions: list[int]) -> dict:
        """Batch soft-delete с optimistic lock per item."""
        deleted = 0
        errors = []
        for item_id, version in zip(item_ids, versions):
            with connection.cursor() as cur:
                cur.execute(
                    "UPDATE estimate_item SET is_deleted = TRUE, version = version + 1, updated_at = NOW() "
                    "WHERE id = %s AND workspace_id = %s AND version = %s AND is_deleted = FALSE",
                    [item_id, workspace_id, version],
                )
                if cur.rowcount == 0:
                    errors.append(f"Item {item_id}: version conflict or already deleted")
                else:
                    deleted += 1
        return {"deleted": deleted, "errors": errors}

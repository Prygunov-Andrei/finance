"""Excel import — парсит .xlsx, создаёт/обновляет items через EstimateService."""

import logging
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation

from django.db import transaction
import zipfile

from openpyxl import load_workbook
from openpyxl.utils.exceptions import InvalidFileException

from apps.estimate.models import Estimate, EstimateItem, EstimateSection
from apps.estimate.services.estimate_service import EstimateService
from apps.estimate.services.markup_service import recalc_estimate_totals

logger = logging.getLogger(__name__)


@dataclass
class ImportResult:
    created: int = 0
    updated: int = 0
    errors: list[str] = field(default_factory=list)


def _to_decimal(val, default=Decimal("0")) -> Decimal:
    if val is None:
        return default
    try:
        return Decimal(str(val)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        return default


def import_estimate_xlsx(estimate_id, workspace_id, file) -> ImportResult:
    """Парсит .xlsx, создаёт/обновляет позиции.

    Формат: Наименование | Ед.изм. | Кол-во | Цена оборуд. | Цена мат. | Цена работ | [row_id]
    Жирная строка с 1 ячейкой → section name.
    """
    result = ImportResult()

    try:
        wb = load_workbook(file, read_only=True)
    except (InvalidFileException, KeyError, zipfile.BadZipFile) as e:
        result.errors.append(f"Невалидный файл: {e}")
        return result

    ws = wb.active
    if ws is None:
        result.errors.append("Нет активного листа")
        return result

    estimate = Estimate.objects.get(id=estimate_id, workspace_id=workspace_id)
    current_section = None
    sort_order = 0

    with transaction.atomic():
        create_batches: dict[str, list[dict]] = {}
        for row_idx, row in enumerate(ws.iter_rows(min_row=2, values_only=False), start=2):
            values = [cell.value for cell in row]

            # Пустая строка
            if not any(values):
                continue

            name = values[0] if len(values) > 0 else None

            # Section detection: жирный текст в первой ячейке, остальные пустые
            cell_0 = row[0]
            is_section = (
                cell_0.value
                and cell_0.font
                and cell_0.font.bold
                and not any(values[1:6])
            )

            if is_section:
                section_name = str(name).strip()
                current_section, _ = EstimateSection.objects.get_or_create(
                    estimate=estimate,
                    workspace_id=workspace_id,
                    name=section_name,
                    defaults={"sort_order": sort_order},
                )
                sort_order += 1
                continue

            # Если нет раздела — создадим дефолтный
            if current_section is None:
                current_section, _ = EstimateSection.objects.get_or_create(
                    estimate=estimate,
                    workspace_id=workspace_id,
                    name="Импорт",
                    defaults={"sort_order": 0},
                )

            # Validate name
            if not name or not str(name).strip():
                result.errors.append(f"Строка {row_idx}: пустое наименование")
                continue

            unit = str(values[1]).strip() if len(values) > 1 and values[1] else "шт"
            quantity = _to_decimal(values[2] if len(values) > 2 else None)
            equip_price = _to_decimal(values[3] if len(values) > 3 else None)
            mat_price = _to_decimal(values[4] if len(values) > 4 else None)
            work_price = _to_decimal(values[5] if len(values) > 5 else None)
            row_id = str(values[6]).strip() if len(values) > 6 and values[6] else None

            if quantity < 0:
                result.errors.append(f"Строка {row_idx}: отрицательное количество ({quantity})")
                continue

            sort_order += 1
            data = {
                "name": str(name).strip(),
                "unit": unit,
                "quantity": quantity,
                "equipment_price": equip_price,
                "material_price": mat_price,
                "work_price": work_price,
                "sort_order": sort_order,
            }

            if row_id:
                # UPDATE по row_id
                existing = EstimateItem.all_objects.filter(
                    row_id=row_id, estimate_id=estimate_id, workspace_id=workspace_id
                ).first()
                if existing:
                    EstimateService.update_item(
                        existing.id, workspace_id, existing.version, data
                    )
                    result.updated += 1
                    continue

            # Collect for bulk create
            create_batches.setdefault(current_section.id, []).append(data)

        # Flush bulk creates
        for sec_id, batch in create_batches.items():
            sec = EstimateSection.objects.get(id=sec_id)
            result.created += EstimateService.bulk_create_items(sec, estimate, workspace_id, batch)

        recalc_estimate_totals(estimate_id, workspace_id)

    return result

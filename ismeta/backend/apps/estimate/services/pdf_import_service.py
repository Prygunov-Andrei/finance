"""PDF import — вызов Recognition Service (standalone FastAPI, E15.02b).

Recognition возвращает по specs/15-recognition-api.md §1:
  {status, items[], errors[], pages_stats: {total, processed, skipped, error}}

Здесь маппим в легаси-контракт который ожидает pdf_views / apply_parsed_items:
  {items, status, errors, pages_total, pages_processed, pages_skipped}
"""

import logging

from asgiref.sync import async_to_sync
from django.db import transaction

from apps.estimate.models import Estimate, EstimateSection
from apps.estimate.services.estimate_service import EstimateService
from apps.estimate.services.markup_service import recalc_estimate_totals
from apps.integration.recognition_client import (
    RecognitionClient,
    RecognitionClientError,
)

logger = logging.getLogger(__name__)

# EstimateItem.name = CharField(max_length=500). E15.03-hotfix: защитный
# truncate на стороне импорта — пока парсер (E15.04) может отдать name с
# «слипшейся» multi-line строкой, лучше обрезать и записать warning, чем
# упасть 500-кой на всём импорте. См. QA-FINDINGS-2026-04-21 #4.
MAX_ITEM_NAME_LEN = 500


class PDFParseError(Exception):
    """Normalized failure from Recognition Service."""

    def __init__(self, message: str, *, code: str = "", status_code: int | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code


def parse_pdf_via_recognition(pdf_bytes: bytes, filename: str) -> dict:
    """Вызывает Recognition /v1/parse/spec и переводит ответ в легаси формат.

    Returns: {items, status, errors, pages_total, pages_processed, pages_skipped}
    Raises: PDFParseError при любых ошибках клиента (401/413/415/422/500/502/таймаут).
    """
    client = RecognitionClient()
    try:
        response = async_to_sync(client.parse_spec)(pdf_bytes, filename)
    except RecognitionClientError as e:
        logger.warning(
            "recognition parse_spec failed: code=%s status=%s", e.code, e.status_code
        )
        raise PDFParseError(
            f"Recognition {e.code}: {e.detail or ''}".rstrip(": "),
            code=e.code,
            status_code=e.status_code,
        ) from e

    stats = response.get("pages_stats") or {}
    return {
        "items": response.get("items", []),
        "status": response.get("status", "error"),
        "errors": response.get("errors", []),
        "pages_total": stats.get("total", 0),
        "pages_processed": stats.get("processed", 0),
        "pages_skipped": stats.get("skipped", 0),
    }


def apply_parsed_items(
    estimate_id: str, workspace_id: str, parsed_items: list[dict]
) -> dict:
    """Создать секции и позиции из распознанных items Recognition-контракта.

    Ожидаемые поля item (§1): name, model_name, brand, unit, quantity,
    tech_specs, section_name, page_number, sort_order.
    """
    estimate = Estimate.objects.get(id=estimate_id, workspace_id=workspace_id)

    sections_map: dict[str, EstimateSection] = {}
    sort_order = 0
    created = 0

    with transaction.atomic():
        batches: dict[str, list[dict]] = {}

        for item in parsed_items:
            section_name = (
                item.get("section_name") or item.get("section") or "Импорт PDF"
            )

            if section_name not in sections_map:
                sec, _ = EstimateSection.objects.get_or_create(
                    estimate=estimate,
                    workspace_id=workspace_id,
                    name=section_name,
                    defaults={"sort_order": len(sections_map)},
                )
                sections_map[section_name] = sec

            section = sections_map[section_name]
            sort_order += 1

            name = str(item.get("name", "")).strip()
            if not name:
                continue

            if len(name) > MAX_ITEM_NAME_LEN:
                logger.warning(
                    "pdf_import: item name truncated from %d to %d chars (page=%s): %r...",
                    len(name),
                    MAX_ITEM_NAME_LEN,
                    item.get("page_number"),
                    name[:80],
                )
                name = name[:MAX_ITEM_NAME_LEN]

            # EstimateItem не имеет отдельных model_name/brand полей — пробрасываем
            # их в tech_specs JSON (frontend редактор читает tech_specs для показа
            # модели/бренда рядом с наименованием).
            tech_specs: dict = dict(item.get("tech_specs") or {}) if isinstance(
                item.get("tech_specs"), dict
            ) else {}
            if item.get("model_name"):
                tech_specs["model_name"] = item["model_name"]
            if item.get("brand"):
                tech_specs["brand"] = item["brand"]
            # E15.05 it2 (R22): отдельное поле manufacturer («Завод-изготовитель»
            # / «Производитель»). В отличие от brand (торговая марка) —
            # указывает конкретного поставщика (ООО «КОРФ», АО «ДКС»).
            if item.get("manufacturer"):
                tech_specs["manufacturer"] = item["manufacturer"]
            if item.get("page_number"):
                tech_specs.setdefault("source_page", item["page_number"])
            # E15.04: колонка «Примечание» и system prefix приходят от
            # Recognition новыми полями — складываем в tech_specs JSON
            # (frontend UI-04 уже умеет читать tech_specs.comments / system).
            if item.get("comments"):
                tech_specs["comments"] = item["comments"]

            data = {
                "name": name,
                "unit": item.get("unit", "шт"),
                "quantity": item.get("quantity", 1),
                # Recognition /parse/spec не возвращает цены — оставляем 0.
                "equipment_price": item.get("equipment_price", 0),
                "material_price": item.get("material_price", 0),
                "work_price": 0,
                "sort_order": sort_order,
                "tech_specs": tech_specs,
            }

            batches.setdefault(str(section.id), []).append(data)

        for sec_id, batch in batches.items():
            sec = EstimateSection.objects.get(id=sec_id)
            created += EstimateService.bulk_create_items(sec, estimate, workspace_id, batch)

        recalc_estimate_totals(estimate_id, workspace_id)

    return {
        "created": created,
        "sections": len(sections_map),
    }

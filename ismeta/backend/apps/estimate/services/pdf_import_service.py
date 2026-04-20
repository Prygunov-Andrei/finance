"""PDF import — вызов ERP SpecificationParser через HTTP, preview + apply."""

import json
import logging
import uuid

import httpx
from django.conf import settings
from django.db import transaction

from apps.estimate.models import Estimate, EstimateSection
from apps.estimate.services.estimate_service import EstimateService
from apps.estimate.services.markup_service import recalc_estimate_totals

logger = logging.getLogger(__name__)


class PDFParseError(Exception):
    pass


def parse_pdf_via_erp(pdf_bytes: bytes, filename: str) -> dict:
    """Вызывает ERP SpecificationParser через HTTP.

    Returns: {items, pages_total, pages_processed, pages_skipped, errors, status}
    """
    erp_url = getattr(settings, "ISMETA_ERP_BASE_URL", "http://localhost:8000")
    url = f"{erp_url}/api/v1/specifications/parse/"

    try:
        with httpx.Client(timeout=300.0) as client:
            resp = client.post(
                url,
                files={"file": (filename, pdf_bytes, "application/pdf")},
            )
            resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as e:
        body = e.response.text[:500] if e.response else ""
        raise PDFParseError(f"ERP parse error HTTP {e.response.status_code}: {body}")
    except httpx.ConnectError as e:
        raise PDFParseError(f"ERP недоступен: {e}")
    except httpx.TimeoutException:
        raise PDFParseError("ERP timeout (PDF слишком большой или LLM не отвечает)")


def apply_parsed_items(
    estimate_id: str, workspace_id: str, parsed_items: list[dict]
) -> dict:
    """Создать секции и позиции из распознанных items."""
    estimate = Estimate.objects.get(id=estimate_id, workspace_id=workspace_id)

    sections_map: dict[str, EstimateSection] = {}
    sort_order = 0
    created = 0

    with transaction.atomic():
        batches: dict[str, list[dict]] = {}

        for item in parsed_items:
            section_name = item.get("section", "Импорт PDF") or "Импорт PDF"

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

            data = {
                "name": item.get("name", "").strip(),
                "unit": item.get("unit", "шт"),
                "quantity": item.get("quantity", 1),
                "equipment_price": item.get("equipment_price", 0),
                "material_price": item.get("material_price", 0),
                "work_price": 0,
                "sort_order": sort_order,
            }

            if not data["name"]:
                continue

            batches.setdefault(str(section.id), []).append(data)

        for sec_id, batch in batches.items():
            sec = EstimateSection.objects.get(id=sec_id)
            created += EstimateService.bulk_create_items(sec, estimate, workspace_id, batch)

        recalc_estimate_totals(estimate_id, workspace_id)

    return {
        "created": created,
        "sections": len(sections_map),
    }

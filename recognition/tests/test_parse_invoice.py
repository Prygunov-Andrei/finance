"""Tests for POST /v1/parse/invoice + InvoiceParser unit (per specs §2)."""

import io
import json

import fitz
import pytest

from app.deps import get_provider
from app.main import app
from app.providers.base import BaseLLMProvider
from app.services.invoice_parser import InvoiceParser


def _make_real_pdf(pages: int = 1) -> bytes:
    doc = fitz.open()
    for i in range(pages):
        page = doc.new_page()
        page.insert_text((72, 72), f"Invoice page {i + 1}")
    data = doc.tobytes()
    doc.close()
    return data


class InvoiceMockProvider(BaseLLMProvider):
    """Async mock: classifies 1st page as header, rest as items. Extracts fixed data."""

    def __init__(
        self,
        items_response: str | None = None,
        header_response: str | None = None,
        fail_on_call: int | None = None,
        fail_items_from_call: int | None = None,
    ) -> None:
        self._items = items_response or json.dumps(
            {
                "items": [
                    {
                        "name": "Кабель ВВГнг(А)-LS 3x2.5",
                        "model_name": "",
                        "brand": "",
                        "unit": "м",
                        "quantity": 200.0,
                        "price_unit": 85.00,
                        "price_total": 17000.00,
                        "currency": "RUB",
                        "vat_rate": 20,
                    },
                ]
            }
        )
        self._header = header_response or json.dumps(
            {
                "supplier": {
                    "name": "ООО Электрокабель",
                    "inn": "7700000000",
                    "kpp": "770001001",
                    "bank_account": "40702810900000000000",
                    "bik": "044525225",
                    "correspondent_account": "30101810400000000225",
                },
                "invoice_meta": {
                    "number": "С-00123",
                    "date": "2026-04-18",
                    "total_amount": 17000.00,
                    "vat_amount": 2833.33,
                    "currency": "RUB",
                },
            }
        )
        self._fail_on_call = fail_on_call
        self._fail_items_from_call = fail_items_from_call
        self._calls = 0

    async def vision_complete(self, image_b64: str, prompt: str) -> str:  # noqa: ARG002
        self._calls += 1
        if self._fail_on_call is not None and self._calls == self._fail_on_call:
            raise ValueError("mock LLM failure")
        if "Определи тип" in prompt:
            # Always "header" — parser handles supplier_extracted guard itself.
            return json.dumps({"type": "header"})
        if "Извлеки реквизиты" in prompt:
            return self._header
        # items prompt: allow persistent failure for partial-success test
        if self._fail_items_from_call is not None and self._calls >= self._fail_items_from_call:
            raise ValueError("mock LLM items failure")
        return self._items

    async def aclose(self) -> None:
        return None


class TestInvoiceParserUnit:
    @pytest.mark.asyncio
    async def test_happy_path(self):
        parser = InvoiceParser(InvoiceMockProvider())
        result = await parser.parse(_make_real_pdf(1), "invoice.pdf")

        assert result.status == "done"
        assert result.pages_stats.total == 1
        assert result.pages_stats.processed == 1
        assert len(result.items) == 1
        assert result.items[0].name.startswith("Кабель")
        assert result.items[0].price_total == 17000.00
        assert result.items[0].vat_rate == 20
        assert result.items[0].page_number == 1
        assert result.supplier.name == "ООО Электрокабель"
        assert result.supplier.inn == "7700000000"
        assert result.invoice_meta.number == "С-00123"
        assert result.invoice_meta.total_amount == 17000.00

    @pytest.mark.asyncio
    async def test_partial_on_page_error(self):
        # 2 pages, page 1 OK (3 calls), page 2 items persistently fail (from call 5 onwards).
        # vision_json retries twice, both fail → ValueError bubbles → state.errors.
        parser = InvoiceParser(InvoiceMockProvider(fail_items_from_call=5))
        result = await parser.parse(_make_real_pdf(2), "invoice.pdf")

        assert result.status == "partial"
        assert result.errors
        assert result.items  # page 1 items survived

    @pytest.mark.asyncio
    async def test_items_preserved_across_pages(self):
        """E16 it1: invoice = точная копия PDF. Одинаковые items с разных
        страниц остаются отдельными позициями (дедупликация отключена,
        симметрично SpecParser E15.03-hotfix). Это важно для pagination
        артефактов — если поставщик разбил длинный список на страницы,
        одинаковые артикулы с разных страниц это реально разные позиции."""
        items_resp = json.dumps(
            {
                "items": [
                    {
                        "name": "Кабель UTP Cat.6",
                        "model_name": "UTP-6",
                        "brand": "Belden",
                        "unit": "м",
                        "quantity": 100.0,
                        "price_unit": 30.0,
                        "price_total": 3000.0,
                    },
                ]
            }
        )
        parser = InvoiceParser(InvoiceMockProvider(items_response=items_resp))
        result = await parser.parse(_make_real_pdf(3), "invoice.pdf")

        cables = [i for i in result.items if "Кабель" in i.name]
        assert len(cables) == 3
        assert [c.page_number for c in cables] == [1, 2, 3]

    @pytest.mark.asyncio
    async def test_build_partial_snapshot(self):
        parser = InvoiceParser(InvoiceMockProvider())
        parser.state.pages_total = 5
        parser.state.pages_processed = 2
        snapshot = parser.build_partial()
        assert snapshot.status == "partial"
        assert "timeout" in snapshot.errors[-1]
        assert snapshot.pages_stats.total == 5


class TestInvoiceEndpoint:
    def test_non_pdf_415(self, client, auth_headers):
        resp = client.post(
            "/v1/parse/invoice",
            files={"file": ("x.txt", io.BytesIO(b"nope"), "text/plain")},
            headers=auth_headers,
        )
        assert resp.status_code == 415
        assert resp.json()["error"] == "unsupported_media_type"

    def test_missing_api_key_401(self, client):
        resp = client.post(
            "/v1/parse/invoice",
            files={"file": ("x.pdf", io.BytesIO(_make_real_pdf(1)), "application/pdf")},
        )
        assert resp.status_code == 401
        assert resp.json() == {"error": "invalid_api_key"}

    def test_happy_path_200(self, client, auth_headers):
        app.dependency_overrides[get_provider] = lambda: InvoiceMockProvider()
        resp = client.post(
            "/v1/parse/invoice",
            files={"file": ("inv.pdf", io.BytesIO(_make_real_pdf(1)), "application/pdf")},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "done"
        assert body["supplier"]["name"] == "ООО Электрокабель"
        assert body["invoice_meta"]["number"] == "С-00123"
        assert len(body["items"]) >= 1
        assert "page_number" in body["items"][0]

    def test_missing_file_400(self, client, auth_headers):
        resp = client.post("/v1/parse/invoice", headers=auth_headers)
        assert resp.status_code == 400
        assert resp.json()["error"] == "invalid_file"

    def test_bad_header_does_not_break_items(self, client, auth_headers):
        """Header extraction returns non-JSON → error recorded but items still extracted."""
        header_resp = "NOT JSON"
        app.dependency_overrides[get_provider] = lambda: InvoiceMockProvider(
            header_response=header_resp
        )
        resp = client.post(
            "/v1/parse/invoice",
            files={"file": ("inv.pdf", io.BytesIO(_make_real_pdf(1)), "application/pdf")},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        # items should still be extracted from the same page
        assert len(body["items"]) >= 1
        # but header errors are accumulated
        assert any("header" in e for e in body["errors"])

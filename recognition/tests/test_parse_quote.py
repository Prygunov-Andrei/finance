"""Tests for POST /v1/parse/quote + QuoteParser unit (per specs §3)."""

import io
import json

import fitz
import pytest

from app.deps import get_provider
from app.main import app
from app.providers.base import BaseLLMProvider
from app.services.quote_parser import QuoteParser


def _make_real_pdf(pages: int = 1) -> bytes:
    doc = fitz.open()
    for i in range(pages):
        page = doc.new_page()
        page.insert_text((72, 72), f"Quote page {i + 1}")
    data = doc.tobytes()
    doc.close()
    return data


class QuoteMockProvider(BaseLLMProvider):
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
                        "name": "Кондиционер настенный",
                        "model_name": "ASYG12LUCA",
                        "brand": "Fujitsu",
                        "unit": "шт",
                        "quantity": 1,
                        "price_unit": 85000.0,
                        "price_total": 85000.0,
                        "currency": "RUB",
                        "tech_specs": "3.5 кВт, инвертор",
                        "lead_time_days": 14,
                        "warranty_months": 36,
                    },
                ]
            }
        )
        self._header = header_response or json.dumps(
            {
                "supplier": {"name": "ООО Климат-Трейд", "inn": "7700000001"},
                "quote_meta": {
                    "number": "КП-2026-04-042",
                    "date": "2026-04-18",
                    "valid_until": "2026-05-18",
                    "total_amount": 85000.0,
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
            return json.dumps({"type": "header"})
        if "Извлеки реквизиты" in prompt:
            return self._header
        if self._fail_items_from_call is not None and self._calls >= self._fail_items_from_call:
            raise ValueError("mock LLM items failure")
        return self._items

    async def aclose(self) -> None:
        return None


class TestQuoteParserUnit:
    @pytest.mark.asyncio
    async def test_happy_path(self):
        parser = QuoteParser(QuoteMockProvider())
        result = await parser.parse(_make_real_pdf(1), "quote.pdf")

        assert result.status == "done"
        assert len(result.items) == 1
        item = result.items[0]
        assert item.model_name == "ASYG12LUCA"
        assert item.lead_time_days == 14
        assert item.warranty_months == 36
        assert item.tech_specs.startswith("3.5")
        assert result.supplier.name == "ООО Климат-Трейд"
        assert result.supplier.inn == "7700000001"
        assert result.quote_meta.valid_until == "2026-05-18"
        assert result.quote_meta.total_amount == 85000.0

    @pytest.mark.asyncio
    async def test_partial_on_items_error(self):
        parser = QuoteParser(QuoteMockProvider(fail_items_from_call=5))
        result = await parser.parse(_make_real_pdf(2), "quote.pdf")
        assert result.status == "partial"
        assert result.items
        assert result.errors

    @pytest.mark.asyncio
    async def test_deduplication(self):
        items_resp = json.dumps(
            {
                "items": [
                    {
                        "name": "Кондиционер канальный",
                        "model_name": "ARYG36",
                        "brand": "Fujitsu",
                        "unit": "шт",
                        "quantity": 2,
                        "price_unit": 120000.0,
                        "price_total": 240000.0,
                    }
                ]
            }
        )
        parser = QuoteParser(QuoteMockProvider(items_response=items_resp))
        result = await parser.parse(_make_real_pdf(3), "quote.pdf")
        assert len(result.items) == 1
        assert result.items[0].quantity == 6.0
        assert result.items[0].price_total == 720000.0

    @pytest.mark.asyncio
    async def test_supplier_optional_fields(self):
        """КП может быть без ИНН — поддерживаем."""
        header_resp = json.dumps(
            {
                "supplier": {"name": "ИП Иванов", "inn": ""},
                "quote_meta": {
                    "number": "25/04",
                    "date": "2026-04-20",
                    "valid_until": "",
                    "total_amount": 0,
                    "currency": "RUB",
                },
            }
        )
        parser = QuoteParser(QuoteMockProvider(header_response=header_resp))
        result = await parser.parse(_make_real_pdf(1), "quote.pdf")
        assert result.supplier.name == "ИП Иванов"
        assert result.supplier.inn == ""


class TestQuoteEndpoint:
    def test_non_pdf_415(self, client, auth_headers):
        resp = client.post(
            "/v1/parse/quote",
            files={"file": ("x.txt", io.BytesIO(b"nope"), "text/plain")},
            headers=auth_headers,
        )
        assert resp.status_code == 415
        assert resp.json()["error"] == "unsupported_media_type"

    def test_missing_api_key_401(self, client):
        resp = client.post(
            "/v1/parse/quote",
            files={"file": ("x.pdf", io.BytesIO(_make_real_pdf(1)), "application/pdf")},
        )
        assert resp.status_code == 401
        assert resp.json() == {"error": "invalid_api_key"}

    def test_happy_path_200(self, client, auth_headers):
        app.dependency_overrides[get_provider] = lambda: QuoteMockProvider()
        resp = client.post(
            "/v1/parse/quote",
            files={"file": ("kp.pdf", io.BytesIO(_make_real_pdf(2)), "application/pdf")},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "done"
        assert body["supplier"]["name"] == "ООО Климат-Трейд"
        assert body["quote_meta"]["valid_until"] == "2026-05-18"
        assert len(body["items"]) >= 1

    def test_missing_file_400(self, client, auth_headers):
        resp = client.post("/v1/parse/quote", headers=auth_headers)
        assert resp.status_code == 400

    def test_large_file_413(self, client, auth_headers):
        from app.config import settings

        payload = b"%PDF-1.4\n" + b"\0" * (settings.max_file_size_mb * 1024 * 1024 + 1)
        resp = client.post(
            "/v1/parse/quote",
            files={"file": ("big.pdf", io.BytesIO(payload), "application/pdf")},
            headers=auth_headers,
        )
        assert resp.status_code == 413
        assert resp.json()["limit_mb"] == settings.max_file_size_mb

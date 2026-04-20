"""Tests for RecognitionClient (respx mocks, no real network)."""

import httpx
import pytest
import respx

from apps.integration.recognition_client import (
    RecognitionClient,
    RecognitionClientError,
)

BASE_URL = "http://recognition-test:8003"
API_KEY = "test-key"


@pytest.fixture
def client() -> RecognitionClient:
    return RecognitionClient(base_url=BASE_URL, api_key=API_KEY, timeout=5.0)


SPEC_OK = {
    "status": "done",
    "items": [{"name": "Вентилятор", "model_name": "WNK 100", "brand": "Корф",
               "unit": "шт", "quantity": 2.0, "tech_specs": "",
               "section_name": "ОВ", "page_number": 1, "sort_order": 0}],
    "errors": [],
    "pages_stats": {"total": 1, "processed": 1, "skipped": 0, "error": 0},
}

INVOICE_OK = {
    "status": "done",
    "items": [{"name": "Кабель", "model_name": "", "brand": "", "unit": "м",
               "quantity": 200.0, "price_unit": 85.0, "price_total": 17000.0,
               "currency": "RUB", "vat_rate": 20, "page_number": 1, "sort_order": 0}],
    "supplier": {"name": "ООО Поставщик", "inn": "7700000000", "kpp": "",
                 "bank_account": "", "bik": "", "correspondent_account": ""},
    "invoice_meta": {"number": "С-001", "date": "2026-04-18",
                     "total_amount": 17000.0, "vat_amount": 2833.33,
                     "currency": "RUB"},
    "errors": [],
    "pages_stats": {"total": 1, "processed": 1, "skipped": 0, "error": 0},
}

QUOTE_OK = {
    "status": "done",
    "items": [{"name": "Кондиционер", "model_name": "ASYG12", "brand": "Fujitsu",
               "unit": "шт", "quantity": 1.0, "price_unit": 85000.0,
               "price_total": 85000.0, "currency": "RUB",
               "tech_specs": "", "lead_time_days": 14, "warranty_months": 36,
               "vat_rate": None, "page_number": 1, "sort_order": 0}],
    "supplier": {"name": "ООО Трейд", "inn": "7700000001"},
    "quote_meta": {"number": "КП-01", "date": "2026-04-18",
                   "valid_until": "2026-05-18", "currency": "RUB",
                   "total_amount": 85000.0},
    "errors": [],
    "pages_stats": {"total": 1, "processed": 1, "skipped": 0, "error": 0},
}


class TestHappyPath:
    @pytest.mark.asyncio
    async def test_parse_spec(self, client):
        with respx.mock() as mock:
            route = mock.post(f"{BASE_URL}/v1/parse/spec").mock(
                return_value=httpx.Response(200, json=SPEC_OK)
            )
            result = await client.parse_spec(b"%PDF-1.4...", "spec.pdf")
            assert result == SPEC_OK
            assert route.called
            # X-API-Key передан
            sent = route.calls.last.request.headers
            assert sent["x-api-key"] == API_KEY

    @pytest.mark.asyncio
    async def test_parse_invoice(self, client):
        with respx.mock() as mock:
            mock.post(f"{BASE_URL}/v1/parse/invoice").mock(
                return_value=httpx.Response(200, json=INVOICE_OK)
            )
            result = await client.parse_invoice(b"%PDF-1.4...", "inv.pdf")
            assert result["supplier"]["inn"] == "7700000000"
            assert result["invoice_meta"]["number"] == "С-001"

    @pytest.mark.asyncio
    async def test_parse_quote(self, client):
        with respx.mock() as mock:
            mock.post(f"{BASE_URL}/v1/parse/quote").mock(
                return_value=httpx.Response(200, json=QUOTE_OK)
            )
            result = await client.parse_quote(b"%PDF-1.4...", "kp.pdf")
            assert result["quote_meta"]["valid_until"] == "2026-05-18"
            assert result["items"][0]["lead_time_days"] == 14

    @pytest.mark.asyncio
    async def test_healthz(self, client):
        with respx.mock() as mock:
            mock.get(f"{BASE_URL}/v1/healthz").mock(
                return_value=httpx.Response(
                    200, json={"status": "ok", "version": "0.1.0",
                               "provider": "openai-gpt-4o-mini"}
                )
            )
            data = await client.healthz()
            assert data["status"] == "ok"


class TestErrorMapping:
    @pytest.mark.asyncio
    async def test_401_invalid_api_key(self, client):
        with respx.mock() as mock:
            mock.post(f"{BASE_URL}/v1/parse/invoice").mock(
                return_value=httpx.Response(401, json={"error": "invalid_api_key"})
            )
            with pytest.raises(RecognitionClientError) as exc_info:
                await client.parse_invoice(b"%PDF-1.4", "x.pdf")
            assert exc_info.value.code == "invalid_api_key"
            assert exc_info.value.status_code == 401

    @pytest.mark.asyncio
    async def test_502_llm_unavailable(self, client):
        with respx.mock() as mock:
            mock.post(f"{BASE_URL}/v1/parse/spec").mock(
                return_value=httpx.Response(
                    502,
                    json={"error": "llm_unavailable", "retry_after_sec": 30,
                          "detail": "upstream 429"},
                )
            )
            with pytest.raises(RecognitionClientError) as exc_info:
                await client.parse_spec(b"%PDF-1.4", "x.pdf")
            assert exc_info.value.code == "llm_unavailable"
            assert exc_info.value.status_code == 502
            assert exc_info.value.extra.get("retry_after_sec") == 30

    @pytest.mark.asyncio
    async def test_413_file_too_large(self, client):
        with respx.mock() as mock:
            mock.post(f"{BASE_URL}/v1/parse/invoice").mock(
                return_value=httpx.Response(
                    413, json={"error": "file_too_large", "limit_mb": 50}
                )
            )
            with pytest.raises(RecognitionClientError) as exc_info:
                await client.parse_invoice(b"%PDF-1.4", "big.pdf")
            assert exc_info.value.code == "file_too_large"
            assert exc_info.value.extra.get("limit_mb") == 50

    @pytest.mark.asyncio
    async def test_415_unsupported_media(self, client):
        with respx.mock() as mock:
            mock.post(f"{BASE_URL}/v1/parse/quote").mock(
                return_value=httpx.Response(
                    415,
                    json={"error": "unsupported_media_type", "detail": "not a pdf"},
                )
            )
            with pytest.raises(RecognitionClientError) as exc_info:
                await client.parse_quote(b"bad", "x.txt")
            assert exc_info.value.code == "unsupported_media_type"
            assert "not a pdf" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_500_internal(self, client):
        with respx.mock() as mock:
            mock.post(f"{BASE_URL}/v1/parse/spec").mock(
                return_value=httpx.Response(
                    500, json={"error": "internal_error", "detail": "oops"}
                )
            )
            with pytest.raises(RecognitionClientError) as exc_info:
                await client.parse_spec(b"%PDF", "x.pdf")
            assert exc_info.value.code == "internal_error"

    @pytest.mark.asyncio
    async def test_422_parse_failed(self, client):
        with respx.mock() as mock:
            mock.post(f"{BASE_URL}/v1/parse/invoice").mock(
                return_value=httpx.Response(
                    422, json={"error": "parse_failed", "detail": "LLM gave junk"}
                )
            )
            with pytest.raises(RecognitionClientError) as exc_info:
                await client.parse_invoice(b"%PDF", "x.pdf")
            assert exc_info.value.code == "parse_failed"


class TestTransportErrors:
    @pytest.mark.asyncio
    async def test_timeout_maps_to_network_timeout(self, client):
        with respx.mock() as mock:
            mock.post(f"{BASE_URL}/v1/parse/spec").mock(
                side_effect=httpx.ReadTimeout("slow")
            )
            with pytest.raises(RecognitionClientError) as exc_info:
                await client.parse_spec(b"%PDF", "x.pdf")
            assert exc_info.value.code == "network_timeout"

    @pytest.mark.asyncio
    async def test_connect_error_maps_to_network_error(self, client):
        with respx.mock() as mock:
            mock.post(f"{BASE_URL}/v1/parse/spec").mock(
                side_effect=httpx.ConnectError("refused")
            )
            with pytest.raises(RecognitionClientError) as exc_info:
                await client.parse_spec(b"%PDF", "x.pdf")
            assert exc_info.value.code == "network_error"

    @pytest.mark.asyncio
    async def test_non_json_error_body_keeps_text(self, client):
        with respx.mock() as mock:
            mock.post(f"{BASE_URL}/v1/parse/spec").mock(
                return_value=httpx.Response(503, text="Service Unavailable")
            )
            with pytest.raises(RecognitionClientError) as exc_info:
                await client.parse_spec(b"%PDF", "x.pdf")
            assert exc_info.value.code == "http_503"
            assert "Service Unavailable" in exc_info.value.detail


class TestSettings:
    @pytest.mark.asyncio
    async def test_uses_django_settings_defaults(self, settings):
        settings.RECOGNITION_URL = "http://cfg-host:1234"
        settings.RECOGNITION_API_KEY = "cfg-key"
        c = RecognitionClient()
        assert c.base_url == "http://cfg-host:1234"
        assert c.api_key == "cfg-key"

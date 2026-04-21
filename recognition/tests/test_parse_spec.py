"""Test POST /v1/parse/spec — happy path, partial, negatives, errors per §5."""

import io
import json

import fitz
import pytest

from app.api.parse import get_provider
from app.main import app
from app.providers.base import BaseLLMProvider
from app.services.spec_parser import SpecParser


def _make_real_pdf(pages: int = 2) -> bytes:
    doc = fitz.open()
    for i in range(pages):
        page = doc.new_page()
        page.insert_text((72, 72), f"Page {i + 1}: Equipment list")
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


class MockProvider(BaseLLMProvider):
    """Async mock LLM provider."""

    def __init__(self, classify_response=None, extract_response=None, fail_on_page=None):
        self._classify = classify_response or json.dumps(
            {"type": "specification", "section_name": "Вентиляция"}
        )
        self._extract = extract_response or json.dumps(
            {
                "items": [
                    {
                        "name": "Вентилятор канальный WNK 100",
                        "model_name": "WNK 100/1",
                        "brand": "Корф",
                        "unit": "шт",
                        "quantity": 10,
                    },
                    {
                        "name": "Воздуховод прямоугольный 200x200",
                        "unit": "м.п.",
                        "quantity": 850,
                    },
                ]
            }
        )
        self._fail_on_page = fail_on_page
        self._call_count = 0

    async def vision_complete(self, image_b64: str, prompt: str) -> str:  # noqa: ARG002
        self._call_count += 1
        if self._fail_on_page is not None and self._call_count == self._fail_on_page:
            raise ValueError("LLM timeout on this page")
        if "Определи тип" in prompt:
            return self._classify
        return self._extract


class TestSpecParserUnit:
    @pytest.mark.asyncio
    async def test_happy_path(self):
        provider = MockProvider()
        parser = SpecParser(provider)
        pdf = _make_real_pdf(2)
        result = await parser.parse(pdf, "test.pdf")

        assert result.status == "done"
        assert len(result.items) >= 2
        assert result.pages_stats.total == 2
        assert result.pages_stats.processed == 2
        assert result.errors == []
        assert result.items[0].section_name == "Вентиляция"
        assert result.items[0].page_number == 1
        assert result.items[0].sort_order == 1

    @pytest.mark.asyncio
    async def test_partial_success(self):
        provider = MockProvider(fail_on_page=2)
        parser = SpecParser(provider)
        pdf = _make_real_pdf(2)
        result = await parser.parse(pdf, "test.pdf")

        assert result.status == "partial"
        assert len(result.errors) >= 1
        assert len(result.items) >= 1

    @pytest.mark.asyncio
    async def test_deduplication(self):
        extract_resp = json.dumps(
            {
                "items": [
                    {
                        "name": "Кабель UTP",
                        "model_name": "Cat.6",
                        "brand": "Belden",
                        "unit": "м",
                        "quantity": 10,
                    },
                ]
            }
        )
        provider = MockProvider(extract_response=extract_resp)
        parser = SpecParser(provider)
        pdf = _make_real_pdf(3)
        result = await parser.parse(pdf, "test.pdf")

        cables = [i for i in result.items if "Кабель" in i.name]
        assert len(cables) == 1
        assert cables[0].quantity == 30.0

    @pytest.mark.asyncio
    async def test_drawing_pages_skipped(self):
        classify_resp = json.dumps({"type": "drawing", "section_name": ""})
        provider = MockProvider(classify_response=classify_resp)
        parser = SpecParser(provider)
        pdf = _make_real_pdf(3)
        result = await parser.parse(pdf, "test.pdf")

        assert result.status == "done"
        assert result.items == []
        assert result.pages_stats.skipped == 3

    @pytest.mark.asyncio
    async def test_build_partial_snapshot(self):
        provider = MockProvider()
        parser = SpecParser(provider)
        parser.state.pages_total = 5
        parser.state.pages_processed = 2
        snapshot = parser.build_partial()
        assert snapshot.status == "partial"
        assert "timeout" in snapshot.errors[-1]


class TestParseSpecEndpoint:
    def test_non_pdf_415(self, client, auth_headers):
        resp = client.post(
            "/v1/parse/spec",
            files={"file": ("test.txt", io.BytesIO(b"not a pdf"), "text/plain")},
            headers=auth_headers,
        )
        assert resp.status_code == 415
        assert resp.json()["error"] == "unsupported_media_type"

    def test_missing_file_400(self, client, auth_headers):
        resp = client.post("/v1/parse/spec", headers=auth_headers)
        assert resp.status_code == 400
        assert resp.json()["error"] == "invalid_file"

    def test_empty_pdf_400(self, client, auth_headers):
        resp = client.post(
            "/v1/parse/spec",
            files={"file": ("empty.pdf", io.BytesIO(b""), "application/pdf")},
            headers=auth_headers,
        )
        assert resp.status_code == 400
        assert resp.json()["error"] == "invalid_file"

    def test_large_file_413(self, client, auth_headers):
        from app.config import settings

        payload = b"%PDF-1.4\n" + b"\0" * (settings.max_file_size_mb * 1024 * 1024 + 1)
        resp = client.post(
            "/v1/parse/spec",
            files={"file": ("big.pdf", io.BytesIO(payload), "application/pdf")},
            headers=auth_headers,
        )
        assert resp.status_code == 413
        body = resp.json()
        assert body["error"] == "file_too_large"
        assert body["limit_mb"] == settings.max_file_size_mb

    def test_bad_pdf_magic_415(self, client, auth_headers):
        resp = client.post(
            "/v1/parse/spec",
            files={"file": ("test.pdf", io.BytesIO(b"NOT-A-PDF"), "application/pdf")},
            headers=auth_headers,
        )
        assert resp.status_code == 415

    def test_real_pdf_mock_llm(self, client, auth_headers):
        mock = MockProvider()
        app.dependency_overrides[get_provider] = lambda: mock
        pdf = _make_real_pdf(2)
        resp = client.post(
            "/v1/parse/spec",
            files={"file": ("spec.pdf", io.BytesIO(pdf), "application/pdf")},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "done"
        assert len(data["items"]) >= 2
        assert data["pages_stats"]["total"] == 2
        assert all("page_number" in it for it in data["items"])

    def test_errors_only_status_error(self, client, auth_headers):
        """Extract always fails → status=error, 200 response, errors populated."""

        class BadExtractProvider(BaseLLMProvider):
            async def vision_complete(self, image_b64, prompt):  # noqa: ARG002
                if "Определи тип" in prompt:
                    return json.dumps({"type": "specification", "section_name": ""})
                return "this is not json"

            async def aclose(self):
                return None

        app.dependency_overrides[get_provider] = lambda: BadExtractProvider()
        pdf = _make_real_pdf(1)
        resp = client.post(
            "/v1/parse/spec",
            files={"file": ("spec.pdf", io.BytesIO(pdf), "application/pdf")},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "error"
        assert body["errors"]


# ---------------------------------------------------------------------------
# DEV-BACKLOG #10: gpt-4o-mini оборачивает JSON в ```json ... ``` fence.
# Проверяем что defensive strip в _common.vision_json справляется.
# ---------------------------------------------------------------------------


class MarkdownWrappedProvider(BaseLLMProvider):
    """Имитирует реальное поведение gpt-4o-mini без response_format=json_object:
    оборачивает ответ в ```json ... ``` fence.
    """

    async def vision_complete(self, image_b64: str, prompt: str) -> str:  # noqa: ARG002
        if "Определи тип" in prompt:
            payload = '{"type": "specification", "section_name": "Вентиляция"}'
        else:
            payload = (
                '{"items": [{"name": "Кабель UTP Cat.6", "model_name": "", '
                '"brand": "Belden", "unit": "м", "quantity": 50, "tech_specs": ""}]}'
            )
        return f"```json\n{payload}\n```"

    async def aclose(self) -> None:
        return None


class PlainFenceProvider(BaseLLMProvider):
    """Тот же кейс, но без языка: просто ``` ... ```."""

    async def vision_complete(self, image_b64: str, prompt: str) -> str:  # noqa: ARG002
        if "Определи тип" in prompt:
            payload = '{"type": "specification", "section_name": ""}'
        else:
            payload = '{"items": [{"name": "Гибкая вставка", "unit": "шт", "quantity": 1}]}'
        return f"```\n{payload}\n```"


class TestMarkdownFenceRecovery:
    @pytest.mark.asyncio
    async def test_markdown_json_fence_parsed(self):
        parser = SpecParser(MarkdownWrappedProvider())
        pdf = _make_real_pdf(1)
        result = await parser.parse(pdf, "x.pdf")
        assert result.status == "done"
        assert len(result.items) == 1
        assert result.items[0].name == "Кабель UTP Cat.6"
        assert result.items[0].brand == "Belden"

    @pytest.mark.asyncio
    async def test_plain_fence_parsed(self):
        parser = SpecParser(PlainFenceProvider())
        pdf = _make_real_pdf(1)
        result = await parser.parse(pdf, "x.pdf")
        assert result.status == "done"
        assert len(result.items) == 1
        assert result.items[0].name == "Гибкая вставка"


class TestHybridTextLayer:
    """SpecParser идёт text-layer путём на нативных PDF — LLM не вызывается."""

    @pytest.mark.asyncio
    async def test_text_layer_parser_skips_llm(self, monkeypatch):
        """PDF с text layer → hybrid путь → провайдер не вызывается."""
        # Монkeypatch has_usable_text_layer чтобы всегда True, затем
        # подмена parse_page_items чтобы вернуть известные items (fitz не пишет
        # кириллицу без кастомного шрифта, формируем через stub).
        import app.services.spec_parser as sp

        def fake_text_layer(_page, **_kw):
            return True

        def fake_parse(_page, current_section="", sticky_parent_name=""):
            return (
                [
                    {
                        "name": "Вентилятор канальный",
                        "model_name": "VKR-200",
                        "unit": "шт",
                        "quantity": 4,
                        "section_name": "Вентиляция",
                    },
                    {
                        "name": "Воздуховод 200x200",
                        "model_name": "",
                        "unit": "м.п.",
                        "quantity": 150,
                        "section_name": "Вентиляция",
                    },
                ],
                "Вентиляция",
                "Воздуховод 200x200",
            )

        monkeypatch.setattr(sp, "has_usable_text_layer", fake_text_layer)
        monkeypatch.setattr(sp, "parse_page_items", fake_parse)

        class FailingProvider(BaseLLMProvider):
            async def vision_complete(self, image_b64, prompt):  # noqa: ARG002
                raise AssertionError("LLM should NOT be called on text-layer PDF")

            async def aclose(self):
                return None

        parser = SpecParser(FailingProvider())
        pdf = _make_real_pdf(2)
        result = await parser.parse(pdf, "native.pdf")

        assert result.status == "done"
        assert result.errors == []
        assert result.pages_stats.processed == 2
        # 2 страницы × 2 items = 4, но dedup сложит одинаковые → 2 уникальных
        # позиции с удвоенными количествами
        assert len(result.items) == 2
        assert result.items[0].name == "Вентилятор канальный"
        assert result.items[0].quantity == 8.0  # 4 + 4
        assert result.items[0].section_name == "Вентиляция"
        assert result.items[1].name == "Воздуховод 200x200"
        assert result.items[1].quantity == 300.0

    @pytest.mark.asyncio
    async def test_text_layer_present_no_items_page_skipped(self, monkeypatch):
        """Titlesheet с text layer, но без позиций → pages_skipped++."""
        import app.services.spec_parser as sp

        monkeypatch.setattr(sp, "has_usable_text_layer", lambda *_a, **_kw: True)
        monkeypatch.setattr(sp, "parse_page_items", lambda *_a, **_kw: ([], "", ""))

        class FailingProvider(BaseLLMProvider):
            async def vision_complete(self, image_b64, prompt):  # noqa: ARG002
                raise AssertionError("LLM should NOT be called")

            async def aclose(self):
                return None

        parser = SpecParser(FailingProvider())
        pdf = _make_real_pdf(1)
        result = await parser.parse(pdf, "titlesheet.pdf")
        assert result.status == "done"
        assert result.items == []
        assert result.pages_stats.skipped == 1


class TestStripMarkdownFenceUnit:
    """Прямые unit-тесты на _strip_markdown_fence — edge cases."""

    def test_plain_json_untouched(self):
        from app.services._common import _strip_markdown_fence

        assert _strip_markdown_fence('{"a": 1}') == '{"a": 1}'

    def test_json_fence(self):
        from app.services._common import _strip_markdown_fence

        assert _strip_markdown_fence('```json\n{"a": 1}\n```') == '{"a": 1}'

    def test_plain_fence(self):
        from app.services._common import _strip_markdown_fence

        assert _strip_markdown_fence('```\n{"a": 1}\n```') == '{"a": 1}'

    def test_fence_with_trailing_whitespace(self):
        from app.services._common import _strip_markdown_fence

        assert _strip_markdown_fence('  ```json\n{"a": 1}\n```  ') == '{"a": 1}'

    def test_fence_without_newline(self):
        """Корнер-кейс: ```json{"a":1}``` в одну строку."""
        from app.services._common import _strip_markdown_fence

        assert _strip_markdown_fence('```{"a": 1}```') == '{"a": 1}'

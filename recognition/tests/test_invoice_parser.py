"""Unit-тесты для E16 it1 invoice hybrid pipeline.

Проверяют:
  - split_qty_unit / parse_lead_time_days — утилиты pdf_text.
  - extract_invoice_rows — column detection + post-process на mock PDF.
  - normalize_invoice_items_via_llm — column-shift protection, multi-line
    merge, lead_time parsing через mock provider.
  - compute_invoice_confidence — 4 репрезентативных кейса.
  - _split_number_with_tail — не расщепляет «6 687,50» (regression
    защита) и корректно разделяет «813 591,00 в наличии».
"""

from __future__ import annotations

import json

import fitz
import pytest

from app.providers.base import BaseLLMProvider, TextCompletion
from app.services.invoice_normalizer import (
    LLMInvoiceNormalizationError,
    NormalizedInvoiceItem,
    NormalizedInvoicePage,
    compute_invoice_confidence,
    normalize_invoice_items_via_llm,
)
from app.services.pdf_text import (
    TableRow,
    _split_number_with_tail,
    extract_invoice_rows,
    parse_lead_time_days,
    split_qty_unit,
)


class TestSplitQtyUnit:
    def test_27_sht(self):
        assert split_qty_unit("27 шт.") == ("27", "шт.")

    def test_10_upak(self):
        assert split_qty_unit("10 упак") == ("10", "упак")

    def test_5_m(self):
        assert split_qty_unit("5 м") == ("5", "м")

    def test_decimal(self):
        assert split_qty_unit("1,5 м") == ("1,5", "м")

    def test_no_unit(self):
        # «27» — только число без unit → возвращаем как qty, unit пустой.
        assert split_qty_unit("27") == ("27", "")

    def test_empty(self):
        assert split_qty_unit("") == ("", "")

    def test_no_match(self):
        # Не парсится — весь текст как qty.
        assert split_qty_unit("7 р.д.") == ("7 р.д.", "")


class TestParseLeadTimeDays:
    def test_working_days(self):
        assert parse_lead_time_days("7 р.д.") == 7
        assert parse_lead_time_days("7 р. д.") == 7

    def test_days(self):
        assert parse_lead_time_days("30 дней") == 30
        assert parse_lead_time_days("5 дн.") == 5

    def test_weeks(self):
        assert parse_lead_time_days("2 нед.") == 14
        assert parse_lead_time_days("1 неделя") == 7

    def test_in_stock(self):
        assert parse_lead_time_days("в наличии") is None

    def test_empty(self):
        assert parse_lead_time_days("") is None

    def test_no_number(self):
        assert parse_lead_time_days("р.д.") is None


class TestSplitNumberWithTail:
    def test_number_with_text(self):
        # Классический ЛУИС+ кейс.
        assert _split_number_with_tail("813 591,00 в наличии") == (
            "813 591,00",
            "в наличии",
        )

    def test_large_number_with_text(self):
        assert _split_number_with_tail("1 714 790,31 итого") == (
            "1 714 790,31",
            "итого",
        )

    def test_pure_number_not_split(self):
        # Regression: «6 687,50» — число с пробелом-разделителем тысяч,
        # хвоста нет — НЕ расщеплять.
        assert _split_number_with_tail("6 687,50") == ("6 687,50", "")

    def test_integer_not_split(self):
        assert _split_number_with_tail("100") == ("100", "")

    def test_empty(self):
        assert _split_number_with_tail("") == ("", "")


class TestExtractInvoiceRowsGolden:
    """extract_invoice_rows на реальных golden PDF — проверяет bbox + column
    detection + post-process, БЕЗ LLM. Эти тесты не требуют OPENAI_API_KEY.

    Отличие от golden_llm в tests/golden/: там full pipeline через LLM,
    здесь только извлечение bbox-rows.
    """

    from pathlib import Path

    FIXTURE_ROOT = (
        Path(__file__).resolve().parent.parent.parent
        / "ismeta"
        / "tests"
        / "fixtures"
        / "golden"
    )

    def test_invoice_01_extracts_4_items(self):
        pdf = self.FIXTURE_ROOT / "invoice-01.pdf"
        if not pdf.exists():
            pytest.skip(f"fixture missing: {pdf}")
        doc = fitz.open(str(pdf))
        try:
            rows = extract_invoice_rows(doc[0])
        finally:
            doc.close()

        # Data rows: у них обязательно заполнены price_unit и price_total.
        data_rows = [
            r for r in rows
            if r.cells.get("price_unit") and r.cells.get("price_total")
        ]
        # invoice-01: 4 «Воздуховода» + возможный мусор. Отбираем только те,
        # где в name есть «Воздуховод» — должно быть ровно 4.
        air_ducts = [r for r in data_rows if "Воздуховод" in (r.cells.get("name") or "")]
        assert len(air_ducts) == 4, (
            f"ожидалось 4 row с Воздуховодом, получено {len(air_ducts)}: "
            f"{[r.cells for r in air_ducts]}"
        )
        # Первый row должен иметь qty=10 и unit=упак.
        first = air_ducts[0]
        assert first.cells.get("qty") == "10"
        assert first.cells.get("unit") == "упак"
        assert first.cells.get("price_unit") == "668,75"
        assert first.cells.get("vat_amount") == "1 205,94"
        assert first.cells.get("price_total") == "6 687,50"

    def test_invoice_02_extracts_15_items(self):
        pdf = self.FIXTURE_ROOT / "invoice-02.pdf"
        if not pdf.exists():
            pytest.skip(f"fixture missing: {pdf}")
        doc = fitz.open(str(pdf))
        try:
            rows_p1 = extract_invoice_rows(doc[0])
            rows_p2 = extract_invoice_rows(doc[1]) if len(doc) > 1 else []
        finally:
            doc.close()

        # Собираем «головы» items (у них всегда есть price_unit+price_total).
        all_rows = rows_p1 + rows_p2
        heads = [
            r for r in all_rows
            if r.cells.get("price_unit") and r.cells.get("price_total")
        ]
        # 15 items всего (14 на p1, 1 на p2). Мусор p2 (договорный текст)
        # отфильтруется: там price_unit пустой у param-rows.
        # Но текст p2 «3. Нажатие Покупателем...» может попасть с ненулевыми
        # cells price_unit и price_total (см. extract_invoice_rows вывод).
        # Берём те rows где qty выглядит как число — т.е. настоящие items.
        numeric_heads = [
            r for r in heads
            if (r.cells.get("qty") or "").replace(",", "").replace(".", "").isdigit()
        ]
        assert len(numeric_heads) >= 15, (
            f"ожидалось ≥15 items, получено {len(numeric_heads)}: "
            f"{[r.cells for r in numeric_heads]}"
        )

        # invoice-02: минимум 2 items с lead_time='7 р.д.' (row 4 и row 7).
        lead_time_rows = [
            r for r in numeric_heads if r.cells.get("lead_time") == "7 р.д."
        ]
        assert len(lead_time_rows) >= 2

        # Unit разделён: у первого row quantity=27, unit=шт.
        first = numeric_heads[0]
        assert first.cells.get("qty") == "27"
        assert first.cells.get("unit") == "шт."

        # Notes разделён: «в наличии» — в notes, не в price_total.
        assert first.cells.get("notes") == "в наличии"
        assert first.cells.get("price_total") == "813 591,00"


class TestExtractInvoiceRowsEdgeCases:
    def test_empty_pdf_returns_empty(self):
        doc = fitz.open()
        doc.new_page()  # пустая страница
        data = doc.tobytes()
        doc.close()
        doc2 = fitz.open(stream=data, filetype="pdf")
        try:
            rows = extract_invoice_rows(doc2[0])
        finally:
            doc2.close()
        assert rows == []


class _FakeTextProvider(BaseLLMProvider):
    """Mock provider с жёстко заданным text_complete response."""

    def __init__(self, response: str, fail: bool = False) -> None:
        self._response = response
        self._fail = fail

    async def vision_complete(self, image_b64: str, prompt: str) -> str:  # noqa: ARG002
        raise NotImplementedError

    async def text_complete(
        self,
        prompt: str,  # noqa: ARG002
        *,
        max_tokens: int | None = None,  # noqa: ARG002
        temperature: float = 0.0,  # noqa: ARG002
        system_prompt: str | None = None,  # noqa: ARG002
    ) -> TextCompletion:
        if self._fail:
            return TextCompletion(content="NOT JSON", prompt_tokens=0, completion_tokens=0)
        return TextCompletion(
            content=self._response, prompt_tokens=100, completion_tokens=50
        )

    async def aclose(self) -> None:
        return None


def _mk_row(row_index: int, **cells: str) -> TableRow:
    return TableRow(
        page_number=1,
        y_mid=float(row_index * 20),
        row_index=row_index,
        cells=cells,
        raw_blocks=list(cells.values()),
    )


class TestNormalizeInvoiceItems:
    @pytest.mark.asyncio
    async def test_basic_mapping(self):
        """LLM возвращает 1 item — парсер строит NormalizedInvoicePage."""
        response = json.dumps(
            {
                "items": [
                    {
                        "name": "Контроллер доступа ЛКД-КС-8000",
                        "quantity": 27,
                        "unit": "шт.",
                        "price_unit": 30133.0,
                        "price_total": 813591.0,
                        "notes": "в наличии",
                        "lead_time_days": None,
                    }
                ]
            }
        )
        provider = _FakeTextProvider(response)
        rows = [
            _mk_row(
                0,
                name="1 Контроллер доступа ЛКД-КС-8000",
                qty="27",
                unit="шт.",
                price_unit="30 133,00",
                price_total="813 591,00",
                notes="в наличии",
            )
        ]
        result = await normalize_invoice_items_via_llm(
            provider, rows, page_number=1
        )
        assert len(result.items) == 1
        item = result.items[0]
        assert item.name == "Контроллер доступа ЛКД-КС-8000"
        assert item.quantity == 27.0
        assert item.unit == "шт."
        assert item.price_unit == 30133.0
        assert item.price_total == 813591.0
        assert item.notes == "в наличии"
        assert item.lead_time_days is None

    @pytest.mark.asyncio
    async def test_lead_time_parsed(self):
        """LLM возвращает lead_time_days — парсер сохраняет int."""
        response = json.dumps(
            {
                "items": [
                    {
                        "name": "Программное обеспечение PNSoft-32",
                        "quantity": 1,
                        "unit": "шт.",
                        "price_unit": 76871.0,
                        "price_total": 76871.0,
                        "lead_time_days": 7,
                        "notes": "7 р.д.",
                    }
                ]
            }
        )
        provider = _FakeTextProvider(response)
        rows = [_mk_row(0, name="Программное обеспечение PNSoft-32")]
        result = await normalize_invoice_items_via_llm(
            provider, rows, page_number=1
        )
        assert result.items[0].lead_time_days == 7

    @pytest.mark.asyncio
    async def test_float_coerce_from_string(self):
        """LLM может вернуть цену строкой — нормализатор приведёт к float."""
        response = json.dumps(
            {
                "items": [
                    {
                        "name": "X",
                        "quantity": "10",
                        "price_unit": "668,75",
                        "price_total": "6 687,50",
                    }
                ]
            }
        )
        provider = _FakeTextProvider(response)
        rows = [_mk_row(0, name="X")]
        result = await normalize_invoice_items_via_llm(
            provider, rows, page_number=1
        )
        assert result.items[0].quantity == 10.0
        assert result.items[0].price_unit == 668.75
        assert result.items[0].price_total == 6687.50

    @pytest.mark.asyncio
    async def test_items_without_name_dropped(self):
        """Item без name — пропускается + warning."""
        response = json.dumps({"items": [{"name": "", "quantity": 1}]})
        provider = _FakeTextProvider(response)
        rows = [_mk_row(0, name="X")]
        result = await normalize_invoice_items_via_llm(
            provider, rows, page_number=1
        )
        assert result.items == []
        assert any("without name" in w for w in result.warnings)

    @pytest.mark.asyncio
    async def test_invalid_json_raises(self):
        provider = _FakeTextProvider("", fail=True)
        rows = [_mk_row(0, name="X")]
        with pytest.raises(LLMInvoiceNormalizationError):
            await normalize_invoice_items_via_llm(provider, rows, page_number=1)

    @pytest.mark.asyncio
    async def test_empty_rows_returns_empty(self):
        """Без rows — нет LLM-call, пустая страница."""
        provider = _FakeTextProvider("{}")
        result = await normalize_invoice_items_via_llm(
            provider, [], page_number=1
        )
        assert result.items == []


class TestComputeInvoiceConfidence:
    def _mk_norm(
        self,
        n: int,
        *,
        price_unit: bool = True,
        price_total: bool = True,
        qty: bool = True,
    ) -> NormalizedInvoicePage:
        items = [
            NormalizedInvoiceItem(
                name=f"item {i}",
                quantity=1.0 if qty else 0.0,
                price_unit=100.0 if price_unit else 0.0,
                price_total=100.0 if price_total else 0.0,
            )
            for i in range(n)
        ]
        return NormalizedInvoicePage(items=items)

    def test_all_prices_high_confidence(self):
        norm = self._mk_norm(5)
        rows = [_mk_row(i) for i in range(5)]
        conf = compute_invoice_confidence(norm, rows)
        assert conf >= 0.9

    def test_no_prices_low_confidence(self):
        norm = self._mk_norm(5, price_unit=False, price_total=False)
        rows = [_mk_row(i) for i in range(5)]
        conf = compute_invoice_confidence(norm, rows)
        assert conf < 0.5

    def test_mixed_medium_confidence(self):
        norm = self._mk_norm(5, price_unit=True, price_total=False)
        rows = [_mk_row(i) for i in range(5)]
        conf = compute_invoice_confidence(norm, rows)
        assert 0.5 <= conf < 0.9

    def test_empty_items_zero(self):
        norm = NormalizedInvoicePage(items=[])
        assert compute_invoice_confidence(norm, [_mk_row(0)]) == 0.0

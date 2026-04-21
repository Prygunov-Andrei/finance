"""Golden set test — real ОВ2 spec PDF, 9 A3 pages, ≈152 позиции.

Фикстура лежит в ismeta/tests/fixtures/golden/ (соседний компонент монорепо).
Помечен маркером `golden` — не входит в обычный `pytest` прогон:

    pytest -m golden                 # только golden
    pytest                           # всё остальное (дефолт)

Цель: catch regressions in text-layer parser (pdf_text.py) — если эвристика
колонок/штампов поломается, recall упадёт ниже 85% и тест не пройдёт.
"""

from pathlib import Path

import pytest

from app.providers.base import BaseLLMProvider
from app.services.spec_parser import SpecParser

FIXTURE_PDF = (
    Path(__file__).resolve().parent.parent.parent.parent
    / "ismeta"
    / "tests"
    / "fixtures"
    / "golden"
    / "spec-ov2-152items.pdf"
)

# Базовые ожидания.
EXPECTED_PAGES_TOTAL = 9
# 90% от 152 — после E15.03 sticky-parent fix текущий baseline 142.
# Запас на ±1-2 позиции от незначительных правок эвристик.
MIN_ITEMS = 138
MIN_SECTIONS = 4


class _NoopProvider(BaseLLMProvider):
    """LLM-провайдер, который падает при вызове — гарантия что text-layer путь
    не проваливается в Vision на нативных PDF."""

    async def vision_complete(self, image_b64: str, prompt: str) -> str:  # noqa: ARG002
        raise AssertionError(
            "Vision should NOT be called on native text-layer PDF — regression"
        )

    async def aclose(self) -> None:
        return None


@pytest.mark.golden
@pytest.mark.asyncio
async def test_ov2_spec_text_layer_recall():
    assert FIXTURE_PDF.exists(), f"fixture not found: {FIXTURE_PDF}"
    pdf_bytes = FIXTURE_PDF.read_bytes()

    parser = SpecParser(_NoopProvider())
    result = await parser.parse(pdf_bytes, filename=FIXTURE_PDF.name)

    assert result.status == "done", f"status={result.status} errors={result.errors}"
    assert result.errors == [], f"unexpected errors: {result.errors}"
    assert result.pages_stats.total == EXPECTED_PAGES_TOTAL
    assert result.pages_stats.processed == EXPECTED_PAGES_TOTAL, (
        f"processed={result.pages_stats.processed} "
        f"(text layer должен покрывать все страницы)"
    )

    # Recall ≥ 85% от 152 позиций. Реальная цифра на момент написания ≈141
    # уникальная (после дедупликации name+model+brand). Если цифра уедет вниз
    # на регрессии — тест упадёт.
    assert len(result.items) >= MIN_ITEMS, (
        f"recall too low: items={len(result.items)} < {MIN_ITEMS}"
    )

    sections = {it.section_name for it in result.items if it.section_name}
    assert len(sections) >= MIN_SECTIONS, (
        f"section detection too coarse: {len(sections)} sections, "
        f"expected ≥{MIN_SECTIONS}. got: {sections}"
    )

    # Dedup должен выдавать уникальные (name, model, brand) — проверяем что
    # в items нет одинаковых троек.
    seen: set[tuple[str, str, str]] = set()
    for it in result.items:
        key = (it.name.lower().strip(), it.model_name.lower().strip(), it.brand.lower().strip())
        assert key not in seen, f"duplicate after dedup: {key}"
        seen.add(key)


@pytest.mark.golden
@pytest.mark.asyncio
async def test_ov2_spec_sections_include_known_keywords():
    """Минимальный «семантический» smoke — ожидаем появление знакомых разделов."""
    pdf_bytes = FIXTURE_PDF.read_bytes()
    parser = SpecParser(_NoopProvider())
    result = await parser.parse(pdf_bytes, filename=FIXTURE_PDF.name)

    joined = " | ".join({it.section_name for it in result.items})
    assert "Противодымная" in joined or "Система" in joined, (
        f"no expected section keywords found in: {joined!r}"
    )
    assert "Клапан" in joined, f"клапаны должны быть отдельной секцией: {joined!r}"

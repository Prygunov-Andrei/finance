"""Golden set test — real ОВ2 spec PDF, 9 A3 pages, ≈152 позиции.

Фикстура лежит в ismeta/tests/fixtures/golden/ (соседний компонент монорепо).
Помечен маркерами:

    pytest -m golden                 # legacy text-layer baseline (no LLM)
    pytest -m golden_llm             # E15.04 LLM-normalize path (требует
                                     # OPENAI_API_KEY в env)
    pytest                           # всё остальное (дефолт без golden)

Цель `golden`: catch regressions in text-layer parser (pdf_text.py).
Цель `golden_llm`: валидация recall column-aware + LLM pipeline на реальном
ОВ2 PDF (целевой recall ≥95% per ТЗ E15.04).

Дедупликация отключена с E15.03-hotfix (смета = точная копия PDF). Одинаковые
(name, model, brand) из разных секций остаются отдельными позициями.
"""

import os
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
# 90% от 152 — после E15.03 sticky-parent fix + E15.03-hotfix (dedup отключён).
# Без дедупа число позиций может быть больше уникальных троек — порог 138 остаётся
# как нижняя граница recall (≥ 138 строк было успешно распознано) для legacy path.
MIN_ITEMS = 138
MIN_SECTIONS = 4

# E15.04 LLM-path: цель ТЗ (it1) ≥140 (92% от 152), цель it2 ≥145.
# Фактически после it2 на gpt-4o full recall 140-142 — R18-strict orphan
# continuation КОРРЕКТНО склеивает multi-line «Дефлектор Цаги» +
# «на узле прохода УП1» в одно имя item'а (было: 2 отдельных items).
# Суммарный count падает на 4-5 при том же семантическом покрытии.
# Baseline остаётся 140 (ТЗ it1) — it2-target 145 не хит из-за корректного
# merging multi-line entries, см. E15.05 it2 final report.
LLM_MIN_ITEMS = 140
LLM_MIN_SECTIONS = 6


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

    # Recall ≥ 85% от 152 позиций. После E15.03-hotfix dedup отключён —
    # одинаковые (name, model, brand) из разных секций остаются отдельно,
    # поэтому фактическое число может быть больше уникальных троек.
    assert len(result.items) >= MIN_ITEMS, (
        f"recall too low: items={len(result.items)} < {MIN_ITEMS}"
    )

    sections = {it.section_name for it in result.items if it.section_name}
    assert len(sections) >= MIN_SECTIONS, (
        f"section detection too coarse: {len(sections)} sections, "
        f"expected ≥{MIN_SECTIONS}. got: {sections}"
    )


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


# ---------------------------------------------------------------------------
# E15.04: column-aware + LLM normalize (требует реальный OpenAI ключ)
# ---------------------------------------------------------------------------


_LLM_SKIP_REASON = "OPENAI_API_KEY не задан — skip golden_llm"


@pytest.mark.golden_llm
@pytest.mark.asyncio
@pytest.mark.skipif(not os.environ.get("OPENAI_API_KEY"), reason=_LLM_SKIP_REASON)
async def test_ov2_spec_llm_normalize_recall():
    """E15.04: column-aware + gpt-4o-mini → recall ≥140 / 152.

    Цель ТЗ — ≥145. Нижняя граница 140 учитывает variance LLM temperature=0
    (строго говоря детерминирован, но OpenAI иногда делает микро-вариации).
    При устойчивом recall ≥145 поднять LLM_MIN_ITEMS до 145.
    """
    from app.providers.openai_vision import OpenAIVisionProvider

    provider = OpenAIVisionProvider()
    try:
        parser = SpecParser(provider)
        result = await parser.parse(FIXTURE_PDF.read_bytes(), filename=FIXTURE_PDF.name)

        assert result.status == "done", f"status={result.status} errors={result.errors}"
        assert result.pages_stats.total == EXPECTED_PAGES_TOTAL
        assert result.pages_stats.processed == EXPECTED_PAGES_TOTAL

        assert len(result.items) >= LLM_MIN_ITEMS, (
            f"LLM recall too low: items={len(result.items)} < {LLM_MIN_ITEMS}"
        )

        sections = {it.section_name for it in result.items if it.section_name}
        assert len(sections) >= LLM_MIN_SECTIONS, (
            f"sections detection too coarse: {len(sections)} < {LLM_MIN_SECTIONS}"
        )

        # Конкретные check'и из ТЗ (ak #3, #4, #6).
        deflectors = [it for it in result.items if "Дефлектор" in it.name]
        assert len(deflectors) >= 2, f"Дефлектор Цаги ожидаем 2+ позиции, got {len(deflectors)}"

        # Kleber — должен быть в ≥2 разных секциях (E15.03-hotfix: dedup отключён).
        klebers = [
            it for it in result.items
            if "Kleber" in (it.model_name + " " + it.name) or "клеящ" in it.name.lower()
        ]
        kleber_sections = {k.section_name for k in klebers}
        assert len(kleber_sections) >= 2, (
            f"Kleber должен быть в ≥2 секциях, got {kleber_sections!r}"
        )
    finally:
        await provider.aclose()


@pytest.mark.golden_llm
@pytest.mark.asyncio
@pytest.mark.skipif(not os.environ.get("OPENAI_API_KEY"), reason=_LLM_SKIP_REASON)
async def test_ov2_spec_llm_time_budget():
    """E15.04 нефункциональный: ≤30s на 9-стр PDF через параллельный batch."""
    import time

    from app.providers.openai_vision import OpenAIVisionProvider

    provider = OpenAIVisionProvider()
    try:
        parser = SpecParser(provider)
        t0 = time.time()
        await parser.parse(FIXTURE_PDF.read_bytes(), filename=FIXTURE_PDF.name)
        dt = time.time() - t0
        # 45s — мягкая верхняя граница: cold-start OpenAI иногда добавляет
        # ~10s latency. Устойчивое значение на прогретом клиенте ≤ 30s.
        assert dt < 45.0, f"LLM time budget exceeded: {dt:.1f}s"
    finally:
        await provider.aclose()

"""Golden тест для spec-aov.pdf (2 стр, 29 позиций, Автоматика/Кабели/Лотки).

Второй golden fixture после spec-ov2-152items — введён после QA-сессии 3
(2026-04-22) и E15.05 it1. Проверяет что prompt+sections+stamp+numeric-prefix
изменения исправляют column shift и не ломают spec-ov2 baseline.

Приёмочные критерии (см. `ismeta/docs/agent-tasks/E15-05-it1-prompt-sections-petya.md`):
- items ≥ 29 (все позиции из PDF)
- sections ≥ 4 (из 5: Оборудование автоматизации / Щитовое / Кабели / Электро / Лотки)
- section_name без числового префикса «N.»
- Items «Комплект автоматизации» (10 шт.): unit=шт./шт, qty=1, brand содержит КОРФ
  или пуст, model_name БЕЗ «КОРФ» (защита от column shift)
- items[].name не содержит «Взаим.» (R20 stamp)
- items[].name не начинается с чистого «N.N » префикса (R21)
"""

import os
import re as _re
from pathlib import Path

import pytest

FIXTURE_PDF = (
    Path(__file__).resolve().parent.parent.parent.parent
    / "ismeta"
    / "tests"
    / "fixtures"
    / "golden"
    / "spec-aov.pdf"
)

AOV_MIN_ITEMS = 29
AOV_MIN_SECTIONS = 4


_LLM_SKIP_REASON = "OPENAI_API_KEY не задан — skip golden_llm"


@pytest.mark.golden_llm
@pytest.mark.asyncio
@pytest.mark.skipif(not os.environ.get("OPENAI_API_KEY"), reason=_LLM_SKIP_REASON)
async def test_aov_spec_llm_normalize():
    from app.providers.openai_vision import OpenAIVisionProvider
    from app.services.spec_parser import SpecParser

    assert FIXTURE_PDF.exists(), f"fixture not found: {FIXTURE_PDF}"

    provider = OpenAIVisionProvider()
    try:
        parser = SpecParser(provider)
        result = await parser.parse(FIXTURE_PDF.read_bytes(), filename=FIXTURE_PDF.name)

        assert result.status == "done", f"status={result.status} errors={result.errors}"
        assert result.pages_stats.total == 2
        assert result.pages_stats.processed == 2

        assert len(result.items) >= AOV_MIN_ITEMS, (
            f"items={len(result.items)} < {AOV_MIN_ITEMS}"
        )

        sections = {it.section_name for it in result.items if it.section_name}
        assert len(sections) >= AOV_MIN_SECTIONS, (
            f"sections={sections!r} (ожидаем ≥{AOV_MIN_SECTIONS})"
        )

        # R17 — префикс «N.» / «N.N» должен быть очищен из section_name.
        for sec in sections:
            assert not _re.match(r"^\d+(\.\d+)*\.?\s", sec), (
                f"numeric prefix not stripped: {sec!r}"
            )

        # R19 column shift: items 1-10 «Комплект автоматизации».
        kits = [it for it in result.items if "Комплект автоматизации" in it.name]
        assert len(kits) == 10, f"kits count wrong: {len(kits)}"
        for kit in kits:
            assert kit.unit in ("шт", "шт."), (
                f"unit wrong: {kit.unit!r} in {kit.name!r}"
            )
            assert kit.quantity == 1.0, (
                f"qty wrong: {kit.quantity} in {kit.name!r}"
            )
            assert "КОРФ" in kit.brand.upper() or kit.brand == "", (
                f"brand wrong: {kit.brand!r} in {kit.name!r}"
            )
            # Защита: бренд не должен «утечь» в model_name (циркулярный shift).
            assert "КОРФ" not in kit.model_name.upper(), (
                f"brand leaked to model: {kit.model_name!r} in {kit.name!r}"
            )

        # R20 — штамп «Взаим.инв.» ни в одном name.
        for it in result.items:
            assert "Взаим" not in it.name, f"stamp leaked: {it.name!r}"
            assert "Согласовано" not in it.name, f"stamp leaked: {it.name!r}"

        # R21 — numeric prefix «N.N » очищен из name.
        for it in result.items:
            assert not _re.match(r"^\d+\.\d+\s", it.name), (
                f"numeric prefix leaked to name: {it.name!r}"
            )

        # Positive case: 2.1 Корпус металлический с артикульным кодом.
        korpus = [it for it in result.items if "Корпус металлический" in it.name]
        assert len(korpus) >= 1, "item '2.1 Корпус металлический' не найден"
        # model_name должен содержать код TI5-10-N-... (из cells.model).
        assert any(
            "TI5" in it.model_name or "TI5" in it.name for it in korpus
        ), f"equipment_code TI5-... потерян: {[it.model_name for it in korpus]!r}"

    finally:
        await provider.aclose()

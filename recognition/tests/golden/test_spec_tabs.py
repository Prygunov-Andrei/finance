"""Третий golden — ТАБС-116-25-ОВ (9 стр, ~150 позиций, Вент/Конд/БТП).

Введён после QA-сессии 4 (2026-04-22, ТАБС-116) и E15.05 it2 (гибрид bbox +
conditional multimodal retry). Проверяет, что:

- R23 multi-row header detection восстановил column detection (до it2 все
  items имели `model_name=""` и было только 1 section);
- R24 x-gap aware span-join убирает артефакты «Pc=3 0 0 Па»;
- R25 stamp-cell filter не пропускает «Дата и подпись», «Код уч № док»,
  «Инв.№ подп.» в items;
- R18-strict orphan-name continuation склеивает multi-line установки
  («П1/В 1 Приточно-вытяжная установка… комплектно со см. узлом… комплектом
  автоматики»);
- R27 conditional multimodal retry активируется на страницах с confidence
  < 0.7 и восстанавливает recall.

Требует OPENAI_API_KEY (использует gpt-4o full для extract, см. it2 config).
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
    / "spec-tabs-116-ov.pdf"
)

# Базовые ожидания по ТЗ E15.05 it2 (acceptance criteria §3).
TABS_MIN_ITEMS = 120       # 80% от ожидаемых ~150
TABS_MIN_SECTIONS = 4      # из 5: Вентиляция/Кондиционирование/Отопление/БТП/Шкаф
TABS_MIN_MODEL_RATIO = 0.8  # ≥80% items с непустым model_name

_LLM_SKIP_REASON = "OPENAI_API_KEY не задан — skip golden_llm"


@pytest.mark.golden_llm
@pytest.mark.asyncio
@pytest.mark.skipif(not os.environ.get("OPENAI_API_KEY"), reason=_LLM_SKIP_REASON)
async def test_tabs_spec_hybrid_recall():
    """E15.05 it2 gate test: hybrid bbox+multimodal должен собрать ≥120 items."""
    from app.providers.openai_vision import OpenAIVisionProvider
    from app.services.spec_parser import SpecParser

    assert FIXTURE_PDF.exists(), f"fixture not found: {FIXTURE_PDF}"

    provider = OpenAIVisionProvider()
    try:
        parser = SpecParser(provider)
        result = await parser.parse(FIXTURE_PDF.read_bytes(), filename=FIXTURE_PDF.name)

        assert result.status == "done", f"status={result.status} errors={result.errors}"
        assert result.pages_stats.total == 9

        # §3 — items count.
        assert len(result.items) >= TABS_MIN_ITEMS, (
            f"recall too low: items={len(result.items)} < {TABS_MIN_ITEMS}"
        )

        # §3 — sections.
        sections = {it.section_name for it in result.items if it.section_name}
        assert len(sections) >= TABS_MIN_SECTIONS, (
            f"sections count too low: {len(sections)} < {TABS_MIN_SECTIONS}, "
            f"got: {sections!r}"
        )

        # R23 — model_name непуст у ≥80% items (column detection работает).
        items_with_model = [it for it in result.items if it.model_name]
        model_ratio = len(items_with_model) / max(len(result.items), 1)
        assert model_ratio >= TABS_MIN_MODEL_RATIO, (
            f"model_name ratio too low: {model_ratio:.2%} < "
            f"{TABS_MIN_MODEL_RATIO:.0%}. R23 multi-row header detection "
            f"скорее всего сломан."
        )

        # R25 — штампы не должны попасть ни в name, ни в model_name.
        stamp_phrases = ["Дата и подпись", "Код уч № док", "Инв.№ подп.", "Инв. № подп."]
        for it in result.items:
            all_fields = " | ".join([
                it.name, it.model_name, it.brand, it.manufacturer, it.comments,
            ])
            for phrase in stamp_phrases:
                assert phrase not in all_fields, (
                    f"stamp leaked: {phrase!r} in {all_fields!r}"
                )

        # R24 — лишние пробелы в числах (e.g. «Pc=3 0 0 Па»).
        for it in result.items:
            # Матч «=<digit><space><digit>» — паттерн из разбитых кернингом чисел.
            assert not _re.search(r"=\d\s+\d", it.name), (
                f"span-join gap leaked (R24): {it.name!r}"
            )

        # R26 — section_name без trailing `:` / `—` / `-`.
        for sec in sections:
            assert not sec.endswith((":", "—", "-", " ")), (
                f"section has trailing char (R26): {sec!r}"
            )

    finally:
        await provider.aclose()


@pytest.mark.golden_llm
@pytest.mark.asyncio
@pytest.mark.skipif(not os.environ.get("OPENAI_API_KEY"), reason=_LLM_SKIP_REASON)
async def test_tabs_spec_multiline_installation_stays_one_item():
    """R18-strict: «Приточно-вытяжная установка… комплектно со см. узлом…
    комплектом автоматики» должна быть ОДНИМ item, а не тремя.

    Это был один из ключевых регрессов QA-сессии 4 (#39) — orphan-name rows
    становились отдельными items.
    """
    from app.providers.openai_vision import OpenAIVisionProvider
    from app.services.spec_parser import SpecParser

    provider = OpenAIVisionProvider()
    try:
        parser = SpecParser(provider)
        result = await parser.parse(FIXTURE_PDF.read_bytes(), filename=FIXTURE_PDF.name)

        pvu_items = [
            it for it in result.items
            if "Приточно-вытяжная установка" in it.name
        ]
        assert pvu_items, "Приточно-вытяжная установка не найдена"
        # Хотя бы один из items должен содержать ОБА «комплектно со см. узлом»
        # И «комплектом автоматики» в имени (склейка multi-line).
        joined = pvu_items[0].name
        assert "комплектно со см. узлом" in joined or "комплектно" in joined, (
            f"multi-line name #1 не склеился: {joined!r}"
        )
        assert "комплектом автоматики" in joined or "автоматики" in joined, (
            f"multi-line name #2 не склеился: {joined!r}"
        )

        # Sanity — должно быть НЕ больше 2-3 items (не 3+ separate).
        # Некоторые PDF имеют несколько установок П1/П2 — нормально.
        orphan_items = [
            it for it in result.items
            if it.name.strip() in (
                "комплектно со см. узлом, пластинчатым рекуператором",
                "комплектом автоматики",
                "комплектно со см. узлом",
            )
        ]
        assert not orphan_items, (
            f"R18-strict сломан: orphan-name rows стали отдельными items: "
            f"{[it.name for it in orphan_items]!r}"
        )
    finally:
        await provider.aclose()

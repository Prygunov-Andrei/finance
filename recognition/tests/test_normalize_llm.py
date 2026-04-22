"""Unit-тесты LLM-нормализатора column-aware rows (E15.04).

Прогоняем `normalize_via_llm` с мок-провайдером → проверяем что JSON
маппится корректно, sticky-inheritance работает, LLMNormalizationError
поднимается при битом ответе.
"""

import json

import pytest

from app.providers.base import BaseLLMProvider, TextCompletion
from app.services.pdf_text import TableRow
from app.services.spec_normalizer import (
    LLMNormalizationError,
    NormalizedItem,
    NormalizedPage,
    compute_confidence,
    normalize_via_llm,
    normalize_via_llm_multimodal,
)


class _StubProvider(BaseLLMProvider):
    """Возвращает заданный JSON из text_complete. Vision роняет."""

    def __init__(self, response_json: str, prompt_tokens: int = 100, completion_tokens: int = 50):
        self._resp = response_json
        self._pt = prompt_tokens
        self._ct = completion_tokens
        self.last_prompt = ""

    async def vision_complete(self, image_b64, prompt):  # noqa: ARG002
        raise AssertionError("vision не должен вызываться в normalize-тестах")

    async def text_complete(self, prompt, *, max_tokens=None, temperature=0.0):  # noqa: ARG002
        self.last_prompt = prompt
        return TextCompletion(
            content=self._resp,
            prompt_tokens=self._pt,
            completion_tokens=self._ct,
        )


def _row(idx: int, cells: dict, y: float = 100.0, is_section: bool = False) -> TableRow:
    return TableRow(
        page_number=1,
        y_mid=y,
        row_index=idx,
        cells=dict(cells),
        raw_blocks=list(cells.values()),
        is_header=False,
        is_section_heading=is_section,
    )


@pytest.mark.asyncio
async def test_valid_json_maps_to_items():
    resp = json.dumps(
        {
            "new_section": "Противодымная вентиляция",
            "new_sticky": "Клапан",
            "items": [
                {
                    "name": "Вентилятор дымоудаления",
                    "model_name": "KLR-DU-400",
                    "brand": "Корф",
                    "unit": "шт",
                    "quantity": 1,
                    "comments": "",
                    "system_prefix": "ВД1",
                }
            ],
        }
    )
    provider = _StubProvider(resp)
    rows = [
        _row(0, {"pos": "ВД1", "name": "Вентилятор", "model": "KLR-DU-400", "brand": "Корф", "unit": "шт", "qty": "1"}),
    ]
    page = await normalize_via_llm(provider, rows, page_number=4)
    assert page.new_section == "Противодымная вентиляция"
    assert page.new_sticky == "Клапан"
    assert len(page.items) == 1
    it = page.items[0]
    assert it.name == "Вентилятор дымоудаления"
    assert it.system_prefix == "ВД1"
    assert it.quantity == 1.0
    assert page.prompt_tokens == 100
    assert page.completion_tokens == 50


@pytest.mark.asyncio
async def test_empty_rows_returns_empty_without_llm_call():
    provider = _StubProvider("{}")  # должен не вызваться
    page = await normalize_via_llm(
        provider, [], page_number=1, current_section="s", sticky_parent_name="x"
    )
    assert page.items == []
    assert page.new_section == "s"
    assert page.new_sticky == "x"
    assert provider.last_prompt == ""  # text_complete не вызывался


@pytest.mark.asyncio
async def test_invalid_json_raises():
    provider = _StubProvider("not a json at all")
    rows = [_row(0, {"name": "X"})]
    with pytest.raises(LLMNormalizationError):
        await normalize_via_llm(provider, rows, page_number=1)


@pytest.mark.asyncio
async def test_missing_items_array_raises():
    provider = _StubProvider(json.dumps({"new_section": "X"}))
    rows = [_row(0, {"name": "X"})]
    with pytest.raises(LLMNormalizationError):
        await normalize_via_llm(provider, rows, page_number=1)


@pytest.mark.asyncio
async def test_item_without_name_skipped_with_warning():
    resp = json.dumps(
        {
            "new_section": "",
            "new_sticky": "",
            "items": [
                {"name": "Good", "unit": "шт", "quantity": 1},
                {"name": "", "unit": "шт", "quantity": 5},
                {"model_name": "M", "unit": "шт"},  # no name
            ],
        }
    )
    provider = _StubProvider(resp)
    rows = [_row(0, {"name": "R1"})]
    page = await normalize_via_llm(provider, rows, page_number=1)
    assert len(page.items) == 1
    assert page.items[0].name == "Good"
    assert any("without name" in w for w in page.warnings)


@pytest.mark.asyncio
async def test_bad_quantity_coerced_with_warning():
    resp = json.dumps(
        {
            "new_section": "",
            "new_sticky": "",
            "items": [{"name": "X", "unit": "шт", "quantity": "not-a-number"}],
        }
    )
    provider = _StubProvider(resp)
    rows = [_row(0, {"name": "X"})]
    page = await normalize_via_llm(provider, rows, page_number=1)
    assert len(page.items) == 1
    assert page.items[0].quantity == 1.0
    assert any("bad quantity" in w for w in page.warnings)


@pytest.mark.asyncio
async def test_hallucination_warning_emitted():
    # 1 row → 5 items (>2x) → warning
    items = [{"name": f"X{i}", "unit": "шт", "quantity": 1} for i in range(5)]
    resp = json.dumps({"new_section": "", "new_sticky": "", "items": items})
    provider = _StubProvider(resp)
    rows = [_row(0, {"name": "R"})]
    page = await normalize_via_llm(provider, rows, page_number=1)
    assert len(page.items) == 5
    assert any("галлюцинация" in w for w in page.warnings)


@pytest.mark.asyncio
async def test_markdown_fence_stripped():
    resp = '```json\n{"new_section": "A", "new_sticky": "B", "items": [{"name": "X", "unit": "шт", "quantity": 1}]}\n```'
    provider = _StubProvider(resp)
    rows = [_row(0, {"name": "X"})]
    page = await normalize_via_llm(provider, rows, page_number=1)
    assert len(page.items) == 1
    assert page.new_section == "A"


@pytest.mark.asyncio
async def test_prompt_includes_input_context():
    resp = json.dumps({"new_section": "", "new_sticky": "", "items": []})
    provider = _StubProvider(resp)
    rows = [_row(0, {"name": "R"})]
    await normalize_via_llm(
        provider,
        rows,
        page_number=1,
        current_section="Текущая секция",
        sticky_parent_name="Текущий sticky",
    )
    # Значения подставились через JSON-encode → проверяем что поля
    # действительно в prompt'е.
    assert "Текущая секция" in provider.last_prompt
    assert "Текущий sticky" in provider.last_prompt
    assert '"cells"' in provider.last_prompt


# ---------------------------------------------------------------------------
# E15.05 it1 — промпт-правила (R17 / R19 / R20 / R21)
# ---------------------------------------------------------------------------


class TestPromptRulesPresent:
    """Структурная проверка NORMALIZE_PROMPT_TEMPLATE: все критичные правила
    из E15.05 it1 присутствуют в тексте. Если кто-то случайно удалит правило
    при следующем редактировании — сломается здесь, а не на golden_llm в проде."""

    def test_critical_rule_0_present(self):
        from app.services.spec_normalizer import NORMALIZE_PROMPT_TEMPLATE

        assert "КРИТИЧЕСКОЕ ПРАВИЛО 0" in NORMALIZE_PROMPT_TEMPLATE
        assert "НЕ ПЕРЕСТАВЛЯЙ КОЛОНКИ" in NORMALIZE_PROMPT_TEMPLATE
        assert "cells.brand" in NORMALIZE_PROMPT_TEMPLATE

    def test_section_numeric_prefix_strip_rule(self):
        from app.services.spec_normalizer import NORMALIZE_PROMPT_TEMPLATE

        # Пример очистки префикса присутствует в правиле 1.
        assert "1. Оборудование автоматизации" in NORMALIZE_PROMPT_TEMPLATE
        assert "Оборудование автоматизации" in NORMALIZE_PROMPT_TEMPLATE
        assert "new_section" in NORMALIZE_PROMPT_TEMPLATE

    def test_numeric_prefix_rule_5c(self):
        from app.services.spec_normalizer import NORMALIZE_PROMPT_TEMPLATE

        # Правило 5c: префикс вида "1.1 " в cells.name должен сниматься.
        assert "1.1 Комплект автоматизации" in NORMALIZE_PROMPT_TEMPLATE

    def test_stamp_prefix_rule_7b(self):
        from app.services.spec_normalizer import NORMALIZE_PROMPT_TEMPLATE

        assert "Взаим.инв." in NORMALIZE_PROMPT_TEMPLATE
        assert "Вз. инв." in NORMALIZE_PROMPT_TEMPLATE

    def test_orphan_comments_rule_7c(self):
        from app.services.spec_normalizer import NORMALIZE_PROMPT_TEMPLATE

        assert "Orphan comments" in NORMALIZE_PROMPT_TEMPLATE

    def test_model_equipment_code_rule_10(self):
        from app.services.spec_normalizer import NORMALIZE_PROMPT_TEMPLATE

        assert "Модель" in NORMALIZE_PROMPT_TEMPLATE
        assert "Код оборудования" in NORMALIZE_PROMPT_TEMPLATE


# ---------------------------------------------------------------------------
# E15.05 it2 — R18-strict / R22 manufacturer / R26 section / R27 confidence+multimodal
# ---------------------------------------------------------------------------


class TestPromptRulesE1505It2:
    """Структурная проверка новых правил в NORMALIZE_PROMPT_TEMPLATE."""

    def test_r18_orphan_strict_rule(self):
        from app.services.spec_normalizer import NORMALIZE_PROMPT_TEMPLATE

        assert "orphan-name" in NORMALIZE_PROMPT_TEMPLATE.lower()
        assert "R18-strict" in NORMALIZE_PROMPT_TEMPLATE
        assert "ВСЕГДА continuation" in NORMALIZE_PROMPT_TEMPLATE

    def test_r22_manufacturer_cell_mapping(self):
        from app.services.spec_normalizer import NORMALIZE_PROMPT_TEMPLATE

        assert "cells.manufacturer" in NORMALIZE_PROMPT_TEMPLATE
        assert "items[].manufacturer" in NORMALIZE_PROMPT_TEMPLATE

    def test_r26_section_normalize_rule(self):
        from app.services.spec_normalizer import NORMALIZE_PROMPT_TEMPLATE

        assert "1d. Normalize section_name" in NORMALIZE_PROMPT_TEMPLATE
        assert "Вентиляция :" in NORMALIZE_PROMPT_TEMPLATE


@pytest.mark.asyncio
async def test_manufacturer_field_maps_from_response():
    """R22: items[].manufacturer прокидывается из LLM-ответа в NormalizedItem."""
    resp = json.dumps(
        {
            "new_section": "Оборудование автоматизации",
            "new_sticky": "",
            "items": [
                {
                    "name": "Комплект автоматизации",
                    "model_name": "",
                    "brand": "",
                    "manufacturer": "ООО \"КОРФ\"",
                    "unit": "шт.",
                    "quantity": 1.0,
                    "comments": "",
                    "system_prefix": "",
                }
            ],
        }
    )
    provider = _StubProvider(resp)
    rows = [_row(0, {"name": "Комплект автоматизации", "manufacturer": "ООО \"КОРФ\""})]
    page = await normalize_via_llm(provider, rows, page_number=1)
    assert len(page.items) == 1
    assert page.items[0].manufacturer == 'ООО "КОРФ"'
    assert page.items[0].brand == ""


@pytest.mark.asyncio
async def test_section_name_colon_stripped_post_processing():
    """R26: даже если LLM проигнорировал правило 1d — post-processing зачищает `:`."""
    resp = json.dumps(
        {
            "new_section": "Вентиляция :",
            "new_sticky": "",
            "items": [
                {"name": "X", "section_name": "Кондиционирование: ", "unit": "шт", "quantity": 1},
            ],
        }
    )
    provider = _StubProvider(resp)
    rows = [_row(0, {"name": "X"})]
    page = await normalize_via_llm(provider, rows, page_number=1)
    assert page.new_section == "Вентиляция"
    assert page.items[0].section_name == "Кондиционирование"


# --- R27: compute_confidence ------------------------------------------------


def _norm_item(**overrides) -> NormalizedItem:
    defaults = dict(
        name="X", model_name="", brand="", manufacturer="", unit="шт",
        quantity=1.0, comments="", system_prefix="", section_name="",
    )
    defaults.update(overrides)
    return NormalizedItem(**defaults)


def test_confidence_all_models_filled_high_score():
    """R27: все items с model_name + brand + 2+ секции → confidence ~1.0."""
    items = [
        _norm_item(name="A", model_name="M1", brand="B1", section_name="S1"),
        _norm_item(name="B", model_name="M2", brand="B2", section_name="S2"),
        _norm_item(name="C", model_name="M3", brand="B3", section_name="S1"),
    ]
    norm = NormalizedPage(items=items, new_section="S2", new_sticky="")
    # 3 rows → count_ratio = 3/3 = 1.0 (вне [0.3, 0.9] → 0.5). Чтобы получить
    # высокий count_score, подаём 4 rows.
    rows = [TableRow(1, 10.0, i, {}, [], False, False) for i in range(4)]
    score = compute_confidence(norm, rows)
    assert score >= 0.9, f"expected ≥0.9, got {score:.3f}"


def test_confidence_no_models_low_score():
    """R27: если model_name пуст у всех items → confidence < 0.6."""
    items = [
        _norm_item(name="A", model_name="", brand="", section_name="S1"),
        _norm_item(name="B", model_name="", brand="", section_name="S1"),
    ]
    norm = NormalizedPage(items=items, new_section="S1", new_sticky="")
    rows = [TableRow(1, 10.0, i, {}, [], False, False) for i in range(3)]
    score = compute_confidence(norm, rows)
    assert score < 0.6, f"expected <0.6, got {score:.3f}"


def test_confidence_empty_items_zero():
    """Пустой items — 0.0 (triggers multimodal retry)."""
    norm = NormalizedPage(items=[], new_section="", new_sticky="")
    rows = [TableRow(1, 10.0, 0, {}, [], False, False)]
    assert compute_confidence(norm, rows) == 0.0


def test_confidence_manufacturer_counts_as_brand():
    """Item с заполненным manufacturer но пустым brand — засчитывается в brand_ratio."""
    # Готовим 3 rows / 1 item → row_count_ratio = 0.33 ∈ [0.3, 0.9] → count_score = 1.0.
    items = [
        _norm_item(name="A", model_name="M1", manufacturer="ООО КОРФ", section_name="S1"),
    ]
    norm = NormalizedPage(items=items, new_section="S1", new_sticky="")
    rows = [TableRow(1, 10.0, i, {}, [], False, False) for i in range(3)]
    score = compute_confidence(norm, rows)
    # model 1.0*0.4 + brand 1.0*0.2 + section 0.5*0.2 + count 1.0*0.2 = 0.9
    assert 0.85 <= score <= 0.95, f"score={score:.3f}"


# --- R27: multimodal fallback ---------------------------------------------


class _MultimodalStubProvider(BaseLLMProvider):
    """Стаб с text_complete (phase1) + multimodal_complete (phase2)."""

    def __init__(self, text_resp: str, multimodal_resp: str):
        self._text = text_resp
        self._mm = multimodal_resp
        self.text_calls = 0
        self.multimodal_calls = 0

    async def vision_complete(self, image_b64, prompt):  # noqa: ARG002
        raise AssertionError("vision не должен вызываться")

    async def text_complete(self, prompt, *, max_tokens=None, temperature=0.0):  # noqa: ARG002
        self.text_calls += 1
        return TextCompletion(content=self._text, prompt_tokens=100, completion_tokens=50)

    async def multimodal_complete(
        self, prompt, *, image_b64, max_tokens=None, temperature=0.0
    ):  # noqa: ARG002
        self.multimodal_calls += 1
        return TextCompletion(content=self._mm, prompt_tokens=200, completion_tokens=80)


@pytest.mark.asyncio
async def test_multimodal_complete_maps_to_items():
    """R27: normalize_via_llm_multimodal корректно маппит ответ в NormalizedPage."""
    mm_resp = json.dumps(
        {
            "new_section": "Вентиляция",
            "new_sticky": "",
            "items": [
                {
                    "name": "Вентилятор",
                    "model_name": "WNK-100",
                    "brand": "",
                    "manufacturer": "ООО КОРФ",
                    "unit": "шт",
                    "quantity": 3,
                    "comments": "",
                }
            ],
        }
    )
    provider = _MultimodalStubProvider(text_resp="{}", multimodal_resp=mm_resp)
    rows = [_row(0, {"name": "Вентилятор"})]
    page = await normalize_via_llm_multimodal(
        provider, rows, image_b64="AAAA", page_number=1
    )
    assert provider.multimodal_calls == 1
    assert len(page.items) == 1
    assert page.items[0].model_name == "WNK-100"
    assert page.items[0].manufacturer == "ООО КОРФ"
    assert page.prompt_tokens == 200


@pytest.mark.asyncio
async def test_multimodal_empty_rows_no_call():
    """R27: пустые rows → мок multimodal не вызывается (early-return)."""
    provider = _MultimodalStubProvider(text_resp="{}", multimodal_resp="{}")
    page = await normalize_via_llm_multimodal(
        provider, [], image_b64="AAAA", page_number=1
    )
    assert provider.multimodal_calls == 0
    assert page.items == []


@pytest.mark.asyncio
async def test_multimodal_invalid_json_raises():
    provider = _MultimodalStubProvider(
        text_resp="{}", multimodal_resp="not-a-json",
    )
    rows = [_row(0, {"name": "X"})]
    with pytest.raises(LLMNormalizationError):
        await normalize_via_llm_multimodal(
            provider, rows, image_b64="AAAA", page_number=1
        )


@pytest.mark.asyncio
async def test_column_shift_does_not_happen_when_llm_obeys():
    """Sanity: если LLM корректно скопировал cells → items, brand не утекает в
    model_name. Это gating-test для правила 0 (сам тест не гарантирует, что
    prompt сработает на LLM, но проверяет что мок-путь отдаёт поля 1:1)."""
    resp = json.dumps(
        {
            "new_section": "Оборудование автоматизации",
            "new_sticky": "",
            "items": [
                {
                    "name": "Комплект автоматизации для приточной установки П1",
                    "model_name": "",
                    "brand": "ООО \"КОРФ\"",
                    "unit": "шт.",
                    "quantity": 1.0,
                    "comments": "-учтено разделом ИОС4",
                    "system_prefix": "",
                }
            ],
        }
    )
    provider = _StubProvider(resp)
    rows = [
        _row(
            0,
            {
                "name": "1.1 Комплект автоматизации для приточной установки П1",
                "brand": "ООО \"КОРФ\"",
                "unit": "шт.",
                "qty": "1,00",
                "comments": "-учтено разделом ИОС4",
            },
        )
    ]
    page = await normalize_via_llm(provider, rows, page_number=1)
    assert len(page.items) == 1
    it = page.items[0]
    assert it.unit == "шт."
    assert it.quantity == 1.0
    assert "КОРФ" in it.brand
    # Главное — brand НЕ должен утечь в model_name.
    assert "КОРФ" not in it.model_name

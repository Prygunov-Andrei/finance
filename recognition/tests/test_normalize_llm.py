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
    normalize_via_llm,
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

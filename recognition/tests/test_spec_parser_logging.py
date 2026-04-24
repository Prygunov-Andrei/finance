"""DEV-BACKLOG #16: `_process_page` пишет traceback через logger.exception.

Без traceback в логах регрессию в parse_page_items / extract_structured_rows
ловим только по пропавшим items, не по stack.
"""

from __future__ import annotations

import inspect
import logging
from typing import Any
from unittest.mock import patch

import pytest

from app.providers.base import BaseLLMProvider
from app.services import spec_parser
from app.services.spec_parser import SpecParser


class _FailingProvider(BaseLLMProvider):
    async def vision_complete(self, image_b64: str, prompt: str) -> str:  # noqa: ARG002
        raise RuntimeError("boom")

    async def aclose(self) -> None:
        return None


def test_process_page_uses_logger_exception_not_warning():
    """Структурная защита: код _process_page явно вызывает logger.exception."""
    src = inspect.getsource(SpecParser._process_page)
    # Последний except-блок должен логировать через .exception(…) — это
    # добавляет traceback в JSON log.
    assert "logger.exception(" in src, (
        "_process_page должен писать traceback через logger.exception"
    )


@pytest.mark.asyncio
async def test_process_page_writes_traceback_on_exception(caplog):
    """Integration: если что-то упало в обработке страницы, caplog содержит
    запись с exc_info (traceback), а не голый warning."""
    parser = SpecParser(_FailingProvider())

    class _FakePage:
        rotation = 0

        def get_text(self, *_args: Any, **_kwargs: Any) -> str:
            return ""

    class _FakeDoc:
        def __getitem__(self, _idx: int) -> Any:
            return _FakePage()

    # has_usable_text_layer возвращает False → идём в Vision.
    # render_page_to_b64 роняется → попадаем в except.
    with (
        patch(
            "app.services.spec_parser.has_usable_text_layer",
            return_value=False,
        ),
        patch(
            "app.services.spec_parser.render_page_to_b64",
            side_effect=RuntimeError("render exploded"),
        ),
        caplog.at_level(logging.ERROR, logger=spec_parser.logger.name),
    ):
        await parser._process_page(_FakeDoc(), page_num=0)

    records = [r for r in caplog.records if "spec_parse page error" in r.message]
    assert records, "нет записи spec_parse page error"
    # exc_info фиксируется logger.exception — это и есть traceback.
    assert records[0].exc_info is not None, "нет traceback в записи (exc_info None)"
    # errors-список состояния тоже должен пополниться — контракт build_partial.
    assert any("render exploded" in e for e in parser.state.errors)

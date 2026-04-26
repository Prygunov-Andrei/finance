"""Tests for E19-1: async spec parsing endpoint + callbacks + cancellation."""

from __future__ import annotations

import asyncio
from typing import Any

import httpx
import pytest
from httpx import ASGITransport

from app.api.parse import get_provider
from app.main import app
from app.providers.base import BaseLLMProvider
from app.schemas.spec import PagesStats, SpecItem, SpecParseResponse
from app.services import job_registry, spec_parser  # noqa: I001

# Достаточно валидного PDF magic для прохождения _read_pdf проверок.
# SpecParser.parse в тестах замоканa, реальный fitz.open не дёргается.
PDF_BYTES = b"%PDF-1.4\n%fake-content-for-tests\n"


class _NoopProvider(BaseLLMProvider):
    async def vision_complete(self, image_b64: str, prompt: str) -> str:  # noqa: ARG002
        return "{}"

    async def aclose(self) -> None:
        return None


@pytest.fixture
def captured_callbacks(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    """Перехватывает POST-callback'и из `_run_async_spec_job` и складывает
    payload'ы в список. Заменяет httpx.AsyncClient в namespace модуля parse."""
    events: list[dict[str, Any]] = []

    class _FakeResponse:
        status_code = 200

        def raise_for_status(self) -> None:
            return None

    class _FakeAsyncClient:
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            pass

        async def __aenter__(self) -> _FakeAsyncClient:
            return self

        async def __aexit__(self, *args: Any) -> None:
            return None

        async def post(
            self,
            url: str,
            json: dict[str, Any] | None = None,
            headers: dict[str, str] | None = None,
        ) -> _FakeResponse:
            events.append(
                {"url": url, "json": json or {}, "headers": headers or {}}
            )
            return _FakeResponse()

    monkeypatch.setattr("app.api.parse._make_callback_client", _FakeAsyncClient)
    return events


@pytest.fixture
def provider_override() -> Any:
    app.dependency_overrides[get_provider] = lambda: _NoopProvider()
    yield
    app.dependency_overrides.clear()


async def _drain_jobs() -> None:
    """Дождаться завершения всех зарегистрированных background-task'ов.

    `_run_async_spec_job` сам зовёт `job_registry.cleanup` в finally, но
    тестам важно дождаться именно завершения, чтобы collected events
    были полными. Делаем snapshot before-cleanup и await каждой Task.
    """
    async with job_registry._LOCK:
        snapshot = list(job_registry._JOBS.values())
    for task in snapshot:
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass


def _post_files() -> dict[str, Any]:
    return {"file": ("test.pdf", PDF_BYTES, "application/pdf")}


def _headers(job_id: str = "test-job-1", token: str = "tok") -> dict[str, str]:
    return {
        "X-API-Key": "test-key",
        "X-Callback-URL": "http://callback.example.test/cb",
        "X-Job-Id": job_id,
        "X-Callback-Token": token,
    }


@pytest.mark.asyncio
async def test_async_endpoint_returns_202_immediately(
    monkeypatch: pytest.MonkeyPatch,
    captured_callbacks: list[dict[str, Any]],
    provider_override: Any,  # noqa: ARG001
) -> None:
    async def fake_parse(
        self: Any,
        pdf_bytes: bytes,
        filename: str = "x.pdf",
        *,
        on_page_done: Any = None,
    ) -> SpecParseResponse:
        if on_page_done:
            await on_page_done(1, [{"name": "ItemA", "quantity": 1}])
            await on_page_done(2, [{"name": "ItemB", "quantity": 2}])
        return SpecParseResponse(
            status="done",
            items=[
                SpecItem(name="ItemA", page_number=1, sort_order=1),
                SpecItem(name="ItemB", page_number=2, sort_order=2),
            ],
            pages_stats=PagesStats(total=2, processed=2),
        )

    monkeypatch.setattr(spec_parser.SpecParser, "parse", fake_parse)

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/v1/parse/spec/async",
            files=_post_files(),
            headers=_headers("job-A"),
        )

    assert resp.status_code == 202
    body = resp.json()
    assert body == {"status": "accepted", "job_id": "job-A"}

    await _drain_jobs()

    events = [e["json"]["event"] for e in captured_callbacks]
    assert events[0] == "started"
    assert events[-1] == "finished"
    assert events.count("page_done") == 2

    started = captured_callbacks[0]["json"]
    assert started["job_id"] == "job-A"
    assert started["filename"] == "test.pdf"

    page_done = [e["json"] for e in captured_callbacks if e["json"]["event"] == "page_done"]
    assert page_done[0]["page"] == 1
    assert page_done[0]["partial_count"] == 1
    assert page_done[1]["page"] == 2
    assert page_done[1]["partial_count"] == 2
    assert page_done[0]["items"] == [{"name": "ItemA", "quantity": 1}]

    finished = captured_callbacks[-1]["json"]
    assert finished["status"] == "done"
    assert len(finished["items"]) == 2
    assert finished["pages_stats"]["total"] == 2
    assert finished["llm_costs"] == {}

    # X-Callback-Token прокидывается в каждый callback request.
    for cb in captured_callbacks:
        assert cb["headers"].get("X-Callback-Token") == "tok"


@pytest.mark.asyncio
async def test_async_endpoint_generates_job_id_when_missing(
    monkeypatch: pytest.MonkeyPatch,
    captured_callbacks: list[dict[str, Any]],  # noqa: ARG001
    provider_override: Any,  # noqa: ARG001
) -> None:
    async def fake_parse(
        self: Any, pdf_bytes: bytes, filename: str = "x.pdf", *, on_page_done: Any = None
    ) -> SpecParseResponse:
        return SpecParseResponse(status="done", pages_stats=PagesStats(total=0))

    monkeypatch.setattr(spec_parser.SpecParser, "parse", fake_parse)

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/v1/parse/spec/async",
            files=_post_files(),
            headers={
                "X-API-Key": "test-key",
                "X-Callback-URL": "http://cb/x",
                # X-Job-Id отсутствует — recognition сгенерит uuid.
            },
        )

    assert resp.status_code == 202
    body = resp.json()
    assert body["status"] == "accepted"
    assert len(body["job_id"]) >= 32  # uuid4 в hex/dashes

    await _drain_jobs()


@pytest.mark.asyncio
async def test_async_cancel_emits_cancelled_callback(
    monkeypatch: pytest.MonkeyPatch,
    captured_callbacks: list[dict[str, Any]],
    provider_override: Any,  # noqa: ARG001
) -> None:
    parse_started = asyncio.Event()

    async def slow_parse(
        self: Any, pdf_bytes: bytes, filename: str = "x.pdf", *, on_page_done: Any = None
    ) -> SpecParseResponse:
        parse_started.set()
        await asyncio.sleep(60)  # будем cancel'ить раньше
        return SpecParseResponse()  # pragma: no cover — недостижимо

    monkeypatch.setattr(spec_parser.SpecParser, "parse", slow_parse)

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/v1/parse/spec/async",
            files=_post_files(),
            headers=_headers("job-cancel"),
        )
        assert resp.status_code == 202

        # Дождаться что parse реально стартовал, чтобы cancel пришёл по
        # running task а не до её регистрации.
        await asyncio.wait_for(parse_started.wait(), timeout=2.0)

        cancel_resp = await client.post(
            "/v1/parse/spec/cancel/job-cancel",
            headers={"X-API-Key": "test-key"},
        )
        assert cancel_resp.status_code == 200
        assert cancel_resp.json() == {"cancelled": True}

    await _drain_jobs()

    events = [e["json"]["event"] for e in captured_callbacks]
    assert "started" in events
    assert events[-1] == "cancelled"


@pytest.mark.asyncio
async def test_async_cancel_unknown_job_returns_false(
    provider_override: Any,  # noqa: ARG001
) -> None:
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/v1/parse/spec/cancel/no-such-job",
            headers={"X-API-Key": "test-key"},
        )
    assert resp.status_code == 200
    assert resp.json() == {"cancelled": False}


@pytest.mark.asyncio
async def test_async_failure_emits_failed_callback(
    monkeypatch: pytest.MonkeyPatch,
    captured_callbacks: list[dict[str, Any]],
    provider_override: Any,  # noqa: ARG001
) -> None:
    async def boom_parse(
        self: Any, pdf_bytes: bytes, filename: str = "x.pdf", *, on_page_done: Any = None
    ) -> SpecParseResponse:
        raise RuntimeError("oopsie")

    monkeypatch.setattr(spec_parser.SpecParser, "parse", boom_parse)

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/v1/parse/spec/async",
            files=_post_files(),
            headers=_headers("job-fail"),
        )
        assert resp.status_code == 202

    await _drain_jobs()

    events = [e["json"]["event"] for e in captured_callbacks]
    assert events[0] == "started"
    assert events[-1] == "failed"
    failed = captured_callbacks[-1]["json"]
    assert failed["error"] == "oopsie"
    assert failed["code"] == "internal_error"


@pytest.mark.asyncio
async def test_async_multiple_jobs_concurrent(
    monkeypatch: pytest.MonkeyPatch,
    captured_callbacks: list[dict[str, Any]],
    provider_override: Any,  # noqa: ARG001
) -> None:
    """Два jobа стартуют конкурентно — оба должны получить полный набор
    events с правильными job_id."""

    async def fake_parse(
        self: Any, pdf_bytes: bytes, filename: str = "x.pdf", *, on_page_done: Any = None
    ) -> SpecParseResponse:
        # Небольшая yield-точка чтобы оба job'а реально пересеклись.
        await asyncio.sleep(0.01)
        if on_page_done:
            await on_page_done(1, [{"name": "P1"}])
        return SpecParseResponse(
            status="done",
            items=[SpecItem(name="P1", page_number=1, sort_order=1)],
            pages_stats=PagesStats(total=1, processed=1),
        )

    monkeypatch.setattr(spec_parser.SpecParser, "parse", fake_parse)

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        r1, r2 = await asyncio.gather(
            client.post(
                "/v1/parse/spec/async",
                files=_post_files(),
                headers=_headers("job-1"),
            ),
            client.post(
                "/v1/parse/spec/async",
                files=_post_files(),
                headers=_headers("job-2"),
            ),
        )
    assert r1.status_code == 202 and r2.status_code == 202

    await _drain_jobs()

    by_job: dict[str, list[str]] = {"job-1": [], "job-2": []}
    for cb in captured_callbacks:
        body = cb["json"]
        by_job.setdefault(body["job_id"], []).append(body["event"])

    for job_id in ("job-1", "job-2"):
        events = by_job[job_id]
        assert events[0] == "started"
        assert "page_done" in events
        assert events[-1] == "finished"


@pytest.mark.asyncio
async def test_async_callback_failure_does_not_break_parse(
    monkeypatch: pytest.MonkeyPatch,
    provider_override: Any,  # noqa: ARG001
) -> None:
    """ТЗ: НЕ ретраить callbacks. Если callback URL недоступен — лог
    warning, parse не падает, остальные события всё равно публикуются."""
    attempts: list[str] = []

    class _BrokenAsyncClient:
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            pass

        async def __aenter__(self) -> _BrokenAsyncClient:
            return self

        async def __aexit__(self, *args: Any) -> None:
            return None

        async def post(self, *args: Any, **kwargs: Any) -> Any:
            attempts.append("call")
            raise httpx.ConnectError("backend down")

    monkeypatch.setattr("app.api.parse._make_callback_client", _BrokenAsyncClient)

    async def fake_parse(
        self: Any, pdf_bytes: bytes, filename: str = "x.pdf", *, on_page_done: Any = None
    ) -> SpecParseResponse:
        if on_page_done:
            await on_page_done(1, [{"name": "X"}])
        return SpecParseResponse(status="done", pages_stats=PagesStats(total=1))

    monkeypatch.setattr(spec_parser.SpecParser, "parse", fake_parse)

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/v1/parse/spec/async",
            files=_post_files(),
            headers=_headers("job-broken"),
        )
        assert resp.status_code == 202

    await _drain_jobs()

    # 3 события (started, page_done, finished) — каждое попыталось вызвать
    # broken client. Recognition НЕ ретраит.
    assert len(attempts) == 3


@pytest.mark.asyncio
async def test_sync_endpoint_unchanged_no_callback(
    monkeypatch: pytest.MonkeyPatch,
    provider_override: Any,  # noqa: ARG001
) -> None:
    """Регрессия: sync /v1/parse/spec не должен падать на новом параметре
    on_page_done (default = None). Параллельно проверяем что callback в
    sync пути не вызывается."""
    callback_calls: list[Any] = []

    async def fake_parse(
        self: Any, pdf_bytes: bytes, filename: str = "x.pdf", *, on_page_done: Any = None
    ) -> SpecParseResponse:
        if on_page_done:
            callback_calls.append("called")
        return SpecParseResponse(status="done", pages_stats=PagesStats(total=0))

    monkeypatch.setattr(spec_parser.SpecParser, "parse", fake_parse)

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/v1/parse/spec",
            files=_post_files(),
            headers={"X-API-Key": "test-key"},
        )
    assert resp.status_code == 200
    assert callback_calls == []

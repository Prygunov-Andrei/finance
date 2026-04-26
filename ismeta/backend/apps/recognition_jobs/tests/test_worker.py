"""Тесты воркера: атомарный pick + dispatch."""

from __future__ import annotations

import asyncio
from unittest.mock import patch

import httpx
import pytest

from apps.estimate.models import Estimate
from apps.recognition_jobs import worker as worker_module
from apps.recognition_jobs.models import RecognitionJob
from apps.workspace.models import Workspace


@pytest.fixture(autouse=True)
def _settings(settings):
    settings.RECOGNITION_URL = "http://recognition:8003"
    settings.RECOGNITION_API_KEY = "test-key"
    settings.BACKEND_INTERNAL_URL = "http://ismeta-backend:8000"
    settings.RECOGNITION_MAX_PARALLEL_JOBS = 2
    settings.RECOGNITION_WORKER_POLL_INTERVAL = 0.05


@pytest.fixture()
def ws():
    return Workspace.objects.create(name="WS-WORKER", slug="ws-worker")


@pytest.fixture()
def estimate(ws):
    return Estimate.objects.create(
        workspace=ws, name="W",
        default_material_markup={"type": "percent", "value": 30},
        default_work_markup={"type": "percent", "value": 300},
    )


def _job(ws, estimate, **overrides):
    defaults = {
        "estimate": estimate,
        "workspace": ws,
        "file_name": "x.pdf",
        "file_blob": b"%PDF-1.4",
        "cancellation_token": "t",
    }
    defaults.update(overrides)
    return RecognitionJob.objects.create(**defaults)


@pytest.mark.django_db
class TestPickNextQueuedJob:
    def test_picks_oldest_queued(self, ws, estimate):
        old = _job(ws, estimate, file_name="old.pdf")
        _job(ws, estimate, file_name="new.pdf")
        picked = worker_module._pick_next_queued_job()
        assert picked is not None
        assert picked.id == old.id
        old.refresh_from_db()
        assert old.status == "running"
        assert old.started_at is not None

    def test_skips_non_queued(self, ws, estimate):
        _job(ws, estimate, status="done")
        _job(ws, estimate, status="running")
        picked = worker_module._pick_next_queued_job()
        assert picked is None

    def test_returns_none_when_empty(self):
        picked = worker_module._pick_next_queued_job()
        assert picked is None


class _FakeAsyncResp:
    def __init__(self, status_code: int = 202, text: str = "{}"):
        self.status_code = status_code
        self.text = text


class _FakeAsyncClient:
    """httpx.AsyncClient mock — записывает headers и files."""

    instances: list[_FakeAsyncClient] = []

    def __init__(self, *args, **kwargs):
        self.posts: list[tuple[str, dict, dict]] = []
        self.status_code = 202
        _FakeAsyncClient.instances.append(self)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def post(self, url, headers=None, files=None):
        self.posts.append((url, headers or {}, files or {}))
        return _FakeAsyncResp(self.status_code)


@pytest.mark.django_db
class TestPostToRecognition:
    """Unit-тесты чистой http-функции (без DB-side-effect'ов)."""

    def setup_method(self):
        _FakeAsyncClient.instances.clear()

    def test_post_includes_callback_headers_and_file(self, ws, estimate):
        job = _job(ws, estimate)
        with patch.object(worker_module.httpx, "AsyncClient", _FakeAsyncClient):
            status_code, _body = asyncio.run(worker_module._post_to_recognition(job))
        assert status_code == 202
        url, headers, files = _FakeAsyncClient.instances[0].posts[0]
        assert url == "http://recognition:8003/v1/parse/spec/async"
        assert headers["X-API-Key"] == "test-key"
        assert headers["X-Job-Id"] == str(job.id)
        assert headers["X-Callback-Token"] == "t"
        assert headers["X-Callback-URL"] == (
            f"http://ismeta-backend:8000/api/v1/recognition-jobs/{job.id}/callback/"
        )
        assert "file" in files

    def test_post_returns_status_code_on_non_202(self, ws, estimate):
        job = _job(ws, estimate)

        class _Client(_FakeAsyncClient):
            def __init__(self, *a, **kw):
                super().__init__(*a, **kw)
                self.status_code = 500

        with patch.object(worker_module.httpx, "AsyncClient", _Client):
            status_code, _body = asyncio.run(worker_module._post_to_recognition(job))
        assert status_code == 500

    def test_post_returns_none_on_transport_error(self, ws, estimate):
        job = _job(ws, estimate)

        class _Boom:
            def __init__(self, *a, **kw):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return None

            async def post(self, *a, **kw):
                raise httpx.ConnectError("boom")

        with patch.object(worker_module.httpx, "AsyncClient", _Boom):
            status_code, body = asyncio.run(worker_module._post_to_recognition(job))
        assert status_code is None
        assert "boom" in body


@pytest.mark.django_db
class TestMarkFailed:
    def test_mark_failed_updates_status_and_message(self, ws, estimate):
        job = _job(ws, estimate)
        worker_module._mark_failed(job.id, "boom 500")
        job.refresh_from_db()
        assert job.status == "failed"
        assert job.completed_at is not None
        assert job.error_message == "boom 500"


@pytest.mark.asyncio
async def test_run_worker_stops_on_event_when_idle():
    """run_worker корректно завершается по stop_event даже когда очередь пуста.

    Этот тест НЕ использует БД (mock'аем _pick_next_queued_job в None).
    Полноценный integration «pick + dispatch» проверяется через curl-демо
    (см. apps/recognition_jobs/README.md).
    """
    stop = asyncio.Event()
    with patch.object(worker_module, "_pick_next_queued_job", return_value=None):
        worker_task = asyncio.create_task(worker_module.run_worker(stop))
        await asyncio.sleep(0.05)
        stop.set()
        await asyncio.wait_for(worker_task, timeout=2.0)

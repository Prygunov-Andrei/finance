"""Тесты RecognitionJob: модель + properties."""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from apps.estimate.models import Estimate
from apps.recognition_jobs.models import RecognitionJob
from apps.workspace.models import Workspace

User = get_user_model()


@pytest.fixture()
def ws():
    return Workspace.objects.create(name="WS-RJ", slug="ws-rj")


@pytest.fixture()
def user():
    return User.objects.create_user(username="rj-user", password="pw")


@pytest.fixture()
def estimate(ws, user):
    return Estimate.objects.create(
        workspace=ws,
        name="RJ test",
        default_material_markup={"type": "percent", "value": 30},
        default_work_markup={"type": "percent", "value": 300},
        created_by=user,
    )


@pytest.fixture()
def job(ws, estimate, user):
    return RecognitionJob.objects.create(
        estimate=estimate,
        workspace=ws,
        file_name="spec.pdf",
        file_type="pdf",
        file_blob=b"%PDF-1.4 fake bytes",
        cancellation_token="testtoken",
        created_by=user,
    )


@pytest.mark.django_db
class TestRecognitionJobModel:
    def test_default_status_is_queued(self, job):
        assert job.status == RecognitionJob.STATUS_QUEUED
        assert job.is_active is True
        assert job.is_terminal is False

    def test_terminal_statuses(self, job):
        for s in (RecognitionJob.STATUS_DONE, RecognitionJob.STATUS_FAILED, RecognitionJob.STATUS_CANCELLED):
            job.status = s
            assert job.is_terminal is True
            assert job.is_active is False

    def test_duration_seconds_none_when_not_completed(self, job):
        assert job.duration_seconds is None
        job.started_at = timezone.now()
        assert job.duration_seconds is None

    def test_duration_seconds_computed(self, job):
        now = timezone.now()
        job.started_at = now
        job.completed_at = now + timedelta(seconds=42)
        assert job.duration_seconds == 42

    def test_str(self, job):
        assert "queued" in str(job)
        assert "spec.pdf" in str(job)

    def test_indexes_present(self):
        meta = RecognitionJob._meta
        index_fields = {tuple(idx.fields) for idx in meta.indexes}
        assert ("status", "created_at") in index_fields
        assert ("estimate", "created_at") in index_fields

"""Запуск воркера RecognitionJob (E19-2).

Использование:
    python manage.py recognition_worker

В docker-compose поднимается отдельным sidecar-сервисом `recognition-worker`.
"""

import asyncio

from django.core.management.base import BaseCommand

from apps.recognition_jobs.worker import run_worker


class Command(BaseCommand):
    help = "Run recognition jobs worker (async dispatch loop)."

    def handle(self, *args, **options):
        asyncio.run(run_worker())

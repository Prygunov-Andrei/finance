"""Клиент для постановки задач в Celery через Redis."""

from celery import Celery
from config import settings

celery_app = Celery(
    'finans_assistant',
    broker=settings.REDIS_URL,
)


def schedule_media_download(media_id: str):
    """Ставит задачу на скачивание медиа из Telegram."""
    celery_app.send_task(
        'worklog.tasks.download_media_from_telegram',
        args=[media_id],
        queue='default',
    )

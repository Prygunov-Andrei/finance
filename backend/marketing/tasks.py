import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=120)
def publish_mp_to_avito(self, mounting_proposal_id):
    """Публикация МП на Avito."""
    try:
        from marketing.services.avito_publisher import AvitoPublisherService
        result = AvitoPublisherService().publish_mounting_proposal(mounting_proposal_id)
        logger.info('МП #%d опубликовано на Avito: %s', mounting_proposal_id, result.get('status'))
        return result
    except Exception as exc:
        logger.exception('Ошибка публикации МП #%d на Avito: %s', mounting_proposal_id, exc)
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=2, default_retry_delay=300)
def sync_avito_stats(self):
    """Обновление статистики опубликованных объявлений."""
    from marketing.models import AvitoPublishedListing
    count = AvitoPublishedListing.objects.filter(status='published').count()
    logger.info('sync_avito_stats: %d опубликованных объявлений (stub)', count)
    return {'status': 'stub', 'count': count}


@shared_task
def refresh_avito_token():
    """Проактивное обновление OAuth-токена Avito."""
    from marketing.models import AvitoConfig
    config = AvitoConfig.get()
    if not config.client_id or not config.client_secret:
        logger.debug('Avito credentials не настроены, пропуск refresh_avito_token')
        return {'status': 'skipped'}
    logger.info('refresh_avito_token: stub')
    return {'status': 'stub'}


@shared_task
def cleanup_old_listings():
    """Удалить отклонённые листинги старше 90 дней."""
    from datetime import timedelta

    from django.utils import timezone

    from marketing.models import AvitoListing

    cutoff = timezone.now() - timedelta(days=90)
    deleted, _ = AvitoListing.objects.filter(
        status=AvitoListing.Status.REJECTED,
        discovered_at__lt=cutoff,
    ).delete()
    logger.info('cleanup_old_listings: удалено %d записей', deleted)
    return {'deleted': deleted}


@shared_task(bind=True, max_retries=1, default_retry_delay=60)
def execute_campaign_task(self, campaign_id):
    """Отправка email/SMS рассылки."""
    try:
        from marketing.services.campaign_service import CampaignService
        CampaignService().execute_campaign(campaign_id)
        logger.info('Рассылка #%d выполнена', campaign_id)
    except Exception as exc:
        logger.exception('Ошибка рассылки #%d: %s', campaign_id, exc)
        raise self.retry(exc=exc)

"""
Celery-задачи для HVAC-новостей.
Заменяет threading для discovery и реализует AI-рейтинг.
"""
import logging
import time as _time
from celery import shared_task
from django.contrib.auth import get_user_model

logger = logging.getLogger(__name__)
User = get_user_model()


# ============================================================================
# Discovery задачи (замена threading)
# ============================================================================

@shared_task(bind=True, max_retries=1, default_retry_delay=60)
def discover_news_for_resource_task(self, resource_id, provider='auto', user_id=None,
                                     config_id=None):
    """
    Поиск новостей для одного источника.
    Замена threading.Thread в references/views.py.
    """
    from news.discovery_service import NewsDiscoveryService
    from news.models import SearchConfiguration
    from references.models import NewsResource

    start_time = _time.monotonic()
    resource = NewsResource.objects.get(id=resource_id)
    user = User.objects.get(id=user_id) if user_id else None
    config = SearchConfiguration.objects.get(id=config_id) if config_id else None

    logger.info(
        "Celery discovery started for resource %s (%s), provider=%s",
        resource.id, resource.name, provider,
    )
    try:
        service = NewsDiscoveryService(user=user, config=config)
        created, errors, error_msg = service.discover_news_for_resource(
            resource, provider=provider
        )
        duration = _time.monotonic() - start_time
        logger.info(
            "Celery discovery finished for resource %s: created=%s, errors=%s, "
            "provider=%s, duration=%.1fs",
            resource.id, created, errors, provider, duration,
        )
        return {'created': created, 'errors': errors, 'error_msg': error_msg}
    except Exception as e:
        duration = _time.monotonic() - start_time
        logger.error(
            "Celery discovery failed for resource %s after %.1fs: %s",
            resource.id, duration, str(e), exc_info=True,
        )
        raise self.retry(exc=e)


@shared_task(bind=True, max_retries=1, default_retry_delay=60)
def discover_all_resources_task(self, user_id=None, config_id=None, provider='auto',
                                 last_search_date_override=None):
    """
    Поиск новостей по всем автоматическим источникам.
    Замена threading.Thread в references/admin.py.
    """
    from news.discovery_service import NewsDiscoveryService
    from news.models import SearchConfiguration, NewsDiscoveryStatus

    user = User.objects.get(id=user_id) if user_id else None
    config = SearchConfiguration.objects.get(id=config_id) if config_id else None

    logger.info("Celery discovery started for all resources, provider=%s", provider)

    try:
        service = NewsDiscoveryService(user=user, config=config)
        status_obj = NewsDiscoveryStatus.create_new_status(
            total_count=0,
            search_type='resources',
            provider=provider,
        )
        stats = service.discover_all_resources_news(
            status_obj=status_obj,
            last_search_date_override=last_search_date_override,
        )
        logger.info("Celery discovery for all resources completed: %s", stats)

        # Запускаем рейтинг автоматически после discovery
        if service.current_run:
            rate_news_task.delay(discovery_run_id=service.current_run.id)

        return stats
    except Exception as e:
        logger.error("Celery discovery for all resources failed: %s", str(e), exc_info=True)
        raise self.retry(exc=e)


@shared_task(bind=True, max_retries=1, default_retry_delay=60)
def discover_all_manufacturers_task(self, user_id=None, config_id=None, provider='auto',
                                      last_search_date_override=None):
    """
    Поиск новостей по всем производителям.
    Замена threading.Thread в references/admin.py.
    """
    from news.discovery_service import NewsDiscoveryService
    from news.models import SearchConfiguration, NewsDiscoveryStatus

    user = User.objects.get(id=user_id) if user_id else None
    config = SearchConfiguration.objects.get(id=config_id) if config_id else None

    logger.info("Celery discovery started for all manufacturers, provider=%s", provider)

    try:
        service = NewsDiscoveryService(user=user, config=config)
        status_obj = NewsDiscoveryStatus.create_new_status(
            total_count=0,
            search_type='manufacturers',
            provider=provider,
        )
        stats = service.discover_all_manufacturers_news(
            status_obj=status_obj,
            last_search_date_override=last_search_date_override,
        )
        logger.info("Celery discovery for all manufacturers completed: %s", stats)

        # Запускаем рейтинг автоматически после discovery
        if service.current_run:
            rate_news_task.delay(discovery_run_id=service.current_run.id)

        return stats
    except Exception as e:
        logger.error("Celery discovery for all manufacturers failed: %s", str(e), exc_info=True)
        raise self.retry(exc=e)


# ============================================================================
# Rating задачи
# ============================================================================

@shared_task(bind=True, max_retries=2, default_retry_delay=60)
def rate_news_task(self, discovery_run_id=None, config_id=None):
    """
    AI-рейтинг всех неоценённых новостей.
    Запускается автоматически после discovery или вручную.
    """
    from news.rating_service import NewsRatingService
    from news.models import RatingConfiguration, NewsDiscoveryRun

    logger.info("Celery rating task started, discovery_run_id=%s", discovery_run_id)

    try:
        config = RatingConfiguration.objects.get(id=config_id) if config_id else None
        discovery_run = NewsDiscoveryRun.objects.get(id=discovery_run_id) if discovery_run_id else None

        service = NewsRatingService(config=config)
        result = service.rate_unrated_news(discovery_run=discovery_run)

        logger.info("Celery rating task completed: %s", result)

        # После рейтинга запускаем обнаружение дубликатов
        detect_duplicates_task.delay(config_id=config_id)

        return result
    except Exception as e:
        logger.error("Celery rating task failed: %s", str(e), exc_info=True)
        raise self.retry(exc=e)


@shared_task(bind=True, max_retries=1, default_retry_delay=120)
def detect_duplicates_task(self, news_ids=None, config_id=None):
    """
    Обнаружение и объединение дубликатов новостей.
    """
    from news.rating_service import NewsRatingService

    logger.info("Celery duplicate detection started")

    try:
        config = None
        if config_id:
            from news.models import RatingConfiguration
            config = RatingConfiguration.objects.get(id=config_id)

        service = NewsRatingService(config=config)
        result = service.detect_duplicates(news_ids=news_ids)

        logger.info("Celery duplicate detection completed: %s", result)
        return result
    except Exception as e:
        logger.error("Celery duplicate detection failed: %s", str(e), exc_info=True)
        raise self.retry(exc=e)


@shared_task(bind=True)
def analyze_published_news_task(self, config_id=None):
    """
    Одноразовый анализ опубликованных новостей для вывода паттернов.
    """
    from news.rating_service import NewsRatingService

    logger.info("Celery analysis of published news started")

    try:
        config = None
        if config_id:
            from news.models import RatingConfiguration
            config = RatingConfiguration.objects.get(id=config_id)

        service = NewsRatingService(config=config)
        result = service.analyze_published_news()

        logger.info("Celery analysis completed")
        return result
    except Exception as e:
        logger.error("Celery analysis failed: %s", str(e), exc_info=True)
        raise

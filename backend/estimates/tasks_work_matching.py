"""Celery tasks для фонового подбора работ.

Использует общий RedisSessionManager из redis_session.py.
"""
import json
import logging
import time

from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded

from estimates.services.redis_session import RedisSessionManager
from estimates.services.work_matching.knowledge import save_knowledge
from estimates.services.work_matching.pipeline import MatchingContext, match_single_item
from estimates.services.work_matching.service import LOCK_PREFIX, REDIS_PREFIX

logger = logging.getLogger(__name__)

session_mgr = RedisSessionManager(prefix=REDIS_PREFIX)


@shared_task(bind=True, max_retries=0, time_limit=1800, soft_time_limit=1700)
def process_work_matching(self, session_id: str):
    """Фоновый подбор работ. Redis session → pipeline → результаты."""
    data = session_mgr.get(session_id)
    if not data:
        logger.warning('Session %s not found in Redis', session_id)
        return

    estimate_id = int(data['estimate_id'])

    try:
        _run_matching(session_id, estimate_id)
    except SoftTimeLimitExceeded:
        logger.warning('Work matching %s timed out (soft limit)', session_id)
        errors = json.loads(session_mgr.get_field(session_id, 'errors') or '[]')
        errors.append({'error': 'Превышено время выполнения. Частичные результаты доступны.'})
        session_mgr.update(session_id, {'status': 'error', 'errors': json.dumps(errors)})
    except Exception:
        logger.exception('Work matching %s failed', session_id)
        errors = json.loads(session_mgr.get_field(session_id, 'errors') or '[]')
        errors.append({'error': 'Внутренняя ошибка. Частичные результаты доступны.'})
        session_mgr.update(session_id, {'status': 'error', 'errors': json.dumps(errors)})
    finally:
        session_mgr.delete_key(f'{LOCK_PREFIX}:{estimate_id}')


def _run_matching(session_id: str, estimate_id: int):
    """Основной цикл подбора."""
    from estimates.models import Estimate, EstimateItem

    estimate = Estimate.objects.select_related('price_list').get(pk=estimate_id)

    items = list(
        EstimateItem.objects.filter(
            estimate=estimate, work_item__isnull=True,
        )
        .select_related('product', 'product__category', 'product__default_work_item',
                         'product__default_work_item__section')
        .order_by('sort_order', 'pk')
    )

    session_mgr.update(session_id, {'total_items': str(len(items))})

    if not items:
        session_mgr.update(session_id, {'status': 'completed'})
        return

    ctx = MatchingContext(estimate)

    raw = session_mgr.get(session_id)
    results = json.loads(raw.get('results', '[]')) if raw else []
    processed_ids = {r_['item_id'] for r_ in results}
    stats = json.loads(raw.get('stats', '{}')) if raw else {}

    for i, item in enumerate(items):
        if session_mgr.is_cancelled(session_id):
            logger.info('Session %s cancelled, stopping', session_id)
            break

        if item.id in processed_ids:
            continue

        session_mgr.update(session_id, {
            'current_item': str(i + 1),
            'current_tier': 'matching',
        })

        try:
            result = match_single_item(item, ctx)
        except Exception:
            logger.exception('Failed to match item %d', item.id)
            result = {
                'item_id': item.id, 'item_name': item.name,
                'matched_work': None, 'alternatives': [],
                'confidence': 0.0, 'source': 'unmatched', 'llm_reasoning': '',
            }

        results.append(result)

        source = result.get('source', 'unmatched')
        stats[source] = stats.get(source, 0) + 1

        # Сохранить знания для LLM и Web результатов
        if source in ('llm', 'web') and result.get('matched_work'):
            try:
                from pricelists.models import WorkItem
                wi = WorkItem.objects.get(pk=result['matched_work']['id'])
                save_knowledge(
                    item_name=item.name, work_item=wi, source=source,
                    confidence=result['confidence'],
                    llm_reasoning=result.get('llm_reasoning', ''),
                    web_query=result.get('web_search_query', ''),
                    web_summary=result.get('web_search_result_summary', ''),
                )
            except Exception:
                logger.exception('Failed to save knowledge for item %d', item.id)

        session_mgr.update(session_id, {
            'results': json.dumps(results),
            'stats': json.dumps(stats),
            'current_tier': source,
        })

    # Завершение
    if not session_mgr.is_cancelled(session_id):
        session_mgr.update(session_id, {'status': 'completed'})

    logger.info('Work matching %s completed: %s', session_id, json.dumps(stats))


@shared_task
def recover_stuck_work_matching():
    """Находит сессии stuck > 15 мин, помечает как error."""
    try:
        keys = session_mgr.scan_sessions()
    except RuntimeError:
        return

    for key in keys:
        from estimates.services.redis_session import get_redis
        r = get_redis()
        data = r.hgetall(key)
        if data.get('status') != 'processing':
            continue
        started = float(data.get('started_at', 0))
        if time.time() - started > 900:
            sid = key.split(':')[-1]
            logger.warning('Recovering stuck work matching session: %s', sid)
            errors = json.loads(data.get('errors', '[]'))
            errors.append({'error': 'Сессия прервана (timeout). Частичные результаты доступны.'})
            session_mgr.update(sid, {'status': 'error', 'errors': json.dumps(errors)})
            estimate_id = data.get('estimate_id')
            if estimate_id:
                session_mgr.delete_key(f'{LOCK_PREFIX}:{estimate_id}')


@shared_task
def sync_knowledge_md_task():
    """Периодическая синхронизация .md файлов знаний → БД."""
    from django.core.management import call_command
    try:
        call_command('sync_knowledge_md')
    except Exception:
        logger.exception('sync_knowledge_md failed')

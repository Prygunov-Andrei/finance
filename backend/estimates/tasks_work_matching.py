"""Celery tasks для фонового подбора работ.

Двухпроходная архитектура:
  Pass 1: быстрые тиры 0-5 (CPU/memory) — все строки
  Pass 2: LLM-батчинг (тир 6) + Web Search (тир 7) — только unmatched

Использует общий RedisSessionManager из redis_session.py.
"""
import json
import logging
import time

from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded

from estimates.services.redis_session import RedisSessionManager
from estimates.services.work_matching.knowledge import save_knowledge
from estimates.services.work_matching.pipeline import (
    MatchingContext, match_single_item, match_single_item_fast,
)
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
    """Двухпроходный подбор работ.

    Pass 1: быстрые тиры 0-5 (CPU/memory, ~0.01 сек/строка)
    Pass 2: LLM batch (тир 6, по 5 штук) + Web Search (тир 7, по 1)
    """
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

    ctx = MatchingContext(estimate, items=items)

    # Fallback: resolve "то же" для старых смет (импортированных до фикса)
    from estimates.services.ditto_resolver import is_ditto, resolve_ditto
    last_real_name = None
    ditto_map = {}
    for item in items:
        if is_ditto(item.name):
            if last_real_name:
                ditto_map[item.id] = resolve_ditto(item.name, last_real_name)
        else:
            if item.name.strip():
                last_real_name = item.name
    if ditto_map:
        logger.info('Resolved %d "то же" items for matching', len(ditto_map))

    raw = session_mgr.get(session_id)
    stats = json.loads(raw.get('stats', '{}')) if raw else {}

    # Восстановление после рестарта
    existing_results = session_mgr.get_all_results(session_id)
    processed_ids = {r_['item_id'] for r_ in existing_results}

    # ======== Pass 1: быстрые тиры 0-5 ========
    unmatched_items = []

    for i, item in enumerate(items):
        if session_mgr.is_cancelled(session_id):
            logger.info('Session %s cancelled, stopping at pass 1', session_id)
            break

        if item.id in processed_ids:
            continue

        # Подменить "то же" на реальное имя (временно, без сохранения в БД)
        original_name = item.name
        if item.id in ditto_map:
            item.name = ditto_map[item.id]

        session_mgr.update(session_id, {
            'current_item': str(i + 1),
            'current_tier': 'pass1',
            'current_item_name': item.name[:100],
        })

        try:
            result = match_single_item_fast(item, ctx)
        except Exception:
            logger.exception('Fast match failed for item %d', item.id)
            result = None
        finally:
            item.name = original_name

        if result:
            source = result.get('source', 'unmatched')
            stats[source] = stats.get(source, 0) + 1
            session_mgr.append_result(session_id, result)
            session_mgr.update(session_id, {
                'stats': json.dumps(stats),
                'current_tier': source,
            })
        else:
            unmatched_items.append(item)

    logger.info(
        'Pass 1 done for %s: %d matched, %d unmatched',
        session_id, len(items) - len(unmatched_items), len(unmatched_items),
    )

    # ======== Pass 2: LLM batch (тир 6) + Web Search (тир 7) ========
    # Подменить "то же" на реальное имя для LLM (временно)
    originals_pass2 = {}
    for item in unmatched_items:
        if item.id in ditto_map:
            originals_pass2[item.id] = item.name
            item.name = ditto_map[item.id]

    if unmatched_items and not session_mgr.is_cancelled(session_id):
        from estimates.services.work_matching.tiers import Tier6LLM, Tier7WebSearch
        from estimates.services.work_matching.pipeline import _result_to_dict, _get_alternatives

        tier6 = Tier6LLM()
        tier7 = Tier7WebSearch()
        batch_size = tier6.BATCH_SIZE
        total = len(items)

        # Номер текущей строки в общем списке (для прогресс-бара)
        base_item_num = total - len(unmatched_items)

        # Батчинг LLM: по batch_size штук
        for batch_start in range(0, len(unmatched_items), batch_size):
            if session_mgr.is_cancelled(session_id):
                break

            batch = unmatched_items[batch_start:batch_start + batch_size]
            item_num = base_item_num + batch_start + len(batch)

            session_mgr.update(session_id, {
                'current_item': str(item_num),
                'current_tier': 'pass2_llm',
                'current_item_name': batch[0].name[:100],
            })

            # LLM batch
            items_with_candidates = [
                (item, ctx.fuzzy_candidates.get(item.id, []))
                for item in batch
            ]
            try:
                batch_results = tier6.match_batch(items_with_candidates, ctx)
            except Exception:
                logger.exception('LLM batch failed for %d items', len(batch))
                batch_results = {}

            for item in batch:
                if session_mgr.is_cancelled(session_id):
                    break

                llm_result = batch_results.get(item.id)

                if llm_result and llm_result.confidence >= tier6.THRESHOLD:
                    result = _result_to_dict(item, llm_result, ctx)
                else:
                    # Fallback: Tier 7 Web Search (per-item)
                    session_mgr.update(session_id, {
                        'current_tier': 'pass2_web',
                        'current_item_name': item.name[:100],
                    })
                    try:
                        web_match = tier7.match(item, ctx)
                    except Exception:
                        logger.exception('Web search failed for item %d', item.id)
                        web_match = None

                    if web_match and web_match.confidence >= tier7.THRESHOLD:
                        result = _result_to_dict(item, web_match, ctx)
                    else:
                        result = {
                            'item_id': item.id, 'item_name': item.name,
                            'matched_work': None,
                            'alternatives': _get_alternatives(item, ctx),
                            'confidence': 0.0, 'source': 'unmatched',
                            'llm_reasoning': '',
                        }

                source = result.get('source', 'unmatched')
                stats[source] = stats.get(source, 0) + 1

                # Сохранить знания для LLM и Web результатов
                if source in ('llm', 'web') and result.get('matched_work'):
                    _save_knowledge_safe(item, result, source)

                session_mgr.append_result(session_id, result)
                session_mgr.update(session_id, {
                    'stats': json.dumps(stats),
                    'current_tier': source,
                })

    # Восстановить оригинальные имена после Pass 2
    for item_id, orig in originals_pass2.items():
        for item in unmatched_items:
            if item.id == item_id:
                item.name = orig
                break

    # Batch-update knowledge usage counts
    if ctx.knowledge_usage_updates:
        from catalog.models import ProductKnowledge
        from django.db.models import F
        ProductKnowledge.objects.filter(pk__in=set(ctx.knowledge_usage_updates)).update(
            usage_count=F('usage_count') + 1,
        )

    # Завершение
    if not session_mgr.is_cancelled(session_id):
        session_mgr.update(session_id, {'status': 'completed'})

    logger.info('Work matching %s completed: %s', session_id, json.dumps(stats))


def _save_knowledge_safe(item, result: dict, source: str):
    """Сохранить знания для LLM/Web результатов. Не бросает исключений."""
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

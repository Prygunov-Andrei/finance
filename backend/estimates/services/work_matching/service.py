"""WorkMatchingService — главный оркестратор подбора работ.

Используется и ERP, и публичным API. Управляет Redis-сессиями через
общий RedisSessionManager, делегирует matching в pipeline, сохраняет результаты.
"""
import json
import logging
import time
from decimal import Decimal
from typing import Optional

from django.db import transaction
from django.db.models import F

from catalog.models import Product, ProductWorkMapping
from estimates.models import Estimate, EstimateItem, suppress_item_signals
from estimates.services.redis_session import RedisSessionManager

from .knowledge import save_knowledge, verify_knowledge
from .man_hours import calculate_man_hours
from .pipeline import MatchingContext, match_single_item

logger = logging.getLogger(__name__)

REDIS_PREFIX = 'work_match'
LOCK_PREFIX = 'work_match_lock'

# Shared session manager (используется и сервисом, и Celery task)
session_mgr = RedisSessionManager(prefix=REDIS_PREFIX)


class WorkMatchingService:
    """Reusable service для подбора работ. ERP и public API."""

    def start_matching(self, estimate_id: int, user_id: int = 0) -> dict:
        """Создать Redis-сессию, поставить Celery-задачу.

        Returns:
            {'session_id': str, 'total_items': int}
        Raises:
            ValueError если подбор уже запущен на этой смете
        """
        estimate = Estimate.objects.get(pk=estimate_id)

        # Lock по estimate_id
        lock_key = f'{LOCK_PREFIX}:{estimate_id}'
        import uuid
        session_id_candidate = uuid.uuid4().hex[:16]
        if not session_mgr.set_lock(lock_key, session_id_candidate):
            existing_session = session_mgr.get_lock_value(lock_key)
            raise ValueError(f'ALREADY_RUNNING:{existing_session}')

        # Считаем строки для подбора
        total = EstimateItem.objects.filter(
            estimate=estimate, work_item__isnull=True,
        ).count()

        # Создать Redis-сессию
        session_id = session_mgr.create({
            'status': 'processing',
            'estimate_id': str(estimate_id),
            'user_id': str(user_id),
            'total_items': str(total),
            'current_item': '0',
            'current_tier': '',
            'results': '[]',
            'errors': '[]',
            'stats': json.dumps({
                'default': 0, 'history': 0, 'pricelist': 0, 'knowledge': 0,
                'category': 0, 'fuzzy': 0, 'llm': 0, 'web': 0, 'unmatched': 0,
            }),
            'started_at': str(time.time()),
            'man_hours_total': '0',
        })

        # Обновить lock с реальным session_id (create мог дать другой id)
        from estimates.services.redis_session import get_redis
        r = get_redis()
        r.set(lock_key, session_id, xx=True, ex=session_mgr.ttl)

        # Запустить Celery task
        from estimates.tasks_work_matching import process_work_matching
        process_work_matching.delay(session_id)

        return {'session_id': session_id, 'total_items': total}

    def get_progress(self, session_id: str) -> Optional[dict]:
        """Прочитать прогресс из Redis."""
        data = session_mgr.get(session_id)
        if not data:
            return None

        return {
            'session_id': session_id,
            'status': data.get('status', 'unknown'),
            'total_items': int(data.get('total_items', 0)),
            'current_item': int(data.get('current_item', 0)),
            'current_tier': data.get('current_tier', ''),
            'results': json.loads(data.get('results', '[]')),
            'stats': json.loads(data.get('stats', '{}')),
            'errors': json.loads(data.get('errors', '[]')),
            'man_hours_total': data.get('man_hours_total', '0'),
        }

    def cancel(self, session_id: str) -> bool:
        """Отменить подбор."""
        data = session_mgr.get(session_id)
        if not data:
            return False
        session_mgr.cancel(session_id)
        estimate_id = data.get('estimate_id')
        if estimate_id:
            session_mgr.delete_key(f'{LOCK_PREFIX}:{estimate_id}')
        return True

    @transaction.atomic
    def apply_results(self, session_id: str, items: list, user=None) -> dict:
        """Применить подобранные работы к смете."""
        data = session_mgr.get(session_id)
        estimate_id = int(data.get('estimate_id', 0)) if data else 0
        estimate = Estimate.objects.get(pk=estimate_id)

        applied = 0
        with suppress_item_signals():
            for item_data in items:
                item_id = item_data['item_id']
                work_item_id = item_data.get('work_item_id')
                work_price = item_data.get('work_price')

                if not work_item_id:
                    continue

                try:
                    est_item = EstimateItem.objects.select_related('product').get(pk=item_id)
                except EstimateItem.DoesNotExist:
                    continue

                est_item.work_item_id = work_item_id
                if work_price:
                    est_item.work_unit_price = Decimal(work_price)
                est_item.save(update_fields=['work_item', 'work_unit_price'])

                # Record mapping для обучения
                if est_item.product:
                    ProductWorkMapping.objects.update_or_create(
                        product=est_item.product,
                        work_item_id=work_item_id,
                        defaults={
                            'confidence': 1.0,
                            'source': ProductWorkMapping.Source.MANUAL,
                        }
                    )
                    ProductWorkMapping.objects.filter(
                        product=est_item.product,
                        work_item_id=work_item_id,
                    ).update(usage_count=F('usage_count') + 1)

                # Verify knowledge если был LLM/web
                item_normalized = Product.normalize_name(est_item.name)
                verify_knowledge(item_normalized, work_item_id, user=user)

                applied += 1

        # Расчёт человеко-часов
        man_hours = calculate_man_hours(estimate)

        # Снимаем lock
        session_mgr.delete_key(f'{LOCK_PREFIX}:{estimate_id}')

        return {
            'applied': applied,
            'man_hours': str(man_hours.quantize(Decimal('0.01'))),
        }

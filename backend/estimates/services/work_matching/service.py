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

        try:
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
        except Exception:
            session_mgr.delete_key(lock_key)
            raise

    def get_progress(self, session_id: str, include_results: bool = False) -> Optional[dict]:
        """Прочитать прогресс из Redis.

        Args:
            include_results: если True — включить полный массив результатов
                (тяжёлая операция, использовать только при завершении).
        """
        data = session_mgr.get(session_id)
        if not data:
            return None

        status_val = data.get('status', 'unknown')
        result = {
            'session_id': session_id,
            'status': status_val,
            'total_items': int(data.get('total_items', 0)),
            'current_item': int(data.get('current_item', 0)),
            'current_tier': data.get('current_tier', ''),
            'current_item_name': data.get('current_item_name', ''),
            'results': [],
            'stats': json.loads(data.get('stats', '{}')),
            'errors': json.loads(data.get('errors', '[]')),
            'man_hours_total': data.get('man_hours_total', '0'),
        }

        if include_results:
            # Новый формат: результаты в Redis LIST
            results = session_mgr.get_all_results(session_id)
            if results:
                result['results'] = results
            else:
                # Обратная совместимость: старые сессии хранили в hash
                result['results'] = json.loads(data.get('results', '[]'))

        return result

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
    def apply_results(self, session_id: str, items: list,
                      rejected_items: list = None, user=None) -> dict:
        """Применить подобранные работы к смете.

        Args:
            items: принятые — [{item_id, work_item_id, work_price}]
            rejected_items: отклонённые — [{item_id, work_item_id}]
        """
        data = session_mgr.get(session_id)
        estimate_id = int(data.get('estimate_id', 0)) if data else 0
        estimate = Estimate.objects.get(pk=estimate_id)

        # Batch: собрать все item_ids и загрузить разом
        valid_items = [d for d in items if d.get('work_item_id')]
        item_ids = [d['item_id'] for d in valid_items]

        est_items_map = {}
        if item_ids:
            est_items_map = {
                ei.id: ei
                for ei in EstimateItem.objects.filter(pk__in=item_ids).select_related('product')
            }

        # Batch update: подготовить items для bulk_update
        items_to_update = []
        mapping_pairs = []  # (product_id, work_item_id) для ProductWorkMapping
        knowledge_pairs = []  # (normalized_name, work_item_id) для verify_knowledge

        with suppress_item_signals():
            for item_data in valid_items:
                item_id = item_data['item_id']
                work_item_id = item_data['work_item_id']
                work_price = item_data.get('work_price')

                est_item = est_items_map.get(item_id)
                if not est_item:
                    continue

                est_item.work_item_id = work_item_id
                if work_price:
                    est_item.work_unit_price = Decimal(work_price)
                items_to_update.append(est_item)

                if est_item.product_id:
                    mapping_pairs.append((est_item.product_id, work_item_id))

                knowledge_pairs.append((
                    Product.normalize_name(est_item.name),
                    work_item_id,
                ))

            # Один bulk_update вместо N save()
            if items_to_update:
                EstimateItem.objects.bulk_update(
                    items_to_update, ['work_item', 'work_unit_price'],
                )

        applied = len(items_to_update)

        # Batch ProductWorkMapping
        for product_id, work_item_id in mapping_pairs:
            ProductWorkMapping.objects.update_or_create(
                product_id=product_id,
                work_item_id=work_item_id,
                defaults={
                    'confidence': 1.0,
                    'source': ProductWorkMapping.Source.MANUAL,
                },
            )
            ProductWorkMapping.objects.filter(
                product_id=product_id,
                work_item_id=work_item_id,
            ).update(usage_count=F('usage_count') + 1)

        # Batch verify knowledge
        for normalized_name, work_item_id in knowledge_pairs:
            verify_knowledge(normalized_name, work_item_id, user=user)

        # Обработка отклонённых результатов — обучение на ошибках
        rejected_count = 0
        if rejected_items:
            from .knowledge import reject_knowledge
            for rej in rejected_items:
                rej_item_id = rej.get('item_id')
                rej_work_item_id = rej.get('work_item_id')
                if not rej_item_id or not rej_work_item_id:
                    continue

                try:
                    est_item = EstimateItem.objects.select_related('product').get(pk=rej_item_id)
                except EstimateItem.DoesNotExist:
                    continue

                # Деградировать ProductWorkMapping
                if est_item.product:
                    ProductWorkMapping.objects.filter(
                        product=est_item.product,
                        work_item_id=rej_work_item_id,
                    ).update(confidence=F('confidence') * 0.5)

                # Reject knowledge
                item_normalized = Product.normalize_name(est_item.name)
                reject_knowledge(item_normalized, rej_work_item_id, user=user)
                rejected_count += 1

        # Расчёт человеко-часов
        man_hours = calculate_man_hours(estimate)

        # Снимаем lock
        session_mgr.delete_key(f'{LOCK_PREFIX}:{estimate_id}')

        return {
            'applied': applied,
            'rejected': rejected_count,
            'man_hours': str(man_hours.quantize(Decimal('0.01'))),
        }

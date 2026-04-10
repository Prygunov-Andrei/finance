"""Shared mixins для ERP и Public API estimate views.

Общая бизнес-логика CRUD выносится сюда, чтобы не дублировать между
EstimateItemViewSet (ERP) и PublicEstimateItemViewSet (портал).
"""
from decimal import Decimal

from django.db.models import F
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status

from catalog.models import Product, ProductWorkMapping
from estimates.models import EstimateItem, suppress_item_signals


class EstimateItemLearningMixin:
    """Mixin для learning loop: создание ProductWorkMapping при ручном назначении work_item."""

    def perform_update(self, serializer):
        old_work_item_id = serializer.instance.work_item_id
        instance = serializer.save()

        if (instance.work_item_id
                and instance.work_item_id != old_work_item_id
                and instance.product_id):
            ProductWorkMapping.objects.update_or_create(
                product_id=instance.product_id,
                work_item_id=instance.work_item_id,
                defaults={
                    'confidence': 1.0,
                    'source': ProductWorkMapping.Source.MANUAL,
                },
            )
            ProductWorkMapping.objects.filter(
                product_id=instance.product_id,
                work_item_id=instance.work_item_id,
            ).update(usage_count=F('usage_count') + 1)

            from estimates.services.work_matching.knowledge import save_knowledge
            item_normalized = Product.normalize_name(instance.name)
            save_knowledge(item_normalized, instance.work_item_id, source='manual')

            from estimates.services.markup_service import recalculate_subsections_for_items
            recalculate_subsections_for_items([instance.id])


class EstimateItemBulkMixin:
    """Mixin для bulk операций: bulk-create, bulk-delete."""

    @action(detail=False, methods=['post'], url_path='bulk-delete')
    def bulk_delete(self, request):
        item_ids = request.data.get('item_ids', [])
        if not item_ids:
            return Response({'error': 'item_ids обязателен'}, status=status.HTTP_400_BAD_REQUEST)

        with suppress_item_signals():
            qs = self.get_queryset().filter(pk__in=item_ids)
            deleted_count = qs.count()
            qs.delete()

        return Response({'deleted': deleted_count})

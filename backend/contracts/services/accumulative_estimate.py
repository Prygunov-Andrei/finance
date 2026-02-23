import logging
from decimal import Decimal
from typing import Dict, List

from django.db.models import Sum, F, Value, DecimalField
from django.db.models.functions import Coalesce

from contracts.models import (
    Contract, ContractEstimate, ContractEstimateItem,
    EstimatePurchaseLink,
)

logger = logging.getLogger(__name__)


class AccumulativeEstimateService:
    """Сервис для формирования накопительной сметы, остатков и отклонений.
    
    Накопительная смета = подписанная ContractEstimate + агрегация закупок 
    по каждой строке через EstimatePurchaseLink.
    """

    @staticmethod
    def get_accumulative(contract_estimate_id: int) -> List[Dict]:
        """Накопительная смета — строки с информацией о закупках.
        
        Для каждой строки ContractEstimateItem возвращает:
        - сметные данные (количество, цена)
        - закупленные данные (количество, сумма, поставщики, счета)
        """
        items = ContractEstimateItem.objects.filter(
            contract_estimate_id=contract_estimate_id,
        ).select_related('section', 'product').annotate(
            purchased_quantity=Coalesce(
                Sum('purchase_links__quantity_matched'),
                Value(0),
                output_field=DecimalField(),
            ),
            purchased_amount=Coalesce(
                Sum(
                    F('purchase_links__quantity_matched') *
                    F('purchase_links__invoice_item__price_per_unit')
                ),
                Value(0),
                output_field=DecimalField(),
            ),
        ).order_by('section__sort_order', 'sort_order', 'item_number')

        result = []
        for item in items:
            result.append({
                'id': item.id,
                'section_name': item.section.name if item.section else '',
                'item_number': item.item_number,
                'name': item.name,
                'model_name': item.model_name,
                'unit': item.unit,
                'estimate_quantity': str(item.quantity),
                'estimate_material_price': str(item.material_unit_price),
                'estimate_work_price': str(item.work_unit_price),
                'estimate_material_total': str(item.material_total),
                'estimate_work_total': str(item.work_total),
                'purchased_quantity': str(item.purchased_quantity),
                'purchased_amount': str(item.purchased_amount),
                'remaining_quantity': str(item.quantity - item.purchased_quantity),
                'is_analog': item.is_analog,
                'item_type': item.item_type,
            })

        return result

    @staticmethod
    def get_remainder(contract_estimate_id: int) -> List[Dict]:
        """Остатки по смете (смета минус закуплено)."""
        items = ContractEstimateItem.objects.filter(
            contract_estimate_id=contract_estimate_id,
        ).select_related('section', 'product').annotate(
            purchased_quantity=Coalesce(
                Sum('purchase_links__quantity_matched'),
                Value(0),
                output_field=DecimalField(),
            ),
        ).order_by('section__sort_order', 'sort_order', 'item_number')

        result = []
        for item in items:
            remaining = item.quantity - item.purchased_quantity
            if remaining <= 0:
                continue
            result.append({
                'id': item.id,
                'section_name': item.section.name if item.section else '',
                'item_number': item.item_number,
                'name': item.name,
                'model_name': item.model_name,
                'unit': item.unit,
                'estimate_quantity': str(item.quantity),
                'purchased_quantity': str(item.purchased_quantity),
                'remaining_quantity': str(remaining),
                'material_unit_price': str(item.material_unit_price),
                'remaining_material_total': str(
                    (remaining * item.material_unit_price).quantize(Decimal('0.01'))
                ),
            })

        return result

    @staticmethod
    def get_deviations(contract_estimate_id: int) -> List[Dict]:
        """Отклонения — аналоги, допработы, превышения."""
        links = EstimatePurchaseLink.objects.filter(
            contract_estimate_item__contract_estimate_id=contract_estimate_id,
        ).filter(
            models_Q_any_deviation()
        ).select_related(
            'contract_estimate_item', 'invoice_item',
        ).order_by('created_at')

        result = []
        for link in links:
            result.append({
                'id': link.id,
                'estimate_item_name': link.contract_estimate_item.name,
                'invoice_item_name': link.invoice_item.raw_name,
                'match_type': link.match_type,
                'match_reason': link.match_reason,
                'price_exceeds': link.price_exceeds,
                'quantity_exceeds': link.quantity_exceeds,
                'quantity_matched': str(link.quantity_matched),
            })

        additional_items = ContractEstimateItem.objects.filter(
            contract_estimate_id=contract_estimate_id,
            item_type__in=['consumable', 'additional'],
        ).order_by('sort_order')
        for item in additional_items:
            result.append({
                'id': f'additional-{item.id}',
                'estimate_item_name': item.name,
                'invoice_item_name': '',
                'match_type': 'additional',
                'match_reason': f'Тип: {item.get_item_type_display()}',
                'price_exceeds': False,
                'quantity_exceeds': False,
                'quantity_matched': str(item.quantity),
            })

        return result

    @staticmethod
    def export_accumulative_data(contract_estimate_id: int) -> List[Dict]:
        """Данные для экспорта в Excel."""
        return AccumulativeEstimateService.get_accumulative(contract_estimate_id)


def models_Q_any_deviation():
    """Q-объект для фильтрации отклонений."""
    from django.db.models import Q
    return (
        Q(match_type__in=['analog', 'substitute']) |
        Q(price_exceeds=True) |
        Q(quantity_exceeds=True)
    )

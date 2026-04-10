import logging
from decimal import Decimal
from typing import Dict, List, Optional

from django.db.models import Sum

from catalog.services import ProductMatcher
from contracts.models import (
    Contract, ContractEstimate, ContractEstimateItem,
    EstimatePurchaseLink,
)

logger = logging.getLogger(__name__)


class EstimateComplianceChecker:
    """Проверка соответствия счёта на оплату смете к договору.
    
    При оцифровке InvoiceItem по Договору с привязанной ContractEstimate —
    автоматическое сопоставление через ProductMatcher.
    Если позиция не найдена — требуется ручное сопоставление.
    Если цена/количество превышены — обоснование обязательно.
    """

    def __init__(self):
        self.product_matcher = ProductMatcher()

    def check_invoice(self, invoice) -> Dict:
        """Проверяет все позиции счёта на соответствие смете.
        
        Returns:
            {
                'compliant': bool,
                'items': [
                    {
                        'invoice_item_id': int,
                        'status': 'matched' | 'unmatched' | 'exceeds_price' | 'exceeds_quantity',
                        'contract_estimate_item_id': int | None,
                        'details': str,
                    }
                ]
            }
        """
        contract = invoice.contract
        if not contract:
            return {'compliant': True, 'items': [], 'message': 'Счёт не привязан к договору'}

        contract_estimate = ContractEstimate.objects.filter(
            contract=contract,
            status__in=[ContractEstimate.Status.AGREED, ContractEstimate.Status.SIGNED],
        ).first()

        if not contract_estimate:
            return {'compliant': True, 'items': [], 'message': 'У договора нет подписанной сметы'}

        results = []
        all_compliant = True

        for inv_item in invoice.items.select_related('product'):
            result = self._check_item(inv_item, contract_estimate)
            results.append(result)
            if result['status'] != 'matched':
                all_compliant = False

        return {
            'compliant': all_compliant,
            'items': results,
        }

    def _check_item(self, invoice_item, contract_estimate) -> Dict:
        """Проверяет одну позицию счёта."""
        if not invoice_item.product:
            return {
                'invoice_item_id': invoice_item.id,
                'status': 'unmatched',
                'contract_estimate_item_id': None,
                'details': 'Позиция не привязана к товару из каталога',
            }

        cei = ContractEstimateItem.objects.filter(
            contract_estimate=contract_estimate,
            product=invoice_item.product,
        ).first()

        if not cei:
            similar = self._find_similar_in_estimate(
                invoice_item.raw_name, contract_estimate,
            )
            if similar:
                return {
                    'invoice_item_id': invoice_item.id,
                    'status': 'analog_candidate',
                    'contract_estimate_item_id': similar.id,
                    'details': f'Возможный аналог: {similar.name}',
                }
            return {
                'invoice_item_id': invoice_item.id,
                'status': 'unmatched',
                'contract_estimate_item_id': None,
                'details': 'Товар не найден в смете к договору',
            }

        already_matched = EstimatePurchaseLink.objects.filter(
            contract_estimate_item=cei,
        ).aggregate(total=Sum('quantity_matched'))['total'] or Decimal('0')

        remaining = cei.quantity - already_matched
        issues = []

        if invoice_item.price_per_unit > cei.material_unit_price and cei.material_unit_price > 0:
            issues.append(
                f'Цена закупки ({invoice_item.price_per_unit}) > сметной ({cei.material_unit_price})'
            )

        if invoice_item.quantity > remaining:
            issues.append(
                f'Количество ({invoice_item.quantity}) > остаток по смете ({remaining})'
            )

        if issues:
            return {
                'invoice_item_id': invoice_item.id,
                'status': 'exceeds',
                'contract_estimate_item_id': cei.id,
                'details': '; '.join(issues),
            }

        return {
            'invoice_item_id': invoice_item.id,
            'status': 'matched',
            'contract_estimate_item_id': cei.id,
            'details': 'Соответствует смете',
        }

    def _find_similar_in_estimate(
        self, name: str, contract_estimate,
    ) -> Optional[ContractEstimateItem]:
        """Ищет похожую позицию в смете через fuzzy matching."""
        from rapidfuzz import fuzz
        from catalog.models import Product

        normalized = Product.normalize_name(name)
        best_score = 0
        best_item = None

        for cei in ContractEstimateItem.objects.filter(
            contract_estimate=contract_estimate,
        ):
            cei_normalized = Product.normalize_name(cei.name)
            score = fuzz.token_set_ratio(normalized, cei_normalized) / 100.0
            if score > best_score and score >= 0.6:
                best_score = score
                best_item = cei

        return best_item

    def auto_link_invoice(self, invoice) -> Dict:
        """Автоматически создаёт EstimatePurchaseLink для позиций счёта."""
        contract = invoice.contract
        if not contract:
            return {'linked': 0, 'unmatched': 0}

        contract_estimate = ContractEstimate.objects.filter(
            contract=contract,
            status__in=[ContractEstimate.Status.AGREED, ContractEstimate.Status.SIGNED],
        ).first()

        if not contract_estimate:
            return {'linked': 0, 'unmatched': 0}

        linked = 0
        unmatched = 0

        for inv_item in invoice.items.select_related('product'):
            if not inv_item.product:
                unmatched += 1
                continue

            cei = ContractEstimateItem.objects.filter(
                contract_estimate=contract_estimate,
                product=inv_item.product,
            ).first()

            if not cei:
                unmatched += 1
                continue

            EstimatePurchaseLink.objects.create(
                contract_estimate_item=cei,
                invoice_item=inv_item,
                quantity_matched=inv_item.quantity,
                match_type=EstimatePurchaseLink.MatchType.EXACT,
            )
            linked += 1

        return {'linked': linked, 'unmatched': unmatched}

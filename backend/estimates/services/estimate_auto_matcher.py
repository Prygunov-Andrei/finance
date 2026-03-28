"""Автоматический подбор цен материалов для строк сметы.

Preview-режим: показывает предложения без сохранения в БД.
Используется endpoint POST /estimate-items/auto-match/.

Подбор работ (расценок) вынесен в work_matching/ (async pipeline).
"""
import logging
from decimal import Decimal
from typing import Dict, List, Optional

from catalog.models import Product, ProductPriceHistory
from catalog.services import ProductMatcher

logger = logging.getLogger(__name__)


class EstimateAutoMatcher:
    """Подбор цен материалов из каталогов поставщиков и счетов."""

    def __init__(self):
        self.product_matcher = ProductMatcher()

    def preview_matches(
        self,
        estimate,
        supplier_ids: Optional[List[int]] = None,
        price_strategy: str = 'cheapest',
    ) -> List[Dict]:
        """Preview-подбор цен из каталога поставщиков и счетов БЕЗ сохранения в БД.

        supplier_ids — ID Counterparty для фильтрации (None = все).
        price_strategy — 'cheapest' | 'latest'.
        """
        from estimates.models import EstimateItem
        from supplier_integrations.models import SupplierProduct

        items = EstimateItem.objects.filter(
            estimate=estimate,
        ).exclude(name='')

        results = []
        for item in items:
            if item.product and item.material_unit_price > 0:
                continue

            try:
                product, _created = self.product_matcher.find_or_create_product(
                    name=item.name,
                    unit=item.unit,
                    use_llm=True,
                )
            except Exception as exc:
                logger.warning('preview_matches: product match failed for "%s": %s', item.name, exc)
                product = None

            if not product:
                continue

            # Собираем все предложения
            all_offers = []

            # 1. Цены из каталога поставщика (SupplierProduct.base_price)
            sp_qs = SupplierProduct.objects.filter(
                product=product, base_price__isnull=False, is_active=True,
            ).select_related('integration__counterparty')
            if supplier_ids:
                sp_qs = sp_qs.filter(integration__counterparty_id__in=supplier_ids)
            for sp in sp_qs:
                if sp.base_price and sp.base_price > 0:
                    counterparty = sp.integration.counterparty if sp.integration else None
                    all_offers.append({
                        'price': str(sp.base_price),
                        'source_type': 'supplier_catalog',
                        'counterparty_name': counterparty.name if counterparty else sp.integration.name,
                        'counterparty_id': counterparty.id if counterparty else None,
                        'supplier_product_id': sp.id,
                        'price_date': str(sp.price_updated_at) if sp.price_updated_at else None,
                    })

            # 2. Цены из счетов (ProductPriceHistory)
            ph_qs = ProductPriceHistory.objects.filter(
                product=product,
            ).select_related('counterparty')
            if supplier_ids:
                ph_qs = ph_qs.filter(counterparty_id__in=supplier_ids)
            for ph in ph_qs.order_by('-invoice_date')[:5]:
                if ph.price and ph.price > 0:
                    all_offers.append({
                        'price': str(ph.price),
                        'source_type': 'invoice',
                        'counterparty_name': (
                            ph.counterparty.short_name or ph.counterparty.name
                        ) if ph.counterparty else None,
                        'counterparty_id': ph.counterparty_id,
                        'source_price_history_id': ph.id,
                        'invoice_number': ph.invoice_number or '',
                        'invoice_date': str(ph.invoice_date) if ph.invoice_date else '',
                        'price_date': str(ph.invoice_date) if ph.invoice_date else None,
                    })

            # 3. Выбор лучшего предложения
            best_offer = None
            if all_offers:
                if price_strategy == 'cheapest':
                    best_offer = min(all_offers, key=lambda o: Decimal(o['price']))
                else:  # latest
                    best_offer = all_offers[0]

            product_confidence = 0.85 if best_offer else 0.5

            results.append({
                'item_id': item.id,
                'name': item.name,
                'matched_product': {
                    'id': product.id,
                    'name': product.name,
                    'price': best_offer['price'] if best_offer else '0',
                },
                'best_offer': best_offer,
                'all_offers': all_offers,
                'matched_work': None,
                'product_confidence': product_confidence,
                'work_confidence': 0,
                'invoice_info': None,
                'source_price_history_id': (
                    best_offer.get('source_price_history_id')
                    if best_offer else None
                ),
            })

        return results

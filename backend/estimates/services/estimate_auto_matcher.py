import logging
from typing import Dict, List, Optional
from decimal import Decimal
from django.db.models import F

from catalog.models import Product, ProductPriceHistory, ProductWorkMapping
from catalog.services import ProductMatcher
from pricelists.models import WorkItem, PriceList

logger = logging.getLogger(__name__)


class EstimateAutoMatcher:
    """
    Автоматический подбор цен материалов и расценок на работы для строк сметы.

    Двухуровневая стратегия:
    - Подбор цены: ProductMatcher (fuzzy + LLM) → последняя цена из ProductPriceHistory
    - Подбор работы: ProductWorkMapping (история) → правила по Category → LLM fallback

    При ручной правке сметчиком — обновляет ProductWorkMapping для обучения системы.
    """

    MIN_USAGE_COUNT_FOR_AUTO = 2

    def __init__(self):
        self.product_matcher = ProductMatcher()

    def match_prices(self, estimate) -> Dict:
        """Для каждой строки сметы ищет Product через ProductMatcher,
        подтягивает последнюю цену из ProductPriceHistory."""
        from estimates.models import EstimateItem

        items = EstimateItem.objects.filter(
            estimate=estimate, product__isnull=True,
        ).exclude(name='')

        matched = 0
        skipped = 0

        for item in items:
            product, created = self.product_matcher.find_or_create_product(
                name=item.name,
                unit=item.unit,
                use_llm=True,
            )

            item.product = product

            latest_price = ProductPriceHistory.objects.filter(
                product=product,
            ).order_by('-invoice_date').first()

            if latest_price and item.material_unit_price == 0:
                item.material_unit_price = latest_price.price
                item.source_price_history = latest_price

            item.save(update_fields=[
                'product', 'material_unit_price', 'source_price_history',
            ])
            matched += 1

        return {'matched': matched, 'skipped': skipped, 'total': matched + skipped}

    def match_works(self, estimate, price_list_id: Optional[int] = None) -> Dict:
        """Для каждой строки сметы подбирает WorkItem:
        1. Ищет в ProductWorkMapping (история)
        2. Правила по Category → WorkSection
        3. LLM-классификация из предфильтрованных WorkItem"""
        from estimates.models import EstimateItem

        items = EstimateItem.objects.filter(
            estimate=estimate,
            product__isnull=False,
            work_item__isnull=True,
        )

        price_list = None
        if price_list_id:
            try:
                price_list = PriceList.objects.get(pk=price_list_id)
            except PriceList.DoesNotExist:
                pass

        matched_history = 0
        matched_rule = 0
        matched_llm = 0
        unmatched = 0

        for item in items:
            work_item = self._match_work_for_item(item, price_list)
            if work_item:
                source = work_item.pop('_source', 'unknown')
                item.work_item = work_item['work_item']
                if item.work_unit_price == 0 and 'price' in work_item:
                    item.work_unit_price = work_item['price']
                item.save(update_fields=['work_item', 'work_unit_price'])

                if source == 'history':
                    matched_history += 1
                elif source == 'rule':
                    matched_rule += 1
                elif source == 'llm':
                    matched_llm += 1
            else:
                unmatched += 1

        return {
            'matched_history': matched_history,
            'matched_rule': matched_rule,
            'matched_llm': matched_llm,
            'unmatched': unmatched,
        }

    def _match_work_for_item(
        self, item, price_list: Optional[PriceList]
    ) -> Optional[Dict]:
        """Подбирает WorkItem для одной строки сметы."""

        # 1. История — ProductWorkMapping
        mapping = ProductWorkMapping.objects.filter(
            product=item.product,
            usage_count__gte=self.MIN_USAGE_COUNT_FOR_AUTO,
        ).first()

        if mapping:
            result = {'work_item': mapping.work_item, '_source': 'history'}
            price = self._get_work_price(mapping.work_item, price_list)
            if price is not None:
                result['price'] = price
            return result

        # 2. Правила по Category → WorkSection
        if item.product and item.product.category:
            work_items_qs = WorkItem.objects.filter(
                is_current=True,
                section__code__icontains=item.product.category.code[:4],
            )
            if work_items_qs.exists():
                best = self._fuzzy_match_work(item.name, work_items_qs[:20])
                if best:
                    self._record_mapping(
                        item.product, best, ProductWorkMapping.Source.RULE, confidence=0.7,
                    )
                    result = {'work_item': best, '_source': 'rule'}
                    price = self._get_work_price(best, price_list)
                    if price is not None:
                        result['price'] = price
                    return result

        # 3. LLM fallback — предфильтрация + LLM
        try:
            candidates = WorkItem.objects.filter(is_current=True)[:20]
            best = self._fuzzy_match_work(item.name, candidates)
            if best:
                self._record_mapping(
                    item.product, best, ProductWorkMapping.Source.LLM, confidence=0.5,
                )
                result = {'work_item': best, '_source': 'llm'}
                price = self._get_work_price(best, price_list)
                if price is not None:
                    result['price'] = price
                return result
        except Exception as exc:
            logger.warning('Work matching failed for item %s: %s', item.id, exc)

        return None

    def _fuzzy_match_work(
        self, item_name: str, work_items_qs
    ) -> Optional[WorkItem]:
        """Fuzzy-подбор WorkItem по названию строки сметы."""
        from fuzzywuzzy import fuzz

        best_score = 0
        best_item = None
        normalized_name = Product.normalize_name(item_name)

        for wi in work_items_qs:
            wi_normalized = Product.normalize_name(wi.name)
            score = fuzz.token_set_ratio(normalized_name, wi_normalized) / 100.0
            if score > best_score and score >= 0.5:
                best_score = score
                best_item = wi

        return best_item

    def _get_work_price(
        self, work_item: WorkItem, price_list: Optional[PriceList]
    ) -> Optional[Decimal]:
        """Получает цену работы из прайс-листа."""
        if not price_list:
            return None

        try:
            from pricelists.models import PriceListItem
            pli = PriceListItem.objects.filter(
                price_list=price_list,
                work_item=work_item,
            ).first()
            if pli:
                return pli.price_per_unit
        except Exception:
            pass

        return None

    def _record_mapping(
        self,
        product: Product,
        work_item: WorkItem,
        source: str,
        confidence: float = 1.0,
    ):
        """Записывает или обновляет ProductWorkMapping."""
        mapping, created = ProductWorkMapping.objects.get_or_create(
            product=product,
            work_item=work_item,
            defaults={
                'source': source,
                'confidence': confidence,
                'usage_count': 1,
            },
        )
        if not created:
            mapping.usage_count = F('usage_count') + 1
            if confidence > mapping.confidence:
                mapping.confidence = confidence
            mapping.save(update_fields=['usage_count', 'confidence'])

    def auto_fill(
        self, estimate, price_list_id: Optional[int] = None
    ) -> Dict:
        """Одна кнопка: match_prices + match_works."""
        prices_result = self.match_prices(estimate)
        works_result = self.match_works(estimate, price_list_id=price_list_id)
        return {
            'prices': prices_result,
            'works': works_result,
        }

    @staticmethod
    def record_manual_correction(
        product: Product,
        work_item: WorkItem,
    ):
        """При ручной правке сметчиком — обновляет ProductWorkMapping."""
        mapping, created = ProductWorkMapping.objects.get_or_create(
            product=product,
            work_item=work_item,
            defaults={
                'source': ProductWorkMapping.Source.MANUAL,
                'confidence': 1.0,
                'usage_count': 1,
            },
        )
        if not created:
            mapping.source = ProductWorkMapping.Source.MANUAL
            mapping.confidence = 1.0
            mapping.usage_count = F('usage_count') + 1
            mapping.save(update_fields=['source', 'confidence', 'usage_count'])

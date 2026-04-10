"""Pipeline подбора работ: контекст + оркестратор для всех уровней."""
import logging
from decimal import Decimal
from typing import Dict, List, Optional, Tuple

from catalog.models import Product, ProductKnowledge, ProductWorkMapping
from pricelists.models import PriceList, PriceListItem, WorkItem

from .tiers import ALL_TIERS, FAST_TIERS, MatchResult, _wi_grade_str

logger = logging.getLogger(__name__)


class MatchingContext:
    """Кэшированный контекст для pipeline. Создаётся один раз при старте задачи.

    Содержит pre-computed данные чтобы избежать N+1 запросов:
    - Все WorkItems с normalized names
    - Все PriceListItems для прайс-листа сметы
    - History cache (ProductWorkMapping по product_id)
    - Knowledge cache (ProductKnowledge по normalized name)
    - Ставки прайс-листа (для расчёта calculated_cost)
    """

    def __init__(self, estimate, items=None):
        self.estimate = estimate
        self.price_list: Optional[PriceList] = estimate.price_list

        # Pre-compute WorkItems cache: (id, name, normalized_name, obj)
        self.work_items_cache: List[Tuple[int, str, str, WorkItem]] = []
        for wi in WorkItem.objects.filter(is_current=True).select_related('section', 'grade'):
            self.work_items_cache.append((
                wi.id, wi.name, Product.normalize_name(wi.name), wi
            ))
        logger.info('Loaded %d WorkItems into cache', len(self.work_items_cache))

        # Pre-compute PriceListItems: (wi_id, wi_name, wi_normalized, wi_obj, cost_str)
        self.pricelist_items_cache: List[Tuple[int, str, str, WorkItem, Optional[str]]] = []
        self._pli_cost_map: Dict[int, str] = {}  # work_item_id → cost string

        if self.price_list:
            plis = (
                PriceListItem.objects.filter(
                    price_list=self.price_list,
                    is_included=True,
                )
                .select_related('work_item', 'work_item__section', 'work_item__grade')
            )
            for pli in plis:
                wi = pli.work_item
                # Вычисляем cost вручную чтобы избежать N+1 на property
                try:
                    effective_hours = pli.hours_override if pli.hours_override is not None else (wi.hours or Decimal('0'))
                    effective_coeff = pli.coefficient_override if pli.coefficient_override is not None else wi.coefficient
                    effective_grade = pli.grade_override if pli.grade_override is not None else (wi.required_grade or Decimal('1'))
                    rate = self.price_list.get_rate_for_grade(effective_grade)
                    cost = effective_hours * effective_coeff * rate
                    cost_str = str(cost.quantize(Decimal('0.01')))
                except Exception:
                    cost_str = None

                wi_normalized = Product.normalize_name(wi.name)
                self.pricelist_items_cache.append((wi.id, wi.name, wi_normalized, wi, cost_str))
                if cost_str:
                    self._pli_cost_map[wi.id] = cost_str

            logger.info('Loaded %d PriceListItems into cache', len(self.pricelist_items_cache))

        # Prefetch history: product_id → best ProductWorkMapping
        self.history_cache: Dict[int, ProductWorkMapping] = {}
        if items:
            product_ids = [item.product_id for item in items if item.product_id]
            if product_ids:
                mappings = (
                    ProductWorkMapping.objects.filter(
                        product_id__in=product_ids,
                        confidence__gte=0.3,  # Исключить многократно отвергнутые
                    )
                    .select_related('work_item', 'work_item__section')
                    .order_by('-usage_count', '-confidence')
                )
                for m in mappings:
                    if m.product_id not in self.history_cache:
                        self.history_cache[m.product_id] = m
                logger.info('Loaded %d ProductWorkMappings into history cache', len(self.history_cache))

        # Prefetch knowledge: normalized_name → best ProductKnowledge
        self.knowledge_cache: Dict[str, ProductKnowledge] = {}
        knowledge_qs = (
            ProductKnowledge.objects.filter(
                status__in=[ProductKnowledge.Status.VERIFIED, ProductKnowledge.Status.PENDING],
                confidence__gte=0.5,
            )
            .select_related('work_item', 'work_item__section')
            .order_by('-confidence', '-usage_count')
        )
        for k in knowledge_qs:
            if k.item_name_pattern not in self.knowledge_cache:
                self.knowledge_cache[k.item_name_pattern] = k
        logger.info('Loaded %d ProductKnowledge into knowledge cache', len(self.knowledge_cache))

        # Отложенные обновления usage_count для knowledge
        self.knowledge_usage_updates: List[int] = []

        # Shared state: fuzzy candidates from Tier 5 → Tier 6
        self.fuzzy_candidates: Dict[int, list] = {}

    def get_cost_for_work_item(self, wi: WorkItem) -> Optional[str]:
        """Получить стоимость работы из кэша PriceListItem."""
        return self._pli_cost_map.get(wi.id)


def match_single_item(item, ctx: MatchingContext) -> Dict:
    """Прогнать одну строку сметы через все уровни pipeline.

    Returns:
        dict с результатом (matched_work или null + source + confidence)
    """
    for tier in ALL_TIERS:
        try:
            result = tier.match(item, ctx)
        except Exception:
            logger.exception('Tier %s failed for item %d', tier.__class__.__name__, item.id)
            continue

        if result and result.confidence >= getattr(tier, 'THRESHOLD', 0):
            return _result_to_dict(item, result, ctx)

    # Unmatched
    return {
        'item_id': item.id,
        'item_name': item.name,
        'matched_work': None,
        'alternatives': _get_alternatives(item, ctx),
        'confidence': 0.0,
        'source': 'unmatched',
        'llm_reasoning': '',
    }


def match_single_item_fast(item, ctx: MatchingContext) -> Optional[Dict]:
    """Прогнать одну строку только через быстрые тиры (0-5).

    Returns:
        dict с результатом, или None если быстрые тиры не нашли match.
    """
    for tier in FAST_TIERS:
        try:
            result = tier.match(item, ctx)
        except Exception:
            logger.exception('Tier %s failed for item %d', tier.__class__.__name__, item.id)
            continue

        if result and result.confidence >= getattr(tier, 'THRESHOLD', 0):
            return _result_to_dict(item, result, ctx)

    return None


def _result_to_dict(item, result: MatchResult, ctx: MatchingContext = None) -> Dict:
    return {
        'item_id': item.id,
        'item_name': item.name,
        'matched_work': {
            'id': result.work_item_id,
            'name': result.work_item_name,
            'article': result.work_item_article,
            'section_name': result.section_name,
            'hours': result.hours,
            'required_grade': result.required_grade,
            'unit': result.unit,
            'calculated_cost': result.calculated_cost,
        },
        'alternatives': result.alternatives[:3] if result.alternatives else _get_alternatives(item, ctx),
        'confidence': result.confidence,
        'source': result.source,
        'llm_reasoning': result.llm_reasoning,
        'web_search_query': result.web_search_query,
        'web_search_result_summary': result.web_search_result_summary,
    }


def _get_alternatives(item, ctx: MatchingContext) -> List[Dict]:
    """Top-3 альтернативы для ненайденной позиции.

    Возвращает полные данные WorkItem для возможности выбора альтернативы.
    """
    candidates = ctx.fuzzy_candidates.get(item.id, [])
    return [
        {'id': wi.id, 'name': wi.name, 'article': wi.article,
         'hours': str(wi.hours or 0),
         'unit': wi.unit,
         'section_name': wi.section.name if wi.section else '',
         'required_grade': _wi_grade_str(wi),
         'calculated_cost': ctx.get_cost_for_work_item(wi) if ctx else None,
         'confidence': round(score * 0.7, 3)}
        for score, wi in candidates[:3]
    ]

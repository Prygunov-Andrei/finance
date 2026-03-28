"""Pipeline подбора работ: контекст + оркестратор для всех уровней."""
import logging
from decimal import Decimal
from typing import Dict, List, Optional, Tuple

from catalog.models import Product
from pricelists.models import PriceList, PriceListItem, WorkItem

from .tiers import ALL_TIERS, MatchResult

logger = logging.getLogger(__name__)


class MatchingContext:
    """Кэшированный контекст для pipeline. Создаётся один раз при старте задачи.

    Содержит pre-computed данные чтобы избежать N+1 запросов:
    - Все WorkItems с normalized names
    - Все PriceListItems для прайс-листа сметы
    - Ставки прайс-листа (для расчёта calculated_cost)
    """

    def __init__(self, estimate):
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
    """Top-3 альтернативы для ненайденной позиции."""
    candidates = ctx.fuzzy_candidates.get(item.id, [])
    return [
        {'id': wi.id, 'name': wi.name, 'article': wi.article,
         'confidence': round(score * 0.7, 3)}
        for score, wi in candidates[:3]
    ]

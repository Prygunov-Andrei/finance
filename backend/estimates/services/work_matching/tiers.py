"""8-уровневый pipeline подбора работ для строк сметы.

Каждый уровень — класс с методом match(item, context) → MatchResult | None.
Уровни выполняются последовательно, при нахождении совпадения с confidence >= порога
эскалация прекращается.
"""
import logging
import math
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Dict, List, Optional

from rapidfuzz import fuzz

from catalog.models import Product, ProductKnowledge, ProductWorkMapping
from llm_services.models import LLMTaskConfig
from llm_services.providers import get_provider

logger = logging.getLogger(__name__)


@dataclass
class MatchResult:
    """Результат подбора работы для одной строки сметы."""
    work_item_id: int
    work_item_name: str
    work_item_article: str
    section_name: str
    hours: str
    required_grade: str
    unit: str
    calculated_cost: Optional[str]  # стоимость из PriceListItem
    confidence: float
    source: str  # tier name
    llm_reasoning: str = ''
    web_search_query: str = ''
    web_search_result_summary: str = ''
    alternatives: List[Dict] = field(default_factory=list)


def _wi_grade_str(wi) -> str:
    """Безопасное извлечение номера разряда из WorkItem."""
    if wi.required_grade is not None:
        return str(wi.required_grade)
    if wi.grade_id:
        try:
            return str(wi.grade.grade)
        except Exception:
            return ''
    return ''


# ====================== Tier 0: Default Work Item ======================

class Tier0Default:
    """Расценка по умолчанию, заданная оператором на товаре."""

    THRESHOLD = 0.0  # всегда проходит если есть

    def match(self, item, ctx) -> Optional[MatchResult]:
        product = getattr(item, 'product', None)
        if not product or not getattr(product, 'default_work_item', None):
            return None

        wi = product.default_work_item
        return MatchResult(
            work_item_id=wi.id,
            work_item_name=wi.name,
            work_item_article=wi.article,
            section_name=wi.section.name if wi.section else '',
            hours=str(wi.hours or 0),
            required_grade=_wi_grade_str(wi),
            unit=wi.unit,
            calculated_cost=ctx.get_cost_for_work_item(wi),
            confidence=1.0,
            source='default',
        )


# ====================== Tier 1: History (ProductWorkMapping) ======================

class Tier1History:
    """Подбор по истории: ранее подтверждённые связки товар → работа."""

    THRESHOLD = 0.6

    def match(self, item, ctx) -> Optional[MatchResult]:
        product = getattr(item, 'product', None)
        if not product:
            return None

        # Prefetched cache (O(1)) или fallback на DB query
        if ctx.history_cache:
            mapping = ctx.history_cache.get(product.id)
        else:
            mapping = (
                ProductWorkMapping.objects.filter(product=product)
                .select_related('work_item', 'work_item__section')
                .order_by('-usage_count', '-confidence')
                .first()
            )
        if not mapping:
            return None

        # Ручные привязки (MANUAL) — достаточно 1 использования
        # Автоматические — нужно минимум 2
        if mapping.source == ProductWorkMapping.Source.MANUAL and mapping.usage_count >= 1:
            pass  # OK
        elif mapping.usage_count >= 2:
            pass  # OK
        else:
            return None

        # Confidence: базовая confidence маппинга, усиленная usage
        # MANUAL с confidence=1.0 и usage=1 → 0.9 (надёжный источник)
        usage_boost = 1 + math.log10(max(mapping.usage_count, 1)) * 0.5
        conf = min(0.95, mapping.confidence * usage_boost)
        if conf < self.THRESHOLD:
            return None

        wi = mapping.work_item
        return MatchResult(
            work_item_id=wi.id,
            work_item_name=wi.name,
            work_item_article=wi.article,
            section_name=wi.section.name if wi.section else '',
            hours=str(wi.hours or 0),
            required_grade=_wi_grade_str(wi),
            unit=wi.unit,
            calculated_cost=ctx.get_cost_for_work_item(wi),
            confidence=conf,
            source='history',
        )


# ====================== Tier 2: PriceList-Scoped Search ======================

class Tier2PriceList:
    """Fuzzy match по названию внутри прайс-листа сметы."""

    THRESHOLD = 0.55

    def match(self, item, ctx) -> Optional[MatchResult]:
        if not ctx.pricelist_items_cache:
            return None

        item_normalized = Product.normalize_name(item.name)
        best_score = 0.0
        best_entry = None
        alternatives = []

        for wi_id, wi_name, wi_normalized, wi_obj, cost in ctx.pricelist_items_cache:
            score = fuzz.token_set_ratio(item_normalized, wi_normalized) / 100.0
            entry = {
                'id': wi_id, 'name': wi_name, 'article': wi_obj.article,
                'hours': str(wi_obj.hours or 0),
                'unit': wi_obj.unit,
                'section_name': wi_obj.section.name if wi_obj.section else '',
                'required_grade': _wi_grade_str(wi_obj),
                'calculated_cost': cost,
                'confidence': round(score * 0.9, 3),
            }
            if score > best_score:
                if best_entry:
                    alternatives.append(best_entry)
                best_score = score
                best_entry = entry
                best_cost = cost
                best_wi = wi_obj
            elif score > 0.4:
                alternatives.append(entry)

        if best_score < self.THRESHOLD or not best_entry:
            return None

        conf = best_score * 0.9  # scope прайс-листа — сильный сигнал
        return MatchResult(
            work_item_id=best_wi.id,
            work_item_name=best_wi.name,
            work_item_article=best_wi.article,
            section_name=best_wi.section.name if best_wi.section else '',
            hours=str(best_wi.hours or 0),
            required_grade=_wi_grade_str(best_wi),
            unit=best_wi.unit,
            calculated_cost=best_cost,
            confidence=round(conf, 3),
            source='pricelist',
            alternatives=sorted(alternatives, key=lambda x: -x['confidence'])[:3],
        )


# ====================== Tier 3: Knowledge Base ======================

class Tier3Knowledge:
    """Поиск в базе знаний ProductKnowledge."""

    THRESHOLD = 0.5

    def match(self, item, ctx) -> Optional[MatchResult]:
        item_normalized = Product.normalize_name(item.name)

        # Prefetched cache (O(1)) или fallback на DB query
        if ctx.knowledge_cache:
            knowledge = ctx.knowledge_cache.get(item_normalized)
        else:
            knowledge = (
                ProductKnowledge.objects.filter(
                    item_name_pattern=item_normalized,
                    status__in=[ProductKnowledge.Status.VERIFIED, ProductKnowledge.Status.PENDING],
                    confidence__gte=0.5,
                )
                .select_related('work_item', 'work_item__section')
                .order_by('-confidence', '-usage_count')
                .first()
            )
        if not knowledge:
            return None

        # Verified boost +10%
        conf = knowledge.confidence * (1.1 if knowledge.status == ProductKnowledge.Status.VERIFIED else 0.9)
        if conf < self.THRESHOLD:
            return None

        wi = knowledge.work_item
        # Откладываем обновление usage (batch в конце)
        ctx.knowledge_usage_updates.append(knowledge.pk)

        return MatchResult(
            work_item_id=wi.id,
            work_item_name=wi.name,
            work_item_article=wi.article,
            section_name=wi.section.name if wi.section else '',
            hours=str(wi.hours or 0),
            required_grade=_wi_grade_str(wi),
            unit=wi.unit,
            calculated_cost=ctx.get_cost_for_work_item(wi),
            confidence=round(min(conf, 1.0), 3),
            source='knowledge',
        )


# ====================== Tier 4: Category/Section Rules ======================

class Tier4Category:
    """Fuzzy match внутри WorkSection, определённой по категории товара."""

    THRESHOLD = 0.5

    def match(self, item, ctx) -> Optional[MatchResult]:
        product = getattr(item, 'product', None)
        if not product or not getattr(product, 'category', None):
            return None

        category_code = product.category.code[:4] if hasattr(product.category, 'code') else ''
        if not category_code:
            return None

        # Фильтруем из кэша по секции
        item_normalized = Product.normalize_name(item.name)
        best_score = 0.0
        best_entry = None

        for wi_id, wi_name, wi_normalized, wi_obj in ctx.work_items_cache:
            section = wi_obj.section
            if not section or not section.code.startswith(category_code):
                continue
            score = fuzz.token_set_ratio(item_normalized, wi_normalized) / 100.0
            if score > best_score:
                best_score = score
                best_entry = wi_obj

        if best_score < self.THRESHOLD or not best_entry:
            return None

        conf = best_score * 0.8
        return MatchResult(
            work_item_id=best_entry.id,
            work_item_name=best_entry.name,
            work_item_article=best_entry.article,
            section_name=best_entry.section.name if best_entry.section else '',
            hours=str(best_entry.hours or 0),
            required_grade=_wi_grade_str(best_entry),
            unit=best_entry.unit,
            calculated_cost=ctx.get_cost_for_work_item(best_entry),
            confidence=round(conf, 3),
            source='category',
        )


# ====================== Tier 5: Full Catalog Fuzzy ======================

class Tier5Fuzzy:
    """Fuzzy match по ВСЕМУ каталогу WorkItem."""

    THRESHOLD = 0.45

    def match(self, item, ctx) -> Optional[MatchResult]:
        item_normalized = Product.normalize_name(item.name)
        scored = []

        for wi_id, wi_name, wi_normalized, wi_obj in ctx.work_items_cache:
            score = fuzz.token_set_ratio(item_normalized, wi_normalized) / 100.0
            if score > 0.35:
                scored.append((score, wi_obj))

        if not scored:
            return None

        scored.sort(key=lambda x: -x[0])
        best_score, best_wi = scored[0]

        if best_score < self.THRESHOLD:
            # Сохраняем top candidates для Tier 6
            ctx.fuzzy_candidates[item.id] = [(s, wi) for s, wi in scored[:15]]
            return None

        conf = best_score * 0.7
        alternatives = [
            {'id': wi.id, 'name': wi.name, 'article': wi.article,
             'hours': str(wi.hours or 0),
             'unit': wi.unit,
             'section_name': wi.section.name if wi.section else '',
             'required_grade': _wi_grade_str(wi),
             'calculated_cost': ctx.get_cost_for_work_item(wi),
             'confidence': round(s * 0.7, 3)}
            for s, wi in scored[1:4]
        ]

        # Всё равно сохраняем candidates для Tier 6 если conf низкий
        ctx.fuzzy_candidates[item.id] = [(s, wi) for s, wi in scored[:15]]

        return MatchResult(
            work_item_id=best_wi.id,
            work_item_name=best_wi.name,
            work_item_article=best_wi.article,
            section_name=best_wi.section.name if best_wi.section else '',
            hours=str(best_wi.hours or 0),
            required_grade=_wi_grade_str(best_wi),
            unit=best_wi.unit,
            calculated_cost=ctx.get_cost_for_work_item(best_wi),
            confidence=round(conf, 3),
            source='fuzzy',
            alternatives=alternatives,
        )


# ====================== Tier 6: LLM Semantic Match ======================

class Tier6LLM:
    """LLM semantic match с батчингом: до 5 позиций в одном LLM-запросе."""

    THRESHOLD = 0.3
    BATCH_SIZE = 5

    def match(self, item, ctx) -> Optional[MatchResult]:
        """Single-item match (fallback). Для батчинга pipeline использует match_batch()."""
        results = self.match_batch([(item, ctx.fuzzy_candidates.get(item.id, []))], ctx)
        return results.get(item.id)

    def match_batch(self, items_with_candidates: list, ctx) -> Dict[int, Optional[MatchResult]]:
        """Батч-подбор: несколько позиций в одном LLM-запросе.

        Args:
            items_with_candidates: [(item, candidates_list), ...]
        Returns:
            {item_id: MatchResult | None}
        """
        results: Dict[int, Optional[MatchResult]] = {}
        batch_items = []
        all_candidates_map = {}

        for item, candidates in items_with_candidates:
            if not candidates:
                item_normalized = Product.normalize_name(item.name)
                scored = []
                for _, _, wi_normalized, wi_obj in ctx.work_items_cache:
                    score = fuzz.token_set_ratio(item_normalized, wi_normalized) / 100.0
                    scored.append((score, wi_obj))
                scored.sort(key=lambda x: -x[0])
                candidates = scored[:10]
            if candidates:
                batch_items.append(item)
                all_candidates_map[item.id] = candidates

        if not batch_items:
            return results

        try:
            provider_model = LLMTaskConfig.get_provider_for_task('work_matching_semantic')
            provider = get_provider(provider_model)
        except Exception:
            logger.warning('LLM provider unavailable for work_matching_semantic')
            return {item.id: None for item in batch_items}

        # Общий пул кандидатов (deduplicated)
        seen_ids = set()
        shared_candidates = []
        for item in batch_items:
            for _, wi in all_candidates_map.get(item.id, [])[:10]:
                if wi.id not in seen_ids:
                    seen_ids.add(wi.id)
                    shared_candidates.append(wi)
        shared_candidates = shared_candidates[:20]
        wi_map = {wi.id: wi for wi in shared_candidates}

        candidates_json = [
            {'id': wi.id, 'article': wi.article, 'name': wi.name,
             'section': wi.section.name if wi.section else '', 'unit': wi.unit}
            for wi in shared_candidates
        ]

        system_prompt = (
            "Ты эксперт-сметчик по ОВиК. Для КАЖДОЙ позиции сметы подбери "
            "подходящую расценку из списка. Учитывай тип оборудования, "
            "способ монтажа, единицу измерения."
        )
        user_prompt = (
            'Позиции сметы:\n'
            + '\n'.join(f'  [{i}] "{it.name}"' for i, it in enumerate(batch_items))
            + f'\n\nРасценки-кандидаты:\n{_format_candidates(candidates_json)}\n\n'
            'Ответь JSON: {"matches": [{"item_index": 0, "work_item_id": <id или null>, '
            '"confidence": 0.0-1.0, "reasoning": "..."}]}'
        )

        try:
            llm_result = provider.chat_completion(system_prompt, user_prompt)
        except Exception:
            logger.exception('LLM batch failed')
            return {item.id: None for item in batch_items}

        for m in (llm_result.get('matches') or []):
            idx = m.get('item_index')
            wi_id = m.get('work_item_id')
            llm_conf = float(m.get('confidence', 0))
            reasoning = m.get('reasoning', '')

            if idx is None or idx >= len(batch_items) or not wi_id or llm_conf < self.THRESHOLD:
                continue
            matched_wi = wi_map.get(wi_id)
            if not matched_wi:
                continue

            item = batch_items[idx]
            results[item.id] = MatchResult(
                work_item_id=matched_wi.id,
                work_item_name=matched_wi.name,
                work_item_article=matched_wi.article,
                section_name=matched_wi.section.name if matched_wi.section else '',
                hours=str(matched_wi.hours or 0),
                required_grade=_wi_grade_str(matched_wi),
                unit=matched_wi.unit,
                calculated_cost=ctx.get_cost_for_work_item(matched_wi),
                confidence=round(llm_conf * 0.85, 3),
                source='llm',
                llm_reasoning=reasoning,
            )

        for item in batch_items:
            if item.id not in results:
                results[item.id] = None

        return results


# ====================== Tier 7: LLM + Web Search ======================

class Tier7WebSearch:
    """LLM с веб-поиском для неизвестных позиций."""

    THRESHOLD = 0.25

    def match(self, item, ctx) -> Optional[MatchResult]:
        try:
            provider_model = LLMTaskConfig.get_provider_for_task('work_matching_web')
            provider = get_provider(provider_model)
        except Exception:
            logger.warning('LLM provider unavailable for work_matching_web')
            return None

        system_prompt = (
            "Ты эксперт по ОВиК и строительным работам. Определи, какой тип "
            "монтажных работ требуется для указанного оборудования. "
            "Ответь JSON: {\"work_type\": \"описание работы\", \"reasoning\": \"...\"}"
        )
        user_prompt = (
            f'Что это за оборудование: "{item.name}"? '
            'Какой тип монтажных работ требуется для его установки в системах ОВиК?'
        )

        try:
            if provider_model.supports_web_search:
                result = provider.chat_completion_with_search(system_prompt, user_prompt)
            else:
                result = provider.chat_completion(system_prompt, user_prompt)
        except Exception:
            logger.exception('Web search LLM failed for item %s', item.id)
            return None

        work_type = result.get('work_type', '')
        reasoning = result.get('reasoning', '')
        if not work_type:
            return None

        # Fuzzy match work_type description against WorkItem catalog
        work_type_normalized = Product.normalize_name(work_type)
        best_score = 0.0
        best_wi = None

        for wi_id, wi_name, wi_normalized, wi_obj in ctx.work_items_cache:
            score = fuzz.token_set_ratio(work_type_normalized, wi_normalized) / 100.0
            if score > best_score:
                best_score = score
                best_wi = wi_obj

        if not best_wi or best_score < 0.35:
            return None

        conf = best_score * 0.75
        if conf < self.THRESHOLD:
            return None

        return MatchResult(
            work_item_id=best_wi.id,
            work_item_name=best_wi.name,
            work_item_article=best_wi.article,
            section_name=best_wi.section.name if best_wi.section else '',
            hours=str(best_wi.hours or 0),
            required_grade=_wi_grade_str(best_wi),
            unit=best_wi.unit,
            calculated_cost=ctx.get_cost_for_work_item(best_wi),
            confidence=round(conf, 3),
            source='web',
            llm_reasoning=reasoning,
            web_search_query=user_prompt,
            web_search_result_summary=work_type,
        )


# ====================== Helpers ======================

def _format_candidates(candidates: List[Dict]) -> str:
    lines = []
    for c in candidates:
        lines.append(f"  id={c['id']}, арт={c['article']}, \"{c['name']}\" ({c['section']}, {c['unit']})")
    return '\n'.join(lines)


# Полный список уровней в порядке выполнения
ALL_TIERS = [
    Tier0Default(),
    Tier1History(),
    Tier2PriceList(),
    Tier3Knowledge(),
    Tier4Category(),
    Tier5Fuzzy(),
    Tier6LLM(),
    Tier7WebSearch(),
]

TIER_NAMES = ['default', 'history', 'pricelist', 'knowledge', 'category', 'fuzzy', 'llm', 'web']

# Быстрые тиры (0-5): CPU/memory only, без LLM API calls
FAST_TIERS = [
    Tier0Default(),
    Tier1History(),
    Tier2PriceList(),
    Tier3Knowledge(),
    Tier4Category(),
    Tier5Fuzzy(),
]

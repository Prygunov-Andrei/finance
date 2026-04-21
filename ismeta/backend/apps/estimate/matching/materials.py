"""Matching pipeline для МАТЕРИАЛОВ (E-MAT-01).

В отличие от `matching.tiers` (подбор РАБОТ), здесь:
- источник — справочник `Material` в БД ISMeta;
- primary tier — fuzzy similarity (rapidfuzz, UTF-8 safe) на name+model_name+brand;
- результат подставляется в `EstimateItem.material_price` (а не work_price).

Почему rapidfuzz, а не pg_trgm: PostgreSQL pg_trgm возвращает 0.0 для кириллицы
(триграммы строятся побайтно и UTF-8 кириллица рассыпается). Справочник
материалов ограничен размером workspace (<= 10k строк), поэтому Python-side
fuzzy с rapidfuzz.process.extract укладывается в < 50 мс даже без индекса.
pg_trgm GIN-индекс оставляется в миграции как задел на будущее (ASCII-фильтры,
быстрый ILIKE).

Confidence buckets:
- green  (>= 0.90) — уверенный матч, auto-apply;
- yellow (>= 0.70) — предлагаем в UI, оператор подтверждает;
- red    (<  0.70) — не возвращаем (оператор подбирает вручную).
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Iterable
from dataclasses import dataclass
from decimal import Decimal

from django.db import connection
from rapidfuzz import fuzz

from apps.estimate.models import EstimateItem, Material

logger = logging.getLogger(__name__)


GREEN_THRESHOLD = Decimal("0.90")
YELLOW_THRESHOLD = Decimal("0.70")


@dataclass
class MaterialMatch:
    """Подбор материала для одной EstimateItem."""

    item_id: str
    material_id: str
    material_name: str
    material_unit: str
    material_price: Decimal
    confidence: Decimal  # 0..1
    bucket: str  # green | yellow | red

    def as_dict(self) -> dict:
        return {
            "item_id": self.item_id,
            "material_id": self.material_id,
            "material_name": self.material_name,
            "material_unit": self.material_unit,
            "material_price": str(self.material_price),
            "confidence": str(self.confidence),
            "bucket": self.bucket,
        }


def _bucket_for(score: Decimal) -> str:
    if score >= GREEN_THRESHOLD:
        return "green"
    if score >= YELLOW_THRESHOLD:
        return "yellow"
    return "red"


def _build_query_for_item(item: EstimateItem) -> str:
    """Строит строку для trigram поиска по полям item + tech_specs."""
    parts: list[str] = [item.name]
    tech = item.tech_specs or {}
    if isinstance(tech, dict):
        for key in ("model_name", "brand"):
            val = tech.get(key)
            if val and str(val).strip():
                parts.append(str(val).strip())
    return " ".join(parts).strip()


MIN_SCORE = Decimal("0.1")  # фильтр шума, ниже порога yellow


def _similarity(a: str, b: str) -> float:
    """0..1 similarity на основе rapidfuzz.token_set_ratio (UTF-8 safe, устойчив к перестановкам).

    token_set_ratio хорошо работает для артикулов/моделей в середине строки:
    "Кабель ВВГнг 3x2.5" vs "ВВГнг 3x2.5 силовой кабель" = 100.
    """
    if not a or not b:
        return 0.0
    return fuzz.token_set_ratio(a.lower(), b.lower()) / 100.0


def materials_search(
    workspace_id: str, query: str, limit: int = 20
) -> list[tuple[Material, Decimal]]:
    """Поиск материалов по fuzzy-подобию. Возвращает [(Material, score)]."""
    q = (query or "").strip()
    if not q:
        return []

    candidates = list(
        Material.objects.filter(workspace_id=workspace_id, is_active=True)
    )
    if not candidates:
        return []

    scored: list[tuple[Material, Decimal]] = []
    for mat in candidates:
        score_f = _similarity(q, mat.search_text)
        score = Decimal(str(round(score_f, 4)))
        if score < MIN_SCORE:
            continue
        scored.append((mat, score))

    scored.sort(key=lambda pair: (-pair[1], pair[0].name))
    return scored[:limit]


def match_item(item: EstimateItem, workspace_id: str) -> MaterialMatch | None:
    """Подобрать материал для одной позиции. None если score < YELLOW."""
    query = _build_query_for_item(item)
    if not query:
        return None

    hits = materials_search(workspace_id, query, limit=1)
    if not hits:
        return None

    material, score = hits[0]
    if score < YELLOW_THRESHOLD:
        return None

    return MaterialMatch(
        item_id=str(item.id),
        material_id=str(material.id),
        material_name=material.name,
        material_unit=material.unit,
        material_price=material.price,
        confidence=score,
        bucket=_bucket_for(score),
    )


def match_items(
    items: Iterable[EstimateItem], workspace_id: str
) -> list[MaterialMatch]:
    """Пакетный подбор материалов. Для пустого каталога вернёт []."""
    results: list[MaterialMatch] = []
    for item in items:
        match = match_item(item, workspace_id)
        if match is not None:
            results.append(match)
    return results


class MaterialMatchingService:
    """Точка входа в matching пайплайн материалов."""

    @staticmethod
    def match_estimate(estimate_id: str, workspace_id: str) -> dict:
        """Подобрать материалы для всех позиций сметы.

        Возвращает: {session_id, total_items, matched, results}
        где results — список MaterialMatch.as_dict().
        """
        items = list(
            EstimateItem.objects.filter(
                estimate_id=estimate_id,
                workspace_id=workspace_id,
                is_deleted=False,
            ).order_by("sort_order")
        )

        matches = match_items(items, workspace_id)

        return {
            "session_id": str(uuid.uuid4()),
            "total_items": len(items),
            "matched": len(matches),
            "results": [m.as_dict() for m in matches],
        }

    @staticmethod
    def apply_matches(matches: list[dict], workspace_id: str) -> int:
        """Проставить material_price в EstimateItem по списку матчей.

        Обновляет только указанные items (green уровня — auto, yellow —
        если пользователь явно подтвердил через UI).
        """
        updated = 0
        for m in matches:
            item_id = m.get("item_id")
            price = m.get("material_price")
            if not item_id or price in (None, ""):
                continue
            with connection.cursor() as cur:
                cur.execute(
                    """
                    UPDATE estimate_item
                    SET material_price = %s,
                        version = version + 1,
                        updated_at = NOW()
                    WHERE id = %s AND workspace_id = %s AND is_deleted = FALSE
                    """,
                    [price, item_id, workspace_id],
                )
                updated += cur.rowcount
        return updated

    @staticmethod
    def auto_apply_green(estimate_id: str, workspace_id: str) -> int:
        """Shortcut: подобрать и применить только green-матчи (>=0.90)."""
        result = MaterialMatchingService.match_estimate(estimate_id, workspace_id)
        green = [r for r in result["results"] if r.get("bucket") == "green"]
        return MaterialMatchingService.apply_matches(green, workspace_id)

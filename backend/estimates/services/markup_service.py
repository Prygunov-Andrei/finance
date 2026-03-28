"""
Сервис пересчёта наценок в сметах.

Вызывается при изменении наценки на уровне сметы, раздела
или массовой установке наценки на строки.

Содержит единственный источник правды для расчёта продажных цен
(resolve_material_sale_price / resolve_work_sale_price).
"""
from collections import defaultdict
from decimal import Decimal
from typing import Optional

from estimates.models import (
    Estimate, EstimateSection, EstimateSubsection, EstimateItem,
)


# ---------------------------------------------------------------------------
# Единый источник правды: расчёт продажной цены за единицу
# ---------------------------------------------------------------------------

def resolve_material_sale_price(
    purchase: Decimal,
    markup_type: Optional[str],
    markup_value: Optional[Decimal],
    section_pct: Optional[Decimal],
    estimate_pct: Decimal,
) -> Decimal:
    """Продажная цена материала за единицу с учётом каскада наценок.

    Приоритет: строка (markup_type/value) → раздел (section_pct) → смета (estimate_pct).
    """
    if not purchase:
        return Decimal('0')
    if markup_type == 'percent' and markup_value is not None:
        return (purchase * (1 + markup_value / 100)).quantize(Decimal('0.01'))
    if markup_type == 'fixed_price' and markup_value is not None:
        return markup_value
    if markup_type == 'fixed_amount' and markup_value is not None:
        return (purchase + markup_value).quantize(Decimal('0.01'))
    pct = section_pct if section_pct is not None else estimate_pct
    return (purchase * (1 + pct / 100)).quantize(Decimal('0.01'))


def resolve_work_sale_price(
    purchase: Decimal,
    markup_type: Optional[str],
    markup_value: Optional[Decimal],
    section_pct: Optional[Decimal],
    estimate_pct: Decimal,
) -> Decimal:
    """Продажная цена работы за единицу с учётом каскада наценок.

    Приоритет: строка (markup_type/value) → раздел (section_pct) → смета (estimate_pct).
    """
    if not purchase:
        return Decimal('0')
    if markup_type == 'percent' and markup_value is not None:
        return (purchase * (1 + markup_value / 100)).quantize(Decimal('0.01'))
    if markup_type == 'fixed_price' and markup_value is not None:
        return markup_value
    if markup_type == 'fixed_amount' and markup_value is not None:
        return (purchase + markup_value).quantize(Decimal('0.01'))
    pct = section_pct if section_pct is not None else estimate_pct
    return (purchase * (1 + pct / 100)).quantize(Decimal('0.01'))


# ---------------------------------------------------------------------------
# Пересчёт агрегатов подраздела
# ---------------------------------------------------------------------------

def _compute_subsection_totals(items, section, estimate):
    """
    Вычислить агрегаты подраздела из списка строк.
    Возвращает (mat_purchase, work_purchase, mat_sale, work_sale).
    """
    mat_purchase = work_purchase = mat_sale = work_sale = Decimal('0')

    for item in items:
        qty = item.quantity or Decimal('0')
        mat_price = item.material_unit_price or Decimal('0')
        work_price = item.work_unit_price or Decimal('0')

        mat_purchase += qty * mat_price
        work_purchase += qty * work_price

        mat_sale += qty * resolve_material_sale_price(
            mat_price, item.material_markup_type, item.material_markup_value,
            section.material_markup_percent, estimate.default_material_markup_percent,
        )
        work_sale += qty * resolve_work_sale_price(
            work_price, item.work_markup_type, item.work_markup_value,
            section.work_markup_percent, estimate.default_work_markup_percent,
        )

    return (
        mat_purchase.quantize(Decimal('0.01')),
        work_purchase.quantize(Decimal('0.01')),
        mat_sale.quantize(Decimal('0.01')),
        work_sale.quantize(Decimal('0.01')),
    )


def recalculate_estimate_subsections(estimate_id: int):
    """Пересчитать ВСЕ подразделы сметы (после изменения дефолтной наценки)."""
    estimate = Estimate.objects.get(pk=estimate_id)
    sections = {s.id: s for s in EstimateSection.objects.filter(estimate=estimate)}
    subsections = list(EstimateSubsection.objects.filter(section__estimate=estimate))

    items = EstimateItem.objects.filter(
        estimate=estimate, subsection__isnull=False
    )

    by_subsection = defaultdict(list)
    for item in items:
        by_subsection[item.subsection_id].append(item)

    to_update = []
    for sub in subsections:
        section = sections[sub.section_id]
        sub_items = by_subsection.get(sub.id, [])
        mat_p, work_p, mat_s, work_s = _compute_subsection_totals(sub_items, section, estimate)
        sub.materials_purchase = mat_p
        sub.works_purchase = work_p
        sub.materials_sale = mat_s
        sub.works_sale = work_s
        to_update.append(sub)

    if to_update:
        EstimateSubsection.objects.bulk_update(
            to_update,
            ['materials_purchase', 'works_purchase', 'materials_sale', 'works_sale']
        )

    estimate.refresh_from_db()
    estimate.update_auto_characteristics()


def recalculate_section_subsections(section_id: int):
    """Пересчитать подразделы одного раздела (после изменения наценки раздела)."""
    section = EstimateSection.objects.select_related('estimate').get(pk=section_id)
    estimate = section.estimate
    subsections = list(EstimateSubsection.objects.filter(section=section))

    items = EstimateItem.objects.filter(subsection__section=section)
    by_subsection = defaultdict(list)
    for item in items:
        by_subsection[item.subsection_id].append(item)

    to_update = []
    for sub in subsections:
        sub_items = by_subsection.get(sub.id, [])
        mat_p, work_p, mat_s, work_s = _compute_subsection_totals(sub_items, section, estimate)
        sub.materials_purchase = mat_p
        sub.works_purchase = work_p
        sub.materials_sale = mat_s
        sub.works_sale = work_s
        to_update.append(sub)

    if to_update:
        EstimateSubsection.objects.bulk_update(
            to_update,
            ['materials_purchase', 'works_purchase', 'materials_sale', 'works_sale']
        )

    estimate.refresh_from_db()
    estimate.update_auto_characteristics()


def recalculate_subsections_for_items(item_ids):
    """Пересчитать подразделы для всех подразделов, содержащих указанные строки."""
    affected_subsection_ids = set(
        EstimateItem.objects.filter(id__in=item_ids)
        .values_list('subsection_id', flat=True)
        .distinct()
    )
    affected_subsection_ids.discard(None)

    if not affected_subsection_ids:
        return

    affected_estimate_ids = set()
    for sub in EstimateSubsection.objects.filter(
        id__in=affected_subsection_ids
    ).select_related('section__estimate'):
        section = sub.section
        estimate = section.estimate
        affected_estimate_ids.add(estimate.id)

        sub_items = list(EstimateItem.objects.filter(subsection=sub))
        mat_p, work_p, mat_s, work_s = _compute_subsection_totals(sub_items, section, estimate)
        sub.materials_purchase = mat_p
        sub.works_purchase = work_p
        sub.materials_sale = mat_s
        sub.works_sale = work_s
        sub.save(update_fields=[
            'materials_purchase', 'works_purchase', 'materials_sale', 'works_sale',
        ])

    for est_id in affected_estimate_ids:
        est = Estimate.objects.get(pk=est_id)
        est.refresh_from_db()
        est.update_auto_characteristics()


def bulk_set_item_markup(item_ids, material_markup_type=None, material_markup_value=None,
                         work_markup_type=None, work_markup_value=None):
    """
    Массовая установка наценки на выбранные строки.
    None = не менять, 'clear' для type = сбросить к наследованию.
    """
    items = EstimateItem.objects.filter(id__in=item_ids).select_related('subsection')

    changed = False

    if material_markup_type is not None:
        if material_markup_type == 'clear':
            items.update(material_markup_type=None, material_markup_value=None)
        else:
            items.update(
                material_markup_type=material_markup_type,
                material_markup_value=material_markup_value,
            )
        changed = True

    if work_markup_type is not None:
        if work_markup_type == 'clear':
            items.update(work_markup_type=None, work_markup_value=None)
        else:
            items.update(
                work_markup_type=work_markup_type,
                work_markup_value=work_markup_value,
            )
        changed = True

    if not changed:
        return

    recalculate_subsections_for_items(item_ids)

"""Расчёт человеко-часов после подбора работ."""
import logging
from decimal import Decimal

logger = logging.getLogger(__name__)


def calculate_man_hours(estimate) -> Decimal:
    """Суммирует часы × количество для всех строк с работами.

    Если есть PriceListItem — берёт effective_hours × effective_coefficient.
    Иначе — work_item.hours напрямую.
    Обновляет Estimate.man_hours.

    Returns:
        Decimal — общее количество человеко-часов
    """
    from estimates.models import EstimateItem
    from pricelists.models import PriceListItem

    items = (
        EstimateItem.objects.filter(estimate=estimate, work_item__isnull=False)
        .select_related('work_item')
    )

    # Pre-fetch PriceListItems если есть прайс-лист
    pli_map = {}
    if estimate.price_list_id:
        for pli in PriceListItem.objects.filter(
            price_list=estimate.price_list,
        ).select_related('work_item'):
            pli_map[pli.work_item_id] = pli

    total = Decimal('0')
    for item in items:
        pli = pli_map.get(item.work_item_id)
        if pli:
            hours = (pli.hours_override if pli.hours_override is not None
                     else (item.work_item.hours or Decimal('0')))
            coeff = (pli.coefficient_override if pli.coefficient_override is not None
                     else item.work_item.coefficient)
            item_hours = hours * coeff
        else:
            item_hours = item.work_item.hours or Decimal('0')

        total += item.quantity * item_hours

    estimate.man_hours = total
    estimate.save(update_fields=['man_hours'])

    logger.info('Estimate %s: man_hours = %s', estimate.pk, total)
    return total

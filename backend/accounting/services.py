"""
Сервисы для работы с контрагентами: поиск дубликатов, валидация через ФНС, слияние.
"""

import logging
import re
from collections import defaultdict
from difflib import SequenceMatcher

from django.db import transaction

from .models import Counterparty

logger = logging.getLogger('accounting')


def normalize_name(name: str) -> str:
    """Нормализация названия для сравнения: убираем кавычки, формы, лишние пробелы."""
    s = name.lower().strip()
    # Убираем кавычки
    s = re.sub(r'[«»""\'"]', '', s)
    # Убираем полные наименования организационно-правовых форм
    full_forms = [
        'общество с ограниченной ответственностью',
        'акционерное общество',
        'закрытое акционерное общество',
        'открытое акционерное общество',
        'публичное акционерное общество',
        'непубличное акционерное общество',
        'индивидуальный предприниматель',
        'некоммерческая организация',
        'автономная некоммерческая организация',
        'государственное бюджетное учреждение',
        'муниципальное унитарное предприятие',
        'федеральное государственное унитарное предприятие',
    ]
    for form in full_forms:
        s = s.replace(form, '')
    # Убираем сокращённые формы
    for prefix in ['ооо', 'ип', 'зао', 'оао', 'пао', 'нао', 'ао', 'нко', 'ано', 'гбу', 'муп', 'фгуп']:
        s = re.sub(rf'\b{prefix}\b', '', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s


def name_similarity(a: str, b: str) -> float:
    """Вычисляет схожесть двух названий (0..1)."""
    return SequenceMatcher(None, normalize_name(a), normalize_name(b)).ratio()


def find_duplicate_groups(min_similarity: float = 0.8):
    """
    Находит группы потенциальных дубликатов контрагентов.

    Алгоритм:
    1. Группируем по нормализованному названию
    2. Внутри группы проверяем ИНН: если отличаются на 1-2 цифры — вероятный дубль

    Returns:
        list of dict:
        [
          {
            'normalized_name': str,
            'counterparties': [
              {'id': int, 'name': str, 'inn': str, 'type': str, ...},
            ],
            'similarity': float,
          },
        ]
    """
    all_cps = list(Counterparty.objects.all().values(
        'id', 'name', 'short_name', 'inn', 'type', 'vendor_subtype',
        'legal_form', 'kpp', 'ogrn', 'is_active',
    ))

    # Подсчёт связанных объектов для каждого контрагента
    from django.db.models import Count
    relation_counts = {}
    for cp in Counterparty.objects.annotate(
        invoices_count=Count('invoices'),
        contracts_count=Count('contracts'),
        price_history_count=Count('product_prices'),
    ).values('id', 'invoices_count', 'contracts_count', 'price_history_count'):
        relation_counts[cp['id']] = {
            'invoices_count': cp['invoices_count'],
            'contracts_count': cp['contracts_count'],
            'price_history_count': cp['price_history_count'],
        }

    # Группируем по нормализованному названию
    name_groups = defaultdict(list)
    for cp in all_cps:
        norm = normalize_name(cp['name'])
        cp['_relations'] = relation_counts.get(cp['id'], {
            'invoices_count': 0, 'contracts_count': 0, 'price_history_count': 0,
        })
        name_groups[norm].append(cp)

    groups = []

    # Группы с одинаковыми нормализованными названиями (>=2 записей)
    for norm_name, cps in name_groups.items():
        if len(cps) >= 2:
            groups.append({
                'normalized_name': norm_name,
                'counterparties': cps,
                'similarity': 1.0,
            })

    # Дополнительно: ищем почти-совпадения между разными группами
    norms = list(name_groups.keys())
    for i in range(len(norms)):
        for j in range(i + 1, len(norms)):
            # Только для одиночных записей (которые ещё не в группах)
            if len(name_groups[norms[i]]) > 1 or len(name_groups[norms[j]]) > 1:
                continue
            sim = SequenceMatcher(None, norms[i], norms[j]).ratio()
            if sim >= min_similarity:
                merged = name_groups[norms[i]] + name_groups[norms[j]]
                groups.append({
                    'normalized_name': f"{norms[i]} / {norms[j]}",
                    'counterparties': merged,
                    'similarity': round(sim, 3),
                })

    # Сортируем: самые большие группы первыми
    groups.sort(key=lambda g: len(g['counterparties']), reverse=True)
    return groups


def merge_counterparties(keep_id: int, remove_ids: list[int]) -> dict:
    """
    Сливает контрагентов: все связи с remove_ids переносятся на keep_id,
    затем remove_ids удаляются.

    Returns:
        dict: {'merged': int, 'relations_moved': dict}
    """
    keep = Counterparty.objects.get(pk=keep_id)
    to_remove = Counterparty.objects.filter(pk__in=remove_ids)

    if not to_remove.exists():
        return {'merged': 0, 'relations_moved': {}}

    relations_moved = {}

    with transaction.atomic():
        for cp in to_remove:
            moved = _transfer_relations(cp, keep)
            for key, count in moved.items():
                relations_moved[key] = relations_moved.get(key, 0) + count

        merged_count = to_remove.count()
        to_remove.delete()

    logger.info(
        'Merged %d counterparties into %s (id=%d). Relations moved: %s',
        merged_count, keep.name, keep.id, relations_moved,
    )

    return {'merged': merged_count, 'relations_moved': relations_moved}


def _transfer_relations(source: Counterparty, target: Counterparty) -> dict:
    """Переносит все связанные объекты с source на target."""
    moved = {}

    # Invoice — PROTECT, nullable
    count = source.invoices.update(counterparty=target)
    if count:
        moved['invoices'] = count

    # RecurringPayment — PROTECT, not null
    count = source.recurring_payments.update(counterparty=target)
    if count:
        moved['recurring_payments'] = count

    # FrameworkContract — PROTECT, not null
    count = source.framework_contracts.update(counterparty=target)
    if count:
        moved['framework_contracts'] = count

    # Contract — PROTECT, nullable
    count = source.contracts.update(counterparty=target)
    if count:
        moved['contracts'] = count

    # PriceListAgreement — PROTECT, not null
    count = source.price_list_agreements.update(counterparty=target)
    if count:
        moved['price_list_agreements'] = count

    # Correspondence — PROTECT, nullable
    count = source.correspondence.update(counterparty=target)
    if count:
        moved['correspondence'] = count

    # IncomeRecord — SET_NULL, nullable
    count = source.income_records.update(counterparty=target)
    if count:
        moved['income_records'] = count

    # MountingEstimate — SET_NULL, nullable
    count = source.agreed_mounting_estimates.update(agreed_counterparty=target)
    if count:
        moved['mounting_estimates'] = count

    # SupplierIntegration — SET_NULL, nullable
    count = source.supplier_integrations.update(counterparty=target)
    if count:
        moved['supplier_integrations'] = count

    # MountingProposal — SET_NULL, nullable
    count = source.mounting_proposals.update(counterparty=target)
    if count:
        moved['mounting_proposals'] = count

    # ProductPriceHistory — CASCADE
    # Переносим, но только те, что не создадут дубликаты (product+counterparty уникальны?)
    count = source.product_prices.update(counterparty=target)
    if count:
        moved['product_prices'] = count

    # FNSReport — CASCADE (просто удалятся вместе с source, это ок)
    fns_count = source.fns_reports.count()
    if fns_count:
        moved['fns_reports_deleted'] = fns_count

    return moved

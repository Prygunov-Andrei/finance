"""
Трансформация SpecificationItem → Estimate → EstimateItem.

ERP-first сервис: используется и для внутреннего импорта спецификаций, и для портала.
"""
import logging
from typing import Optional

from django.contrib.auth.models import User
from django.db import transaction

from estimates.models import (
    Estimate, EstimateSection, EstimateSubsection, EstimateItem,
    SpecificationItem,
)
from objects.models import Object
from accounting.models import LegalEntity

logger = logging.getLogger(__name__)

# Название объекта для автоматически созданных смет портала
PORTAL_OBJECT_NAME = 'Публичный портал'


def _get_or_create_portal_object():
    """Получает или создаёт объект для смет публичного портала."""
    obj = Object.objects.filter(name=PORTAL_OBJECT_NAME).first()
    if not obj:
        obj = Object.objects.create(name=PORTAL_OBJECT_NAME)
    return obj


def _get_default_legal_entity():
    """Получает юр.лицо по умолчанию (первое в БД)."""
    entity = LegalEntity.objects.first()
    if not entity:
        entity = LegalEntity.objects.create(
            name='ООО Компания',
            short_name='Компания',
        )
    return entity


def _get_or_create_system_user():
    """Получает или создаёт системного пользователя для автоматических смет."""
    user, _ = User.objects.get_or_create(
        username='portal_system',
        defaults={
            'first_name': 'Портал',
            'last_name': 'Система',
            'is_active': False,
        },
    )
    return user


@transaction.atomic
def create_estimate_from_spec_items(
    request,  # api_public.EstimateRequest
    object_instance: Optional[Object] = None,
    legal_entity: Optional[LegalEntity] = None,
    created_by: Optional[User] = None,
) -> Estimate:
    """Трансформирует сырые SpecificationItem в стандартную Estimate ERP.

    1. Создаёт Estimate (связывает с EstimateRequest)
    2. Группирует SpecificationItem по section_name → EstimateSection
    3. Создаёт EstimateSubsection (по умолчанию одна на секцию)
    4. Для каждого SpecificationItem → EstimateItem

    Args:
        request: EstimateRequest из api_public
        object_instance: Объект для сметы (если None — портальный объект)
        legal_entity: Юр.лицо (если None — первое в БД)

    Returns:
        Созданная Estimate.
    """
    if object_instance is None:
        object_instance = _get_or_create_portal_object()
    if legal_entity is None:
        legal_entity = _get_default_legal_entity()
    if created_by is None:
        created_by = _get_or_create_system_user()

    estimate = Estimate.objects.create(
        name=f'Портал: {request.project_name}',
        object=object_instance,
        legal_entity=legal_entity,
        created_by=created_by,
        status=Estimate.Status.DRAFT,
    )
    request.estimate = estimate
    request.save(update_fields=['estimate'])

    spec_items = request.spec_items.order_by('sort_order', 'created_at')

    if not spec_items.exists():
        logger.warning(
            'create_estimate_from_spec_items: нет SpecificationItem для запроса #%s',
            request.pk,
        )
        return estimate

    # Группировка по разделам
    sections = {}
    item_number = 0

    for spec_item in spec_items:
        section_key = spec_item.section_name or 'Общее'

        if section_key not in sections:
            section = EstimateSection.objects.create(
                estimate=estimate,
                name=section_key,
                sort_order=len(sections),
            )
            subsection = EstimateSubsection.objects.create(
                section=section,
                name='Оборудование и материалы',
                sort_order=0,
            )
            sections[section_key] = (section, subsection)

        section, subsection = sections[section_key]
        item_number += 1

        EstimateItem.objects.create(
            estimate=estimate,
            section=section,
            subsection=subsection,
            item_number=str(item_number),
            name=spec_item.name,
            model_name=spec_item.model_name,
            unit=spec_item.unit,
            quantity=spec_item.quantity,
            original_name=spec_item.name,
            custom_data={
                'brand': spec_item.brand,
                'tech_specs': spec_item.tech_specs_raw,
                'source_spec_item_id': spec_item.pk,
            },
        )

    logger.info(
        'create_estimate_from_spec_items: создана смета %s с %d позициями в %d секциях',
        estimate.number, item_number, len(sections),
    )

    return estimate

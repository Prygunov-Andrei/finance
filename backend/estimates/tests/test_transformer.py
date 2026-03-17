"""Тесты specification_transformer — Заход 2."""
import pytest
from decimal import Decimal

from estimates.models import (
    Estimate, EstimateSection, EstimateSubsection, EstimateItem,
    SpecificationItem,
)
from estimates.services.specification_transformer import create_estimate_from_spec_items
from api_public.tests.factories import EstimateRequestFactory


@pytest.fixture
def portal_object(db):
    """Объект для портальных смет."""
    from objects.models import Object
    return Object.objects.create(name='Тестовый портал')


@pytest.fixture
def legal_entity(db):
    """Юр.лицо для тестов."""
    from accounting.models import LegalEntity, TaxSystem
    tax_system, _ = TaxSystem.objects.get_or_create(
        code='osno', defaults={'name': 'ОСНО'},
    )
    return LegalEntity.objects.create(
        name='ООО Тест', short_name='Тест', tax_system=tax_system,
    )


@pytest.fixture
def request_with_items(db):
    """EstimateRequest с несколькими SpecificationItem."""
    req = EstimateRequestFactory()
    SpecificationItem.objects.create(
        request=req, name='Вентилятор ВКК-160', model_name='ВКК-160',
        brand='Вентс', unit='шт', quantity=2, section_name='ОВ',
        tech_specs_raw='350 м3/ч', sort_order=0,
    )
    SpecificationItem.objects.create(
        request=req, name='Труба PPR 25мм', unit='м',
        quantity=Decimal('50.000'), section_name='ВК', sort_order=1,
    )
    SpecificationItem.objects.create(
        request=req, name='Клапан обратный DN50', unit='шт',
        quantity=3, section_name='ВК', sort_order=2,
    )
    return req


@pytest.fixture
def empty_request(db):
    """EstimateRequest без SpecificationItem."""
    return EstimateRequestFactory()


@pytest.fixture
def system_user(db):
    """Системный пользователь для тестов."""
    from django.contrib.auth.models import User
    return User.objects.create_user(username='test_system', password='test')


def _create(req, obj, le, user):
    """Хелпер: вызов create_estimate_from_spec_items с фикстурами."""
    return create_estimate_from_spec_items(
        req, object_instance=obj, legal_entity=le, created_by=user,
    )


class TestCreateEstimateFromSpecItems:
    """Тесты create_estimate_from_spec_items()."""

    def test_estimate_created(self, request_with_items, portal_object, legal_entity, system_user):
        """Estimate создаётся и связывается с request."""
        estimate = _create(request_with_items, portal_object, legal_entity, system_user)

        assert estimate.pk is not None
        assert estimate.number  # автогенерация номера
        assert estimate.status == Estimate.Status.DRAFT
        assert 'Портал' in estimate.name
        assert request_with_items.project_name in estimate.name

        request_with_items.refresh_from_db()
        assert request_with_items.estimate == estimate

    def test_sections_grouped(self, request_with_items, portal_object, legal_entity, system_user):
        """SpecificationItem группируются по section_name → EstimateSection."""
        estimate = _create(request_with_items, portal_object, legal_entity, system_user)

        sections = EstimateSection.objects.filter(estimate=estimate).order_by('sort_order')
        section_names = list(sections.values_list('name', flat=True))
        assert 'ОВ' in section_names
        assert 'ВК' in section_names
        assert len(section_names) == 2

    def test_items_created(self, request_with_items, portal_object, legal_entity, system_user):
        """EstimateItem создаются для каждого SpecificationItem."""
        estimate = _create(request_with_items, portal_object, legal_entity, system_user)

        items = EstimateItem.objects.filter(estimate=estimate)
        assert items.count() == 3

    def test_item_fields_mapped(self, request_with_items, portal_object, legal_entity, system_user):
        """Поля SpecificationItem корректно маппятся в EstimateItem."""
        estimate = _create(request_with_items, portal_object, legal_entity, system_user)

        item = EstimateItem.objects.filter(
            estimate=estimate, name='Вентилятор ВКК-160',
        ).first()
        assert item is not None
        assert item.model_name == 'ВКК-160'
        assert item.unit == 'шт'
        assert item.quantity == Decimal('2')
        assert item.original_name == 'Вентилятор ВКК-160'

    def test_custom_data_populated(self, request_with_items, portal_object, legal_entity, system_user):
        """brand и tech_specs сохраняются в custom_data."""
        estimate = _create(request_with_items, portal_object, legal_entity, system_user)

        item = EstimateItem.objects.filter(
            estimate=estimate, name='Вентилятор ВКК-160',
        ).first()
        assert item.custom_data['brand'] == 'Вентс'
        assert item.custom_data['tech_specs'] == '350 м3/ч'
        assert 'source_spec_item_id' in item.custom_data

    def test_subsection_created(self, request_with_items, portal_object, legal_entity, system_user):
        """Каждая секция получает один Subsection."""
        estimate = _create(request_with_items, portal_object, legal_entity, system_user)

        for section in estimate.sections.all():
            assert section.subsections.count() == 1
            assert section.subsections.first().name == 'Оборудование и материалы'

    def test_items_in_correct_section(self, request_with_items, portal_object, legal_entity, system_user):
        """Позиции попадают в правильные секции."""
        estimate = _create(request_with_items, portal_object, legal_entity, system_user)

        ov_section = EstimateSection.objects.get(estimate=estimate, name='ОВ')
        vk_section = EstimateSection.objects.get(estimate=estimate, name='ВК')

        assert EstimateItem.objects.filter(section=ov_section).count() == 1
        assert EstimateItem.objects.filter(section=vk_section).count() == 2

    def test_empty_request(self, empty_request, portal_object, legal_entity, system_user):
        """Пустой request → пустая смета (без секций)."""
        estimate = _create(empty_request, portal_object, legal_entity, system_user)

        assert estimate.pk is not None
        assert estimate.sections.count() == 0

    def test_no_section_name_uses_default(self, portal_object, legal_entity, system_user):
        """SpecificationItem без section_name → секция 'Общее'."""
        req = EstimateRequestFactory()
        SpecificationItem.objects.create(
            request=req, name='Неизвестная позиция', section_name='',
        )
        estimate = _create(req, portal_object, legal_entity, system_user)

        section = estimate.sections.first()
        assert section.name == 'Общее'

    def test_item_numbering(self, request_with_items, portal_object, legal_entity, system_user):
        """item_number последователен (1, 2, 3)."""
        estimate = _create(request_with_items, portal_object, legal_entity, system_user)

        items = EstimateItem.objects.filter(estimate=estimate).order_by('item_number')
        numbers = [it.item_number for it in items]
        assert numbers == [1, 2, 3] or numbers == ['1', '2', '3']

    def test_object_and_legal_entity_used(self, request_with_items, portal_object, legal_entity, system_user):
        """Переданные object и legal_entity используются."""
        estimate = _create(request_with_items, portal_object, legal_entity, system_user)
        assert estimate.object == portal_object
        assert estimate.legal_entity == legal_entity

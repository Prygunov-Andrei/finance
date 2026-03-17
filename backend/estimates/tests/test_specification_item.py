"""Тесты модели SpecificationItem — Заход 0+1."""
import pytest
from decimal import Decimal

from estimates.models import SpecificationItem
from api_public.tests.factories import EstimateRequestFactory, EstimateRequestFileFactory


@pytest.fixture
def spec_request(db):
    return EstimateRequestFactory()


@pytest.fixture
def spec_file(spec_request):
    return EstimateRequestFileFactory(request=spec_request)


class TestSpecificationItem:
    """Тесты модели SpecificationItem."""

    def test_create_basic(self, spec_request):
        """Создание базовой позиции спецификации."""
        item = SpecificationItem.objects.create(
            request=spec_request,
            name='Кондиционер Daikin FTXB35C',
            unit='шт',
            quantity=2,
        )
        assert item.pk is not None
        assert item.name == 'Кондиционер Daikin FTXB35C'

    def test_default_values(self, spec_request):
        """Дефолтные значения: unit='шт', quantity=1."""
        item = SpecificationItem.objects.create(
            request=spec_request,
            name='Труба PPR 25мм',
        )
        assert item.unit == 'шт'
        assert item.quantity == Decimal('1')
        assert item.page_number == 0
        assert item.sort_order == 0

    def test_cross_app_fk_request(self, spec_request):
        """FK на api_public.EstimateRequest работает."""
        item = SpecificationItem.objects.create(
            request=spec_request,
            name='Клапан обратный DN50',
        )
        assert item.request == spec_request
        assert spec_request.spec_items.count() == 1

    def test_cross_app_fk_source_file(self, spec_request, spec_file):
        """FK на api_public.EstimateRequestFile работает."""
        item = SpecificationItem.objects.create(
            request=spec_request,
            source_file=spec_file,
            name='Насос циркуляционный',
        )
        assert item.source_file == spec_file
        assert spec_file.spec_items.count() == 1

    def test_source_file_nullable(self, spec_request):
        """source_file может быть NULL."""
        item = SpecificationItem.objects.create(
            request=spec_request,
            name='Без файла-источника',
            source_file=None,
        )
        assert item.source_file is None

    def test_cascade_delete_on_request(self, spec_request):
        """При удалении запроса удаляются SpecificationItem."""
        SpecificationItem.objects.create(
            request=spec_request, name='Позиция 1',
        )
        SpecificationItem.objects.create(
            request=spec_request, name='Позиция 2',
        )
        assert SpecificationItem.objects.count() == 2
        spec_request.delete()
        assert SpecificationItem.objects.count() == 0

    def test_source_file_set_null(self, spec_request, spec_file):
        """При удалении файла source_file ставится в NULL."""
        item = SpecificationItem.objects.create(
            request=spec_request,
            source_file=spec_file,
            name='Позиция с файлом',
        )
        spec_file.delete()
        item.refresh_from_db()
        assert item.source_file is None

    def test_all_fields(self, spec_request, spec_file):
        """Создание позиции со всеми заполненными полями."""
        item = SpecificationItem.objects.create(
            request=spec_request,
            source_file=spec_file,
            name='Вентилятор канальный ВКК-160',
            model_name='ВКК-160',
            brand='Вентс',
            unit='шт',
            quantity=Decimal('4.000'),
            tech_specs_raw='Расход 350 м3/ч, давление 250 Па',
            section_name='ОВ',
            page_number=5,
            sort_order=10,
        )
        assert item.model_name == 'ВКК-160'
        assert item.brand == 'Вентс'
        assert item.tech_specs_raw == 'Расход 350 м3/ч, давление 250 Па'
        assert item.section_name == 'ОВ'
        assert item.page_number == 5
        assert item.sort_order == 10

    def test_ordering(self, spec_request):
        """Позиции упорядочены по sort_order, затем created_at."""
        item2 = SpecificationItem.objects.create(
            request=spec_request, name='Второй', sort_order=2,
        )
        item1 = SpecificationItem.objects.create(
            request=spec_request, name='Первый', sort_order=1,
        )
        qs = SpecificationItem.objects.filter(request=spec_request)
        assert list(qs) == [item1, item2]

    def test_str(self, spec_request):
        """__str__ содержит имя, количество и единицу."""
        item = SpecificationItem.objects.create(
            request=spec_request,
            name='Фильтр',
            quantity=Decimal('3.000'),
            unit='шт',
        )
        s = str(item)
        assert 'Фильтр' in s
        assert 'шт' in s

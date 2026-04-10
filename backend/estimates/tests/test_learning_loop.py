"""Тесты learning loop: perform_update создаёт ProductWorkMapping."""
from decimal import Decimal
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient

from accounting.models import LegalEntity
from catalog.models import Product, ProductWorkMapping, ProductKnowledge
from estimates.models import Estimate, EstimateSection, EstimateItem
from objects.models import Object
from pricelists.models import WorkItem, WorkSection, WorkerGrade


class LearningLoopTestCase(TestCase):
    """Test that manual work_item assignment feeds the learning system."""

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user('testuser', password='test123')
        cls.legal = LegalEntity.objects.create(name='Test LE', short_name='TLE')
        cls.obj = Object.objects.create(name='Test Object', legal_entity=cls.legal)
        cls.estimate = Estimate.objects.create(
            number='TEST-001', name='Test', object=cls.obj, legal_entity=cls.legal,
        )
        cls.section = EstimateSection.objects.create(
            estimate=cls.estimate, name='Section 1', sort_order=1,
        )
        cls.grade = WorkerGrade.objects.create(grade=3, name='Монтажник 3р', hourly_rate=Decimal('500'))
        cls.work_section = WorkSection.objects.create(name='Вентиляция', code='VENT')
        cls.work_item = WorkItem.objects.create(
            article='VENT-001', name='Монтаж воздуховода', unit='м',
            hours=Decimal('0.5'), section=cls.work_section, grade=cls.grade,
        )
        cls.product = Product.objects.create(
            name='Воздуховод круглый 200мм', normalized_name='воздуховод круглый 200мм',
        )

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.item = EstimateItem.objects.create(
            estimate=self.estimate, section=self.section,
            name='Воздуховод круглый 200мм', unit='м', quantity=Decimal('10'),
            product=self.product, sort_order=1, item_number=1,
        )

    def test_patch_work_item_creates_mapping(self):
        """PATCH work_item on EstimateItem should create ProductWorkMapping."""
        self.assertFalse(ProductWorkMapping.objects.filter(
            product=self.product, work_item=self.work_item,
        ).exists())

        resp = self.client.patch(
            f'/api/v1/estimate-items/{self.item.id}/',
            {'work_item': self.work_item.id},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)

        mapping = ProductWorkMapping.objects.get(
            product=self.product, work_item=self.work_item,
        )
        self.assertEqual(mapping.confidence, 1.0)
        self.assertEqual(mapping.source, ProductWorkMapping.Source.MANUAL)
        self.assertGreaterEqual(mapping.usage_count, 1)

    def test_patch_work_item_creates_knowledge(self):
        """PATCH work_item should also create ProductKnowledge entry."""
        self.client.patch(
            f'/api/v1/estimate-items/{self.item.id}/',
            {'work_item': self.work_item.id},
            format='json',
        )

        knowledge = ProductKnowledge.objects.filter(
            work_item=self.work_item,
        ).first()
        self.assertIsNotNone(knowledge)

    def test_no_mapping_without_product(self):
        """If EstimateItem has no product, no mapping should be created."""
        item_no_product = EstimateItem.objects.create(
            estimate=self.estimate, section=self.section,
            name='Что-то без товара', unit='шт', quantity=Decimal('1'),
            sort_order=2, item_number=2,
        )

        self.client.patch(
            f'/api/v1/estimate-items/{item_no_product.id}/',
            {'work_item': self.work_item.id},
            format='json',
        )

        self.assertFalse(ProductWorkMapping.objects.filter(
            work_item=self.work_item, product__isnull=True,
        ).exists())

    def test_repeated_assignment_increases_usage(self):
        """Same product+work_item assignment should increase usage_count."""
        self.client.patch(
            f'/api/v1/estimate-items/{self.item.id}/',
            {'work_item': self.work_item.id},
            format='json',
        )

        mapping = ProductWorkMapping.objects.get(
            product=self.product, work_item=self.work_item,
        )
        first_count = mapping.usage_count

        # Create another item with same product
        item2 = EstimateItem.objects.create(
            estimate=self.estimate, section=self.section,
            name='Воздуховод круглый 200мм (дубль)', unit='м', quantity=Decimal('5'),
            product=self.product, sort_order=3, item_number=3,
        )
        self.client.patch(
            f'/api/v1/estimate-items/{item2.id}/',
            {'work_item': self.work_item.id},
            format='json',
        )

        mapping.refresh_from_db()
        self.assertGreater(mapping.usage_count, first_count)

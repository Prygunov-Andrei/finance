from decimal import Decimal
from django.contrib.auth.models import User
from rest_framework.test import APITestCase
from rest_framework import status
from proposals.models import MountingProposal, MountingCondition
from objects.models import Object as ERPObject
from accounting.models import LegalEntity, Counterparty, TaxSystem


class MountingProposalM2MTest(APITestCase):
    """Тесты M2M поля mounting_estimates для MountingProposal"""

    def setUp(self):
        self.user = User.objects.create_user(username='testuser', password='password')
        self.client.force_authenticate(user=self.user)

        self.tax_system = TaxSystem.objects.filter(code='osn_vat_20').first()
        if not self.tax_system:
            self.tax_system = TaxSystem.objects.create(
                code='osn_vat_20', name='ОСН с НДС 20%', vat_rate=Decimal('20.00')
            )

        self.legal_entity = LegalEntity.objects.create(
            short_name='ООО Тест',
            full_name='ООО "Тест"',
            inn='1234567890',
            tax_system=self.tax_system,
        )

        self.obj = ERPObject.objects.create(
            name='Тестовый объект',
            customer=Counterparty.objects.create(
                name='Заказчик', short_name='З', type='customer',
                legal_form='ooo', inn='1111111111',
            ),
            legal_entity=self.legal_entity,
        )

    def test_mounting_estimates_m2m_field(self):
        """Поле mounting_estimates является M2M"""
        mp = MountingProposal.objects.create(
            name='Тестовое МП',
            date='2026-01-01',
            object=self.obj,
            created_by=self.user,
        )
        field = MountingProposal._meta.get_field('mounting_estimates')
        self.assertTrue(field.many_to_many)

    def test_create_mp_without_mounting_estimates(self):
        """Создание МП без монтажных смет"""
        mp = MountingProposal.objects.create(
            name='МП без смет',
            date='2026-01-01',
            object=self.obj,
            created_by=self.user,
        )
        self.assertEqual(mp.mounting_estimates.count(), 0)

    def test_create_new_version_copies_m2m(self):
        """Версионирование копирует M2M mounting_estimates"""
        mp = MountingProposal.objects.create(
            name='МП для версии',
            date='2026-01-01',
            object=self.obj,
            created_by=self.user,
        )
        cond = MountingCondition.objects.create(name='Условие')
        mp.conditions.add(cond)

        new_mp = mp.create_new_version()
        self.assertEqual(new_mp.version_number, 2)
        self.assertEqual(new_mp.conditions.count(), 1)
        self.assertIn(cond, new_mp.conditions.all())

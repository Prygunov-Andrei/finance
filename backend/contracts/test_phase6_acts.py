from decimal import Decimal
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from datetime import date

from objects.models import Object
from accounting.models import Counterparty, LegalEntity, TaxSystem
from .models import (
    Contract, Act, ActItem,
    ContractEstimate, ContractEstimateSection, ContractEstimateItem,
)


class Phase6TestMixin:
    """Общий setUp для тестов Фазы 6"""

    def _create_base_objects(self):
        self.tax_system = TaxSystem.objects.create(code='osn', name='ОСН')
        self.legal_entity = LegalEntity.objects.create(
            name='Наша Фирма', short_name='НФ',
            inn='1111111111', tax_system=self.tax_system,
        )
        self.counterparty = Counterparty.objects.create(
            name='Заказчик Тест', short_name='ЗТ',
            inn='2222222222',
            type=Counterparty.Type.CUSTOMER,
            legal_form=Counterparty.LegalForm.OOO,
        )
        self.obj = Object.objects.create(name='Объект Фаза6', address='г. Москва')
        self.contract = Contract.objects.create(
            object=self.obj,
            legal_entity=self.legal_entity,
            counterparty=self.counterparty,
            contract_type=Contract.Type.INCOME,
            number='ДГ-006',
            name='Договор на КС-2',
            contract_date=date.today(),
            total_amount=Decimal('500000.00'),
            vat_rate=Decimal('20.00'),
        )
        self.ce = ContractEstimate.objects.create(
            contract=self.contract,
            number='СМ-006',
            name='Смета тест',
            status='draft',
        )
        self.ce_section = ContractEstimateSection.objects.create(
            contract_estimate=self.ce,
            name='Раздел 1',
            sort_order=0,
        )
        self.ce_item1 = ContractEstimateItem.objects.create(
            contract_estimate=self.ce,
            section=self.ce_section,
            item_number=1,
            name='Кабель ВВГнг 3х2.5',
            unit='м',
            quantity=Decimal('100'),
            material_unit_price=Decimal('50.00'),
            work_unit_price=Decimal('30.00'),
            sort_order=0,
        )
        self.ce_item2 = ContractEstimateItem.objects.create(
            contract_estimate=self.ce,
            section=self.ce_section,
            item_number=2,
            name='Розетка ABB Zena',
            unit='шт',
            quantity=Decimal('20'),
            material_unit_price=Decimal('200.00'),
            work_unit_price=Decimal('150.00'),
            sort_order=1,
        )


class ActModelExtensionsTests(Phase6TestMixin, TestCase):
    """Тесты расширений модели Act: act_type, AGREED статус, contract_estimate"""

    def setUp(self):
        self._create_base_objects()

    def test_act_type_default_ks2(self):
        act = Act.objects.create(
            contract=self.contract, number='КС-001',
            date=date.today(), amount_gross=Decimal('10000'),
        )
        self.assertEqual(act.act_type, Act.ActType.KS2)

    def test_act_type_simple(self):
        act = Act.objects.create(
            contract=self.contract, number='АКТ-S',
            date=date.today(), amount_gross=Decimal('5000'),
            act_type=Act.ActType.SIMPLE,
        )
        self.assertEqual(act.act_type, 'simple')
        self.assertEqual(act.get_act_type_display(), 'Простой акт')

    def test_act_type_ks3(self):
        act = Act.objects.create(
            contract=self.contract, number='КС3-001',
            date=date.today(), amount_gross=Decimal('5000'),
            act_type=Act.ActType.KS3,
        )
        self.assertEqual(act.act_type, 'ks3')

    def test_agreed_status(self):
        act = Act.objects.create(
            contract=self.contract, number='КС-002',
            date=date.today(), amount_gross=Decimal('10000'),
        )
        act.status = Act.Status.AGREED
        act.save()
        act.refresh_from_db()
        self.assertEqual(act.status, 'agreed')

    def test_contract_estimate_link(self):
        act = Act.objects.create(
            contract=self.contract, number='КС-003',
            date=date.today(), amount_gross=Decimal('10000'),
            contract_estimate=self.ce,
        )
        self.assertEqual(act.contract_estimate_id, self.ce.id)
        self.assertIn(act, self.ce.acts.all())

    def test_contract_estimate_nullable(self):
        act = Act.objects.create(
            contract=self.contract, number='КС-004',
            date=date.today(), amount_gross=Decimal('10000'),
        )
        self.assertIsNone(act.contract_estimate)


class ActItemModelTests(Phase6TestMixin, TestCase):
    """Тесты модели ActItem"""

    def setUp(self):
        self._create_base_objects()
        self.act = Act.objects.create(
            contract=self.contract, number='КС-010',
            date=date.today(), amount_gross=Decimal('12000'),
            amount_net=Decimal('10000'), vat_amount=Decimal('2000'),
            contract_estimate=self.ce,
        )

    def test_create_act_item(self):
        item = ActItem.objects.create(
            act=self.act,
            contract_estimate_item=self.ce_item1,
            name='Кабель ВВГнг 3х2.5',
            unit='м',
            quantity=Decimal('50'),
            unit_price=Decimal('80.00'),
            amount=Decimal('4000.00'),
            sort_order=0,
        )
        self.assertEqual(item.act, self.act)
        self.assertEqual(item.contract_estimate_item, self.ce_item1)
        self.assertEqual(str(item), 'Кабель ВВГнг 3х2.5 — 4000.00')

    def test_act_items_relation(self):
        ActItem.objects.create(
            act=self.act, name='Кабель', unit='м',
            quantity=Decimal('10'), unit_price=Decimal('80'),
            amount=Decimal('800'), sort_order=0,
        )
        ActItem.objects.create(
            act=self.act, name='Розетка', unit='шт',
            quantity=Decimal('5'), unit_price=Decimal('350'),
            amount=Decimal('1750'), sort_order=1,
        )
        self.assertEqual(self.act.act_items.count(), 2)

    def test_ordering(self):
        i2 = ActItem.objects.create(
            act=self.act, name='Второй', unit='шт',
            quantity=Decimal('1'), unit_price=Decimal('100'),
            amount=Decimal('100'), sort_order=2,
        )
        i1 = ActItem.objects.create(
            act=self.act, name='Первый', unit='шт',
            quantity=Decimal('1'), unit_price=Decimal('50'),
            amount=Decimal('50'), sort_order=1,
        )
        items = list(self.act.act_items.all())
        self.assertEqual(items[0].id, i1.id)
        self.assertEqual(items[1].id, i2.id)

    def test_cascade_delete_with_act(self):
        ActItem.objects.create(
            act=self.act, name='Удаляемая', unit='шт',
            quantity=Decimal('1'), unit_price=Decimal('100'),
            amount=Decimal('100'),
        )
        act_id = self.act.id
        self.act.delete()
        self.assertEqual(ActItem.objects.filter(act_id=act_id).count(), 0)


class ActCreateFromAccumulativeTests(Phase6TestMixin, TestCase):
    """Тесты метода Act.create_from_accumulative"""

    def setUp(self):
        self._create_base_objects()

    def test_create_from_accumulative_basic(self):
        items_data = [
            {'contract_estimate_item_id': self.ce_item1.id, 'quantity': '50'},
            {'contract_estimate_item_id': self.ce_item2.id, 'quantity': '10'},
        ]
        act = Act.create_from_accumulative(
            self.ce, items_data,
            number='КС2-001', date=date.today(),
        )
        self.assertEqual(act.act_type, Act.ActType.KS2)
        self.assertEqual(act.contract, self.contract)
        self.assertEqual(act.contract_estimate, self.ce)
        self.assertEqual(act.act_items.count(), 2)

    def test_from_accumulative_amounts_calculated(self):
        items_data = [
            {'contract_estimate_item_id': self.ce_item1.id, 'quantity': '100'},
        ]
        act = Act.create_from_accumulative(
            self.ce, items_data,
            number='КС2-002', date=date.today(),
        )
        unit_price = self.ce_item1.material_unit_price + self.ce_item1.work_unit_price
        expected_net = (Decimal('100') * unit_price).quantize(Decimal('0.01'))
        expected_vat = (expected_net * Decimal('20') / Decimal('100')).quantize(Decimal('0.01'))
        expected_gross = expected_net + expected_vat

        self.assertEqual(act.amount_net, expected_net)
        self.assertEqual(act.vat_amount, expected_vat)
        self.assertEqual(act.amount_gross, expected_gross)

    def test_from_accumulative_custom_unit_price(self):
        items_data = [
            {
                'contract_estimate_item_id': self.ce_item1.id,
                'quantity': '10',
                'unit_price': '100.00',
            },
        ]
        act = Act.create_from_accumulative(
            self.ce, items_data,
            number='КС2-003', date=date.today(),
        )
        item = act.act_items.first()
        self.assertEqual(item.unit_price, Decimal('100.00'))
        self.assertEqual(item.amount, Decimal('1000.00'))

    def test_from_accumulative_item_copies_name(self):
        items_data = [
            {'contract_estimate_item_id': self.ce_item1.id},
        ]
        act = Act.create_from_accumulative(
            self.ce, items_data,
            number='КС2-004', date=date.today(),
        )
        item = act.act_items.first()
        self.assertEqual(item.name, self.ce_item1.name)
        self.assertEqual(item.unit, self.ce_item1.unit)

    def test_from_accumulative_empty_items(self):
        act = Act.create_from_accumulative(
            self.ce, [],
            number='КС2-005', date=date.today(),
        )
        self.assertEqual(act.act_items.count(), 0)
        self.assertEqual(act.amount_net, Decimal('0'))


class ActAPITests(Phase6TestMixin, TestCase):
    """Тесты API для Act: agree, sign, from-accumulative, filter by act_type"""

    def setUp(self):
        self._create_base_objects()
        self.user = User.objects.create_user(username='testuser', password='testpass')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def _create_act(self, **kwargs):
        defaults = {
            'contract': self.contract,
            'number': 'КС-API-001',
            'date': date.today(),
            'amount_gross': Decimal('12000'),
            'amount_net': Decimal('10000'),
            'vat_amount': Decimal('2000'),
        }
        defaults.update(kwargs)
        return Act.objects.create(**defaults)

    def test_agree_draft_act(self):
        act = self._create_act()
        response = self.client.post(f'/api/v1/acts/{act.id}/agree/')
        self.assertEqual(response.status_code, 200)
        act.refresh_from_db()
        self.assertEqual(act.status, Act.Status.AGREED)

    def test_agree_signed_act_fails(self):
        act = self._create_act(status=Act.Status.SIGNED)
        response = self.client.post(f'/api/v1/acts/{act.id}/agree/')
        self.assertEqual(response.status_code, 400)

    def test_agree_already_agreed_fails(self):
        act = self._create_act(status=Act.Status.AGREED)
        response = self.client.post(f'/api/v1/acts/{act.id}/agree/')
        self.assertEqual(response.status_code, 400)

    def test_sign_draft_act(self):
        act = self._create_act()
        response = self.client.post(f'/api/v1/acts/{act.id}/sign/')
        self.assertEqual(response.status_code, 200)
        act.refresh_from_db()
        self.assertEqual(act.status, Act.Status.SIGNED)

    def test_sign_agreed_act(self):
        act = self._create_act(status=Act.Status.AGREED)
        response = self.client.post(f'/api/v1/acts/{act.id}/sign/')
        self.assertEqual(response.status_code, 200)
        act.refresh_from_db()
        self.assertEqual(act.status, Act.Status.SIGNED)

    def test_sign_cancelled_act_fails(self):
        act = self._create_act(status=Act.Status.CANCELLED)
        response = self.client.post(f'/api/v1/acts/{act.id}/sign/')
        self.assertEqual(response.status_code, 400)

    def test_filter_by_act_type(self):
        self._create_act(number='КС-1', act_type=Act.ActType.KS2)
        self._create_act(number='КС-S', act_type=Act.ActType.SIMPLE)
        response = self.client.get('/api/v1/acts/?act_type=ks2')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['act_type'], 'ks2')

    def test_act_serializer_includes_act_items(self):
        act = self._create_act(contract_estimate=self.ce)
        ActItem.objects.create(
            act=act, name='Позиция', unit='шт',
            quantity=Decimal('5'), unit_price=Decimal('100'),
            amount=Decimal('500'),
        )
        response = self.client.get(f'/api/v1/acts/{act.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['act_items']), 1)
        self.assertEqual(response.data['act_items'][0]['name'], 'Позиция')

    def test_act_serializer_includes_act_type_display(self):
        act = self._create_act(act_type=Act.ActType.KS3)
        response = self.client.get(f'/api/v1/acts/{act.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['act_type_display'], 'КС-3 (Справка о стоимости)')

    def test_from_accumulative_endpoint(self):
        data = {
            'contract_estimate_id': self.ce.id,
            'number': 'КС2-API-001',
            'date': str(date.today()),
            'items': [
                {'contract_estimate_item_id': self.ce_item1.id, 'quantity': '50'},
                {'contract_estimate_item_id': self.ce_item2.id, 'quantity': '10'},
            ],
        }
        response = self.client.post(
            '/api/v1/acts/from-accumulative/', data, format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['act_type'], 'ks2')
        self.assertEqual(len(response.data['act_items']), 2)

    def test_from_accumulative_missing_data(self):
        response = self.client.post(
            '/api/v1/acts/from-accumulative/', {}, format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_from_accumulative_invalid_ce_id(self):
        data = {
            'contract_estimate_id': 99999,
            'items': [{'contract_estimate_item_id': self.ce_item1.id}],
        }
        response = self.client.post(
            '/api/v1/acts/from-accumulative/', data, format='json',
        )
        self.assertEqual(response.status_code, 404)

    def test_status_flow_draft_agree_sign(self):
        act = self._create_act()
        self.assertEqual(act.status, Act.Status.DRAFT)

        self.client.post(f'/api/v1/acts/{act.id}/agree/')
        act.refresh_from_db()
        self.assertEqual(act.status, Act.Status.AGREED)

        self.client.post(f'/api/v1/acts/{act.id}/sign/')
        act.refresh_from_db()
        self.assertEqual(act.status, Act.Status.SIGNED)

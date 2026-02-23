"""
Создание полного набора тестовых данных для QA-тестирования.
Использует существующий generate_data для базовых сущностей,
затем добавляет данные для новых моделей (Catalog, Invoice, EstimateItem,
ContractEstimate, ContractText, ActItem, IncomeRecord, RecurringPayment,
JournalEntry, EstimatePurchaseLink, Personnel).

Запуск: python manage.py seed_qa_data
"""
import random
from decimal import Decimal
from datetime import timedelta, date
from django.core.management.base import BaseCommand
from django.core.management import call_command
from django.db import transaction
from django.contrib.auth.models import User
from faker import Faker

from objects.models import Object
from accounting.models import (
    TaxSystem, LegalEntity, Account, Counterparty, AccountBalance,
)
from contracts.models import (
    Contract, FrameworkContract, Act, ContractAmendment,
    ContractEstimate, ContractEstimateSection, ContractEstimateItem,
    ContractText, ActItem, EstimatePurchaseLink,
)
from estimates.models import (
    Estimate, EstimateSection, EstimateItem,
)
from payments.models import (
    Invoice, InvoiceItem, ExpenseCategory,
    IncomeRecord, RecurringPayment, JournalEntry,
)
from catalog.models import Product, ProductPriceHistory, ProductWorkMapping
try:
    from catalog.models import Category as ProductCategory
except ImportError:
    ProductCategory = None
from pricelists.models import WorkItem, PriceList
from personnel.models import Employee, PositionRecord, SalaryHistory
from communications.models import Correspondence

fake = Faker('ru_RU')

SYSTEMS = ['Вентиляция', 'Кондиционирование', 'Отопление', 'Водоснабжение', 'Электрика']

MATERIALS = [
    ('Кабель ВВГнг 3x2.5', 'ВВГнг-LS 3x2.5', 'м', Decimal('42.50'), Decimal('15.00')),
    ('Кабель ВВГнг 5x4', 'ВВГнг-LS 5x4.0', 'м', Decimal('98.00'), Decimal('18.00')),
    ('Автоматический выключатель 16А', 'ABB S201 C16', 'шт', Decimal('680.00'), Decimal('120.00')),
    ('Автоматический выключатель 25А', 'ABB S201 C25', 'шт', Decimal('720.00'), Decimal('120.00')),
    ('Розетка двойная с заземлением', 'Legrand Valena Life', 'шт', Decimal('450.00'), Decimal('80.00')),
    ('Выключатель одноклавишный', 'Legrand Valena Life', 'шт', Decimal('380.00'), Decimal('60.00')),
    ('Щит распределительный 24 мод', 'ABB Mistral65', 'шт', Decimal('4500.00'), Decimal('1200.00')),
    ('Труба ПНД 25 мм', 'ПНД ПЭ100 SDR11', 'м', Decimal('65.00'), Decimal('25.00')),
    ('Фитинг ПНД угол 25', 'Компрессионный', 'шт', Decimal('120.00'), Decimal('45.00')),
    ('Кондиционер сплит 3.5 кВт', 'Daikin FTXB35C', 'шт', Decimal('52000.00'), Decimal('8500.00')),
    ('Кондиционер сплит 5.0 кВт', 'Daikin FTXB50C', 'шт', Decimal('68000.00'), Decimal('9500.00')),
    ('Вентилятор канальный 200', 'Systemair K 200 M', 'шт', Decimal('18500.00'), Decimal('3200.00')),
    ('Воздуховод оцинк. 200x200', 'Оцинковка 0.5мм', 'м', Decimal('850.00'), Decimal('320.00')),
    ('Радиатор стальной 500x800', 'Buderus Logatrend K-Profil', 'шт', Decimal('6800.00'), Decimal('1500.00')),
    ('Трубка медная 6.35 мм', 'Cu 1/4"', 'м', Decimal('380.00'), Decimal('45.00')),
    ('Трубка медная 9.52 мм', 'Cu 3/8"', 'м', Decimal('520.00'), Decimal('45.00')),
    ('Дренажная помпа', 'Aspen Mini Orange', 'шт', Decimal('4200.00'), Decimal('800.00')),
    ('Гофра ПВХ 20 мм', 'ПВХ серая', 'м', Decimal('12.00'), Decimal('8.00')),
    ('Лоток кабельный 100x50', 'Перфорированный', 'м', Decimal('280.00'), Decimal('65.00')),
    ('Клеммная колодка 4 мм²', 'WAGO 222-413', 'шт', Decimal('45.00'), Decimal('10.00')),
    ('Вентиляционная решетка 300x300', 'АМН', 'шт', Decimal('650.00'), Decimal('120.00')),
    ('Теплоизоляция Armaflex 9x22', 'Armacell AF-09022', 'м', Decimal('85.00'), Decimal('15.00')),
    ('Кронштейн для наружного блока', 'К-450', 'компл', Decimal('1200.00'), Decimal('600.00')),
    ('Фреон R410A', 'R410A', 'кг', Decimal('1800.00'), Decimal('0.00')),
    ('Припой серебряный', 'Harris Stay-Silv 15', 'кг', Decimal('8500.00'), Decimal('0.00')),
]

OBJECTS_DATA = [
    ('ЖК «Новые горизонты», корпус 3', 'г. Москва, ул. Академика Королёва, 15', 'in_progress'),
    ('БЦ «Меридиан» (реконструкция)', 'г. Москва, ул. Ленинская Слобода, 26', 'in_progress'),
    ('ТЦ «Галерея», 2-я очередь', 'г. Санкт-Петербург, пр. Лиговский, 30А', 'active'),
    ('Склад «Логистик Парк»', 'МО, г. Домодедово, ул. Промышленная, 5', 'completed'),
    ('Школа №1284 (капремонт)', 'г. Москва, ул. Кржижановского, 18', 'in_progress'),
    ('Поликлиника №5', 'г. Москва, ул. Маршала Тухачевского, 44', 'planned'),
    ('Коттедж Иванов А.С.', 'МО, п. Барвиха, ул. Сосновая, 12', 'active'),
    ('Офис ООО «Технопром»', 'г. Москва, Пресненская наб., 10', 'completed'),
]

COUNTERPARTIES_CUSTOMERS = [
    ('ООО «Стройинвест»', 'Стройинвест', 'customer', 'ooo'),
    ('АО «Девелопмент Групп»', 'ДГ', 'customer', 'ooo'),
    ('ООО «Бизнес Центр Меридиан»', 'БЦ Меридиан', 'customer', 'ooo'),
    ('ИП Иванов А.С.', 'Иванов А.С.', 'customer', 'ip'),
    ('ООО «ТехноПром»', 'ТехноПром', 'customer', 'ooo'),
    ('ГБУ «Управление Капстроя»', 'УКС', 'customer', 'ooo'),
]

COUNTERPARTIES_VENDORS = [
    ('ООО «ЭлектроСнаб»', 'ЭлектроСнаб', 'vendor', 'ooo', 'supplier'),
    ('ООО «КлиматПро»', 'КлиматПро', 'vendor', 'ooo', 'supplier'),
    ('ООО «СантехОпт»', 'СантехОпт', 'vendor', 'ooo', 'supplier'),
    ('ИП Петров С.В. (монтаж)', 'Петров С.В.', 'vendor', 'ip', 'executor'),
    ('ООО «Монтажспецстрой»', 'МСС', 'vendor', 'ooo', 'executor'),
    ('ООО «ВентМастер»', 'ВентМастер', 'vendor', 'ooo', 'both'),
    ('ООО «Кабельный мир»', 'КабМир', 'vendor', 'ooo', 'supplier'),
    ('ООО «Промстройтепло»', 'ПСТ', 'vendor', 'ooo', 'executor'),
]


class Command(BaseCommand):
    help = 'Полное наполнение БД тестовыми данными для QA-чеклиста'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('=== Seed QA Data ===\n'))
        with transaction.atomic():
            self.user = User.objects.filter(is_superuser=True).first()
            if not self.user:
                self.user = User.objects.create_superuser('admin', 'admin@example.com', 'admin')

            self._create_test_users()
            self._create_directories()
            self._create_counterparties()
            self._create_legal_entities()
            self._create_catalog_products()
            self._create_objects()
            self._create_pricelists()
            self._create_estimates_with_items()
            self._create_proposals()
            self._create_framework_contracts()
            self._create_contracts_full()
            self._create_invoices()
            self._create_income_records()
            self._create_recurring_payments()
            self._create_journal_entries()
            self._create_correspondence()
            self._create_personnel()

        self.stdout.write(self.style.SUCCESS('\n=== Seed QA Data завершён ==='))

    # ------------------------------------------------------------------
    def _create_test_users(self):
        roles = [
            ('smetschik', 'Сметчик', 'Сергей', 'smetschik@test.com'),
            ('manager_kp', 'Менеджер КП', 'Михаил', 'manager@test.com'),
            ('director', 'Директор', 'Дмитрий', 'director@test.com'),
            ('supply', 'Оператор снабжения', 'Ольга', 'supply@test.com'),
            ('accountant', 'Бухгалтер', 'Бэлла', 'buh@test.com'),
            ('foreman', 'Начальник участка', 'Николай', 'foreman@test.com'),
            ('engineer', 'Инженер ПТО', 'Игорь', 'engineer@test.com'),
            ('contract_dept', 'Договорной отдел', 'Катерина', 'contract@test.com'),
        ]
        self.test_users = {}
        for username, last_name, first_name, email in roles:
            u, created = User.objects.get_or_create(
                username=username,
                defaults={
                    'first_name': first_name,
                    'last_name': last_name,
                    'email': email,
                    'is_staff': True,
                },
            )
            if created:
                u.set_password('test1234')
                u.save()
            self.test_users[username] = u
        self.stdout.write(f'✓ Пользователи: {len(self.test_users)}')

    # ------------------------------------------------------------------
    def _create_directories(self):
        call_command('generate_data', directories=True, verbosity=0)
        self.stdout.write('✓ Справочники (generate_data --directories)')

    # ------------------------------------------------------------------
    def _create_counterparties(self):
        self.customers = []
        for name, short, tp, lf in COUNTERPARTIES_CUSTOMERS:
            c, _ = Counterparty.objects.get_or_create(
                name=name,
                defaults={
                    'short_name': short, 'type': tp, 'legal_form': lf,
                    'inn': fake.numerify('##########'),
                    'contact_info': f'{fake.name()}\n{fake.phone_number()}',
                    'is_active': True,
                },
            )
            self.customers.append(c)

        self.vendors = []
        for name, short, tp, lf, sub in COUNTERPARTIES_VENDORS:
            c, _ = Counterparty.objects.get_or_create(
                name=name,
                defaults={
                    'short_name': short, 'type': tp, 'legal_form': lf,
                    'vendor_subtype': sub,
                    'inn': fake.numerify('##########'),
                    'contact_info': f'{fake.name()}\n{fake.phone_number()}',
                    'is_active': True,
                },
            )
            self.vendors.append(c)
        self.stdout.write(f'✓ Контрагенты: {len(self.customers)} заказчиков, {len(self.vendors)} поставщиков')

    # ------------------------------------------------------------------
    def _create_legal_entities(self):
        ts_osn = TaxSystem.objects.get(code='osn')
        ts_usn = TaxSystem.objects.filter(code='usn_6').first() or ts_osn

        self.le_main, _ = LegalEntity.objects.get_or_create(
            inn='7701234567',
            defaults={
                'name': 'ООО «Август Инженерные Системы»',
                'short_name': 'Август ИС',
                'kpp': '770101001',
                'ogrn': '1177746000001',
                'tax_system': ts_osn,
                'director_name': 'Прыгунов Андрей Владимирович',
                'director_position': 'Генеральный директор',
            },
        )
        self.le_second, _ = LegalEntity.objects.get_or_create(
            inn='7702345678',
            defaults={
                'name': 'ООО «Август Сервис»',
                'short_name': 'Август Сервис',
                'kpp': '770201001',
                'ogrn': '1177746000002',
                'tax_system': ts_usn,
                'director_name': 'Прыгунов Андрей Владимирович',
                'director_position': 'Генеральный директор',
            },
        )

        self.acc_main, _ = Account.objects.get_or_create(
            legal_entity=self.le_main,
            number='40702810100000000001',
            defaults={
                'name': 'Основной р/с (Точка)',
                'account_type': Account.Type.BANK_ACCOUNT,
                'bank_name': 'АО «Точка»',
                'bik': '044525104',
                'currency': Account.Currency.RUB,
                'initial_balance': Decimal('5000000.00'),
                'balance_date': date.today() - timedelta(days=30),
            },
        )
        self.acc_second, _ = Account.objects.get_or_create(
            legal_entity=self.le_second,
            number='40702810200000000002',
            defaults={
                'name': 'Р/с Август Сервис',
                'account_type': Account.Type.BANK_ACCOUNT,
                'bank_name': 'ПАО «Сбербанк»',
                'bik': '044525225',
                'currency': Account.Currency.RUB,
                'initial_balance': Decimal('2000000.00'),
                'balance_date': date.today() - timedelta(days=30),
            },
        )
        self.acc_cash, _ = Account.objects.get_or_create(
            legal_entity=self.le_main,
            number='CASH-001',
            defaults={
                'name': 'Касса',
                'account_type': Account.Type.CASH,
                'currency': Account.Currency.RUB,
                'initial_balance': Decimal('50000.00'),
                'balance_date': date.today() - timedelta(days=30),
            },
        )

        for i in range(6):
            bd = date.today() - timedelta(days=i * 30)
            AccountBalance.objects.get_or_create(
                account=self.acc_main, balance_date=bd,
                defaults={'balance': Decimal('5000000') + Decimal(str(random.randint(-500000, 500000)))},
            )

        self.stdout.write('✓ Юрлица: 2, Счета: 3')

    # ------------------------------------------------------------------
    def _create_catalog_products(self):
        if ProductCategory:
            cats = {}
            for code, name in [('cable', 'Кабельная продукция'), ('auto', 'Автоматика'), ('climate', 'Климат'), ('plumbing', 'Сантехника'), ('accessories', 'Аксессуары')]:
                c, _ = ProductCategory.objects.get_or_create(code=code, defaults={'name': name})
                cats[code] = c
        else:
            cats = {}

        self.products = []
        cat_map = {
            'Кабель': 'cable', 'Автомат': 'auto', 'Кондиционер': 'climate',
            'Вентилятор': 'climate', 'Радиатор': 'plumbing', 'Труб': 'plumbing',
        }
        for name, model, unit, mat_price, _ in MATERIALS:
            cat_code = None
            for prefix, cc in cat_map.items():
                if name.startswith(prefix):
                    cat_code = cc
                    break
            product, _ = Product.objects.get_or_create(
                name=f'{name} {model}'.strip(),
                defaults={
                    'default_unit': unit,
                    'category': cats.get(cat_code) if cats else None,
                    'status': 'verified',
                },
            )
            self.products.append(product)
            for vendor in random.sample(self.vendors, min(3, len(self.vendors))):
                if vendor.vendor_subtype in ('supplier', 'both', None):
                    ProductPriceHistory.objects.get_or_create(
                        product=product, counterparty=vendor,
                        invoice_date=date.today() - timedelta(days=random.randint(10, 180)),
                        defaults={
                            'price': mat_price * Decimal(str(random.uniform(0.9, 1.15))),
                            'unit': unit,
                        },
                    )
        self.stdout.write(f'✓ Каталог товаров: {len(self.products)}')

    # ------------------------------------------------------------------
    def _create_objects(self):
        self.objects = []
        for name, address, status in OBJECTS_DATA:
            start = date.today() - timedelta(days=random.randint(30, 365))
            end = start + timedelta(days=random.randint(120, 540))
            obj, _ = Object.objects.get_or_create(
                name=name,
                defaults={
                    'address': address,
                    'status': status,
                    'start_date': start,
                    'end_date': end,
                    'description': f'Объект: {name}. Адрес: {address}',
                },
            )
            self.objects.append(obj)
        self.stdout.write(f'✓ Объекты: {len(self.objects)}')

    # ------------------------------------------------------------------
    def _create_pricelists(self):
        call_command('generate_data', pricelists=5, verbosity=0)
        self.stdout.write('✓ Прайс-листы: 5 (generate_data)')

    # ------------------------------------------------------------------
    def _create_estimates_with_items(self):
        """Сметы + строки сметы (EstimateItem)"""
        price_list = PriceList.objects.first()
        work_items_qs = list(WorkItem.objects.filter(is_current=True))

        self.estimates = []
        for obj in self.objects:
            for est_idx in range(random.randint(1, 3)):
                est = Estimate.objects.create(
                    name=f'Смета {SYSTEMS[est_idx % len(SYSTEMS)]} — {obj.name[:30]}',
                    object=obj,
                    legal_entity=self.le_main,
                    with_vat=True, vat_rate=Decimal('20.00'),
                    price_list=price_list,
                    status=random.choice(['draft', 'approved', 'signed']),
                    created_by=self.test_users.get('smetschik', self.user),
                )
                self.estimates.append(est)

                materials_subset = random.sample(MATERIALS, min(random.randint(8, 20), len(MATERIALS)))
                for sys_idx, system_name in enumerate(random.sample(SYSTEMS, min(3, len(SYSTEMS)))):
                    section = EstimateSection.objects.create(
                        estimate=est, name=system_name, sort_order=sys_idx,
                    )
                    items_for_section = materials_subset[sys_idx * 5:(sys_idx + 1) * 5] or materials_subset[:3]
                    for item_idx, (iname, imodel, iunit, iprice, wprice) in enumerate(items_for_section):
                        qty = Decimal(str(random.randint(5, 500)))
                        product = next((p for p in self.products if iname in p.name), None)
                        work_item = random.choice(work_items_qs) if work_items_qs else None
                        EstimateItem.objects.create(
                            estimate=est, section=section,
                            name=iname, model_name=imodel, unit=iunit,
                            quantity=qty,
                            material_unit_price=iprice,
                            work_unit_price=wprice,
                            product=product,
                            work_item=work_item,
                            sort_order=item_idx,
                        )

                if work_items_qs and self.products:
                    for p in random.sample(self.products, min(5, len(self.products))):
                        wi = random.choice(work_items_qs)
                        ProductWorkMapping.objects.get_or_create(
                            product=p, work_item=wi,
                            defaults={'confidence': random.uniform(0.7, 1.0), 'source': 'manual'},
                        )

        self.stdout.write(f'✓ Сметы: {len(self.estimates)} (со строками EstimateItem)')

    # ------------------------------------------------------------------
    def _create_proposals(self):
        call_command('generate_data', tkp=8, mp=6, verbosity=0)
        self.stdout.write('✓ ТКП: 8, МП: 6 (generate_data)')

    # ------------------------------------------------------------------
    def _create_framework_contracts(self):
        created = 0
        for vendor in self.vendors[:4]:
            fc_date = date.today() - timedelta(days=random.randint(180, 730))
            FrameworkContract.objects.create(
                number=f'РД-{fake.numerify("####")}',
                name=f'Рамочный договор с {vendor.short_name}',
                date=fc_date,
                valid_from=fc_date,
                valid_until=fc_date + timedelta(days=random.randint(365, 1095)),
                legal_entity=self.le_main,
                counterparty=vendor,
                status='active',
                created_by=self.test_users.get('contract_dept', self.user),
                notes=f'Рамочный на {random.choice(SYSTEMS)}',
            )
            created += 1
        self.stdout.write(f'✓ Рамочные договоры: {created}')

    # ------------------------------------------------------------------
    def _create_contracts_full(self):
        """Договоры + ContractEstimate + ContractText + Акты + ActItem"""
        from proposals.models import TechnicalProposal, MountingProposal

        self.contracts = []

        approved_tkps = list(TechnicalProposal.objects.filter(status='approved'))
        approved_mps = list(MountingProposal.objects.filter(status='approved'))

        for obj in self.objects:
            customer = random.choice(self.customers)
            total = Decimal(str(random.randint(5_000_000, 80_000_000)))
            c_date = obj.start_date - timedelta(days=random.randint(5, 30)) if obj.start_date else date.today() - timedelta(days=60)

            obj_tkps = [t for t in approved_tkps if t.object_id == obj.id]
            tkp = None
            if obj_tkps:
                tkp = obj_tkps[0]
                approved_tkps = [t for t in approved_tkps if t.id != tkp.id]
            income_status = 'active' if tkp else random.choice(['planned', 'completed'])

            income_contract = Contract.objects.create(
                object=obj,
                legal_entity=self.le_main,
                counterparty=customer,
                contract_type='income',
                number=f'ДГ-{obj.id}-{fake.numerify("###")}',
                name=f'Договор генподряда — {obj.name[:40]}',
                contract_date=c_date,
                start_date=obj.start_date,
                end_date=obj.end_date,
                total_amount=total,
                vat_rate=Decimal('20.00'),
                vat_included=True,
                status=income_status,
                technical_proposal=tkp,
            )
            self.contracts.append(income_contract)
            self._add_contract_details(income_contract)

            for i in range(random.randint(1, 3)):
                vendor = random.choice(self.vendors)
                exp_amount = Decimal(str(random.randint(1_000_000, 15_000_000)))

                obj_mps = [m for m in approved_mps if m.object_id == obj.id]
                mp = None
                if obj_mps:
                    mp = obj_mps.pop(0)
                    approved_mps = [m for m in approved_mps if m.id != mp.id]
                expense_status = 'active' if mp else random.choice(['planned', 'completed'])

                expense_contract = Contract.objects.create(
                    object=obj,
                    legal_entity=self.le_main,
                    counterparty=vendor,
                    contract_type='expense',
                    parent_contract=income_contract,
                    number=f'СУБ-{obj.id}-{i + 1}-{fake.numerify("##")}',
                    name=f'Субподряд {SYSTEMS[i % len(SYSTEMS)]} — {vendor.short_name}',
                    contract_date=c_date + timedelta(days=random.randint(5, 30)),
                    start_date=obj.start_date,
                    end_date=obj.end_date,
                    total_amount=exp_amount,
                    vat_rate=Decimal('20.00'),
                    vat_included=True,
                    status=expense_status,
                    mounting_proposal=mp,
                )
                self.contracts.append(expense_contract)
                self._add_contract_details(expense_contract)

        self.stdout.write(f'✓ Договоры: {len(self.contracts)} (с CE, текстами, актами)')

    def _add_contract_details(self, contract):
        obj_estimates = [e for e in self.estimates if e.object_id == contract.object_id]

        if obj_estimates:
            source_est = random.choice(obj_estimates)
            ce = ContractEstimate.objects.create(
                contract=contract,
                number=f'СМ-{contract.number}',
                name=f'Смета к договору {contract.number}',
                status=random.choice(['draft', 'agreed', 'signed']),
                source_estimate=source_est,
            )

            sections_map = {}
            est_items = EstimateItem.objects.filter(estimate=source_est).select_related('section')
            for ei in est_items:
                sec_name = ei.section.name if ei.section else 'Основной раздел'
                if sec_name not in sections_map:
                    sections_map[sec_name] = ContractEstimateSection.objects.create(
                        contract_estimate=ce, name=sec_name,
                    )
                ContractEstimateItem.objects.create(
                    contract_estimate=ce,
                    section=sections_map[sec_name],
                    name=ei.name,
                    model_name=ei.model_name or '',
                    unit=ei.unit,
                    quantity=ei.quantity,
                    material_unit_price=ei.material_unit_price,
                    work_unit_price=ei.work_unit_price,
                )

            if random.random() < 0.3:
                ce2 = ContractEstimate.objects.create(
                    contract=contract,
                    number=f'СМ-{contract.number}-v2',
                    name=f'Смета к договору {contract.number} (v2)',
                    status='draft',
                    version_number=2,
                    parent_version=ce,
                    source_estimate=source_est,
                )
                for sec in ContractEstimateSection.objects.filter(contract_estimate=ce):
                    new_sec = ContractEstimateSection.objects.create(
                        contract_estimate=ce2, name=sec.name,
                    )
                    for item in ContractEstimateItem.objects.filter(section=sec):
                        ContractEstimateItem.objects.create(
                            contract_estimate=ce2,
                            section=new_sec,
                            name=item.name,
                            model_name=item.model_name,
                            unit=item.unit,
                            quantity=item.quantity * Decimal('1.1'),
                            material_unit_price=item.material_unit_price,
                            work_unit_price=item.work_unit_price,
                        )

        ContractText.objects.create(
            contract=contract,
            content_md=self._generate_contract_md(contract),
            version=1,
            created_by=self.test_users.get('contract_dept', self.user),
        )

        if random.random() < 0.4:
            am = ContractAmendment.objects.create(
                contract=contract,
                number=f'ДС-{contract.number}-1',
                date=contract.contract_date + timedelta(days=random.randint(30, 120)),
                reason='Изменение объёмов работ и корректировка сроков',
                new_total_amount=contract.total_amount * Decimal('1.15'),
            )
            ContractText.objects.create(
                contract=contract,
                content_md=f'# Дополнительное соглашение №{am.number}\n\nК договору {contract.number}.\n\nПричина: {am.reason}',
                version=2,
                amendment=am,
                created_by=self.test_users.get('contract_dept', self.user),
            )

        act_count = random.randint(1, 5)
        amount_per_act = (contract.total_amount / Decimal(str(max(act_count * 3, 1)))).quantize(Decimal('0.01'))
        amount_net = (amount_per_act / Decimal('1.2')).quantize(Decimal('0.01'))
        vat = (amount_per_act - amount_net).quantize(Decimal('0.01'))
        for a_idx in range(act_count):
            act_date = (contract.start_date or date.today() - timedelta(days=90)) + timedelta(days=a_idx * 30)
            act_status = random.choice(['draft', 'agreed', 'signed'])
            act_type = random.choice(['ks2', 'ks3', 'simple'])
            act = Act.objects.create(
                contract=contract,
                number=f'АКТ-{contract.id}-{a_idx + 1:03d}',
                date=act_date,
                period_start=act_date - timedelta(days=30),
                period_end=act_date,
                amount_gross=amount_per_act,
                amount_net=amount_net,
                vat_amount=vat,
                status=act_status,
                act_type=act_type,
            )

            if act_type in ('ks2', 'ks3'):
                for ai_idx in range(random.randint(3, 8)):
                    m = random.choice(MATERIALS)
                    qty = Decimal(str(random.randint(5, 100)))
                    up = m[3] + m[4]
                    ActItem.objects.create(
                        act=act,
                        name=m[0],
                        unit=m[2],
                        quantity=qty,
                        unit_price=up,
                        amount=qty * up,
                    )

    def _generate_contract_md(self, contract):
        ct = 'Генерального подряда' if contract.contract_type == 'income' else 'Субподряда'
        return f"""# Договор {ct} № {contract.number}

## 1. Предмет договора
Подрядчик обязуется выполнить работы по монтажу инженерных систем
на объекте: **{contract.object.name if contract.object else 'N/A'}**.

## 2. Стоимость и порядок расчётов
Общая стоимость работ: **{contract.total_amount:,.2f} руб.** (включая НДС {contract.vat_rate}%).
Оплата производится поэтапно на основании подписанных актов КС-2.

## 3. Сроки выполнения
- Начало: {contract.start_date or 'по согласованию'}
- Окончание: {contract.end_date or 'по согласованию'}

## 4. Обязанности сторон
### 4.1. Заказчик
- Обеспечить доступ на объект
- Обеспечить фронт работ
- Принять работы по актам КС-2

### 4.2. Подрядчик
- Выполнить работы в соответствии со сметой
- Обеспечить качество работ
- Предоставить исполнительную документацию

## 5. Гарантийные обязательства
Гарантийный срок на выполненные работы — 24 месяца.
"""

    # ------------------------------------------------------------------
    def _create_invoices(self):
        categories = list(ExpenseCategory.objects.all())
        if not categories:
            self.stdout.write(self.style.WARNING('Нет категорий расходов — пропуск Invoice'))
            return
        cat = categories[0]
        invoice_statuses = ['recognition', 'review', 'in_registry', 'approved', 'paid', 'paid', 'cancelled']

        created = 0
        for contract in self.contracts:
            if contract.contract_type != 'expense':
                continue
            for inv_idx in range(random.randint(2, 6)):
                inv_date = (contract.start_date or date.today() - timedelta(days=90)) + timedelta(days=inv_idx * 20)
                status = random.choice(invoice_statuses)
                inv = Invoice.objects.create(
                    invoice_type='supplier',
                    source='manual',
                    invoice_number=f'СЧ-{contract.id}-{inv_idx + 1}',
                    invoice_date=inv_date,
                    due_date=inv_date + timedelta(days=14),
                    counterparty=contract.counterparty,
                    object=contract.object,
                    contract=contract,
                    category=cat,
                    account=self.acc_main,
                    legal_entity=self.le_main,
                    status=status,
                    amount_gross=Decimal(str(random.randint(50000, 2000000))),
                    amount_net=Decimal(str(random.randint(40000, 1700000))),
                    vat_amount=Decimal(str(random.randint(8000, 300000))),
                    description=f'Счёт от {contract.counterparty.short_name}',
                )
                for ii in range(random.randint(2, 8)):
                    m = random.choice(MATERIALS)
                    qty = Decimal(str(random.randint(5, 200)))
                    price = m[3] * Decimal(str(random.uniform(0.9, 1.1)))
                    product = next((p for p in self.products if m[0] in p.name), None)
                    InvoiceItem.objects.create(
                        invoice=inv,
                        product=product,
                        raw_name=f'{m[0]} {m[1]}',
                        quantity=qty,
                        unit=m[2],
                        price_per_unit=price.quantize(Decimal('0.01')),
                        amount=(qty * price).quantize(Decimal('0.01')),
                    )
                created += 1

                ce_items = ContractEstimateItem.objects.filter(
                    contract_estimate__contract=contract,
                ).order_by('?')[:3]
                inv_items = list(inv.items.all())
                for cei, ii in zip(ce_items, inv_items):
                    EstimatePurchaseLink.objects.create(
                        contract_estimate_item=cei,
                        invoice_item=ii,
                        quantity_matched=min(cei.quantity, ii.quantity),
                        match_type=random.choice(['exact', 'analog']),
                        price_exceeds=ii.price_per_unit > cei.material_unit_price,
                        quantity_exceeds=False,
                        match_reason='Автоматическое сопоставление при тестировании' if random.random() < 0.5 else '',
                    )

        self.stdout.write(f'✓ Счета (Invoice): {created} с позициями и EstimatePurchaseLink')

    # ------------------------------------------------------------------
    def _create_income_records(self):
        categories = list(ExpenseCategory.objects.all())
        cat = categories[0] if categories else None
        if not cat:
            return
        created = 0
        income_contracts = [c for c in self.contracts if c.contract_type == 'income']
        for contract in income_contracts:
            for _ in range(random.randint(1, 4)):
                amt = Decimal(str(random.randint(500000, 5000000)))
                pd = (contract.start_date or date.today() - timedelta(days=60)) + timedelta(days=random.randint(30, 180))
                IncomeRecord.objects.create(
                    income_type=random.choice(['customer_act', 'advance']),
                    account=self.acc_main,
                    category=cat,
                    legal_entity=self.le_main,
                    counterparty=contract.counterparty,
                    object=contract.object,
                    contract=contract,
                    amount=amt,
                    payment_date=pd,
                    description=f'Оплата от {contract.counterparty.short_name}',
                )
                created += 1
        self.stdout.write(f'✓ Поступления (IncomeRecord): {created}')

    # ------------------------------------------------------------------
    def _create_recurring_payments(self):
        categories = list(ExpenseCategory.objects.filter(code__in=['office', 'services']))
        if not categories:
            categories = list(ExpenseCategory.objects.all()[:2])
        if not categories:
            return
        recurring_data = [
            ('Аренда офиса', Decimal('250000.00'), 'monthly', 5),
            ('Интернет', Decimal('5000.00'), 'monthly', 1),
            ('Лицензия 1С', Decimal('12000.00'), 'quarterly', 15),
            ('Уборка офиса', Decimal('15000.00'), 'monthly', 25),
        ]
        for name, amount, freq, day in recurring_data:
            vendor = random.choice(self.vendors)
            RecurringPayment.objects.create(
                name=name,
                counterparty=vendor,
                category=random.choice(categories),
                account=self.acc_main,
                legal_entity=self.le_main,
                amount=amount,
                frequency=freq,
                day_of_month=day,
                start_date=date.today() - timedelta(days=365),
                next_generation_date=date.today() + timedelta(days=random.randint(1, 28)),
                description=f'{name} — {vendor.short_name}',
                is_active=True,
            )
        self.stdout.write(f'✓ Периодические платежи: {len(recurring_data)}')

    # ------------------------------------------------------------------
    def _create_journal_entries(self):
        categories = list(ExpenseCategory.objects.all())
        if len(categories) < 2:
            return
        created = 0
        for _ in range(15):
            from_cat, to_cat = random.sample(categories, 2)
            JournalEntry.objects.create(
                date=date.today() - timedelta(days=random.randint(1, 180)),
                from_account=from_cat,
                to_account=to_cat,
                amount=Decimal(str(random.randint(10000, 500000))),
                description=f'Проводка: {from_cat.name} → {to_cat.name}',
                created_by=self.test_users.get('accountant', self.user),
                is_auto=random.random() < 0.5,
            )
            created += 1
        self.stdout.write(f'✓ Проводки (JournalEntry): {created}')

    # ------------------------------------------------------------------
    def _create_correspondence(self):
        created = 0
        for contract in random.sample(self.contracts, min(10, len(self.contracts))):
            for _ in range(random.randint(2, 5)):
                Correspondence.objects.create(
                    contract=contract,
                    counterparty=contract.counterparty,
                    type=random.choice(['incoming', 'outgoing']),
                    category=random.choice(['letter', 'email', 'claim']),
                    number=f'П-{fake.numerify("####")}',
                    date=(contract.start_date or date.today()) + timedelta(days=random.randint(0, 120)),
                    status=random.choice(['draft', 'sent', 'received', 'processed']),
                    subject=fake.sentence(),
                    description=fake.text(max_nb_chars=300),
                )
                created += 1
        self.stdout.write(f'✓ Переписка: {created}')

    # ------------------------------------------------------------------
    def _create_personnel(self):
        roles_data = [
            ('Прыгунов Андрей Владимирович', 'Генеральный директор', Decimal('300000'), Decimal('150000')),
            ('Смирнов Сергей Петрович', 'Сметчик', Decimal('120000'), Decimal('80000')),
            ('Козлов Михаил Андреевич', 'Менеджер коммерческого отдела', Decimal('100000'), Decimal('60000')),
            ('Иванова Ольга Николаевна', 'Оператор снабжения', Decimal('90000'), Decimal('55000')),
            ('Фёдорова Бэлла Витальевна', 'Бухгалтер', Decimal('110000'), Decimal('70000')),
            ('Кузнецов Николай Иванович', 'Начальник участка', Decimal('130000'), Decimal('80000')),
            ('Волков Игорь Дмитриевич', 'Инженер ПТО', Decimal('95000'), Decimal('60000')),
            ('Морозова Катерина Сергеевна', 'Специалист договорного отдела', Decimal('100000'), Decimal('65000')),
        ]
        created = 0
        for full_name, position, salary_full, salary_official in roles_data:
            emp, emp_created = Employee.objects.get_or_create(
                full_name=full_name,
            )
            if emp_created:
                PositionRecord.objects.create(
                    employee=emp,
                    legal_entity=self.le_main,
                    position_title=position,
                    start_date=date.today() - timedelta(days=random.randint(180, 730)),
                )
                SalaryHistory.objects.create(
                    employee=emp,
                    salary_full=salary_full,
                    salary_official=salary_official,
                    effective_date=date.today() - timedelta(days=random.randint(30, 365)),
                )
                created += 1
        self.stdout.write(f'✓ Сотрудники: {created}')

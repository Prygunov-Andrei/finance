"""
Фабрика для генерации тестовых данных.
Поддерживает генерацию по отдельным сущностям с параметрами количества.
"""
import random
from decimal import Decimal
from datetime import timedelta, date
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db import transaction
from faker import Faker
from django.contrib.auth.models import User

# Импорт всех моделей
from objects.models import Object
from accounting.models import (
    TaxSystem, LegalEntity, Account, AccountBalance, Counterparty
)
from payments.models import Payment, PaymentRegistry, ExpenseCategory
from communications.models import Correspondence
from contracts.models import (
    Contract, FrameworkContract, WorkScheduleItem, Act,
    ContractAmendment, ActPaymentAllocation
)
from estimates.models import (
    Project, ProjectNote, Estimate, EstimateSection,
    EstimateSubsection, EstimateCharacteristic, MountingEstimate
)
from proposals.models import (
    TechnicalProposal, MountingProposal, FrontOfWorkItem,
    MountingCondition, TKPEstimateSection, TKPEstimateSubsection,
    TKPCharacteristic, TKPFrontOfWork
)
from pricelists.models import (
    WorkerGrade, WorkSection, WorkerGradeSkills, WorkItem,
    PriceList, PriceListAgreement, PriceListItem
)

fake = Faker('ru_RU')


class Command(BaseCommand):
    help = """
    Генерация тестовых данных для всех сущностей.
    
    Примеры использования:
        python manage.py generate_data --all
        python manage.py generate_data --objects 10 --counterparties 100
        python manage.py generate_data --contracts 50 --payments 500
        python manage.py generate_data --estimates 20 --projects 15
    """

    def add_arguments(self, parser):
        # Основные сущности
        parser.add_argument('--all', action='store_true', help='Генерировать все сущности с дефолтными значениями')
        parser.add_argument('--objects', type=int, help='Количество объектов')
        parser.add_argument('--counterparties', type=int, help='Количество контрагентов')
        parser.add_argument('--contracts', type=int, help='Количество договоров')
        parser.add_argument('--payments', type=int, help='Количество платежей')
        parser.add_argument('--acts', type=int, help='Количество актов')
        parser.add_argument('--projects', type=int, help='Количество проектов')
        parser.add_argument('--estimates', type=int, help='Количество смет')
        parser.add_argument('--tkp', type=int, help='Количество ТКП')
        parser.add_argument('--mp', type=int, help='Количество МП')
        parser.add_argument('--pricelists', type=int, help='Количество прайс-листов')
        
        # Справочники
        parser.add_argument('--directories', action='store_true', help='Генерировать только справочники')
        
        # Параметры для договоров
        parser.add_argument('--contracts-per-object', type=int, default=4, help='Договоров на объект (по умолчанию 4)')
        parser.add_argument('--payments-per-contract', type=int, default=100, help='Платежей на договор (по умолчанию 100)')
        parser.add_argument('--acts-per-contract', type=int, default=20, help='Актов на договор (по умолчанию 20)')

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('=== Генерация тестовых данных ===\n'))
        
        # Сохраняем параметры для использования в методах
        self.payments_per_contract = options.get('payments_per_contract', 100)
        self.acts_per_contract = options.get('acts_per_contract', 20)
        self.contracts_per_object = options.get('contracts_per_object', 4)
        
        with transaction.atomic():
            # Всегда создаем справочники и базовые данные
            self.ensure_base_data()
            
            if options['all']:
                self.generate_all()
            elif options['directories']:
                self.generate_directories_only()
            else:
                # Генерируем только запрошенные сущности
                if options['objects']:
                    self.generate_objects(options['objects'])
                if options['counterparties']:
                    self.generate_counterparties(options['counterparties'])
                if options['contracts']:
                    self.generate_contracts(options['contracts'])
                if options['payments']:
                    self.generate_payments(options['payments'])
                if options['acts']:
                    self.generate_acts(options['acts'])
                if options['projects']:
                    self.generate_projects(options['projects'])
                if options['estimates']:
                    self.generate_estimates(options['estimates'])
                if options['tkp']:
                    self.generate_tkp(options['tkp'])
                if options['mp']:
                    self.generate_mp(options['mp'])
                if options['pricelists']:
                    self.generate_pricelists(options['pricelists'])
        
        self.stdout.write(self.style.SUCCESS('\n=== Генерация завершена ==='))

    def ensure_base_data(self):
        """Создает базовые данные, необходимые для работы"""
        # Суперпользователь
        if not User.objects.filter(username='admin').exists():
            User.objects.create_superuser('admin', 'admin@example.com', 'admin')
            self.stdout.write('✓ Создан суперпользователь: admin/admin')
        
        # Справочники
        self.generate_directories_only()
        
        # Юрлицо (если нет)
        if not LegalEntity.objects.exists():
            tax_system = TaxSystem.objects.first()
            if tax_system:
                LegalEntity.objects.create(
                    name='ООО "Тестовая Компания"',
                    short_name='ТестКом',
                    inn='1234567890',
                    kpp='123456789',
                    ogrn='1234567890123',
                    tax_system=tax_system,
                    director_name='Иванов Иван Иванович',
                    director_position='Генеральный директор'
                )
                self.stdout.write('✓ Создано тестовое юрлицо')
        
        # Счет (если нет)
        legal_entity = LegalEntity.objects.first()
        if legal_entity and not Account.objects.filter(legal_entity=legal_entity).exists():
            account = Account.objects.create(
                legal_entity=legal_entity,
                name='Основной расчетный счет',
                number='40702810100000000001',
                account_type=Account.Type.BANK_ACCOUNT,
                bank_name='ПАО "Тестовый Банк"',
                bik='044525225',
                currency=Account.Currency.RUB,
                initial_balance=Decimal('10000000.00'),
                balance_date=date.today() - timedelta(days=30)
            )
            self.stdout.write('✓ Создан тестовый счет')
            
            # Создаем несколько остатков на счете (AccountBalance)
            for i in range(3):
                balance_date = date.today() - timedelta(days=(i+1)*30)
                AccountBalance.objects.get_or_create(
                    account=account,
                    balance_date=balance_date,
                    defaults={'balance': Decimal('10000000.00') + Decimal(str(random.randint(-1000000, 2000000)))}
                )

    def generate_all(self):
        """Генерирует все сущности с разумными значениями по умолчанию"""
        self.stdout.write('\n--- Генерация всех сущностей ---\n')
        
        # Справочники уже созданы в ensure_base_data
        
        # Основные сущности
        self.generate_counterparties(100)
        self.generate_objects(10)
        self.generate_pricelists(5)
        self.generate_projects(50)
        self.generate_estimates(30)
        self.generate_mounting_estimates(20)
        self.generate_tkp(20)
        self.generate_mp(15)
        self.generate_framework_contracts(10)
        
        # Договоры с автоматическим созданием связанных данных
        objects = Object.objects.all()
        for obj in objects:
            contracts_count = random.randint(3, 5)
            # Используем параметр из командной строки, если задан
            if hasattr(self, 'contracts_per_object'):
                contracts_count = self.contracts_per_object
            self.generate_contracts_for_object(obj, contracts_count)
        
        self.stdout.write('\n✓ Все сущности сгенерированы')

    def generate_directories_only(self):
        """Генерирует только справочники"""
        self.stdout.write('--- Генерация справочников ---\n')
        
        # Системы налогообложения
        tax_systems = [
            {'code': 'osn', 'name': 'ОСН (НДС 20%)', 'vat_rate': 20, 'has_vat': True},
            {'code': 'usn_15', 'name': 'УСН (Доходы-Расходы)', 'vat_rate': 0, 'has_vat': False},
            {'code': 'usn_6', 'name': 'УСН (Доходы)', 'vat_rate': 0, 'has_vat': False},
        ]
        for ts in tax_systems:
            TaxSystem.objects.get_or_create(code=ts['code'], defaults=ts)
        self.stdout.write('✓ Системы налогообложения')
        
        # Категории расходов
        categories_data = {
            'materials': ('Материалы', ['Стройматериалы', 'Инструменты', 'Крепеж']),
            'salary': ('Зарплата', ['Основная', 'Премии', 'Отпускные']),
            'services': ('Услуги', ['Транспорт', 'Связь', 'Консультации']),
            'office': ('Офисные расходы', ['Аренда', 'Канцтовары', 'Интернет']),
            'income': ('Поступления', ['Авансы', 'Оплата работ', 'Возвраты']),
        }
        categories = []
        for code, (name, subcats) in categories_data.items():
            cat, _ = ExpenseCategory.objects.get_or_create(
                code=code, defaults={'name': name}
            )
            categories.append(cat)
            for subcat_name in subcats:
                ExpenseCategory.objects.get_or_create(
                    name=f'{name} - {subcat_name}',
                    parent=cat,
                    defaults={'code': f'{code}_{subcat_name.lower()}'}
                )
        self.stdout.write('✓ Категории расходов')
        
        # Разряды рабочих
        grades_data = [
            (1, 'Монтажник 1 разряда', Decimal('500.00')),
            (2, 'Монтажник 2 разряда', Decimal('600.00')),
            (3, 'Монтажник 3 разряда', Decimal('750.00')),
            (4, 'Монтажник 4 разряда', Decimal('900.00')),
            (5, 'Монтажник 5 разряда', Decimal('1100.00')),
        ]
        grades = []
        for grade_num, name, rate in grades_data:
            grade, _ = WorkerGrade.objects.get_or_create(
                grade=grade_num,
                defaults={'name': name, 'default_hourly_rate': rate}
            )
            grades.append(grade)
        self.stdout.write('✓ Разряды рабочих')
        
        # Разделы работ
        sections_data = [
            ('VENT', 'Вентиляция', None),
            ('COND', 'Кондиционирование', None),
            ('HEAT', 'Отопление', None),
            ('WATER', 'Водоснабжение', None),
            ('ELEC', 'Электрика', None),
        ]
        sections = []
        for code, name, parent_code in sections_data:
            parent = None
            if parent_code:
                parent = WorkSection.objects.filter(code=parent_code).first()
            section, _ = WorkSection.objects.get_or_create(
                code=code, defaults={'name': name, 'parent': parent}
            )
            sections.append(section)
        self.stdout.write('✓ Разделы работ')
        
        # Навыки разрядов (WorkerGradeSkills)
        for grade in grades:
            for section in sections[:3]:  # Для каждого разряда создаем навыки в 3 разделах
                WorkerGradeSkills.objects.get_or_create(
                    grade=grade,
                    section=section,
                    defaults={'description': f'Навыки {grade.name} в разделе {section.name}: {fake.text(max_nb_chars=200)}'}
                )
        self.stdout.write('✓ Навыки разрядов')
        
        # Работы
        work_section = WorkSection.objects.first()
        if work_section:
            for i in range(20):
                grade = WorkerGrade.objects.order_by('?').first()
                if grade:
                    WorkItem.objects.get_or_create(
                        article=f'WORK-{i+1:03d}',
                        defaults={
                            'section': work_section,
                            'name': f'Работа {fake.word()}',
                            'unit': random.choice(WorkItem.Unit.choices)[0],
                            'hours': Decimal(str(random.randint(1, 10))),
                            'grade': grade,
                            'required_grade': Decimal(str(grade.grade)),
                            'coefficient': Decimal('1.00'),
                            'composition': fake.text(max_nb_chars=200)
                        }
                    )
        self.stdout.write('✓ Работы')
        
        # Фронт работ
        front_items = [
            'Подвести электропитание к местам установки',
            'Подготовить площадку для монтажа',
            'Обеспечить доступ к объекту',
            'Выполнить демонтаж старого оборудования',
        ]
        for item in front_items:
            FrontOfWorkItem.objects.get_or_create(name=item)
        self.stdout.write('✓ Фронт работ')
        
        # Условия для МП
        conditions = [
            'Проживание',
            'Питание',
            'Инструмент',
            'Транспорт',
        ]
        for cond in conditions:
            MountingCondition.objects.get_or_create(name=cond)
        self.stdout.write('✓ Условия для МП')

    def generate_objects(self, count):
        """Генерирует объекты"""
        self.stdout.write(f'\n--- Генерация {count} объектов ---')
        created = 0
        for _ in range(count):
            start_date = fake.date_between(start_date='-2y', end_date='today')
            end_date = start_date + timedelta(days=random.randint(90, 365))
            Object.objects.create(
                name=f"ЖК {fake.city_name()}, ул. {fake.street_name()}",
                address=fake.address(),
                status=random.choice(Object.Status.choices)[0],
                start_date=start_date,
                end_date=end_date,
                description=fake.text(max_nb_chars=500)
            )
            created += 1
        self.stdout.write(f'✓ Создано объектов: {created}')

    def generate_counterparties(self, count):
        """Генерирует контрагентов"""
        self.stdout.write(f'\n--- Генерация {count} контрагентов ---')
        created = 0
        types = ['customer', 'vendor', 'both']
        legal_forms = ['ooo', 'ip', 'self_employed', 'fiz']
        
        for _ in range(count):
            cp_type = random.choice(types)
            legal_form = random.choice(legal_forms)
            vendor_subtype = None
            if cp_type == 'vendor':
                vendor_subtype = random.choice(['supplier', 'executor', 'both'])
            
            Counterparty.objects.create(
                name=fake.company(),
                short_name=fake.company_suffix(),
                type=cp_type,
                vendor_subtype=vendor_subtype,
                legal_form=legal_form,
                inn=fake.numerify('##########') if legal_form != 'fiz' else fake.numerify('############'),
                kpp=fake.numerify('#########') if legal_form in ['ooo', 'both'] else '',
                ogrn=fake.numerify('###############') if legal_form != 'fiz' else '',
                contact_info=f"{fake.name()}\n{fake.phone_number()}\n{fake.email()}",
                is_active=True
            )
            created += 1
        self.stdout.write(f'✓ Создано контрагентов: {created}')

    def generate_contracts_for_object(self, obj, count):
        """Генерирует договоры для объекта с автоматическим созданием связанных данных"""
        legal_entity = LegalEntity.objects.first()
        if not legal_entity:
            self.stdout.write(self.style.ERROR('Нет юрлица для создания договоров'))
            return
        
        customers = list(Counterparty.objects.filter(type__in=['customer', 'both']))
        vendors = list(Counterparty.objects.filter(type__in=['vendor', 'both']))
        
        if not customers and not vendors:
            self.stdout.write(self.style.ERROR('Нет контрагентов для создания договоров'))
            return
        
        # Доходные договоры
        income_count = max(1, count // 2)
        for _ in range(income_count):
            if not customers:
                break
            customer = random.choice(customers)
            total_amount = Decimal(random.randint(10_000_000, 100_000_000))
            contract = self._create_income_contract(obj, legal_entity, customer, total_amount)
            if contract:
                self._fill_contract_data(contract)
        
        # Расходные договоры
        expense_count = count - income_count
        parent_contracts = list(Contract.objects.filter(object=obj, contract_type='income'))
        for _ in range(expense_count):
            if not vendors:
                break
            vendor = random.choice(vendors)
            amount = Decimal(random.randint(1_000_000, 10_000_000))
            contract = self._create_expense_contract(obj, legal_entity, vendor, amount, parent_contracts)
            if contract:
                self._fill_contract_data(contract)

    def generate_contracts(self, count):
        """Генерирует договоры"""
        self.stdout.write(f'\n--- Генерация {count} договоров ---')
        objects = list(Object.objects.all())
        if not objects:
            self.stdout.write(self.style.ERROR('Нет объектов для создания договоров'))
            return
        
        created = 0
        for _ in range(count):
            obj = random.choice(objects)
            self.generate_contracts_for_object(obj, 1)
            created += 1
        self.stdout.write(f'✓ Создано договоров: {created}')

    def _create_income_contract(self, obj, legal_entity, customer, total_amount):
        """Создает доходный договор"""
        try:
            # Выбираем статус, но если "active", нужен ТКП
            status_choice = random.choice(Contract.Status.choices)
            status = status_choice[0]  # Берем значение (первый элемент кортежа)
            technical_proposal = None
            
            # Если статус "active", привязываем ТКП
            if status == Contract.Status.ACTIVE:
                tkp_list = list(TechnicalProposal.objects.filter(object=obj, status='approved'))
                if tkp_list:
                    technical_proposal = random.choice(tkp_list)
                else:
                    # Если нет утвержденных ТКП, меняем статус
                    status = random.choice([Contract.Status.PLANNED, Contract.Status.COMPLETED])
            
            contract = Contract.objects.create(
                object=obj,
                legal_entity=legal_entity,
                counterparty=customer,
                contract_type=Contract.Type.INCOME,
                number=f"ДГ-{obj.id}-{random.randint(1000, 9999)}",
                name=f"Договор генподряда на {fake.word()}",
                contract_date=obj.start_date - timedelta(days=random.randint(5, 30)) if obj.start_date else fake.date_this_year(),
                start_date=obj.start_date,
                end_date=obj.end_date,
                total_amount=total_amount,
                vat_rate=Decimal('20.00'),
                vat_included=True,
                status=status,
                technical_proposal=technical_proposal
            )
            return contract
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Ошибка создания договора: {e}'))
            return None

    def _create_expense_contract(self, obj, legal_entity, vendor, amount, parent_contracts=None):
        """Создает расходный договор"""
        try:
            parent = random.choice(parent_contracts) if parent_contracts else None
            # Выбираем статус, но если "active", нужен МП
            status_choice = random.choice(Contract.Status.choices)
            status = status_choice[0]  # Берем значение (первый элемент кортежа)
            mounting_proposal = None
            
            # Если статус "active", привязываем МП
            if status == Contract.Status.ACTIVE:
                mp_list = list(MountingProposal.objects.filter(object=obj, status='approved'))
                if mp_list:
                    mounting_proposal = random.choice(mp_list)
                else:
                    # Если нет утвержденных МП, меняем статус
                    status = random.choice([Contract.Status.PLANNED, Contract.Status.COMPLETED])
            
            contract = Contract.objects.create(
                object=obj,
                legal_entity=legal_entity,
                counterparty=vendor,
                contract_type=Contract.Type.EXPENSE,
                parent_contract=parent,
                number=f"СУБ-{obj.id}-{random.randint(1000, 9999)}",
                name=f"Договор субподряда на {fake.word()}",
                contract_date=obj.start_date + timedelta(days=random.randint(0, 30)) if obj.start_date else fake.date_this_year(),
                start_date=obj.start_date,
                end_date=obj.end_date,
                total_amount=amount,
                vat_rate=Decimal('20.00'),
                vat_included=True,
                status=status,
                mounting_proposal=mounting_proposal
            )
            return contract
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Ошибка создания договора: {e}'))
            return None

    def _fill_contract_data(self, contract):
        """Заполняет договор связанными данными: график, акты, платежи, переписка"""
        # График работ
        if contract.start_date and contract.end_date:
            contract_duration = (contract.end_date - contract.start_date).days
            stages_count = random.randint(5, 10)
            stage_duration = max(1, contract_duration // stages_count)
            
            for j in range(stages_count):
                stage_start = contract.start_date + timedelta(days=j * stage_duration)
                stage_end = min(
                    contract.start_date + timedelta(days=(j + 1) * stage_duration),
                    contract.end_date
                )
                if stage_start >= contract.end_date:
                    break
                    
                WorkScheduleItem.objects.create(
                    contract=contract,
                    name=f"Этап {j+1}: {fake.sentence(nb_words=3)}",
                    start_date=stage_start,
                    end_date=stage_end,
                    workers_count=random.randint(2, 15),
                    status=random.choice(WorkScheduleItem.Status.choices)[0]
                )
        else:
            # Если нет дат договора, создаем простой график
            base_date = fake.date_this_year()
            for j in range(random.randint(5, 10)):
                WorkScheduleItem.objects.create(
                    contract=contract,
                    name=f"Этап {j+1}: {fake.sentence(nb_words=3)}",
                    start_date=base_date + timedelta(days=j*15),
                    end_date=base_date + timedelta(days=(j+1)*15),
                    workers_count=random.randint(2, 15),
                    status=random.choice(WorkScheduleItem.Status.choices)[0]
                )
        
        # Акты (по умолчанию 20 на договор, можно настроить через параметр)
        acts = []
        act_amount_pool = contract.total_amount
        acts_count = getattr(self, 'acts_per_contract', 20)
        for j in range(acts_count):
            amount = act_amount_pool / Decimal(str(acts_count))
            act_date = contract.start_date + timedelta(days=j*15) if contract.start_date else fake.date_this_year()
            status = 'signed' if act_date < date.today() else 'draft'
            
            act = Act.objects.create(
                contract=contract,
                number=f"АКТ-{contract.id}-{j+1:03d}",
                date=act_date,
                period_start=act_date - timedelta(days=15),
                period_end=act_date,
                amount_gross=amount,
                status=status
            )
            acts.append(act)
        
        # Платежи (по умолчанию 100 на договор, можно настроить через параметр)
        account = Account.objects.filter(legal_entity=contract.legal_entity).first()
        if not account:
            return
        
        category = ExpenseCategory.objects.first()
        if not category:
            return
        
        payments_count = getattr(self, 'payments_per_contract', 100)
        for k in range(payments_count):
            payment_date = contract.start_date + timedelta(days=k*3) if contract.start_date else fake.date_this_year()
            amount = Decimal(random.randint(50000, 500000))
            
            if contract.contract_type == 'expense':
                # Расход: через реестр
                registry_status = 'paid' if payment_date < date.today() else random.choice(['planned', 'approved'])
                reg_item = PaymentRegistry.objects.create(
                    contract=contract,
                    category=category,
                    amount=amount,
                    planned_date=payment_date,
                    status=registry_status,
                    act=random.choice(acts) if k % 3 == 0 and acts else None,
                    account=account
                )
                
                if registry_status == 'paid':
                    Payment.objects.create(
                        payment_type='expense',
                        amount=amount,
                        payment_date=payment_date,
                        account=account,
                        contract=contract,
                        category=category,
                        legal_entity=contract.legal_entity,
                        status='paid',
                        description=f"Оплата по заявке {reg_item.id}"
                    )
            else:
                # Доход: прямой платеж
                if payment_date < date.today():
                    Payment.objects.create(
                        payment_type='income',
                        amount=amount,
                        payment_date=payment_date,
                        account=account,
                        contract=contract,
                        category=category,
                        legal_entity=contract.legal_entity,
                        status='paid',
                        description=f"Оплата от заказчика по договору {contract.number}"
                    )
        
        # Переписка
        for m in range(random.randint(3, 8)):
            Correspondence.objects.create(
                contract=contract,
                type=random.choice(Correspondence.Type.choices)[0],
                category=random.choice(Correspondence.Category.choices)[0],
                number=f"ПИСЬМО-{contract.id}-{m+1}",
                date=contract.start_date + timedelta(days=m*20) if contract.start_date else fake.date_this_year(),
                status=random.choice(Correspondence.Status.choices)[0],
                subject=fake.sentence(),
                description=fake.text(max_nb_chars=500)
            )
        
        # Дополнительные соглашения (20% договоров имеют доп. соглашения)
        if random.random() < 0.2:
            amendment_count = random.randint(1, 3)
            for am in range(amendment_count):
                amendment_date = contract.contract_date + timedelta(days=random.randint(30, 180))
                # Ограничиваем новую сумму, чтобы не превысить 14 цифр
                new_amount = None
                if random.random() < 0.5:
                    # Максимальная сумма: 999999999999.99 (14 цифр)
                    max_amount = Decimal('999999999999.99')
                    # Если текущая сумма уже близка к максимуму, не увеличиваем
                    if contract.total_amount < max_amount * Decimal('0.8'):
                        multiplier = Decimal(str(random.uniform(1.0, 1.2)))
                        new_amount = (contract.total_amount * multiplier).quantize(Decimal('0.01'))
                        if new_amount > max_amount:
                            new_amount = max_amount
                    else:
                        # Если сумма уже большая, уменьшаем или оставляем как есть
                        new_amount = contract.total_amount * Decimal(str(random.uniform(0.95, 1.05))).quantize(Decimal('0.01'))
                
                ContractAmendment.objects.create(
                    contract=contract,
                    number=f"ДС-{contract.number}-{am+1}",
                    date=amendment_date,
                    reason=fake.text(max_nb_chars=300),
                    new_start_date=contract.start_date + timedelta(days=random.randint(0, 30)) if contract.start_date else None,
                    new_end_date=contract.end_date + timedelta(days=random.randint(0, 60)) if contract.end_date else None,
                    new_total_amount=new_amount
                )
        
        # Связи между актами и платежами (ActPaymentAllocation)
        # Создаем связи для части платежей с актами
        paid_payments = Payment.objects.filter(contract=contract, status='paid')
        for payment in paid_payments[:len(acts)]:  # Связываем платежи с актами
            if acts:
                act = random.choice(acts)
                # Создаем связь только если её еще нет
                if not ActPaymentAllocation.objects.filter(act=act, payment=payment).exists():
                    ActPaymentAllocation.objects.create(
                        act=act,
                        payment=payment,
                        amount=min(payment.amount, act.amount_gross)
                    )

    def generate_payments(self, count):
        """Генерирует платежи"""
        self.stdout.write(f'\n--- Генерация {count} платежей ---')
        contracts = list(Contract.objects.all())
        accounts = list(Account.objects.all())
        categories = list(ExpenseCategory.objects.all())
        
        if not contracts or not accounts or not categories:
            self.stdout.write(self.style.ERROR('Нет необходимых данных для создания платежей'))
            return
        
        created = 0
        for _ in range(count):
            contract = random.choice(contracts)
            account = random.choice(accounts)
            category = random.choice(categories)
            payment_type = random.choice(['income', 'expense'])
            
            Payment.objects.create(
                payment_type=payment_type,
                amount=Decimal(random.randint(10000, 1000000)),
                payment_date=fake.date_between(start_date='-1y', end_date='today'),
                account=account,
                contract=contract,
                category=category,
                legal_entity=contract.legal_entity if contract.legal_entity else account.legal_entity,
                status=random.choice(['pending', 'paid', 'cancelled']),
                description=fake.text(max_nb_chars=200)
            )
            created += 1
        self.stdout.write(f'✓ Создано платежей: {created}')

    def generate_acts(self, count):
        """Генерирует акты"""
        self.stdout.write(f'\n--- Генерация {count} актов ---')
        contracts = list(Contract.objects.all())
        if not contracts:
            self.stdout.write(self.style.ERROR('Нет договоров для создания актов'))
            return
        
        created = 0
        for _ in range(count):
            contract = random.choice(contracts)
            act_date = fake.date_between(
                start_date=contract.start_date if contract.start_date else '-1y',
                end_date=contract.end_date if contract.end_date else 'today'
            )
            
            Act.objects.create(
                contract=contract,
                number=f"АКТ-{contract.id}-{random.randint(100, 999)}",
                date=act_date,
                period_start=act_date - timedelta(days=30),
                period_end=act_date,
                amount_gross=Decimal(random.randint(100000, 5000000)),
                status=random.choice(Act.Status.choices)[0]
            )
            created += 1
        self.stdout.write(f'✓ Создано актов: {created}')

    def generate_projects(self, count):
        """Генерирует проекты (с поддержкой версионирования)"""
        self.stdout.write(f'\n--- Генерация {count} проектов ---')
        objects = list(Object.objects.all())
        if not objects:
            self.stdout.write(self.style.ERROR('Нет объектов для создания проектов'))
            return
        
        user = User.objects.first()
        if not user:
            self.stdout.write(self.style.ERROR('Нет пользователей для создания проектов'))
            return
        
        created = 0
        for _ in range(count):
            obj = random.choice(objects)
            project_date = fake.date_between(start_date='-2y', end_date='today')
            
            # Создаем временный файл
            from django.core.files.uploadedfile import SimpleUploadedFile
            temp_file = SimpleUploadedFile('project.zip', b'fake project data')
            
            # Если разрешение "В производство работ", нужен файл разрешения
            is_approved = random.choice([True, False])
            approval_file = None
            if is_approved:
                approval_file = SimpleUploadedFile('approval.pdf', b'fake approval data')
            
            project = Project.objects.create(
                cipher=f"ПР-{obj.id}-{random.randint(100, 999)}",
                name=f"Проект {fake.word()}",
                date=project_date,
                stage=random.choice(Project.Stage.choices)[0],
                object=obj,
                file=temp_file,
                is_approved_for_production=is_approved,
                production_approval_file=approval_file,
                production_approval_date=fake.date_between(start_date='-1y', end_date='today') if is_approved else None,
                primary_check_done=random.choice([True, False]),
                secondary_check_done=random.choice([True, False])
            )
            
            # Создаем версии (30% проектов имеют версии)
            if random.random() < 0.3:
                versions_count = random.randint(1, 3)
                parent = project
                for v in range(versions_count):
                    new_date = parent.date + timedelta(days=(v+1)*30)
                    version_file = SimpleUploadedFile(f'project_v{v+2}.zip', b'fake project data')
                    parent = Project.objects.create(
                        cipher=parent.cipher,  # Тот же шифр
                        name=parent.name,
                        date=new_date,
                        stage=parent.stage,
                        object=parent.object,
                        file=version_file,
                        parent_version=parent,
                        version_number=parent.version_number + 1,
                        is_current=True
                    )
                    # Старая версия становится неактуальной
                    Project.objects.filter(id=parent.id).exclude(id=parent.id).update(is_current=False)
            
            # Замечания к проекту (30% проектов имеют замечания)
            if random.random() < 0.3:
                notes_count = random.randint(1, 5)
                for n in range(notes_count):
                    ProjectNote.objects.create(
                        project=project,
                        author=user,
                        text=fake.text(max_nb_chars=500)
                    )
            
            created += 1
        self.stdout.write(f'✓ Создано проектов: {created}')

    def generate_estimates(self, count):
        """Генерирует сметы (с поддержкой версионирования)"""
        self.stdout.write(f'\n--- Генерация {count} смет ---')
        objects = list(Object.objects.all())
        legal_entities = list(LegalEntity.objects.all())
        price_lists = list(PriceList.objects.all())
        projects = list(Project.objects.filter(is_current=True))
        user = User.objects.first()
        
        if not objects or not legal_entities or not user:
            self.stdout.write(self.style.ERROR('Нет необходимых данных для создания смет'))
            return
        
        created = 0
        for _ in range(count):
            obj = random.choice(objects)
            legal_entity = random.choice(legal_entities)
            price_list = random.choice(price_lists) if price_lists else None
            
            estimate = Estimate.objects.create(
                name=f"Смета {fake.word()}",
                object=obj,
                legal_entity=legal_entity,
                with_vat=True,
                vat_rate=Decimal('20.00'),
                price_list=price_list,
                man_hours=Decimal(str(random.randint(100, 1000))),
                status=random.choice(Estimate.Status.choices)[0],
                created_by=user
            )
            
            # Привязываем проекты
            if projects:
                estimate.projects.set(random.sample(projects, min(2, len(projects))))
            
            # Создаем разделы и подразделы
            for s in range(random.randint(2, 5)):
                section = EstimateSection.objects.create(
                    estimate=estimate,
                    name=f"Раздел {s+1}: {fake.word()}",
                    sort_order=s
                )
                for ss in range(random.randint(2, 4)):
                    EstimateSubsection.objects.create(
                        section=section,
                        name=f"Подраздел {ss+1}: {fake.word()}",
                        materials_sale=Decimal(str(random.randint(100000, 1000000))),
                        works_sale=Decimal(str(random.randint(100000, 1000000))),
                        materials_purchase=Decimal(str(random.randint(50000, 500000))),
                        works_purchase=Decimal(str(random.randint(50000, 500000))),
                        sort_order=ss
                    )
            
            # Создаем характеристики
            EstimateCharacteristic.objects.create(
                estimate=estimate,
                name='Материалы',
                purchase_amount=Decimal('0'),
                sale_amount=Decimal('0'),
                is_auto_calculated=True,
                source_type='sections',
                sort_order=1
            )
            EstimateCharacteristic.objects.create(
                estimate=estimate,
                name='Работы',
                purchase_amount=Decimal('0'),
                sale_amount=Decimal('0'),
                is_auto_calculated=True,
                source_type='sections',
                sort_order=2
            )
            
            # Обновляем автоматические характеристики
            estimate.update_auto_characteristics()
            
            # Создаем версии (30% смет имеют версии)
            if random.random() < 0.3:
                versions_count = random.randint(1, 2)
                parent = estimate
                for v in range(versions_count):
                    parent = parent.create_new_version()
            
            created += 1
        self.stdout.write(f'✓ Создано смет: {created}')

    def generate_tkp(self, count):
        """Генерирует ТКП (с поддержкой версионирования)"""
        self.stdout.write(f'\n--- Генерация {count} ТКП ---')
        objects = list(Object.objects.all())
        legal_entities = list(LegalEntity.objects.all())
        estimates = list(Estimate.objects.all())
        user = User.objects.first()
        
        if not objects or not legal_entities or not user:
            self.stdout.write(self.style.ERROR('Нет необходимых данных для создания ТКП'))
            return
        
        created = 0
        for _ in range(count):
            obj = random.choice(objects)
            legal_entity = random.choice(legal_entities)
            tkp_estimates = random.sample(estimates, min(3, len(estimates))) if estimates else []
            
            tkp = TechnicalProposal.objects.create(
                name=f"ТКП {fake.word()}",
                date=fake.date_between(start_date='-1y', end_date='today'),
                object=obj,
                object_area=random.randint(100, 10000),
                legal_entity=legal_entity,
                advance_required=fake.text(max_nb_chars=200),
                work_duration=fake.text(max_nb_chars=200),
                validity_days=random.randint(30, 90),
                status=random.choice(TechnicalProposal.Status.choices)[0],
                created_by=user
            )
            
            if tkp_estimates:
                tkp.estimates.set(tkp_estimates)
                tkp.copy_data_from_estimates()
            
            # Фронт работ
            front_items = list(FrontOfWorkItem.objects.all())
            if front_items:
                for front_item in random.sample(front_items, min(3, len(front_items))):
                    TKPFrontOfWork.objects.create(
                        tkp=tkp,
                        front_item=front_item,
                        when_text=fake.text(max_nb_chars=100),
                        when_date=fake.date_between(start_date='today', end_date='+30d')
                    )
            
            # Создаем версии (20% ТКП имеют версии)
            if random.random() < 0.2:
                versions_count = random.randint(1, 2)
                parent = tkp
                for v in range(versions_count):
                    parent = parent.create_new_version()
            
            created += 1
        self.stdout.write(f'✓ Создано ТКП: {created}')

    def generate_mp(self, count):
        """Генерирует МП"""
        self.stdout.write(f'\n--- Генерация {count} МП ---')
        objects = list(Object.objects.all())
        counterparties = list(Counterparty.objects.filter(type__in=['vendor', 'both']))
        tkp_list = list(TechnicalProposal.objects.all())
        mounting_estimates = list(MountingEstimate.objects.all())
        user = User.objects.first()
        
        if not objects or not user:
            self.stdout.write(self.style.ERROR('Нет необходимых данных для создания МП'))
            return
        
        created = 0
        for _ in range(count):
            obj = random.choice(objects)
            counterparty = random.choice(counterparties) if counterparties else None
            parent_tkp = random.choice(tkp_list) if tkp_list else None
            mounting_estimate = random.choice(mounting_estimates) if mounting_estimates else None
            
            mp = MountingProposal.objects.create(
                name=f"МП {fake.word()}",
                date=fake.date_between(start_date='-1y', end_date='today'),
                object=obj,
                counterparty=counterparty,
                parent_tkp=parent_tkp,
                mounting_estimate=mounting_estimate,
                total_amount=Decimal(str(random.randint(1000000, 10000000))),
                man_hours=Decimal(str(random.randint(100, 1000))),
                status=random.choice(MountingProposal.Status.choices)[0],
                created_by=user
            )
            
            # Условия
            conditions = list(MountingCondition.objects.all())
            if conditions:
                mp.conditions.set(random.sample(conditions, min(2, len(conditions))))
            
            created += 1
        self.stdout.write(f'✓ Создано МП: {created}')

    def generate_pricelists(self, count):
        """Генерирует прайс-листы"""
        self.stdout.write(f'\n--- Генерация {count} прайс-листов ---')
        work_items = list(WorkItem.objects.filter(is_current=True))
        counterparties = list(Counterparty.objects.filter(type__in=['vendor', 'both']))
        
        if not work_items:
            self.stdout.write(self.style.ERROR('Нет работ для создания прайс-листов'))
            return
        
        created = 0
        for _ in range(count):
            pricelist = PriceList.objects.create(
                number=f"ПЛ-{random.randint(100, 999)}",
                name=f"Прайс-лист {fake.word()}",
                date=fake.date_between(start_date='-1y', end_date='today'),
                status=random.choice(PriceList.Status.choices)[0],
                grade_1_rate=Decimal('500.00'),
                grade_2_rate=Decimal('600.00'),
                grade_3_rate=Decimal('750.00'),
                grade_4_rate=Decimal('900.00'),
                grade_5_rate=Decimal('1100.00')
            )
            
            # Добавляем работы
            selected_items = random.sample(work_items, min(10, len(work_items)))
            for work_item in selected_items:
                PriceListItem.objects.create(
                    price_list=pricelist,
                    work_item=work_item,
                    is_included=True
                )
            
            # Согласования с контрагентами
            if counterparties:
                counterparty = random.choice(counterparties)
                PriceListAgreement.objects.create(
                    price_list=pricelist,
                    counterparty=counterparty,
                    agreed_date=fake.date_between(start_date='-6m', end_date='today'),
                    notes=fake.text(max_nb_chars=200)
                )
            
            created += 1
        self.stdout.write(f'✓ Создано прайс-листов: {created}')

    def generate_mounting_estimates(self, count):
        """Генерирует монтажные сметы"""
        self.stdout.write(f'\n--- Генерация {count} монтажных смет ---')
        objects = list(Object.objects.all())
        estimates = list(Estimate.objects.all())
        counterparties = list(Counterparty.objects.filter(type__in=['vendor', 'both']))
        user = User.objects.first()
        
        if not objects or not user:
            self.stdout.write(self.style.ERROR('Нет необходимых данных для создания монтажных смет'))
            return
        
        created = 0
        for _ in range(count):
            obj = random.choice(objects)
            source_estimate = random.choice(estimates) if estimates else None
            counterparty = random.choice(counterparties) if counterparties else None
            
            mounting_estimate = MountingEstimate.objects.create(
                name=f"Монтажная смета {fake.word()}",
                object=obj,
                source_estimate=source_estimate,
                total_amount=Decimal(str(random.randint(1000000, 10000000))),
                man_hours=Decimal(str(random.randint(100, 1000))),
                status=random.choice(MountingEstimate.Status.choices)[0],
                agreed_counterparty=counterparty,
                agreed_date=fake.date_between(start_date='-6m', end_date='today') if counterparty else None,
                created_by=user
            )
            
            # Создаем версии (20% монтажных смет имеют версии)
            if random.random() < 0.2:
                versions_count = random.randint(1, 2)
                parent = mounting_estimate
                for v in range(versions_count):
                    parent = parent.create_new_version()
            
            created += 1
        self.stdout.write(f'✓ Создано монтажных смет: {created}')

    def generate_framework_contracts(self, count):
        """Генерирует рамочные договоры"""
        self.stdout.write(f'\n--- Генерация {count} рамочных договоров ---')
        legal_entities = list(LegalEntity.objects.all())
        counterparties = list(Counterparty.objects.filter(type__in=['vendor', 'both']))
        price_lists = list(PriceList.objects.all())
        user = User.objects.first()
        
        if not legal_entities or not counterparties or not user:
            self.stdout.write(self.style.ERROR('Нет необходимых данных для создания рамочных договоров'))
            return
        
        created = 0
        for _ in range(count):
            legal_entity = random.choice(legal_entities)
            counterparty = random.choice(counterparties)
            contract_date = fake.date_between(start_date='-2y', end_date='today')
            valid_from = contract_date
            valid_until = valid_from + timedelta(days=random.randint(365, 1095))  # 1-3 года
            
            framework = FrameworkContract.objects.create(
                name=f"Рамочный договор {fake.word()}",
                date=contract_date,
                valid_from=valid_from,
                valid_until=valid_until,
                legal_entity=legal_entity,
                counterparty=counterparty,
                status=random.choice(FrameworkContract.Status.choices)[0],
                created_by=user,
                notes=fake.text(max_nb_chars=500)
            )
            
            # Привязываем прайс-листы
            if price_lists:
                selected_lists = random.sample(price_lists, min(3, len(price_lists)))
                framework.price_lists.set(selected_lists)
            
            created += 1
        self.stdout.write(f'✓ Создано рамочных договоров: {created}')

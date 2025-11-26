import random
from decimal import Decimal
from datetime import timedelta, date
from django.core.management.base import BaseCommand
from django.core.files.base import ContentFile
from django.utils import timezone
from django.db import transaction
from faker import Faker

# Импорт моделей
from django.contrib.auth.models import User
from objects.models import Object
from accounting.models import Counterparty, LegalEntity, Account, TaxSystem
from communications.models import Correspondence
from contracts.models import (
    Contract, CommercialProposal, WorkScheduleItem, Act, 
    ContractAmendment, ActPaymentAllocation
)
from payments.models import Payment, PaymentRegistry, ExpenseCategory

fake = Faker('ru_RU')

class Command(BaseCommand):
    help = 'Заполняет базу данных реалистичными тестовыми данными'

    def handle(self, *args, **kwargs):
        self.stdout.write('Начинаем генерацию данных...')
        
        # Проверка и создание суперпользователя
        if not User.objects.filter(username='admin').exists():
            User.objects.create_superuser('admin', 'admin@example.com', 'admin')
            self.stdout.write('Создан суперпользователь: admin/admin')

        with transaction.atomic():
            self.generate_directories()
            legal_entities = self.generate_legal_entities()
            categories = self.generate_categories()
            customers, vendors = self.generate_counterparties()
            objects = self.generate_objects()
            
            for obj in objects:
                self.stdout.write(f'Обработка объекта: {obj.name}')
                # 1. Создаем доходные договоры (с Заказчиками)
                self.generate_income_flow(obj, legal_entities, customers, categories)
                
                # 2. Создаем расходные договоры (с Исполнителями)
                self.generate_expense_flow(obj, legal_entities, vendors, categories)

        self.stdout.write(self.style.SUCCESS('Успешно сгенерированы тестовые данные!'))

    def generate_directories(self):
        """Создает базовые справочники"""
        TaxSystem.objects.get_or_create(code='osn', defaults={'name': 'ОСН (НДС 20%)', 'vat_rate': 20})
        TaxSystem.objects.get_or_create(code='usn_15', defaults={'name': 'УСН (Доходы-Расходы)', 'vat_rate': 0})
        TaxSystem.objects.get_or_create(code='usn_6', defaults={'name': 'УСН (Доходы)', 'vat_rate': 0})

    def generate_categories(self):
        """Создает дерево категорий расходов"""
        roots = {
            'materials': 'Материалы',
            'salary': 'Зарплата',
            'services': 'Услуги',
            'office': 'Офисные расходы',
            'income': 'Поступления'
        }
        categories = []
        for code, name in roots.items():
            cat, _ = ExpenseCategory.objects.get_or_create(name=name, defaults={'code': code})
            
            # Подкатегории
            for i in range(3):
                sub_cat, _ = ExpenseCategory.objects.get_or_create(
                    name=f'{name} - {fake.word()}',
                    parent=cat,
                    defaults={'code': f'{code}_{i}'}
                )
                categories.append(sub_cat)
        return categories

    def generate_legal_entities(self):
        """Создает наши юрлица и счета"""
        entities = []
        tax_systems = list(TaxSystem.objects.all())
        
        for _ in range(3):
            le = LegalEntity.objects.create(
                name=fake.company(),
                inn=fake.numerify('##########'),
                kpp=fake.numerify('#########'),
                ogrn=fake.numerify('#############'),
                tax_system=random.choice(tax_systems)
            )
            entities.append(le)
            
            # Счета
            for _ in range(random.randint(2, 4)):
                Account.objects.create(
                    legal_entity=le,
                    name=f'Основной {fake.bank()}',
                    number=fake.iban(),
                    bank_name=fake.bank(),
                    bik=fake.numerify('#########'),
                    currency='RUB',
                    initial_balance=Decimal(random.randint(1000000, 50000000))
                )
        return entities

    def generate_counterparties(self):
        """Создает контрагентов"""
        customers = []
        vendors = []
        
        # Заказчики
        for _ in range(10):
            c = Counterparty.objects.create(
                name=fake.company(),
                inn=fake.numerify('##########'),
                type='customer',
                contact_info=f"{fake.name()}\n{fake.phone_number()}\n{fake.email()}"
            )
            customers.append(c)

        # Исполнители
        for _ in range(10):
            v = Counterparty.objects.create(
                name=fake.company(),
                inn=fake.numerify('##########'),
                type='vendor',
                contact_info=f"{fake.name()}\n{fake.phone_number()}\n{fake.email()}"
            )
            vendors.append(v)
            
        return customers, vendors

    def generate_objects(self):
        """Создает объекты строительства"""
        objects = []
        for _ in range(20):
            start_date = fake.date_this_year()
            end_date = start_date + timedelta(days=random.randint(90, 365))
            obj = Object.objects.create(
                name=f"ЖК {fake.city_name()}, ул. {fake.street_name()}",
                address=fake.address(),
                status=random.choice(['planned', 'in_progress', 'completed']),
                start_date=start_date,
                end_date=end_date
            )
            objects.append(obj)
        return objects

    def generate_income_flow(self, obj, legal_entities, customers, categories):
        """Генерирует доходную часть (Договоры с заказчиками)"""
        for i in range(3): # 3 договора на объект
            customer = random.choice(customers)
            le = random.choice(legal_entities)
            total_amount = Decimal(random.randint(10_000_000, 100_000_000))
            
            # 1. КП
            cp = CommercialProposal.objects.create(
                object=obj,
                counterparty=customer,
                proposal_type='income',
                number=f"KP-{obj.id}-{i}-{random.randint(100,999)}",
                date=obj.start_date - timedelta(days=10),
                total_amount=total_amount,
                status='approved',
                description=fake.text(max_nb_chars=200)
            )
            
            # 2. Договор
            contract = Contract.objects.create(
                name=f"Договор генподряда №{cp.number}",
                number=f"CNT-{cp.number}",
                contract_type='income',
                status='active',
                legal_entity=le,
                counterparty=customer,
                object=obj,
                commercial_proposal=cp,
                contract_date=cp.date + timedelta(days=5),
                start_date=obj.start_date,
                end_date=obj.end_date,
                total_amount=total_amount,
                vat_included=True
            )
            
            self._fill_contract_data(contract, categories)

    def generate_expense_flow(self, obj, legal_entities, vendors, categories):
        """Генерирует расходную часть (Субподрядчики)"""
        # Берем случайный доходный договор как родительский (если есть)
        parent_contracts = list(Contract.objects.filter(object=obj, contract_type='income'))
        
        for i in range(random.randint(2, 5)):
            vendor = random.choice(vendors)
            le = random.choice(legal_entities)
            amount = Decimal(random.randint(1_000_000, 5_000_000))
            
            # 1. КП от подрядчика
            cp = CommercialProposal.objects.create(
                object=obj,
                counterparty=vendor,
                proposal_type='expense',
                number=f"MKP-{obj.id}-{i}-{random.randint(100,999)}",
                date=obj.start_date + timedelta(days=random.randint(0, 30)),
                total_amount=amount,
                status='approved'
            )
            
            # 2. Договор
            contract = Contract.objects.create(
                name=f"Договор субподряда {fake.job()}",
                number=f"SUB-{cp.number}",
                contract_type='expense',
                status='active',
                legal_entity=le,
                counterparty=vendor,
                object=obj,
                commercial_proposal=cp,
                parent_contract=random.choice(parent_contracts) if parent_contracts else None,
                contract_date=cp.date + timedelta(days=2),
                start_date=cp.date + timedelta(days=5),
                end_date=cp.date + timedelta(days=60),
                total_amount=amount,
                vat_included=True
            )
            
            self._fill_contract_data(contract, categories)

    def _fill_contract_data(self, contract, categories):
        """Наполняет договор данными (График, Акты, Платежи, Переписка)"""
        
        # 1. График работ
        for j in range(5):
            WorkScheduleItem.objects.create(
                contract=contract,
                name=f"Этап работ {j+1}: {fake.sentence(nb_words=3)}",
                start_date=contract.start_date + timedelta(days=j*10),
                end_date=contract.start_date + timedelta(days=(j+1)*10),
                workers_count=random.randint(2, 10)
            )
            
        # 2. Акты (KS-2)
        acts = []
        act_amount_pool = contract.total_amount
        for j in range(random.randint(3, 8)):
            amount = act_amount_pool * Decimal('0.1') # по 10%
            act_date = contract.start_date + timedelta(days=j*30)
            if act_date > date.today():
                status = 'draft'
            else:
                status = 'signed'
                
            act = Act.objects.create(
                contract=contract,
                number=f"ACT-{contract.id}-{j}",
                date=act_date,
                period_start=act_date - timedelta(days=30),
                period_end=act_date,
                amount_gross=amount,
                amount_net=amount * Decimal('0.8333'), # approx without VAT 20%
                vat_amount=amount * Decimal('0.1667'),
                status=status
            )
            acts.append(act)
            
            # Сразу создаем начисления для подписанных
            if status == 'signed':
                pass # Логика начисления баланса уже в модели/сигналах или вычисляется

        # 3. Платежи (30+ штук)
        # Для расходных - через Реестр, для доходных - сразу Payment
        
        accounts = Account.objects.filter(legal_entity=contract.legal_entity)
        if not accounts.exists(): return
        account = accounts.first()

        for k in range(35):
            payment_date = contract.start_date + timedelta(days=k*5)
            amount = Decimal(random.randint(10000, 500000))
            category = random.choice(categories)
            
            if contract.contract_type == 'expense':
                # Расход: Реестр -> Платеж
                registry_status = 'paid' if payment_date < date.today() else random.choice(['planned', 'approved'])
                
                reg_item = PaymentRegistry.objects.create(
                    contract=contract,
                    category=category,
                    amount=amount,
                    planned_date=payment_date,
                    status=registry_status,
                    act=random.choice(acts) if k % 2 != 0 and acts else None
                )
                
                if registry_status == 'paid':
                    Payment.objects.create(
                        payment_type='expense',
                        amount=amount,
                        payment_date=payment_date,
                        account=account,
                        contract=contract,
                        category=category,
                        description=f"Оплата по заявке {reg_item.id}"
                    )
            else:
                # Доход: Просто входящий платеж
                if payment_date < date.today():
                    Payment.objects.create(
                        payment_type='income',
                        amount=amount,
                        payment_date=payment_date,
                        account=account,
                        contract=contract,
                        category=category, # Income category technically
                        description=f"Оплата от заказчика по договору {contract.number}"
                    )

        # 4. Переписка
        for m in range(5):
            Correspondence.objects.create(
                contract=contract,
                type=random.choice(['incoming', 'outgoing']),
                category='letter',
                number=f"LTR-{contract.id}-{m}",
                date=contract.start_date + timedelta(days=m*15),
                status=random.choice(['sent', 'received']),
                subject=fake.sentence(),
                description=fake.text()
            )



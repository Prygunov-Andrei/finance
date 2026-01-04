from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.db import transaction
from objects.models import Object
from accounting.models import LegalEntity, Account, Counterparty, TaxSystem, AccountBalance
from contracts.models import Contract, CommercialProposal, ContractAmendment, WorkScheduleItem, Act, ActPaymentAllocation
from payments.models import Payment, PaymentRegistry, ExpenseCategory
from communications.models import Correspondence

User = get_user_model()

class Command(BaseCommand):
    help = 'Очищает базу данных, оставляя только суперпользователей.'

    def handle(self, *args, **options):
        self.stdout.write('Начинаем очистку базы данных...')

        with transaction.atomic():
            # 1. Платежи и финансы
            self.stdout.write('Удаляем платежи и распределения...')
            ActPaymentAllocation.objects.all().delete()
            PaymentRegistry.objects.all().delete()
            Payment.objects.all().delete()
            AccountBalance.objects.all().delete()
            ExpenseCategory.objects.all().delete()

            # 2. Коммуникации и Документооборот
            self.stdout.write('Удаляем переписку и акты...')
            Correspondence.objects.all().delete()
            Act.objects.all().delete()
            ContractAmendment.objects.all().delete()
            WorkScheduleItem.objects.all().delete()

            # 3. Основные сущности (Договоры, КП, Объекты)
            self.stdout.write('Удаляем договоры, КП и объекты...')
            # Удаляем договоры вручную, если каскад не срабатывает как надо, но тут должно быть ок
            Contract.objects.all().delete()
            CommercialProposal.objects.all().delete()
            Object.objects.all().delete()

            # 4. Справочники (Юрлица, Контрагенты, Счета)
            self.stdout.write('Удаляем справочники (Юрлица, Счета, Контрагенты)...')
            Account.objects.all().delete()
            LegalEntity.objects.all().delete()
            Counterparty.objects.all().delete()
            # TaxSystem часто является предустановленным справочником, но если нужно совсем чисто:
            TaxSystem.objects.all().delete()

            # 5. Пользователи
            self.stdout.write('Удаляем пользователей (кроме админов)...')
            count, _ = User.objects.filter(is_superuser=False).delete()
            self.stdout.write(f'Удалено {count} обычных пользователей.')

        self.stdout.write(self.style.SUCCESS('База данных успешно очищена! Остались только Администраторы.'))


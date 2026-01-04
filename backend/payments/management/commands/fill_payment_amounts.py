"""
Management command для заполнения NULL значений amount_gross, amount_net, vat_amount.

Использование:
    python manage.py fill_payment_amounts --dry-run
    python manage.py fill_payment_amounts
"""
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.db import transaction

from payments.models import Payment


class Command(BaseCommand):
    help = 'Заполняет NULL значения amount_gross, amount_net, vat_amount в платежах'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Только показать что будет изменено, без фактических изменений'
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        
        # Находим платежи с NULL суммами
        payments_to_fix = Payment.objects.filter(
            amount_gross__isnull=True
        ).prefetch_related('items')
        
        total = payments_to_fix.count()
        self.stdout.write(f'Найдено платежей с NULL amount_gross: {total}')
        
        if total == 0:
            self.stdout.write(self.style.SUCCESS('Все платежи уже заполнены.'))
            return
        
        fixed = 0
        errors = 0
        
        with transaction.atomic():
            for payment in payments_to_fix:
                try:
                    # Пытаемся вычислить суммы из items
                    if payment.items.exists():
                        items = list(payment.items.all())
                        
                        # amount_gross = сумма всех items
                        amount_gross = sum(
                            (item.quantity * item.price_per_unit) if item.quantity and item.price_per_unit 
                            else Decimal('0') 
                            for item in items
                        )
                        
                        # vat_amount = сумма НДС всех items
                        vat_amount = sum(
                            item.vat_amount or Decimal('0') 
                            for item in items
                        )
                        
                        # amount_net = amount_gross - vat_amount
                        amount_net = amount_gross - vat_amount
                    else:
                        # Если нет items, используем amount как fallback
                        amount_gross = payment.amount or Decimal('0')
                        vat_amount = Decimal('0')
                        amount_net = amount_gross
                    
                    if not dry_run:
                        payment.amount_gross = amount_gross
                        payment.amount_net = amount_net
                        payment.vat_amount = vat_amount
                        payment.save(update_fields=['amount_gross', 'amount_net', 'vat_amount'])
                    
                    fixed += 1
                    
                    if options['verbosity'] >= 2:
                        self.stdout.write(
                            f'  [{payment.id}] {payment.description[:50] if payment.description else "Без описания"}... '
                            f'gross={amount_gross}, net={amount_net}, vat={vat_amount}'
                        )
                    
                except Exception as e:
                    errors += 1
                    self.stdout.write(self.style.ERROR(f'  Ошибка для платежа {payment.id}: {e}'))
            
            if dry_run:
                # Откатываем изменения
                transaction.set_rollback(True)
        
        self.stdout.write('')
        if dry_run:
            self.stdout.write(self.style.WARNING(f'[DRY RUN] Будет исправлено: {fixed} платежей'))
        else:
            self.stdout.write(self.style.SUCCESS(f'Исправлено: {fixed} платежей'))
        
        if errors:
            self.stdout.write(self.style.ERROR(f'Ошибок: {errors}'))

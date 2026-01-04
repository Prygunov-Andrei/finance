"""
Management command для очистки устаревших данных LLM-парсинга.

Использование:
    python manage.py cleanup_old_data --parsed-docs-days=90
    python manage.py cleanup_old_data --dry-run
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta

from llm_services.models import ParsedDocument


class Command(BaseCommand):
    help = 'Очистка устаревших ParsedDocument (не связанных с платежами)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--parsed-docs-days',
            type=int,
            default=90,
            help='Удалить ParsedDocument старше N дней (по умолчанию: 90)'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Только показать что будет удалено, без фактического удаления'
        )
        parser.add_argument(
            '--include-linked',
            action='store_true',
            help='Также удалять документы связанные с платежами'
        )

    def handle(self, *args, **options):
        days = options['parsed_docs_days']
        dry_run = options['dry_run']
        include_linked = options['include_linked']
        
        cutoff = timezone.now() - timedelta(days=days)
        
        self.stdout.write(f'Ищем ParsedDocument старше {days} дней (до {cutoff.date()})...')
        
        # Базовый queryset
        queryset = ParsedDocument.objects.filter(created_at__lt=cutoff)
        
        # По умолчанию не удаляем связанные с платежами
        if not include_linked:
            queryset = queryset.filter(payment__isnull=True)
        
        # Статистика по статусам
        stats = {
            'pending': queryset.filter(status=ParsedDocument.Status.PENDING).count(),
            'success': queryset.filter(status=ParsedDocument.Status.SUCCESS).count(),
            'failed': queryset.filter(status=ParsedDocument.Status.FAILED).count(),
            'needs_review': queryset.filter(status=ParsedDocument.Status.NEEDS_REVIEW).count(),
        }
        
        total = sum(stats.values())
        
        self.stdout.write(f'\nНайдено документов для удаления: {total}')
        for status_name, count in stats.items():
            if count > 0:
                self.stdout.write(f'  - {status_name}: {count}')
        
        if total == 0:
            self.stdout.write(self.style.SUCCESS('Нечего удалять.'))
            return
        
        if dry_run:
            self.stdout.write(self.style.WARNING('\n[DRY RUN] Фактическое удаление не выполнено.'))
            return
        
        # Удаляем
        deleted_count, deleted_details = queryset.delete()
        
        self.stdout.write(self.style.SUCCESS(f'\nУдалено: {deleted_count} записей'))
        for model_name, count in deleted_details.items():
            if count > 0:
                self.stdout.write(f'  - {model_name}: {count}')

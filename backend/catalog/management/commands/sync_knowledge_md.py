"""Синхронизация базы знаний ProductKnowledge ↔ .md файлы.

Использование:
  python manage.py sync_knowledge_md            # .md → БД (ручные правки)
  python manage.py sync_knowledge_md --export   # БД → .md
  python manage.py sync_knowledge_md --bidirectional  # обе стороны
"""
import os
import re
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from catalog.models import Product, ProductKnowledge
from pricelists.models import WorkItem

KNOWLEDGE_DIR = os.path.join(settings.BASE_DIR, '..', 'data', 'knowledge', 'products')


class Command(BaseCommand):
    help = 'Синхронизация ProductKnowledge с .md файлами в data/knowledge/'

    def add_arguments(self, parser):
        parser.add_argument(
            '--export', action='store_true',
            help='Экспорт БД → .md файлы',
        )
        parser.add_argument(
            '--bidirectional', action='store_true',
            help='Полная синхронизация в обе стороны',
        )

    def handle(self, *args, **options):
        os.makedirs(KNOWLEDGE_DIR, exist_ok=True)

        if options['export'] or options['bidirectional']:
            self._export_to_md()

        if not options['export'] or options['bidirectional']:
            self._import_from_md()

    def _export_to_md(self):
        """Экспорт ProductKnowledge → .md файлы."""
        entries = (
            ProductKnowledge.objects.filter(
                status__in=[ProductKnowledge.Status.VERIFIED, ProductKnowledge.Status.PENDING],
            )
            .select_related('work_item', 'work_section')
            .order_by('item_name_pattern')
        )

        # Группируем по item_name_pattern
        grouped = {}
        for entry in entries:
            key = entry.item_name_pattern
            if key not in grouped:
                grouped[key] = []
            grouped[key].append(entry)

        created = 0
        for name, knowledge_list in grouped.items():
            filename = name.replace(' ', '-')[:80] + '.md'
            filepath = os.path.join(KNOWLEDGE_DIR, filename)

            content = f"# {name}\n\n## Подходящие расценки\n"
            for k in knowledge_list:
                status_label = 'verified' if k.status == ProductKnowledge.Status.VERIFIED else 'pending'
                content += f"- **{k.work_item.article}** {k.work_item.name} (confidence: {k.confidence:.2f}, {status_label})\n"

            content += "\n## Источник знаний\n"
            for k in knowledge_list:
                if k.llm_reasoning:
                    content += f"- {k.get_source_display()}: {k.llm_reasoning}\n"

            content += "\n## Примечания оператора\n\n"

            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            created += 1

            # Обновить md_file_path в БД
            rel_path = os.path.join('products', filename)
            ProductKnowledge.objects.filter(
                item_name_pattern=name,
            ).update(md_file_path=rel_path)

        self.stdout.write(self.style.SUCCESS(f'Экспортировано {created} .md файлов'))

    def _import_from_md(self):
        """Импорт .md файлов → ProductKnowledge."""
        if not os.path.exists(KNOWLEDGE_DIR):
            self.stdout.write('Директория data/knowledge/products/ не найдена')
            return

        imported = 0
        for filename in sorted(os.listdir(KNOWLEDGE_DIR)):
            if not filename.endswith('.md'):
                continue

            filepath = os.path.join(KNOWLEDGE_DIR, filename)
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()

            # Извлечь имя из заголовка
            title_match = re.search(r'^# (.+)$', content, re.MULTILINE)
            if not title_match:
                continue
            item_name = title_match.group(1).strip()
            normalized = Product.normalize_name(item_name)

            # Извлечь расценки: **ARTICLE** Name (confidence: X.XX, status)
            pattern = r'\*\*([A-Za-zА-Яа-я0-9\-]+)\*\*\s+(.+?)\s+\(confidence:\s*([\d.]+),\s*(\w+)\)'
            for match in re.finditer(pattern, content):
                article = match.group(1)
                confidence = float(match.group(3))
                status_str = match.group(4)

                try:
                    work_item = WorkItem.objects.get(article=article, is_current=True)
                except WorkItem.DoesNotExist:
                    self.stderr.write(f'  WorkItem {article} не найден, пропуск')
                    continue

                status = (
                    ProductKnowledge.Status.VERIFIED
                    if status_str == 'verified'
                    else ProductKnowledge.Status.PENDING
                )

                _, created = ProductKnowledge.objects.update_or_create(
                    item_name_pattern=normalized,
                    work_item=work_item,
                    defaults={
                        'confidence': confidence,
                        'source': ProductKnowledge.Source.MANUAL,
                        'status': status,
                        'work_section': work_item.section,
                        'md_file_path': os.path.join('products', filename),
                    },
                )
                if created:
                    imported += 1

        self.stdout.write(self.style.SUCCESS(f'Импортировано {imported} новых записей из .md'))

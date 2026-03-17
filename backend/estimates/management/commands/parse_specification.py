"""
Management-команда для CLI-тестирования парсинга спецификаций.

Использование:
    python manage.py parse_specification path/to/spec.pdf
    python manage.py parse_specification spec.pdf --no-estimate
    python manage.py parse_specification spec.pdf --auto-fill
"""
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from api_public.models import EstimateRequest
from estimates.models import SpecificationItem
from estimates.services.specification_transformer import create_estimate_from_spec_items
from llm_services.services.specification_parser import SpecificationParser


class Command(BaseCommand):
    help = 'Парсинг PDF-спецификации через LLM Vision'

    def add_arguments(self, parser):
        parser.add_argument('pdf_path', type=str, help='Путь к PDF-файлу')
        parser.add_argument(
            '--no-estimate', action='store_true',
            help='Только парсинг, без создания Estimate',
        )
        parser.add_argument(
            '--auto-fill', action='store_true',
            help='Запустить EstimateAutoMatcher.auto_fill() после создания сметы',
        )
        parser.add_argument(
            '--project-name', type=str, default='CLI тест',
            help='Название проекта для EstimateRequest',
        )

    def handle(self, *args, **options):
        pdf_path = Path(options['pdf_path'])
        if not pdf_path.exists():
            raise CommandError(f'Файл не найден: {pdf_path}')

        pdf_content = pdf_path.read_bytes()
        self.stdout.write(f'Файл: {pdf_path.name} ({len(pdf_content)} байт)')

        # Парсинг
        parser = SpecificationParser()

        def on_progress(page, total):
            self.stdout.write(f'  Страница {page}/{total}', ending='\r')

        result = parser.parse_pdf(
            pdf_content, filename=pdf_path.name, on_page_progress=on_progress,
        )
        self.stdout.write('')  # newline после \r

        # Результат парсинга
        self.stdout.write(self.style.SUCCESS(
            f'\nСтатус: {result["status"]}'
        ))
        self.stdout.write(f'Позиций: {len(result["items"])}')
        self.stdout.write(
            f'Страниц: {result["pages_processed"]}/{result["pages_total"]} '
            f'(пропущено: {result["pages_skipped"]}, ошибок: {result["pages_error"]})'
        )

        if result['errors']:
            self.stdout.write(self.style.WARNING('\nОшибки:'))
            for err in result['errors']:
                self.stdout.write(f'  {err}')

        if not result['items']:
            self.stdout.write(self.style.WARNING('Нет позиций для сохранения.'))
            return

        # Вывод первых 10 позиций
        self.stdout.write('\nПервые 10 позиций:')
        for i, item in enumerate(result['items'][:10]):
            self.stdout.write(
                f'  {i+1}. {item["name"]}'
                f' | {item.get("brand", "")} {item.get("model_name", "")}'
                f' | {item["quantity"]} {item["unit"]}'
                f' | {item.get("section_name", "")}'
            )
        if len(result['items']) > 10:
            self.stdout.write(f'  ... и ещё {len(result["items"]) - 10}')

        if options['no_estimate']:
            return

        # Создаём EstimateRequest + SpecificationItem
        estimate_request = EstimateRequest.objects.create(
            email='cli-test@local',
            project_name=options['project_name'],
            status=EstimateRequest.Status.PARSING,
            total_files=1,
            processed_files=1,
            total_spec_items=len(result['items']),
        )

        for item_data in result['items']:
            SpecificationItem.objects.create(
                request=estimate_request,
                name=item_data['name'],
                model_name=item_data.get('model_name', ''),
                brand=item_data.get('brand', ''),
                unit=item_data.get('unit', 'шт'),
                quantity=item_data.get('quantity', 1),
                tech_specs_raw=item_data.get('tech_specs', ''),
                section_name=item_data.get('section_name', ''),
                page_number=item_data.get('page_number', 0),
                sort_order=item_data.get('sort_order', 0),
            )

        self.stdout.write(self.style.SUCCESS(
            f'\nСохранено {len(result["items"])} SpecificationItem'
        ))

        # Создаём Estimate
        estimate = create_estimate_from_spec_items(estimate_request)
        self.stdout.write(self.style.SUCCESS(
            f'Создана смета: {estimate.number} ({estimate.name})'
        ))
        self.stdout.write(
            f'Секций: {estimate.sections.count()}, '
            f'Позиций: {EstimateRequest.objects.get(pk=estimate_request.pk).estimate.items.count()}'
        )

        # Auto-fill
        if options['auto_fill']:
            from estimates.services.estimate_auto_matcher import EstimateAutoMatcher
            matcher = EstimateAutoMatcher()
            fill_result = matcher.auto_fill(estimate)
            self.stdout.write(self.style.SUCCESS('\nAuto-fill результат:'))
            self.stdout.write(f'  Цены: {fill_result["prices"]}')
            self.stdout.write(f'  Работы: {fill_result["works"]}')

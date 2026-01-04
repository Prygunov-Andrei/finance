"""
Management команда для тестирования парсинга PDF через LLM
Использование: python manage.py test_llm_parse <путь_к_pdf_файлу> [--provider openai|gemini|grok]
"""
import os
import sys
import json
from pathlib import Path
from django.core.management.base import BaseCommand, CommandError
from django.conf import settings
from dotenv import load_dotenv

# Загружаем переменные окружения из .env
load_dotenv()

from llm_services.models import LLMProvider
from llm_services.providers import get_provider
from llm_services.schemas import ParsedInvoice


class Command(BaseCommand):
    help = 'Тестирует парсинг PDF-файла через LLM провайдера'
    
    def add_arguments(self, parser):
        parser.add_argument(
            'pdf_file',
            type=str,
            help='Путь к файлу для парсинга (PDF, PNG или JPG)'
        )
        parser.add_argument(
            '--provider',
            type=str,
            choices=['openai', 'gemini', 'grok'],
            default=None,
            help='Тип провайдера (openai, gemini, grok). Если не указан, используется провайдер по умолчанию.'
        )
    
    def handle(self, *args, **options):
        pdf_path = Path(options['pdf_file'])
        
        if not pdf_path.exists():
            raise CommandError(f'Файл не найден: {pdf_path}')
        
        # Определяем тип файла
        file_ext = pdf_path.suffix.lower()
        supported_formats = ['.pdf', '.png', '.jpg', '.jpeg']
        if file_ext not in supported_formats:
            raise CommandError(f'Файл должен быть PDF, PNG или JPG, получен: {file_ext}')
        
        file_type = 'pdf' if file_ext == '.pdf' else file_ext[1:]  # Убираем точку
        if file_type == 'jpeg':
            file_type = 'jpg'
        
        # Получаем провайдер
        provider_type = options.get('provider')
        provider_model = None
        
        if provider_type:
            provider_model = LLMProvider.objects.filter(
                provider_type=provider_type,
                is_active=True
            ).first()
            if not provider_model:
                raise CommandError(f'Провайдер {provider_type} не найден в БД или неактивен')
        else:
            try:
                provider_model = LLMProvider.get_default()
            except ValueError as e:
                raise CommandError(f'Не удалось получить провайдер по умолчанию: {e}')
        
        self.stdout.write(
            self.style.SUCCESS(f'Используется провайдер: {provider_model.get_provider_type_display()} ({provider_model.model_name})')
        )
        
        # Читаем файл
        try:
            with open(pdf_path, 'rb') as f:
                file_content = f.read()
            self.stdout.write(f'Файл загружен: {len(file_content)} байт ({file_type.upper()})')
        except Exception as e:
            raise CommandError(f'Ошибка чтения файла: {e}')
        
        # Создаем провайдер
        try:
            provider = get_provider(provider_model)
        except ValueError as e:
            raise CommandError(f'Ошибка создания провайдера: {e}')
        
        # Парсим
        self.stdout.write('Начинаем парсинг...')
        try:
            parsed_invoice, processing_time = provider.parse_invoice(file_content, file_type=file_type)
            
            self.stdout.write(
                self.style.SUCCESS(f'\n✅ Парсинг успешно завершен за {processing_time} мс\n')
            )
            
            # Выводим результаты
            self.stdout.write(self.style.WARNING('=' * 60))
            self.stdout.write(self.style.WARNING('РЕЗУЛЬТАТЫ ПАРСИНГА'))
            self.stdout.write(self.style.WARNING('=' * 60))
            
            self.stdout.write(f'\n📄 СЧЕТ:')
            self.stdout.write(f'  Номер: {parsed_invoice.invoice.number}')
            self.stdout.write(f'  Дата: {parsed_invoice.invoice.invoice_date}')
            
            self.stdout.write(f'\n🏢 ПОСТАВЩИК:')
            self.stdout.write(f'  Название: {parsed_invoice.vendor.name}')
            self.stdout.write(f'  ИНН: {parsed_invoice.vendor.inn}')
            if parsed_invoice.vendor.kpp:
                self.stdout.write(f'  КПП: {parsed_invoice.vendor.kpp}')
            
            self.stdout.write(f'\n🏢 ПОКУПАТЕЛЬ:')
            self.stdout.write(f'  Название: {parsed_invoice.buyer.name}')
            self.stdout.write(f'  ИНН: {parsed_invoice.buyer.inn}')
            
            self.stdout.write(f'\n💰 СУММЫ:')
            self.stdout.write(f'  Сумма с НДС: {parsed_invoice.totals.amount_gross}')
            self.stdout.write(f'  НДС: {parsed_invoice.totals.vat_amount}')
            
            self.stdout.write(f'\n📦 ПОЗИЦИИ ({len(parsed_invoice.items)}):')
            for i, item in enumerate(parsed_invoice.items, 1):
                self.stdout.write(f'  {i}. {item.name}')
                self.stdout.write(f'     Количество: {item.quantity} {item.unit}')
                self.stdout.write(f'     Цена за единицу: {item.price_per_unit}')
                total = item.quantity * item.price_per_unit
                self.stdout.write(f'     Итого: {total}')
            
            self.stdout.write(f'\n📊 Уверенность: {parsed_invoice.confidence * 100:.1f}%')
            
            # Выводим JSON
            self.stdout.write(self.style.WARNING('\n' + '=' * 60))
            self.stdout.write(self.style.WARNING('JSON РЕЗУЛЬТАТ'))
            self.stdout.write(self.style.WARNING('=' * 60))
            
            result_dict = parsed_invoice.model_dump(mode='json')
            self.stdout.write(json.dumps(result_dict, ensure_ascii=False, indent=2))
            self.stdout.write('')
            
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f'\n❌ Ошибка парсинга: {e}')
            )
            import traceback
            self.stdout.write(traceback.format_exc())
            sys.exit(1)

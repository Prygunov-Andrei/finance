"""
Management команда для сравнения LLM провайдеров
Использование: python manage.py compare_providers <путь_к_pdf_файлу>
"""
import os
import sys
import json
import time
from pathlib import Path
from django.core.management.base import BaseCommand, CommandError

# Загружаем переменные окружения из .env (если python-dotenv установлен)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from llm_services.models import LLMProvider
from llm_services.providers import get_provider
from llm_services.schemas import ParsedInvoice


class Command(BaseCommand):
    help = 'Сравнивает результаты парсинга PDF через все доступные LLM провайдеры'
    
    def add_arguments(self, parser):
        parser.add_argument(
            'pdf_file',
            type=str,
            help='Путь к файлу для парсинга (PDF, PNG или JPG)'
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
        
        # Читаем файл
        try:
            with open(pdf_path, 'rb') as f:
                file_content = f.read()
            file_size_kb = len(file_content) / 1024
            self.stdout.write(f'📄 Файл: {pdf_path.name} ({file_size_kb:.1f} KB, {file_type.upper()})\n')
        except Exception as e:
            raise CommandError(f'Ошибка чтения файла: {e}')
        
        # Получаем все активные провайдеры
        providers = LLMProvider.objects.filter(is_active=True).order_by('provider_type')
        
        if not providers.exists():
            raise CommandError('Нет активных провайдеров в БД')
        
        results = []
        
        for provider_model in providers:
            provider_name = provider_model.get_provider_type_display()
            model_name = provider_model.model_name
            
            self.stdout.write(f'🔄 Тестирую {provider_name} ({model_name})...')
            
            try:
                provider = get_provider(provider_model)
            except ValueError as e:
                self.stdout.write(
                    self.style.ERROR(f'  ❌ Ошибка создания провайдера: {e}')
                )
                continue
            
            # Замеряем время выполнения
            start_time = time.time()
            try:
                parsed_invoice, processing_time_ms = provider.parse_invoice(file_content, file_type=file_type)
                actual_time = time.time() - start_time
                
                results.append({
                    'provider': provider_name,
                    'model': model_name,
                    'success': True,
                    'processing_time_ms': processing_time_ms,
                    'actual_time_s': actual_time,
                    'confidence': parsed_invoice.confidence,
                    'invoice_number': parsed_invoice.invoice.number,
                    'invoice_date': str(parsed_invoice.invoice.date),
                    'vendor_name': parsed_invoice.vendor.name,
                    'vendor_inn': parsed_invoice.vendor.inn,
                    'buyer_name': parsed_invoice.buyer.name,
                    'buyer_inn': parsed_invoice.buyer.inn,
                    'amount_gross': float(parsed_invoice.totals.amount_gross),
                    'vat_amount': float(parsed_invoice.totals.vat_amount),
                    'items_count': len(parsed_invoice.items),
                    'data': parsed_invoice
                })
                
                self.stdout.write(
                    self.style.SUCCESS(
                        f'  ✅ Успешно за {actual_time:.1f}с (уверенность: {parsed_invoice.confidence*100:.1f}%)'
                    )
                )
            except Exception as e:
                actual_time = time.time() - start_time
                results.append({
                    'provider': provider_name,
                    'model': model_name,
                    'success': False,
                    'error': str(e),
                    'actual_time_s': actual_time
                })
                self.stdout.write(
                    self.style.ERROR(f'  ❌ Ошибка: {e}')
                )
        
        # Выводим сравнение
        self.stdout.write('\n' + '=' * 80)
        self.stdout.write(self.style.WARNING('📊 СРАВНИТЕЛЬНАЯ ТАБЛИЦА'))
        self.stdout.write('=' * 80 + '\n')
        
        # Таблица результатов
        headers = ['Провайдер', 'Модель', 'Статус', 'Время (с)', 'Уверенность', 'Позиций']
        col_widths = [20, 25, 10, 12, 12, 10]
        
        # Заголовок
        header_row = ' | '.join(h.ljust(w) for h, w in zip(headers, col_widths))
        self.stdout.write(header_row)
        self.stdout.write('-' * len(header_row))
        
        # Данные
        for r in results:
            if r['success']:
                row = [
                    r['provider'][:20],
                    r['model'][:25],
                    '✅ OK',
                    f"{r['actual_time_s']:.1f}",
                    f"{r['confidence']*100:.1f}%",
                    str(r['items_count'])
                ]
            else:
                row = [
                    r['provider'][:20],
                    r['model'][:25],
                    '❌ ERROR',
                    f"{r['actual_time_s']:.1f}",
                    'N/A',
                    'N/A'
                ]
            self.stdout.write(' | '.join(cell.ljust(w) for cell, w in zip(row, col_widths)))
        
        # Детальное сравнение данных
        successful_results = [r for r in results if r['success']]
        if len(successful_results) > 1:
            self.stdout.write('\n' + '=' * 80)
            self.stdout.write(self.style.WARNING('🔍 ДЕТАЛЬНОЕ СРАВНЕНИЕ ДАННЫХ'))
            self.stdout.write('=' * 80 + '\n')
            
            # Сравниваем ключевые поля
            comparison_fields = [
                ('Номер счета', 'invoice_number'),
                ('Дата счета', 'invoice_date'),
                ('Поставщик', 'vendor_name'),
                ('ИНН поставщика', 'vendor_inn'),
                ('Покупатель', 'buyer_name'),
                ('ИНН покупателя', 'buyer_inn'),
                ('Сумма с НДС', 'amount_gross'),
                ('НДС', 'vat_amount'),
                ('Кол-во позиций', 'items_count'),
            ]
            
            for field_name, field_key in comparison_fields:
                self.stdout.write(f'\n📋 {field_name}:')
                values = []
                for r in successful_results:
                    value = r.get(field_key, 'N/A')
                    if isinstance(value, float):
                        value = f"{value:,.2f}"
                    values.append((r['provider'], value))
                
                # Проверяем совпадение
                unique_values = set(str(v[1]) for v in values)
                if len(unique_values) == 1:
                    status = '✅'
                else:
                    status = '⚠️'
                
                for provider, value in values:
                    self.stdout.write(f'  {status} {provider:20} : {value}')
        
        # Самый быстрый и самый уверенный
        if successful_results:
            fastest = min(successful_results, key=lambda x: x['actual_time_s'])
            most_confident = max(successful_results, key=lambda x: x['confidence'])
            
            self.stdout.write('\n' + '=' * 80)
            self.stdout.write(self.style.WARNING('🏆 ЛУЧШИЕ РЕЗУЛЬТАТЫ'))
            self.stdout.write('=' * 80)
            self.stdout.write(f'⚡ Самый быстрый: {fastest["provider"]} ({fastest["actual_time_s"]:.1f}с)')
            self.stdout.write(f'🎯 Самый уверенный: {most_confident["provider"]} ({most_confident["confidence"]*100:.1f}%)')
        
        # Стоимость (приблизительная, на основе публичных цен)
        self.stdout.write('\n' + '=' * 80)
        self.stdout.write(self.style.WARNING('💰 ПРИМЕРНАЯ СТОИМОСТЬ (на основе публичных тарифов)'))
        self.stdout.write('=' * 80)
        self.stdout.write('⚠️  Точные цены зависят от вашего тарифа и объема использования')
        self.stdout.write('📝 Для точной стоимости проверьте ваши договоры с провайдерами\n')
        
        # Сохраняем результаты в JSON для дальнейшего анализа
        output_file = pdf_path.parent / f'{pdf_path.stem}_comparison.json'
        output_data = {
            'pdf_file': str(pdf_path),
            'file_size_kb': file_size_kb,
            'test_time': time.strftime('%Y-%m-%d %H:%M:%S'),
            'results': []
        }
        
        for r in results:
            result_data = {
                'provider': r['provider'],
                'model': r['model'],
                'success': r['success'],
                'processing_time_ms': r.get('processing_time_ms'),
                'actual_time_s': r['actual_time_s'],
                'confidence': r.get('confidence'),
            }
            
            if r['success']:
                result_data['parsed_data'] = r['data'].model_dump(mode='json')
            else:
                result_data['error'] = r.get('error')
            
            output_data['results'].append(result_data)
        
        try:
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(output_data, f, ensure_ascii=False, indent=2)
            self.stdout.write(f'\n💾 Результаты сохранены в: {output_file}')
        except Exception as e:
            self.stdout.write(
                self.style.WARNING(f'\n⚠️  Не удалось сохранить результаты: {e}')
            )

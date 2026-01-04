import os
import sys
from pathlib import Path
from django.core.management.base import BaseCommand, CommandError
from llm_services.models import LLMProvider
from llm_services.services.document_parser import DocumentParser
from llm_services.services.exceptions import RateLimitError


class Command(BaseCommand):
    help = 'Массовый импорт PDF-счетов из директории'
    
    def add_arguments(self, parser):
        parser.add_argument(
            'directory',
            type=str,
            help='Путь к директории с PDF-файлами'
        )
        parser.add_argument(
            '--provider',
            type=str,
            choices=[p.value for p in LLMProvider.ProviderType],
            help='LLM-провайдер для парсинга (openai, gemini, grok). Если не указан, используется провайдер по умолчанию.'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Только показать файлы, не парсить'
        )
    
    def handle(self, *args, **options):
        directory = Path(options['directory'])
        
        if not directory.exists():
            raise CommandError(f'Директория не найдена: {directory}')
        
        if not directory.is_dir():
            raise CommandError(f'Указанный путь не является директорией: {directory}')
        
        # Получаем провайдер
        provider_type_str = options.get('provider')
        if provider_type_str:
            try:
                provider = LLMProvider.objects.get(
                    provider_type=provider_type_str,
                    is_active=True
                )
            except LLMProvider.DoesNotExist:
                raise CommandError(f'Провайдер {provider_type_str} не настроен или не активен')
        else:
            provider = LLMProvider.get_default()
        
        # Собираем поддерживаемые файлы (PDF, PNG, JPG, JPEG)
        supported_extensions = ('.pdf', '.png', '.jpg', '.jpeg')
        files = []
        for ext in supported_extensions:
            files.extend(directory.glob(f'**/*{ext}'))
            files.extend(directory.glob(f'**/*{ext.upper()}'))
        
        # Убираем дубликаты (на случай если файл найден и с маленькой и с большой буквы)
        files = list(set(files))
        files.sort()
        
        self.stdout.write(f'Найдено {len(files)} файлов для обработки')
        self.stdout.write(f'Используется провайдер: {provider.get_provider_type_display()} ({provider.model_name})')
        
        if options['dry_run']:
            self.stdout.write('\nРежим dry-run - файлы не будут обработаны:')
            for f in files:
                self.stdout.write(f'  - {f.name} ({f.suffix})')
            return
        
        parser = DocumentParser(provider=provider)
        
        success_count = 0
        error_count = 0
        skip_count = 0
        
        for i, file_path in enumerate(files, 1):
            self.stdout.write(f'[{i}/{len(files)}] {file_path.name}... ', ending='')
            
            try:
                with open(file_path, 'rb') as f:
                    content = f.read()
                
                # Определяем тип файла
                file_ext = file_path.suffix.lower().lstrip('.')
                file_type = 'pdf' if file_ext == 'pdf' else file_ext
                
                result = parser.parse_invoice(
                    file_content=content,
                    filename=file_path.name,
                    file_type=file_type
                )
                
                if result.get('from_cache'):
                    self.stdout.write(self.style.WARNING('КЭШИРОВАНО'))
                    skip_count += 1
                elif result['success']:
                    self.stdout.write(self.style.SUCCESS('OK'))
                    success_count += 1
                else:
                    self.stdout.write(self.style.ERROR(f'ОШИБКА: {result.get("error", "Unknown error")}'))
                    error_count += 1
                    
            except RateLimitError as e:
                self.stdout.write(self.style.ERROR('RATE LIMIT'))
                self.stdout.write(self.style.WARNING(f'Достигнут лимит запросов: {e}'))
                self.stdout.write(self.style.WARNING('Остановка импорта.'))
                break
                
            except Exception as e:
                self.stdout.write(self.style.ERROR(f'ОШИБКА: {e}'))
                error_count += 1
        
        self.stdout.write('')
        self.stdout.write('=' * 60)
        self.stdout.write(self.style.SUCCESS(f'Успешно обработано: {success_count}'))
        self.stdout.write(self.style.WARNING(f'Из кэша: {skip_count}'))
        self.stdout.write(self.style.ERROR(f'Ошибки: {error_count}'))
        self.stdout.write('=' * 60)

"""
Management команда для создания LLM провайдеров в БД
Использование: python manage.py setup_providers
"""
from django.core.management.base import BaseCommand
from llm_services.models import LLMProvider


class Command(BaseCommand):
    help = 'Создает провайдеры LLM в базе данных (если их еще нет)'
    
    def handle(self, *args, **options):
        providers_data = [
            {
                'provider_type': LLMProvider.ProviderType.OPENAI,
                'model_name': 'gpt-4o',
                'env_key_name': 'OPENAI_API_KEY',
                'is_default': True
            },
            {
                'provider_type': LLMProvider.ProviderType.GEMINI,
                'model_name': 'gemini-3-flash-preview',
                'env_key_name': 'GOOGLE_AI_API_KEY',
                'is_default': False
            },
            {
                'provider_type': LLMProvider.ProviderType.GROK,
                'model_name': 'grok-2-vision-1212',
                'env_key_name': 'GROK_API_KEY',
                'is_default': False
            }
        ]
        
        created_count = 0
        for data in providers_data:
            provider, created = LLMProvider.objects.get_or_create(
                provider_type=data['provider_type'],
                defaults={
                    'model_name': data['model_name'],
                    'env_key_name': data['env_key_name'],
                    'is_default': data['is_default'],
                    'is_active': True
                }
            )
            
            if created:
                created_count += 1
                self.stdout.write(
                    self.style.SUCCESS(f'✓ Создан провайдер: {provider.get_provider_type_display()}')
                )
            else:
                # Обновляем существующий, если нужно
                if provider.model_name != data['model_name']:
                    provider.model_name = data['model_name']
                    provider.save()
                if provider.env_key_name != data['env_key_name']:
                    provider.env_key_name = data['env_key_name']
                    provider.save()
                self.stdout.write(
                    self.style.WARNING(f'  Провайдер уже существует: {provider.get_provider_type_display()}')
                )
        
        # Убеждаемся, что только один провайдер имеет is_default=True
        default_providers = LLMProvider.objects.filter(is_default=True)
        if default_providers.count() > 1:
            # Оставляем только OpenAI как default
            openai_provider = LLMProvider.objects.filter(
                provider_type=LLMProvider.ProviderType.OPENAI
            ).first()
            if openai_provider:
                LLMProvider.objects.filter(is_default=True).exclude(
                    pk=openai_provider.pk
                ).update(is_default=False)
                self.stdout.write(
                    self.style.SUCCESS(f'✓ Установлен провайдер по умолчанию: {openai_provider.get_provider_type_display()}')
                )
        elif default_providers.count() == 0:
            # Если нет default, устанавливаем OpenAI
            openai_provider = LLMProvider.objects.filter(
                provider_type=LLMProvider.ProviderType.OPENAI
            ).first()
            if openai_provider:
                openai_provider.is_default = True
                openai_provider.save()
                self.stdout.write(
                    self.style.SUCCESS(f'✓ Установлен провайдер по умолчанию: {openai_provider.get_provider_type_display()}')
                )
        
        self.stdout.write(
            self.style.SUCCESS(f'\nГотово! Создано новых провайдеров: {created_count}')
        )

from django.test import TestCase
from django.db import IntegrityError
from llm_services.models import LLMProvider, ParsedDocument
from decimal import Decimal
import hashlib


class LLMProviderModelTest(TestCase):
    """Тесты модели LLMProvider"""
    
    def test_create_provider(self):
        """Создание провайдера"""
        provider = LLMProvider.objects.create(
            provider_type=LLMProvider.ProviderType.OPENAI,
            model_name='gpt-4o',
            env_key_name='OPENAI_API_KEY'
        )
        self.assertEqual(provider.provider_type, LLMProvider.ProviderType.OPENAI)
        self.assertEqual(provider.model_name, 'gpt-4o')
        self.assertTrue(provider.is_active)
        self.assertFalse(provider.is_default)
    
    def test_provider_str(self):
        """Строковое представление провайдера"""
        provider = LLMProvider.objects.create(
            provider_type=LLMProvider.ProviderType.GEMINI,
            model_name='gemini-1.5-pro',
            env_key_name='GOOGLE_AI_API_KEY'
        )
        self.assertIn('Google Gemini', str(provider))
        self.assertIn('gemini-1.5-pro', str(provider))
    
    def test_provider_str_with_default(self):
        """Строковое представление с флагом default"""
        provider = LLMProvider.objects.create(
            provider_type=LLMProvider.ProviderType.OPENAI,
            model_name='gpt-4o',
            env_key_name='OPENAI_API_KEY',
            is_default=True
        )
        self.assertIn('по умолчанию', str(provider))
    
    def test_set_default_clears_others(self):
        """Установка default сбрасывает другие"""
        provider1 = LLMProvider.objects.create(
            provider_type=LLMProvider.ProviderType.OPENAI,
            model_name='gpt-4o',
            env_key_name='OPENAI_API_KEY',
            is_default=True
        )
        provider2 = LLMProvider.objects.create(
            provider_type=LLMProvider.ProviderType.GEMINI,
            model_name='gemini-1.5-pro',
            env_key_name='GOOGLE_AI_API_KEY',
            is_default=False
        )
        
        # Устанавливаем provider2 как default
        provider2.is_default = True
        provider2.save()
        
        provider1.refresh_from_db()
        self.assertFalse(provider1.is_default)
        self.assertTrue(provider2.is_default)
    
    def test_get_default(self):
        """Получение провайдера по умолчанию"""
        provider1 = LLMProvider.objects.create(
            provider_type=LLMProvider.ProviderType.OPENAI,
            model_name='gpt-4o',
            env_key_name='OPENAI_API_KEY',
            is_default=True
        )
        provider2 = LLMProvider.objects.create(
            provider_type=LLMProvider.ProviderType.GEMINI,
            model_name='gemini-1.5-pro',
            env_key_name='GOOGLE_AI_API_KEY',
            is_default=False
        )
        
        default = LLMProvider.get_default()
        self.assertEqual(default.id, provider1.id)
    
    def test_get_default_no_default_uses_first_active(self):
        """Если нет default, возвращается первый активный"""
        provider1 = LLMProvider.objects.create(
            provider_type=LLMProvider.ProviderType.OPENAI,
            model_name='gpt-4o',
            env_key_name='OPENAI_API_KEY',
            is_default=False,
            is_active=True
        )
        provider2 = LLMProvider.objects.create(
            provider_type=LLMProvider.ProviderType.GEMINI,
            model_name='gemini-1.5-pro',
            env_key_name='GOOGLE_AI_API_KEY',
            is_default=False,
            is_active=True
        )
        
        default = LLMProvider.get_default()
        # Должен вернуть первый активный (по ordering)
        self.assertIsNotNone(default)
        self.assertTrue(default.is_active)
    
    def test_get_api_key_from_env(self):
        """Получение API ключа из ENV"""
        import os
        os.environ['TEST_API_KEY'] = 'test-key-123'
        
        provider = LLMProvider.objects.create(
            provider_type=LLMProvider.ProviderType.OPENAI,
            model_name='gpt-4o',
            env_key_name='TEST_API_KEY'
        )
        
        key = provider.get_api_key()
        self.assertEqual(key, 'test-key-123')
        
        # Очистка
        del os.environ['TEST_API_KEY']
    
    def test_get_api_key_missing(self):
        """Ошибка при отсутствии API ключа"""
        provider = LLMProvider.objects.create(
            provider_type=LLMProvider.ProviderType.OPENAI,
            model_name='gpt-4o',
            env_key_name='NONEXISTENT_KEY'
        )
        
        with self.assertRaises(ValueError) as cm:
            provider.get_api_key()
        self.assertIn('не найден', str(cm.exception).lower())


class ParsedDocumentModelTest(TestCase):
    """Тесты модели ParsedDocument"""
    
    def setUp(self):
        self.provider = LLMProvider.objects.create(
            provider_type=LLMProvider.ProviderType.OPENAI,
            model_name='gpt-4o',
            env_key_name='OPENAI_API_KEY'
        )
    
    def test_create_parsed_document(self):
        """Создание записи распарсенного документа"""
        file_hash = hashlib.sha256(b'test content').hexdigest()
        
        doc = ParsedDocument.objects.create(
            file_hash=file_hash,
            original_filename='test_invoice.pdf',
            provider=self.provider,
            status=ParsedDocument.Status.SUCCESS,
            confidence_score=0.95
        )
        
        self.assertEqual(doc.file_hash, file_hash)
        self.assertEqual(doc.original_filename, 'test_invoice.pdf')
        self.assertEqual(doc.status, ParsedDocument.Status.SUCCESS)
        self.assertEqual(doc.confidence_score, 0.95)
    
    def test_file_hash_unique(self):
        """Хэш файла должен быть уникальным"""
        file_hash = hashlib.sha256(b'test content').hexdigest()
        
        ParsedDocument.objects.create(
            file_hash=file_hash,
            original_filename='test1.pdf',
            provider=self.provider
        )
        
        with self.assertRaises(IntegrityError):
            ParsedDocument.objects.create(
                file_hash=file_hash,
                original_filename='test2.pdf',
                provider=self.provider
            )
    
    def test_parsed_document_str(self):
        """Строковое представление документа"""
        file_hash = hashlib.sha256(b'test').hexdigest()
        doc = ParsedDocument.objects.create(
            file_hash=file_hash,
            original_filename='invoice.pdf',
            provider=self.provider,
            status=ParsedDocument.Status.SUCCESS
        )
        
        self.assertIn('invoice.pdf', str(doc))
        self.assertIn('Успешно', str(doc))
    
    def test_parsed_document_with_json_data(self):
        """Сохранение JSON данных"""
        file_hash = hashlib.sha256(b'test').hexdigest()
        
        parsed_data = {
            'vendor': {'name': 'ООО Тест', 'inn': '1234567890'},
            'buyer': {'name': 'ООО Наша', 'inn': '0987654321'},
            'invoice': {'number': '123', 'date': '2024-01-15'},
            'totals': {'amount_gross': '10000.00', 'vat_amount': '1666.67'},
            'items': []
        }
        
        doc = ParsedDocument.objects.create(
            file_hash=file_hash,
            original_filename='test.pdf',
            provider=self.provider,
            parsed_data=parsed_data
        )
        
        doc.refresh_from_db()
        self.assertIsNotNone(doc.parsed_data)
        self.assertEqual(doc.parsed_data['vendor']['name'], 'ООО Тест')
    
    def test_parsed_document_ordering(self):
        """Сортировка по дате создания (новые первые)"""
        from datetime import timedelta
        from django.utils import timezone
        
        file_hash1 = hashlib.sha256(b'test1').hexdigest()
        file_hash2 = hashlib.sha256(b'test2').hexdigest()
        
        doc1 = ParsedDocument.objects.create(
            file_hash=file_hash1,
            original_filename='old.pdf',
            provider=self.provider
        )
        doc2 = ParsedDocument.objects.create(
            file_hash=file_hash2,
            original_filename='new.pdf',
            provider=self.provider
        )
        
        docs = list(ParsedDocument.objects.all())
        self.assertEqual(docs[0], doc2)  # Новый первый
        self.assertEqual(docs[1], doc1)  # Старый второй

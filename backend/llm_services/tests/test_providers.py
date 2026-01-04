"""
Тесты для LLM провайдеров
"""
from unittest.mock import Mock, patch, MagicMock
from django.test import TestCase
from llm_services.providers.openai_provider import OpenAIProvider
from llm_services.providers.gemini_provider import GeminiProvider
from llm_services.providers.grok_provider import GrokProvider
from llm_services.providers.base import BaseLLMProvider
from llm_services.schemas import ParsedInvoice
from datetime import date as Date
from decimal import Decimal


class BaseLLMProviderTest(TestCase):
    """Тесты базового класса провайдера"""
    
    def test_calculate_file_hash(self):
        """Вычисление SHA256 хэша файла"""
        content1 = b'test content 1'
        content2 = b'test content 2'
        
        hash1 = BaseLLMProvider.calculate_file_hash(content1)
        hash2 = BaseLLMProvider.calculate_file_hash(content2)
        hash1_again = BaseLLMProvider.calculate_file_hash(content1)
        
        self.assertNotEqual(hash1, hash2)
        self.assertEqual(hash1, hash1_again)
        self.assertEqual(len(hash1), 64)  # SHA256 hex string length
    
    def test_get_system_prompt(self):
        """Системный промпт содержит необходимые инструкции"""
        # Создаем простой mock-провайдер
        class MockProvider(BaseLLMProvider):
            def parse_invoice(self, pdf_content):
                pass
        
        provider = MockProvider(api_key='test', model_name='test')
        prompt = provider.get_system_prompt()
        
        self.assertIn('российских счетов', prompt)
        self.assertIn('JSON', prompt)
        self.assertIn('vendor', prompt)
        self.assertIn('buyer', prompt)
        self.assertIn('invoice', prompt)
        self.assertIn('items', prompt)


class OpenAIProviderTest(TestCase):
    """Тесты OpenAI провайдера"""
    
    def setUp(self):
        self.provider = OpenAIProvider(
            api_key='test-key',
            model_name='gpt-4o'
        )
    
    @patch('llm_services.providers.base.fitz')
    def test_pdf_to_images(self, mock_fitz):
        """Конвертация PDF в изображения"""
        # Мокаем fitz
        mock_doc = MagicMock()
        mock_doc.__len__ = Mock(return_value=2)  # 2 страницы
        mock_page1 = MagicMock()
        mock_page2 = MagicMock()
        mock_doc.load_page = Mock(side_effect=[mock_page1, mock_page2])
        
        mock_pix1 = MagicMock()
        mock_pix1.tobytes = Mock(return_value=b'image1_bytes')
        mock_pix2 = MagicMock()
        mock_pix2.tobytes = Mock(return_value=b'image2_bytes')
        
        mock_page1.get_pixmap = Mock(return_value=mock_pix1)
        mock_page2.get_pixmap = Mock(return_value=mock_pix2)
        
        mock_fitz.open = Mock(return_value=mock_doc)
        mock_fitz.Matrix = Mock(return_value=MagicMock())
        
        pdf_content = b'fake pdf content'
        # Вызываем статический метод базового класса
        images = BaseLLMProvider.pdf_to_images_base64(pdf_content)
        
        self.assertEqual(len(images), 2)
        self.assertIsInstance(images[0], str)  # base64 string
        mock_doc.close.assert_called_once()
    
    @patch('llm_services.providers.base.fitz')
    @patch('llm_services.providers.openai_provider.OpenAI')
    def test_parse_invoice_success(self, mock_openai_class, mock_fitz):
        """Успешный парсинг через OpenAI"""
        # Мокаем OpenAI client
        mock_client = MagicMock()
        mock_openai_class.return_value = mock_client
        
        # Мокаем ответ
        mock_response = MagicMock()
        mock_response.choices[0].message.content = '''{
            "vendor": {"name": "ООО Тест", "inn": "1234567890", "kpp": null},
            "buyer": {"name": "ООО Наша", "inn": "0987654321"},
            "invoice": {"number": "123", "date": "2024-01-15"},
            "totals": {"amount_gross": "10000.00", "vat_amount": "1666.67"},
            "items": [
                {"name": "Товар 1", "quantity": "10.000", "unit": "шт", "price_per_unit": "100.00"}
            ],
            "confidence": 0.95
        }'''
        mock_client.chat.completions.create = Mock(return_value=mock_response)
        
        # Мокаем fitz для PDF
        mock_doc = MagicMock()
        mock_doc.__len__ = Mock(return_value=1)
        mock_page = MagicMock()
        mock_doc.load_page = Mock(return_value=mock_page)
        mock_pix = MagicMock()
        mock_pix.tobytes = Mock(return_value=b'image_bytes')
        mock_page.get_pixmap = Mock(return_value=mock_pix)
        mock_fitz.open = Mock(return_value=mock_doc)
        mock_fitz.Matrix = Mock(return_value=MagicMock())
        
        provider = OpenAIProvider(api_key='test-key', model_name='gpt-4o')
        pdf_content = b'fake pdf'
        parsed, processing_time = provider.parse_invoice(pdf_content)
        
        self.assertIsInstance(parsed, ParsedInvoice)
        self.assertEqual(parsed.invoice.number, '123')
        self.assertIsInstance(processing_time, int)
        self.assertGreaterEqual(processing_time, 0)


class GeminiProviderTest(TestCase):
    """Тесты Google Gemini провайдера"""
    
    def setUp(self):
        self.provider = GeminiProvider(
            api_key='test-key',
            model_name='gemini-1.5-pro'
        )
    
    @patch('llm_services.providers.gemini_provider.genai')
    @patch('llm_services.providers.base.Image')
    @patch('llm_services.providers.base.fitz')
    def test_parse_invoice_success(self, mock_fitz, mock_image, mock_genai):
        """Успешный парсинг через Gemini"""
        # Мокаем genai
        mock_model = MagicMock()
        mock_response = MagicMock()
        mock_response.text = '''{
            "vendor": {"name": "ООО Тест", "inn": "1234567890", "kpp": null},
            "buyer": {"name": "ООО Наша", "inn": "0987654321"},
            "invoice": {"number": "123", "date": "2024-01-15"},
            "totals": {"amount_gross": "10000.00", "vat_amount": "1666.67"},
            "items": [],
            "confidence": 0.9
        }'''
        mock_model.generate_content = Mock(return_value=mock_response)
        mock_genai.GenerativeModel = Mock(return_value=mock_model)
        mock_genai.configure = Mock()
        mock_genai.GenerationConfig = Mock(return_value=MagicMock())
        
        # Мокаем fitz
        mock_doc = MagicMock()
        mock_doc.__len__ = Mock(return_value=1)
        mock_page = MagicMock()
        mock_doc.load_page = Mock(return_value=mock_page)
        mock_pix = MagicMock()
        mock_pix.tobytes = Mock(return_value=b'image_bytes')
        mock_page.get_pixmap = Mock(return_value=mock_pix)
        mock_fitz.open = Mock(return_value=mock_doc)
        mock_fitz.Matrix = Mock(return_value=MagicMock())
        
        # Мокаем PIL Image
        mock_image.open = Mock(return_value=MagicMock())
        
        provider = GeminiProvider(api_key='test-key', model_name='gemini-1.5-pro')
        pdf_content = b'fake pdf'
        parsed, processing_time = provider.parse_invoice(pdf_content)
        
        self.assertIsInstance(parsed, ParsedInvoice)
        self.assertEqual(parsed.invoice.number, '123')
        self.assertIsInstance(processing_time, int)


class GrokProviderTest(TestCase):
    """Тесты Grok провайдера"""
    
    def setUp(self):
        self.provider = GrokProvider(
            api_key='test-key',
            model_name='grok-2-vision-1212'
        )
    
    @patch('llm_services.providers.grok_provider.httpx')
    @patch('llm_services.providers.base.fitz')
    def test_parse_invoice_success(self, mock_fitz, mock_httpx):
        """Успешный парсинг через Grok"""
        # Мокаем httpx
        mock_response_obj = MagicMock()
        mock_response_obj.json.return_value = {
            "choices": [{
                "message": {
                    "content": '''{
                        "vendor": {"name": "ООО Тест", "inn": "1234567890", "kpp": null},
                        "buyer": {"name": "ООО Наша", "inn": "0987654321"},
                        "invoice": {"number": "123", "date": "2024-01-15"},
                        "totals": {"amount_gross": "10000.00", "vat_amount": "1666.67"},
                        "items": [],
                        "confidence": 0.92
                    }'''
                }
            }]
        }
        mock_response_obj.raise_for_status = Mock()
        
        mock_client = MagicMock()
        mock_client.__enter__ = Mock(return_value=mock_client)
        mock_client.__exit__ = Mock(return_value=False)
        mock_client.post = Mock(return_value=mock_response_obj)
        mock_httpx.Client = Mock(return_value=mock_client)
        
        # Мокаем fitz
        mock_doc = MagicMock()
        mock_doc.__len__ = Mock(return_value=1)
        mock_page = MagicMock()
        mock_doc.load_page = Mock(return_value=mock_page)
        mock_pix = MagicMock()
        mock_pix.tobytes = Mock(return_value=b'image_bytes')
        mock_page.get_pixmap = Mock(return_value=mock_pix)
        mock_fitz.open = Mock(return_value=mock_doc)
        mock_fitz.Matrix = Mock(return_value=MagicMock())
        
        provider = GrokProvider(api_key='test-key', model_name='grok-2-vision-1212')
        pdf_content = b'fake pdf'
        parsed, processing_time = provider.parse_invoice(pdf_content)
        
        self.assertIsInstance(parsed, ParsedInvoice)
        self.assertEqual(parsed.invoice.number, '123')
        self.assertIsInstance(processing_time, int)
        mock_client.post.assert_called_once()


class ProviderFactoryTest(TestCase):
    """Тесты фабрики провайдеров"""
    
    @patch.dict('os.environ', {'OPENAI_API_KEY': 'test-openai-key'})
    def test_get_provider_openai(self):
        """Создание OpenAI провайдера через фабрику"""
        from llm_services.models import LLMProvider
        from llm_services.providers import get_provider
        
        provider_model = LLMProvider.objects.create(
            provider_type=LLMProvider.ProviderType.OPENAI,
            model_name='gpt-4o',
            env_key_name='OPENAI_API_KEY',
            is_active=True,
            is_default=True
        )
        
        provider = get_provider(provider_model)
        self.assertIsInstance(provider, OpenAIProvider)
        self.assertEqual(provider.model_name, 'gpt-4o')
    
    @patch.dict('os.environ', {'GOOGLE_AI_API_KEY': 'test-gemini-key'})
    def test_get_provider_gemini(self):
        """Создание Gemini провайдера через фабрику"""
        from llm_services.models import LLMProvider
        from llm_services.providers import get_provider
        
        provider_model = LLMProvider.objects.create(
            provider_type=LLMProvider.ProviderType.GEMINI,
            model_name='gemini-1.5-pro',
            env_key_name='GOOGLE_AI_API_KEY',
            is_active=True
        )
        
        provider = get_provider(provider_model)
        self.assertIsInstance(provider, GeminiProvider)
        self.assertEqual(provider.model_name, 'gemini-1.5-pro')
    
    @patch.dict('os.environ', {'GROK_API_KEY': 'test-grok-key'})
    def test_get_provider_grok(self):
        """Создание Grok провайдера через фабрику"""
        from llm_services.models import LLMProvider
        from llm_services.providers import get_provider
        
        provider_model = LLMProvider.objects.create(
            provider_type=LLMProvider.ProviderType.GROK,
            model_name='grok-2-vision-1212',
            env_key_name='GROK_API_KEY',
            is_active=True
        )
        
        provider = get_provider(provider_model)
        self.assertIsInstance(provider, GrokProvider)
        self.assertEqual(provider.model_name, 'grok-2-vision-1212')
    
    @patch.dict('os.environ', {'OPENAI_API_KEY': 'test-key'})
    def test_get_provider_default(self):
        """Получение провайдера по умолчанию"""
        from llm_services.models import LLMProvider
        from llm_services.providers import get_provider
        
        LLMProvider.objects.create(
            provider_type=LLMProvider.ProviderType.OPENAI,
            model_name='gpt-4o',
            env_key_name='OPENAI_API_KEY',
            is_active=True,
            is_default=True
        )
        
        provider = get_provider()
        self.assertIsInstance(provider, OpenAIProvider)
    
    def test_get_provider_invalid_type(self):
        """Ошибка при неизвестном типе провайдера"""
        from llm_services.models import LLMProvider
        from llm_services.providers import get_provider
        
        # Создаем провайдер с валидным типом, но затем изменяем его вручную
        provider_model = LLMProvider.objects.create(
            provider_type=LLMProvider.ProviderType.OPENAI,
            model_name='test',
            env_key_name='TEST_KEY',
            is_active=True
        )
        # Изменяем тип на несуществующий через прямое присваивание
        provider_model.provider_type = 'invalid_type'
        
        with self.assertRaises(ValueError):
            get_provider(provider_model)

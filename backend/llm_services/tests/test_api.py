from unittest.mock import patch, MagicMock
from django.urls import reverse
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from llm_services.models import LLMProvider
from llm_services.services.exceptions import RateLimitError
from llm_services.schemas import ParsedInvoice
from decimal import Decimal


User = get_user_model()


class ParseInvoiceAPITest(APITestCase):
    """Тесты API парсинга счетов"""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.client.force_authenticate(user=self.user)
        
        self.provider = LLMProvider.objects.create(
            provider_type=LLMProvider.ProviderType.OPENAI,
            model_name='gpt-4o',
            env_key_name='OPENAI_API_KEY',
            is_active=True,
            is_default=True
        )
    
    def test_parse_invoice_no_file(self):
        """POST без файла"""
        url = reverse('parse-invoice')
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', response.data)
    
    def test_parse_invoice_wrong_format(self):
        """POST с не-поддерживаемым файлом"""
        url = reverse('parse-invoice')
        file = SimpleUploadedFile('test.txt', b'not a pdf')
        response = self.client.post(url, {'file': file})
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('PDF', response.data['error'])
    
    @patch('llm_services.views.DocumentParser')
    def test_parse_invoice_success(self, mock_parser_class):
        """Успешный парсинг"""
        mock_parser = MagicMock()
        mock_parsed_doc = MagicMock()
        mock_parsed_doc.id = 1
        
        mock_parser.parse_invoice.return_value = {
            'success': True,
            'from_cache': False,
            'parsed_document': mock_parsed_doc,
            'data': {
                'vendor': {'name': 'Test', 'inn': '123', 'kpp': None},
                'buyer': {'name': 'Our', 'inn': '456'},
                'invoice': {'number': '1', 'invoice_date': '2024-01-01'},
                'totals': {'amount_gross': '1000', 'vat_amount': '100'},
                'items': [],
                'confidence': 0.9
            },
            'matches': {
                'vendor': {'match_type': 'not_found', 'counterparty': None, 'suggestions': []},
                'buyer': {'match_type': 'exact', 'legal_entity': MagicMock(id=1), 'error': None},
                'products': []
            },
            'warnings': [],
            'error': None
        }
        mock_parser_class.return_value = mock_parser
        
        url = reverse('parse-invoice')
        file = SimpleUploadedFile('test.pdf', b'%PDF-1.4 fake pdf')
        response = self.client.post(url, {'file': file})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])
    
    @patch('llm_services.views.DocumentParser')
    def test_parse_invoice_rate_limit(self, mock_parser_class):
        """Обработка rate limit"""
        mock_parser = MagicMock()
        mock_parser.parse_invoice.side_effect = RateLimitError('Rate limit')
        mock_parser_class.return_value = mock_parser
        
        url = reverse('parse-invoice')
        file = SimpleUploadedFile('test.pdf', b'%PDF-1.4 fake pdf')
        response = self.client.post(url, {'file': file})
        
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertIn('лимит', response.data['error'].lower())
    
    @patch('llm_services.views.DocumentParser')
    def test_parse_invoice_png_file(self, mock_parser_class):
        """Парсинг PNG файла"""
        mock_parser = MagicMock()
        mock_parsed_doc = MagicMock()
        mock_parsed_doc.id = 1
        
        mock_parser.parse_invoice.return_value = {
            'success': True,
            'from_cache': False,
            'parsed_document': mock_parsed_doc,
            'data': {
                'vendor': {'name': 'Test', 'inn': '123', 'kpp': None},
                'buyer': {'name': 'Our', 'inn': '456'},
                'invoice': {'number': '1', 'invoice_date': '2024-01-01'},
                'totals': {'amount_gross': '1000', 'vat_amount': '100'},
                'items': [],
                'confidence': 0.9
            },
            'matches': {
                'vendor': {'match_type': 'not_found', 'counterparty': None, 'suggestions': []},
                'buyer': {'match_type': 'exact', 'legal_entity': MagicMock(id=1), 'error': None},
                'products': []
            },
            'warnings': [],
            'error': None
        }
        mock_parser_class.return_value = mock_parser
        
        url = reverse('parse-invoice')
        # PNG magic bytes: 89 50 4E 47 (\x89PNG)
        png_content = b'\x89PNG\r\n\x1a\n' + b'fake png data'
        file = SimpleUploadedFile('test.png', png_content)
        response = self.client.post(url, {'file': file})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Проверяем, что parser был вызван с правильным файлом
        mock_parser.parse_invoice.assert_called_once()
        call_args = mock_parser.parse_invoice.call_args
        self.assertEqual(call_args[1]['filename'], 'test.png')


class LLMProviderAPITest(APITestCase):
    """Тесты API провайдеров"""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.client.force_authenticate(user=self.user)
        
        self.provider = LLMProvider.objects.create(
            provider_type=LLMProvider.ProviderType.OPENAI,
            model_name='gpt-4o',
            env_key_name='OPENAI_API_KEY',
            is_active=True,
            is_default=True
        )
    
    def test_list_providers(self):
        """GET /api/v1/llm-providers/"""
        url = reverse('llm-provider-list')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(len(response.data) > 0)
    
    def test_get_provider_detail(self):
        """GET /api/v1/llm-providers/{id}/"""
        url = reverse('llm-provider-detail', args=[self.provider.id])
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], self.provider.id)
        self.assertEqual(response.data['model_name'], 'gpt-4o')
    
    def test_set_default_provider(self):
        """POST /api/v1/llm-providers/{id}/set_default/"""
        new_provider = LLMProvider.objects.create(
            provider_type=LLMProvider.ProviderType.GEMINI,
            model_name='gemini-3-flash-preview',
            env_key_name='GOOGLE_AI_API_KEY',
            is_active=True,
            is_default=False
        )
        
        url = reverse('llm-provider-set-default', args=[new_provider.id])
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['is_default'])
        
        # Старый провайдер должен быть не default
        self.provider.refresh_from_db()
        self.assertFalse(self.provider.is_default)
        
        # Новый провайдер должен быть default
        new_provider.refresh_from_db()
        self.assertTrue(new_provider.is_default)

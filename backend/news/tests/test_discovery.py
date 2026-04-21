"""
Тесты для NewsDiscoveryService.

Покрывает чистые функции (extract_domain, _build_search_prompt)
и мокает LLM API для интеграционных сценариев.
"""
import json
from datetime import date
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from news.discovery_service import NewsDiscoveryService
from news.models import NewsPost, SearchConfiguration
from references.models import Manufacturer, NewsResource

User = get_user_model()


class ExtractDomainTest(TestCase):
    """Тесты для статического метода _extract_domain."""

    def test_basic_url(self):
        result = NewsDiscoveryService._extract_domain("https://ejarn.com/news")
        self.assertEqual(result, "ejarn.com")

    def test_www_prefix_stripped(self):
        result = NewsDiscoveryService._extract_domain("https://www.ejarn.com/category/eJarn_news_index")
        self.assertEqual(result, "ejarn.com")

    def test_http_protocol(self):
        result = NewsDiscoveryService._extract_domain("http://www.example.com/path")
        self.assertEqual(result, "example.com")

    def test_subdomain_preserved(self):
        result = NewsDiscoveryService._extract_domain("https://news.example.com/articles")
        self.assertEqual(result, "news.example.com")

    def test_no_protocol(self):
        """URL без протокола -- urlparse помещает все в path."""
        result = NewsDiscoveryService._extract_domain("example.com/page")
        self.assertEqual(result, "example.com")

    def test_complex_path(self):
        result = NewsDiscoveryService._extract_domain(
            "https://www.carrier.com/commercial/en/us/news/"
        )
        self.assertEqual(result, "carrier.com")

    def test_trailing_slash(self):
        result = NewsDiscoveryService._extract_domain("https://example.org/")
        self.assertEqual(result, "example.org")

    def test_empty_string(self):
        result = NewsDiscoveryService._extract_domain("")
        self.assertEqual(result, "")

    def test_port_in_url(self):
        result = NewsDiscoveryService._extract_domain("https://example.com:8080/path")
        self.assertEqual(result, "example.com:8080")


class BuildSearchPromptTest(TestCase):
    """Тесты для _build_search_prompt -- проверяет формирование промпта."""

    def setUp(self):
        self.config = SearchConfiguration.objects.create(
            name="test-config",
            is_active=True,
        )
        self.user = User.objects.create_user(
            email="test-prompt@test.com",
            password="password",
        )
        self.resource = NewsResource.objects.create(
            name="Test Resource",
            url="https://www.example.com/news",
            language="en",
        )

    def test_prompt_contains_resource_url(self):
        service = NewsDiscoveryService(user=self.user, config=self.config)
        prompt = service._build_search_prompt(
            self.resource,
            start_date=date(2026, 3, 1),
            end_date=date(2026, 3, 15),
        )
        self.assertIn("example.com", prompt)
        self.assertIn("Test Resource", prompt)

    def test_prompt_contains_json_format(self):
        service = NewsDiscoveryService(user=self.user, config=self.config)
        prompt = service._build_search_prompt(
            self.resource,
            start_date=date(2026, 3, 1),
            end_date=date(2026, 3, 15),
        )
        self.assertIn('"news"', prompt)

    def test_custom_instructions_used(self):
        self.resource.custom_search_instructions = "Custom prompt for special source"
        self.resource.save()

        service = NewsDiscoveryService(user=self.user, config=self.config)
        prompt = service._build_search_prompt(
            self.resource,
            start_date=date(2026, 3, 1),
            end_date=date(2026, 3, 15),
        )
        self.assertIn("Custom prompt for special source", prompt)

    def test_russian_date_format(self):
        self.resource.language = "ru"
        self.resource.save()

        service = NewsDiscoveryService(user=self.user, config=self.config)
        prompt = service._build_search_prompt(
            self.resource,
            start_date=date(2026, 3, 1),
            end_date=date(2026, 3, 15),
        )
        # Русский формат: DD.MM.YYYY
        self.assertIn("01.03.2026", prompt)


class DiscoverReturnsResultsTest(TestCase):
    """
    Тест: mock LLM API возвращает JSON c новостями,
    сервис создает записи NewsPost.
    """

    def setUp(self):
        self.config = SearchConfiguration.objects.create(
            name="test-config",
            is_active=True,
            primary_provider="grok",
            fallback_chain=[],
        )
        self.user = User.objects.create_user(
            email="test-discover@test.com",
            password="password",
        )
        self.resource = NewsResource.objects.create(
            name="Test Source",
            url="https://www.hvac-news.com/articles",
            language="en",
            source_type="auto",
        )

    @patch.object(NewsDiscoveryService, '_query_grok')
    def test_discover_creates_posts(self, mock_grok):
        """LLM возвращает 2 новости -> создается 2 NewsPost."""
        mock_grok.return_value = {
            "news": [
                {
                    "title": "Новость об HVAC оборудовании",
                    "summary": "Компания представила новую линейку чиллеров.",
                    "source_url": "https://www.hvac-news.com/articles/1",
                },
                {
                    "title": "Обновление стандартов",
                    "summary": "Новые стандарты энергоэффективности вступают в силу.",
                    "source_url": "https://www.hvac-news.com/articles/2",
                },
            ]
        }

        service = NewsDiscoveryService(user=self.user, config=self.config)
        created, errors, error_msg = service.discover_news_for_resource(
            self.resource, provider="grok"
        )

        self.assertEqual(created, 2)
        self.assertEqual(errors, 0)
        self.assertIsNone(error_msg)

        # Проверяем что записи реально созданы в БД
        posts = NewsPost.objects.filter(status="draft")
        self.assertEqual(posts.count(), 2)
        titles = list(posts.values_list("title", flat=True))
        self.assertIn("Новость об HVAC оборудовании", titles)
        self.assertIn("Обновление стандартов", titles)

    @patch.object(NewsDiscoveryService, '_query_grok')
    def test_discover_no_news(self, mock_grok):
        """LLM возвращает пустой массив -> создается запись 'не найдено'."""
        mock_grok.return_value = {"news": []}

        service = NewsDiscoveryService(user=self.user, config=self.config)
        created, errors, error_msg = service.discover_news_for_resource(
            self.resource, provider="grok"
        )

        # created=1 потому что создается запись "новостей не найдено"
        self.assertEqual(created, 1)
        self.assertEqual(errors, 0)
        self.assertIsNone(error_msg)

        post = NewsPost.objects.first()
        self.assertTrue(post.is_no_news_found)


class DiscoverHandlesApiErrorTest(TestCase):
    """
    Тест: mock LLM API выбрасывает исключение,
    сервис gracefully обрабатывает ошибку.
    """

    def setUp(self):
        self.config = SearchConfiguration.objects.create(
            name="test-error-config",
            is_active=True,
            primary_provider="grok",
            fallback_chain=[],
        )
        self.user = User.objects.create_user(
            email="test-error@test.com",
            password="password",
        )
        self.resource = NewsResource.objects.create(
            name="Failing Source",
            url="https://www.example-fail.com/news",
            language="en",
            source_type="auto",
        )

    @patch.object(NewsDiscoveryService, '_query_grok')
    def test_api_error_graceful(self, mock_grok):
        """Ошибка API -> 0 created, 1 error, error_msg заполнен."""
        mock_grok.side_effect = ConnectionError("API connection timeout")

        service = NewsDiscoveryService(user=self.user, config=self.config)
        created, errors, error_msg = service.discover_news_for_resource(
            self.resource, provider="grok"
        )

        self.assertEqual(created, 0)
        self.assertEqual(errors, 1)
        self.assertIn("API connection timeout", error_msg)

    @patch.object(NewsDiscoveryService, '_query_grok')
    def test_api_error_creates_error_post(self, mock_grok):
        """При ошибке API создается NewsPost с описанием ошибки."""
        mock_grok.side_effect = ValueError("Invalid JSON response")

        service = NewsDiscoveryService(user=self.user, config=self.config)
        service.discover_news_for_resource(self.resource, provider="grok")

        # Должна быть создана запись об ошибке
        error_posts = NewsPost.objects.filter(title__icontains="Ошибка")
        self.assertTrue(error_posts.exists())

    @patch.object(NewsDiscoveryService, '_query_grok')
    def test_manual_source_rejected(self, mock_grok):
        """Источник типа manual не должен обрабатываться через ViewSet (отдельная проверка)."""
        # Сервис сам не фильтрует по типу -- это делает view,
        # но мы проверяем что при вызове discover_news_for_resource ошибки нет.
        mock_grok.return_value = {"news": []}
        self.resource.source_type = "manual"
        self.resource.save()

        service = NewsDiscoveryService(user=self.user, config=self.config)
        created, errors, error_msg = service.discover_news_for_resource(
            self.resource, provider="grok"
        )
        # Сервис обрабатывает любой source_type (фильтр в view)
        self.assertEqual(errors, 0)


class TrackApiCallCostTest(TestCase):
    """Тест расчета стоимости API вызова."""

    def setUp(self):
        self.config = SearchConfiguration.objects.create(
            name="test-cost-config",
            is_active=True,
            grok_input_price=3.0,
            grok_output_price=15.0,
        )
        self.user = User.objects.create_user(
            email="test-cost@test.com",
            password="password",
        )

    def test_cost_calculation(self):
        """Проверяем формулу: (input * input_price + output * output_price) / 1M."""
        service = NewsDiscoveryService(user=self.user, config=self.config)
        # Без current_run трекинг не записывает, но cost считается
        cost = service._track_api_call(
            provider='grok',
            model='grok-4-1-fast',
            input_tokens=1000,
            output_tokens=500,
            duration_ms=1200,
            success=True,
            news_extracted=3,
        )
        # (1000 * 3.0 + 500 * 15.0) / 1_000_000 = (3000 + 7500) / 1_000_000 = 0.0105
        self.assertAlmostEqual(cost, 0.0105, places=6)

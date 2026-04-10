"""Тесты AvitoAPIClient — OAuth2, rate limiting, retries."""

import time
from unittest.mock import MagicMock, patch, PropertyMock

import pytest

from marketing.clients.avito import AvitoAPIClient, AvitoAPIError


class TestAvitoAPIClientInit:
    def test_raises_without_credentials(self, db):
        """Без client_id/client_secret — AvitoAPIError."""
        from marketing.models import AvitoConfig
        config = AvitoConfig.get()
        config.client_id = ''
        config.client_secret = ''
        config.save()

        client = AvitoAPIClient()
        with pytest.raises(AvitoAPIError, match='credentials'):
            client.__enter__()

    @patch('marketing.clients.avito.httpx.Client')
    def test_enters_with_valid_credentials(self, mock_httpx_cls, db):
        """С credentials — клиент создаётся."""
        from marketing.models import AvitoConfig
        from django.utils import timezone
        from datetime import timedelta

        config = AvitoConfig.get()
        config.client_id = 'test_id'
        config.client_secret = 'test_secret'
        config.access_token = 'valid_token'
        config.token_expires_at = timezone.now() + timedelta(hours=1)
        config.save()

        mock_httpx_cls.return_value = MagicMock()
        client = AvitoAPIClient()
        result = client.__enter__()
        assert result is client
        client.__exit__(None, None, None)


class TestTokenRefresh:
    @patch('marketing.clients.avito.httpx.Client')
    def test_refresh_on_expired_token(self, mock_httpx_cls, db):
        """Автоматический refresh при истёкшем токене."""
        from marketing.models import AvitoConfig
        from django.utils import timezone
        from datetime import timedelta

        config = AvitoConfig.get()
        config.client_id = 'test_id'
        config.client_secret = 'test_secret'
        config.access_token = 'expired'
        config.token_expires_at = timezone.now() - timedelta(hours=1)
        config.save()

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'access_token': 'new_token',
            'expires_in': 3600,
        }

        mock_client = MagicMock()
        mock_client.post.return_value = mock_response
        mock_httpx_cls.return_value = mock_client

        client = AvitoAPIClient()
        client.__enter__()

        config.refresh_from_db()
        assert config.access_token == 'new_token'
        assert config.token_expires_at > timezone.now()

        client.__exit__(None, None, None)

    @patch('marketing.clients.avito.httpx.Client')
    def test_refresh_failure_raises(self, mock_httpx_cls, db):
        """Ошибка refresh → AvitoAPIError."""
        from marketing.models import AvitoConfig
        from django.utils import timezone
        from datetime import timedelta

        config = AvitoConfig.get()
        config.client_id = 'test_id'
        config.client_secret = 'test_secret'
        config.access_token = ''
        config.token_expires_at = None
        config.save()

        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.text = 'Unauthorized'

        mock_client = MagicMock()
        mock_client.post.return_value = mock_response
        mock_httpx_cls.return_value = mock_client

        client = AvitoAPIClient()
        with pytest.raises(AvitoAPIError, match='Ошибка получения токена'):
            client.__enter__()


class TestRateLimiting:
    def test_throttle_tracks_timestamps(self):
        """Rate limiter отслеживает timestamps запросов."""
        client = AvitoAPIClient()
        client._request_timestamps = []
        client.RATE_LIMIT = 3
        client.RATE_WINDOW = 60

        # Первые 3 запроса должны пройти без задержки
        for _ in range(3):
            client._throttle()

        assert len(client._request_timestamps) == 3

    def test_throttle_cleans_old_timestamps(self):
        """Старые timestamps удаляются."""
        client = AvitoAPIClient()
        client.RATE_LIMIT = 5
        client.RATE_WINDOW = 1

        # Добавить старые timestamps
        old_time = time.monotonic() - 2  # 2 секунды назад
        client._request_timestamps = [old_time, old_time + 0.1, old_time + 0.2]

        client._throttle()

        # Старые удалены, добавлен 1 новый
        assert len(client._request_timestamps) == 1


class TestRequestRetries:
    @patch('marketing.clients.avito.httpx.Client')
    def test_retry_on_5xx(self, mock_httpx_cls, db):
        """5xx ошибки вызывают retry."""
        from marketing.models import AvitoConfig
        from django.utils import timezone
        from datetime import timedelta

        config = AvitoConfig.get()
        config.client_id = 'test_id'
        config.client_secret = 'test_secret'
        config.access_token = 'token'
        config.token_expires_at = timezone.now() + timedelta(hours=1)
        config.save()

        mock_response_500 = MagicMock()
        mock_response_500.status_code = 500

        mock_response_200 = MagicMock()
        mock_response_200.status_code = 200
        mock_response_200.json.return_value = {'ok': True}

        mock_client = MagicMock()
        mock_client.request.side_effect = [mock_response_500, mock_response_200]
        mock_httpx_cls.return_value = mock_client

        client = AvitoAPIClient()
        client.config = config
        client._client = mock_client
        client._request_timestamps = []
        client.RETRY_DELAY = 0  # без задержки в тестах

        result = client._request('GET', '/test')
        assert result == {'ok': True}
        assert mock_client.request.call_count == 2

    @patch('marketing.clients.avito.httpx.Client')
    def test_4xx_raises_immediately(self, mock_httpx_cls, db):
        """4xx ошибки (кроме 403) не ретраятся."""
        from marketing.models import AvitoConfig
        from django.utils import timezone
        from datetime import timedelta

        config = AvitoConfig.get()
        config.client_id = 'test_id'
        config.client_secret = 'test_secret'
        config.access_token = 'token'
        config.token_expires_at = timezone.now() + timedelta(hours=1)
        config.save()

        mock_response = MagicMock()
        mock_response.status_code = 400
        mock_response.text = 'Bad Request'

        mock_client = MagicMock()
        mock_client.request.return_value = mock_response
        mock_httpx_cls.return_value = mock_client

        client = AvitoAPIClient()
        client.config = config
        client._client = mock_client
        client._request_timestamps = []

        with pytest.raises(AvitoAPIError, match='Client error 400'):
            client._request('GET', '/test')

        assert mock_client.request.call_count == 1


class TestPublicMethods:
    def test_create_listing_calls_request(self):
        """create_listing вызывает POST."""
        client = AvitoAPIClient()
        client._request = MagicMock(return_value={'id': '123'})

        result = client.create_listing({'title': 'Test'})
        client._request.assert_called_once_with('POST', '/autoload/v1/upload', json={'title': 'Test'})
        assert result == {'id': '123'}

    def test_get_item_calls_request(self):
        """get_item вызывает GET."""
        client = AvitoAPIClient()
        client._request = MagicMock(return_value={'title': 'Item'})

        result = client.get_item('456')
        client._request.assert_called_once_with('GET', '/items/v2/item/456')

    def test_get_item_stats_calls_request(self):
        """get_item_stats вызывает POST со списком ID."""
        client = AvitoAPIClient()
        client.config = MagicMock()
        client.config.user_id = 'user123'
        client._request = MagicMock(return_value={'stats': []})

        client.get_item_stats([1, 2, 3])
        client._request.assert_called_once()
        args = client._request.call_args
        assert args[0][0] == 'POST'
        assert 'stats/items' in args[0][1]

    def test_get_category_tree_calls_request(self):
        """get_category_tree вызывает GET."""
        client = AvitoAPIClient()
        client._request = MagicMock(return_value={'tree': []})

        client.get_category_tree()
        client._request.assert_called_once_with('GET', '/autoload/v1/user-docs/tree')

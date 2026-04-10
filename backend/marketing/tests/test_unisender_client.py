"""Тесты UnisenderClient — email, SMS, status checks."""

import pytest
from unittest.mock import patch, MagicMock

from marketing.clients.unisender import UnisenderClient, UnisenderAPIError


class TestUnisenderClientInit:
    def test_raises_when_not_configured(self, db):
        """Без API-ключа или is_active=False → UnisenderAPIError."""
        from marketing.models import UnisenderConfig
        config = UnisenderConfig.get()
        config.api_key = ''
        config.is_active = False
        config.save()

        with pytest.raises(UnisenderAPIError, match='не настроен'):
            UnisenderClient()

    def test_raises_when_inactive(self, db):
        """is_active=False даже с ключом → ошибка."""
        from marketing.models import UnisenderConfig
        config = UnisenderConfig.get()
        config.api_key = 'test_key'
        config.is_active = False
        config.save()

        with pytest.raises(UnisenderAPIError, match='не настроен'):
            UnisenderClient()

    def test_creates_with_valid_config(self, db):
        """С ключом и is_active=True — клиент создаётся."""
        from marketing.models import UnisenderConfig
        config = UnisenderConfig.get()
        config.api_key = 'test_key'
        config.is_active = True
        config.save()

        client = UnisenderClient()
        assert client.config.api_key == 'test_key'


class TestSendEmail:
    def test_send_email_returns_stub(self, db):
        """send_email возвращает stub-ответ."""
        from marketing.models import UnisenderConfig
        config = UnisenderConfig.get()
        config.api_key = 'test_key'
        config.is_active = True
        config.save()

        client = UnisenderClient()
        result = client.send_email('test@example.com', 'Subject', 'Body')
        assert result['status'] == 'stub'
        assert result['email'] == 'test@example.com'


class TestSendSMS:
    def test_send_sms_returns_stub(self, db):
        """send_sms возвращает stub-ответ."""
        from marketing.models import UnisenderConfig
        config = UnisenderConfig.get()
        config.api_key = 'test_key'
        config.is_active = True
        config.save()

        client = UnisenderClient()
        result = client.send_sms('+79001234567', 'Текст SMS')
        assert result['status'] == 'stub'
        assert result['phone'] == '+79001234567'


class TestStatusChecks:
    def test_check_email_status(self, db):
        from marketing.models import UnisenderConfig
        config = UnisenderConfig.get()
        config.api_key = 'key'
        config.is_active = True
        config.save()

        client = UnisenderClient()
        result = client.check_email_status('msg_123')
        assert result['status'] == 'stub'

    def test_check_sms_status(self, db):
        from marketing.models import UnisenderConfig
        config = UnisenderConfig.get()
        config.api_key = 'key'
        config.is_active = True
        config.save()

        client = UnisenderClient()
        result = client.check_sms_status('sms_456')
        assert result['status'] == 'stub'


class TestGetBalance:
    def test_get_balance_returns_stub(self, db):
        from marketing.models import UnisenderConfig
        config = UnisenderConfig.get()
        config.api_key = 'key'
        config.is_active = True
        config.save()

        client = UnisenderClient()
        result = client.get_balance()
        assert 'balance' in result

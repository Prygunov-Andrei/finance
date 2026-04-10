"""
UnisenderClient — клиент Unisender API (email + SMS).

Полная реализация запланирована на Фазу 4.
"""
import logging

import httpx

logger = logging.getLogger(__name__)


class UnisenderAPIError(Exception):
    def __init__(self, message, response_data=None):
        self.message = message
        self.response_data = response_data
        super().__init__(message)


class UnisenderClient:
    """Клиент Unisender API (email + SMS)."""

    BASE_URL = 'https://api.unisender.com/ru/api'
    TIMEOUT = 30

    def __init__(self):
        from marketing.models import UnisenderConfig
        self.config = UnisenderConfig.get()
        if not self.config.is_active or not self.config.api_key:
            raise UnisenderAPIError('Unisender не настроен или не активен')

    def send_email(self, to_email, subject, body, attachments=None):
        """Отправить email через Unisender."""
        # TODO: Фаза 4 — реализация
        logger.info('UnisenderClient.send_email: %s → %s (stub)', subject, to_email)
        return {'status': 'stub', 'email': to_email}

    def send_sms(self, phone, text):
        """Отправить SMS через Unisender."""
        # TODO: Фаза 4 — реализация
        logger.info('UnisenderClient.send_sms: → %s (stub)', phone)
        return {'status': 'stub', 'phone': phone}

    def check_email_status(self, message_id):
        """Проверить статус email."""
        return {'status': 'stub'}

    def check_sms_status(self, message_id):
        """Проверить статус SMS."""
        return {'status': 'stub'}

    def get_balance(self):
        """Получить баланс аккаунта."""
        return {'status': 'stub', 'balance': '0'}

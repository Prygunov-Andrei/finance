"""
AvitoAPIClient — клиент Avito API с OAuth2 и rate limiting.

Полная реализация запланирована на Фазу 3.
Текущая версия — интерфейс для тестирования.
"""
import logging
import time

import httpx

logger = logging.getLogger(__name__)


class AvitoAPIError(Exception):
    def __init__(self, message, status_code=None, response_data=None):
        self.message = message
        self.status_code = status_code
        self.response_data = response_data
        super().__init__(message)


class AvitoAPIClient:
    """Клиент Avito API с OAuth2 и rate limiting."""

    BASE_URL = 'https://api.avito.ru'
    TOKEN_URL = 'https://api.avito.ru/token'
    TIMEOUT = 30
    MAX_RETRIES = 3
    RETRY_DELAY = 2
    RATE_LIMIT = 55
    RATE_WINDOW = 60

    def __init__(self):
        self.config = None
        self._client = None
        self._request_timestamps = []

    def __enter__(self):
        from marketing.models import AvitoConfig
        self.config = AvitoConfig.get()
        if not self.config.client_id or not self.config.client_secret:
            raise AvitoAPIError('Avito API credentials не настроены')
        self._client = httpx.Client(timeout=self.TIMEOUT)
        self._ensure_valid_token()
        return self

    def __exit__(self, *args):
        if self._client:
            self._client.close()
            self._client = None

    def _ensure_valid_token(self):
        if not self.config.is_token_valid():
            self._refresh_token()

    def _refresh_token(self):
        response = self._client.post(
            self.TOKEN_URL,
            data={
                'grant_type': 'client_credentials',
                'client_id': self.config.client_id,
                'client_secret': self.config.client_secret,
            },
        )
        if response.status_code != 200:
            raise AvitoAPIError(
                f'Ошибка получения токена: {response.status_code}',
                status_code=response.status_code,
                response_data=response.text[:500],
            )
        data = response.json()
        from django.utils import timezone
        from datetime import timedelta
        self.config.access_token = data['access_token']
        self.config.token_expires_at = timezone.now() + timedelta(seconds=data.get('expires_in', 3600))
        self.config.save(update_fields=['access_token', 'token_expires_at', 'updated_at'])
        logger.info('Avito OAuth токен обновлён, истекает: %s', self.config.token_expires_at)

    def _throttle(self):
        now = time.monotonic()
        self._request_timestamps = [
            t for t in self._request_timestamps if now - t < self.RATE_WINDOW
        ]
        if len(self._request_timestamps) >= self.RATE_LIMIT:
            sleep_time = self.RATE_WINDOW - (now - self._request_timestamps[0])
            if sleep_time > 0:
                logger.debug('Rate limit: ожидание %.1f сек', sleep_time)
                time.sleep(sleep_time)
        self._request_timestamps.append(time.monotonic())

    def _request(self, method, path, **kwargs):
        self._throttle()
        self._ensure_valid_token()

        url = f'{self.BASE_URL}/{path.lstrip("/")}'
        headers = {'Authorization': f'Bearer {self.config.access_token}'}
        last_error = None

        for attempt in range(1, self.MAX_RETRIES + 1):
            try:
                response = self._client.request(method, url, headers=headers, **kwargs)
                if response.status_code == 403:
                    self._refresh_token()
                    headers['Authorization'] = f'Bearer {self.config.access_token}'
                    continue
                if response.status_code >= 500:
                    raise AvitoAPIError(f'Server error {response.status_code}', status_code=response.status_code)
                if response.status_code >= 400:
                    raise AvitoAPIError(
                        f'Client error {response.status_code}: {response.text[:200]}',
                        status_code=response.status_code,
                    )
                return response.json()
            except httpx.TimeoutException as e:
                last_error = AvitoAPIError(f'Timeout (attempt {attempt}): {e}')
                logger.warning('Avito API timeout (attempt %d/%d): %s', attempt, self.MAX_RETRIES, url)
            except httpx.RequestError as e:
                last_error = AvitoAPIError(f'Request error (attempt {attempt}): {e}')
                logger.warning('Avito API error (attempt %d/%d): %s', attempt, self.MAX_RETRIES, e)
            except AvitoAPIError as e:
                if e.status_code and e.status_code >= 500:
                    last_error = e
                    logger.warning('Avito API 5xx (attempt %d/%d): %s', attempt, self.MAX_RETRIES, e.message)
                else:
                    raise
            if attempt < self.MAX_RETRIES:
                time.sleep(self.RETRY_DELAY * attempt)

        raise last_error or AvitoAPIError('Все попытки исчерпаны')

    # --- Публичные методы ---

    def create_listing(self, listing_data):
        return self._request('POST', '/autoload/v1/upload', json=listing_data)

    def get_item(self, item_id):
        return self._request('GET', f'/items/v2/item/{item_id}')

    def get_items_list(self):
        return self._request('GET', f'/core/v1/accounts/{self.config.user_id}/items/')

    def get_item_stats(self, item_ids):
        return self._request(
            'POST',
            f'/core/v1/accounts/{self.config.user_id}/stats/items',
            json={'itemIds': item_ids},
        )

    def get_category_tree(self):
        return self._request('GET', '/autoload/v1/user-docs/tree')

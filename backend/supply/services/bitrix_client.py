"""
BitrixAPIClient — клиент для работы с Bitrix24 REST API.

Использует incoming webhook для обратных вызовов к API Битрикс24.
Поддерживает rate limiting (2 req/s), exponential backoff при 503.
"""

import logging
import time
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

# Rate limiting
MAX_REQUESTS_PER_SECOND = 2
MAX_RETRIES = 3
INITIAL_BACKOFF = 1.0  # секунды


class BitrixAPIError(Exception):
    """Ошибка при обращении к Bitrix24 API."""

    def __init__(self, message: str, status_code: int = 0, response_data: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.response_data = response_data


class BitrixAPIClient:
    """
    Клиент для работы с Bitrix24 REST API через incoming webhook.

    Использование:
        client = BitrixAPIClient(webhook_url="https://xxx.bitrix24.ru/rest/1/abc123/")
        deal = client.get_deal(12345)
        comments = client.get_deal_comments(12345)
        file_bytes = client.download_file("https://xxx.bitrix24.ru/disk/...")
    """

    def __init__(self, webhook_url: str, timeout: int = 30):
        self.webhook_url = webhook_url.rstrip('/')
        self.timeout = timeout
        self._last_request_time = 0.0

    def _rate_limit(self):
        """Ожидание между запросами для соблюдения rate limit."""
        now = time.time()
        elapsed = now - self._last_request_time
        min_interval = 1.0 / MAX_REQUESTS_PER_SECOND
        if elapsed < min_interval:
            time.sleep(min_interval - elapsed)
        self._last_request_time = time.time()

    def _call(self, method: str, params: Optional[Dict] = None) -> Dict:
        """
        Вызов метода Bitrix24 REST API.

        Args:
            method: Название метода (например, "crm.deal.get")
            params: Параметры вызова

        Returns:
            Тело ответа (dict)

        Raises:
            BitrixAPIError: При ошибке API
        """
        url = f'{self.webhook_url}/{method}'
        backoff = INITIAL_BACKOFF

        for attempt in range(MAX_RETRIES + 1):
            self._rate_limit()
            try:
                with httpx.Client(timeout=self.timeout) as client:
                    response = client.post(url, json=params or {})

                if response.status_code == 503:
                    if attempt < MAX_RETRIES:
                        logger.warning(
                            'Bitrix API 503 for %s, retry %d/%d in %.1fs',
                            method, attempt + 1, MAX_RETRIES, backoff,
                        )
                        time.sleep(backoff)
                        backoff *= 2
                        continue
                    raise BitrixAPIError(
                        f'Bitrix API returned 503 after {MAX_RETRIES} retries',
                        status_code=503,
                    )

                if response.status_code != 200:
                    raise BitrixAPIError(
                        f'Bitrix API HTTP {response.status_code}: {response.text[:500]}',
                        status_code=response.status_code,
                        response_data=response.text,
                    )

                data = response.json()

                # Bitrix может вернуть ошибку внутри 200
                if 'error' in data:
                    raise BitrixAPIError(
                        f'Bitrix API error: {data["error"]} — {data.get("error_description", "")}',
                        response_data=data,
                    )

                return data

            except httpx.TimeoutException as exc:
                if attempt < MAX_RETRIES:
                    logger.warning(
                        'Bitrix API timeout for %s, retry %d/%d',
                        method, attempt + 1, MAX_RETRIES,
                    )
                    time.sleep(backoff)
                    backoff *= 2
                    continue
                raise BitrixAPIError(f'Bitrix API timeout for {method}') from exc

            except httpx.RequestError as exc:
                raise BitrixAPIError(f'Bitrix API request error: {exc}') from exc

        raise BitrixAPIError(f'Bitrix API max retries reached for {method}')

    # =========================================================================
    # Основные методы
    # =========================================================================

    def get_deal(self, deal_id: int) -> Dict:
        """
        Получить данные сделки.

        Returns:
            Данные сделки (dict) из поля "result"
        """
        data = self._call('crm.deal.get', {'ID': deal_id})
        return data.get('result', {})

    def get_deal_comments(self, deal_id: int) -> List[Dict]:
        """
        Получить все комментарии (timeline) сделки с пагинацией.

        Returns:
            Список всех комментариев (с файлами)
        """
        all_comments = []
        start = 0

        while True:
            data = self._call('crm.timeline.comment.list', {
                'filter': {'ENTITY_ID': deal_id, 'ENTITY_TYPE': 'deal'},
                'order': {'ID': 'ASC'},
                'start': start,
            })
            result = data.get('result', [])
            if not result:
                break
            all_comments.extend(result)

            # Пагинация: если есть "next", продолжаем
            next_start = data.get('next')
            if next_start is None:
                break
            start = next_start

        return all_comments

    def download_file(self, download_url: str) -> bytes:
        """
        Скачать файл по URL из Битрикс24.

        Args:
            download_url: URL для скачивания (urlDownload из FILES)

        Returns:
            Содержимое файла (bytes)
        """
        self._rate_limit()
        try:
            with httpx.Client(timeout=self.timeout, follow_redirects=True) as client:
                response = client.get(download_url)
                response.raise_for_status()
                return response.content
        except httpx.TimeoutException as exc:
            raise BitrixAPIError(f'File download timeout: {download_url}') from exc
        except httpx.HTTPStatusError as exc:
            raise BitrixAPIError(
                f'File download error {exc.response.status_code}: {download_url}',
                status_code=exc.response.status_code,
            ) from exc

    def get_pipeline_stages(self, category_id: int = 0) -> List[Dict]:
        """
        Получить стадии воронки сделок.

        Args:
            category_id: ID категории (0 = default)

        Returns:
            Список стадий
        """
        data = self._call('crm.status.list', {
            'filter': {'ENTITY_ID': f'DEAL_STAGE{"" if category_id == 0 else f"_{category_id}"}'},
        })
        return data.get('result', [])

    def batch(self, commands: Dict[str, str]) -> Dict:
        """
        Пакетный вызов (до 50 методов за 1 запрос).

        Args:
            commands: Словарь {label: "method_name?param=value"}

        Returns:
            Словарь результатов {label: result}
        """
        data = self._call('batch', {'cmd': commands})
        return data.get('result', {}).get('result', {})

    def test_connection(self) -> bool:
        """
        Тестовый вызов для проверки подключения.

        Returns:
            True если подключение работает
        """
        try:
            data = self._call('crm.deal.list', {
                'select': ['ID'],
                'start': 0,
            })
            return 'result' in data
        except BitrixAPIError:
            return False

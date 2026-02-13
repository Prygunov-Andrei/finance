"""
Клиент для работы с Tochka Bank Open API v2.

Документация: https://developers.tochka.com/docs/tochka-api/
"""

import logging
import os
from datetime import date, datetime, timedelta
from typing import Any, Optional

import httpx
import jwt
from django.utils import timezone

logger = logging.getLogger(__name__)


class TochkaAPIError(Exception):
    """Ошибка API Точки."""

    def __init__(self, message: str, status_code: int = 0, response_data: Any = None):
        self.status_code = status_code
        self.response_data = response_data
        super().__init__(message)


class TochkaAPIClient:
    """
    Синхронный клиент для Tochka Bank Open API v2.

    Использует httpx для HTTP-запросов.
    Автоматически обновляет access_token при истечении.
    """

    # NOTE: В актуальной OpenAPI спецификации base URL для production:
    # https://enter.tochka.com/uapi/
    BASE_URL = 'https://enter.tochka.com/uapi'
    SANDBOX_URL = 'https://enter.tochka.com/sandbox/v2'
    TOKEN_URL = 'https://enter.tochka.com/connect/token'
    SANDBOX_TOKEN_URL = 'https://enter.tochka.com/sandbox/connect/token'

    # Таймаут для HTTP-запросов (секунды)
    TIMEOUT = 30
    # Количество попыток при ошибках сети
    MAX_RETRIES = 3

    # Default scopes per Tochka OpenAPI swagger.json
    # (space-separated, as required by OAuth2 token endpoint)
    DEFAULT_SCOPE = ' '.join([
        'ReadAccountsBasic',
        'ReadAccountsDetail',
        'ReadBalances',
        'ReadStatements',
        'ReadCustomerData',
        'CreatePaymentForSign',
        'CreatePaymentOrder',
        'ManageWebhookData',
    ])

    def __init__(self, bank_connection, sandbox: bool = False):
        """
        Args:
            bank_connection: Экземпляр BankConnection с credentials.
            sandbox: Использовать sandbox-контур.
        """
        self.connection = bank_connection
        self.sandbox = sandbox
        self._base_url = self.SANDBOX_URL if sandbox else self.BASE_URL
        self._token_url = self.SANDBOX_TOKEN_URL if sandbox else self.TOKEN_URL
        self._client = httpx.Client(timeout=self.TIMEOUT)

    def close(self):
        """Закрыть HTTP-клиент."""
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()

    # =========================================================================
    # Аутентификация
    # =========================================================================

    def authenticate(self, scope: str = DEFAULT_SCOPE) -> str:
        """
        Убедиться, что есть валидный access_token.

        Args:
            scope: Scope используется только если потребуется заново получать токен
                   (в нашем случае — через refresh_token).

        Returns:
            access_token строка.
        """
        # Точка также умеет выдавать "JWT-ключ" в кабинете (готовый Bearer JWT).
        # Это отдельный механизм от /connect/token. Если переменная задана —
        # используем её как access_token и (если пусто) заполняем customer_code из claims.
        env_jwt_token = os.environ.get('TOCHKA_JWT_TOKEN', '').strip()
        if env_jwt_token:
            if self.connection.access_token != env_jwt_token:
                self.connection.access_token = env_jwt_token
                self.connection.token_expires_at = None

                # Не доверяем токену как "истине", но customer_code из него удобно подтянуть
                # (без валидации подписи — подпись проверяется на стороне банка).
                if not self.connection.customer_code:
                    try:
                        payload = jwt.decode(env_jwt_token, options={'verify_signature': False})
                        customer_code = str(payload.get('customer_code', '')).strip()
                        if customer_code:
                            self.connection.customer_code = customer_code
                    except Exception:
                        pass

                self.connection.save(update_fields=['access_token', 'token_expires_at', 'customer_code'])
            return self.connection.access_token

        # В продакшене Точка требует пользовательский токен:
        # authorization_code или password flow.
        if not self.connection.access_token:
            if self.connection.refresh_token:
                self.refresh_access_token()
            else:
                username = os.environ.get('TOCHKA_USERNAME', '').strip()
                password = os.environ.get('TOCHKA_PASSWORD', '').strip()
                if username and password:
                    self.authenticate_password(username=username, password=password, scope=scope)
                else:
                    raise TochkaAPIError(
                        'Нет access_token/refresh_token для подключения. '
                        'Выполните OAuth authorization_code flow или задайте TOCHKA_JWT_TOKEN / TOCHKA_USERNAME/TOCHKA_PASSWORD.'
                    )
        return self.connection.access_token

    def authenticate_password(self, username: str, password: str, scope: str = DEFAULT_SCOPE) -> str:
        """
        Получить access_token через password flow (требует пользователя Точки).
        """
        data = {
            'grant_type': 'password',
            'username': username,
            'password': password,
            'scope': scope,
            'client_id': self.connection.client_id,
            'client_secret': self.connection.client_secret,
        }

        response = self._client.post(self._token_url, data=data)
        if response.status_code != 200:
            raise TochkaAPIError(
                f'Ошибка password auth: {response.status_code} {response.text}',
                status_code=response.status_code,
                response_data=response.text,
            )

        result = response.json()
        access_token = result.get('access_token', '')
        expires_in = result.get('expires_in', 86400)
        refresh_token = result.get('refresh_token', '')

        if not access_token:
            raise TochkaAPIError(f'Пустой access_token в ответе: {result}')

        self.connection.access_token = access_token
        if refresh_token:
            self.connection.refresh_token = refresh_token
        self.connection.token_expires_at = timezone.now() + timedelta(seconds=expires_in)
        self.connection.save(update_fields=['access_token', 'refresh_token', 'token_expires_at'])

        logger.info('Tochka: password auth OK для %s', self.connection.name)
        return access_token

    def exchange_authorization_code(self, code: str, redirect_uri: str, scope: str = DEFAULT_SCOPE) -> str:
        """
        Обменять authorization_code на access_token/refresh_token.
        """
        data = {
            'grant_type': 'authorization_code',
            'code': code,
            'redirect_uri': redirect_uri,
            'client_id': self.connection.client_id,
            'client_secret': self.connection.client_secret,
            'scope': scope,
        }

        response = self._client.post(self._token_url, data=data)
        if response.status_code != 200:
            raise TochkaAPIError(
                f'Ошибка обмена кода: {response.status_code} {response.text}',
                status_code=response.status_code,
                response_data=response.text,
            )

        result = response.json()
        access_token = result.get('access_token', '')
        expires_in = result.get('expires_in', 86400)
        refresh_token = result.get('refresh_token', '')

        if not access_token:
            raise TochkaAPIError(f'Пустой access_token в ответе: {result}')

        self.connection.access_token = access_token
        if refresh_token:
            self.connection.refresh_token = refresh_token
        self.connection.token_expires_at = timezone.now() + timedelta(seconds=expires_in)
        self.connection.save(update_fields=['access_token', 'refresh_token', 'token_expires_at'])

        logger.info('Tochka: OAuth code exchange OK для %s', self.connection.name)
        return access_token

    def refresh_access_token(self) -> str:
        """
        Обновить access_token через refresh_token.

        Returns:
            Новый access_token.
        """
        if not self.connection.refresh_token:
            raise TochkaAPIError('refresh_token отсутствует — нужно заново выполнить OAuth подключение')

        data = {
            'grant_type': 'refresh_token',
            'refresh_token': self.connection.refresh_token,
            'client_id': self.connection.client_id,
            'client_secret': self.connection.client_secret,
            'scope': self.DEFAULT_SCOPE,
        }

        response = self._client.post(self._token_url, data=data)

        if response.status_code != 200:
            raise TochkaAPIError(
                f'Ошибка refresh_token: {response.status_code} {response.text}',
                status_code=response.status_code,
                response_data=response.text,
            )

        result = response.json()
        access_token = result.get('access_token', '')
        expires_in = result.get('expires_in', 86400)
        refresh_token = result.get('refresh_token', '')

        self.connection.access_token = access_token
        if refresh_token:
            self.connection.refresh_token = refresh_token
        self.connection.token_expires_at = timezone.now() + timedelta(seconds=expires_in)
        self.connection.save(update_fields=[
            'access_token', 'refresh_token', 'token_expires_at',
        ])

        logger.info('Tochka: токен обновлён для %s', self.connection.name)
        return access_token

    def ensure_valid_token(self):
        """Проверить и при необходимости обновить access_token."""
        env_jwt_token = os.environ.get('TOCHKA_JWT_TOKEN', '').strip()
        # Если JWT-ключ задан в окружении — всегда предпочитаем его.
        # Это избегает ситуации, когда в БД лежит старый/невалидный токен.
        if env_jwt_token:
            if self.connection.access_token != env_jwt_token:
                self.authenticate()
            return

        if not self.connection.access_token:
            self.authenticate()
            return

        # Обновляем за 5 минут до истечения
        if self.connection.token_expires_at:
            if timezone.now() >= self.connection.token_expires_at - timedelta(minutes=5):
                self.refresh_access_token()
        else:
            # Нет информации о сроке — обновляем
            self.refresh_access_token()

    # =========================================================================
    # HTTP helpers
    # =========================================================================

    def _headers(self) -> dict:
        """Заголовки для авторизованных запросов."""
        return {
            'Authorization': f'Bearer {self.connection.access_token}',
            'Content-Type': 'application/json',
        }

    def _request(
        self,
        method: str,
        path: str,
        json_data: Optional[dict] = None,
        params: Optional[dict] = None,
    ) -> dict:
        """
        Выполнить авторизованный HTTP-запрос к API.

        Args:
            method: HTTP-метод (GET, POST, PUT, DELETE).
            path: Путь относительно base_url (например: /payment/v1.0/for-sign).
            json_data: Тело запроса (JSON).
            params: Query-параметры.

        Returns:
            Распарсенный JSON-ответ.

        Raises:
            TochkaAPIError: При ошибке API.
        """
        self.ensure_valid_token()

        url = f'{self._base_url}{path}'
        last_error = None

        for attempt in range(1, self.MAX_RETRIES + 1):
            try:
                response = self._client.request(
                    method=method,
                    url=url,
                    headers=self._headers(),
                    json=json_data,
                    params=params,
                )

                if response.status_code == 401:
                    # Токен протух — обновляем и повторяем
                    logger.warning('Tochka: 401, обновляем токен (попытка %d)', attempt)
                    self.authenticate()
                    continue

                if response.status_code >= 400:
                    raise TochkaAPIError(
                        f'Tochka API ошибка: {response.status_code} {response.text}',
                        status_code=response.status_code,
                        response_data=response.text,
                    )

                # Некоторые эндпоинты возвращают пустое тело
                if not response.content:
                    return {}

                return response.json()

            except httpx.RequestError as exc:
                last_error = exc
                logger.warning(
                    'Tochka: ошибка сети (попытка %d/%d): %s',
                    attempt, self.MAX_RETRIES, exc,
                )
                if attempt == self.MAX_RETRIES:
                    raise TochkaAPIError(
                        f'Ошибка сети после {self.MAX_RETRIES} попыток: {exc}',
                    ) from exc

        raise TochkaAPIError(f'Не удалось выполнить запрос: {last_error}')

    # =========================================================================
    # Счета и балансы
    # =========================================================================

    def get_customers_list(self) -> dict:
        """Получить список клиентов (customerCode)."""
        return self._request('GET', '/open-banking/v1.0/customers')

    def get_accounts_list(self) -> dict:
        """Получить список счетов."""
        return self._request('GET', '/open-banking/v1.0/accounts')

    def get_account_balance(self, account_id: str) -> dict:
        """Получить баланс счёта."""
        return self._request('GET', f'/open-banking/v1.0/accounts/{account_id}/balances')

    # =========================================================================
    # Выписки
    # =========================================================================

    def get_statement(
        self,
        account_id: str,
        date_from: date,
        date_to: date,
    ) -> dict:
        """
        Получить выписку по счёту за период.

        Args:
            account_id: ID счёта в банке.
            date_from: Начало периода.
            date_to: Конец периода.
        """
        return self._request(
            'GET',
            f'/open-banking/v1.0/accounts/{account_id}/statements',
            params={
                'dateFrom': date_from.isoformat(),
                'dateTo': date_to.isoformat(),
            },
        )

    # =========================================================================
    # Платежи
    # =========================================================================

    def create_payment_for_sign(self, payment_data: dict) -> dict:
        """
        Создать платёж на подпись (черновик).

        Платёж появится в интернет-банке для подписания.

        Args:
            payment_data: Данные платёжного поручения.
        """
        # Support: production payments base: /uapi/payments/v2.0/
        try:
            return self._request('POST', '/payments/v2.0/for-sign', json_data=payment_data)
        except TochkaAPIError as exc:
            if getattr(exc, 'status_code', 0) == 404:
                # Fallback to legacy path from older swagger
                return self._request('POST', '/payment/v1.0/for-sign', json_data=payment_data)
            raise

    def create_payment(self, payment_data: dict) -> dict:
        """
        Создать и подписать платёж (auto-sign).

        DEPRECATED в API Точки, но поддерживается.

        Args:
            payment_data: Данные платёжного поручения.
        """
        try:
            return self._request('POST', '/payments/v2.0/order', json_data=payment_data)
        except TochkaAPIError as exc:
            if getattr(exc, 'status_code', 0) == 404:
                return self._request('POST', '/payment/v1.0/order', json_data=payment_data)
            raise

    def get_payment_for_sign_list(self) -> dict:
        """Получить список платежей, ожидающих подписи."""
        try:
            return self._request('GET', '/payments/v2.0/for-sign')
        except TochkaAPIError as exc:
            if getattr(exc, 'status_code', 0) == 404:
                return self._request('GET', '/payment/v1.0/for-sign')
            raise

    def get_payment_status(self, request_id: str) -> dict:
        """
        Получить статус платежа.

        Args:
            request_id: ID запроса (requestId из ответа create_payment*).
        """
        try:
            return self._request('GET', f'/payments/v2.0/status/{request_id}')
        except TochkaAPIError as exc:
            if getattr(exc, 'status_code', 0) == 404:
                return self._request('GET', f'/payment/v1.0/status/{request_id}')
            raise

    # =========================================================================
    # Вебхуки
    # =========================================================================

    def get_webhooks(self) -> dict:
        """Получить список настроенных вебхуков."""
        client_id = self.connection.client_id
        return self._request('GET', f'/webhook/v1.0/{client_id}')

    def create_webhook(self, url: str, webhook_type: str) -> dict:
        """
        Создать вебхук.

        Args:
            url: URL для получения вебхуков (HTTPS, порт 443).
            webhook_type: Тип события (incomingPayment, outgoingPayment, etc.).
        """
        client_id = self.connection.client_id
        return self._request(
            'PUT',
            f'/webhook/v1.0/{client_id}',
            json_data={
                'url': url,
                'webhookType': webhook_type,
            },
        )

    def edit_webhook(self, url: str, webhook_type: str) -> dict:
        """Изменить существующий вебхук."""
        client_id = self.connection.client_id
        return self._request(
            'POST',
            f'/webhook/v1.0/{client_id}',
            json_data={
                'url': url,
                'webhookType': webhook_type,
            },
        )

    def delete_webhook(self, webhook_type: str) -> dict:
        """Удалить вебхук."""
        client_id = self.connection.client_id
        return self._request(
            'DELETE',
            f'/webhook/v1.0/{client_id}',
            json_data={'webhookType': webhook_type},
        )

    def send_test_webhook(self, webhook_type: str) -> dict:
        """Отправить тестовый вебхук."""
        client_id = self.connection.client_id
        return self._request(
            'POST',
            f'/webhook/v1.0/{client_id}/test-send',
            json_data={'webhookType': webhook_type},
        )

    # =========================================================================
    # Выставление счетов и закрывающие документы
    # =========================================================================

    def create_invoice(self, customer_code: str, invoice_data: dict) -> dict:
        """Создать счёт на оплату."""
        return self._request(
            'POST',
            '/invoice/v1.0/bills',
            json_data={
                'customerCode': customer_code,
                **invoice_data,
            },
        )

    def get_invoice_status(self, customer_code: str, document_id: str) -> dict:
        """Получить статус оплаты счёта."""
        return self._request(
            'GET',
            f'/invoice/v1.0/bills/{customer_code}/{document_id}/payment-status',
        )

    # =========================================================================
    # Утилиты
    # =========================================================================

    def build_payment_data(
        self,
        customer_code: str,
        account_code: str,
        recipient_name: str,
        recipient_inn: str,
        recipient_kpp: str,
        recipient_account: str,
        recipient_bank_name: str,
        recipient_bik: str,
        recipient_corr_account: str,
        amount: str,
        purpose: str,
        payment_date: Optional[date] = None,
    ) -> dict:
        """
        Сформировать словарь данных для создания платёжного поручения.

        Args:
            customer_code: customerCode клиента в банке.
            account_code: accountCode счёта списания.
            recipient_*: Реквизиты получателя.
            amount: Сумма (строка, например "15000.00").
            purpose: Назначение платежа.
            payment_date: Дата платежа (по умолчанию — сегодня, МСК).

        Returns:
            Словарь для передачи в create_payment* методы.
        """
        if payment_date is None:
            payment_date = date.today()

        return {
            'Data': {
                'customerCode': customer_code,
                'accountCode': account_code,
                'recipientName': recipient_name,
                'recipientINN': recipient_inn,
                'recipientKPP': recipient_kpp or '',
                'recipientAccount': recipient_account,
                'recipientBankName': recipient_bank_name,
                'recipientBIK': recipient_bik,
                'recipientCorrAccount': recipient_corr_account or '',
                'amount': str(amount),
                'purpose': purpose,
                'paymentDate': payment_date.isoformat(),
            }
        }

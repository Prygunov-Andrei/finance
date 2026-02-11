"""
Клиент для работы с API-FNS (api-fns.ru).

Предоставляет методы для:
- Поиска компаний по ИНН/названию (search, ac)
- Получения полных данных ЕГРЮЛ/ЕГРИП (egr)
- Проверки контрагента (check)
- Получения бухгалтерской отчетности (bo)
- Статистики использования ключа (stat)
"""

import hashlib
import logging
from datetime import timedelta
from typing import Optional

import httpx
from django.conf import settings
from django.utils import timezone

from .models import FNSCache

logger = logging.getLogger('fns')

# TTL для кэша по типам запросов (в часах)
CACHE_TTL = {
    'search': 24,       # 1 день
    'ac': 24,           # 1 день
    'egr': 168,         # 7 дней
    'check': 168,       # 7 дней
    'bo': 720,          # 30 дней (финансовая отчетность меняется редко)
    'stat': 0.083,      # 5 минут
    'multinfo': 24,     # 1 день
}

# Таймаут HTTP-запросов (секунды)
HTTP_TIMEOUT = 30


class FNSClientError(Exception):
    """Ошибка клиента API-FNS."""
    pass


class FNSClient:
    """HTTP-клиент для API-FNS (api-fns.ru)."""

    BASE_URL = "https://api-fns.ru/api"

    def __init__(self):
        self.api_key = settings.FNS_API_KEY
        if not self.api_key:
            raise FNSClientError("FNS_API_KEY не настроен в settings")

    def _get_cache_key(self, endpoint: str, params: dict) -> str:
        """Генерирует хеш для кэширования запроса."""
        cache_str = f"{endpoint}:{sorted(params.items())}"
        return hashlib.sha256(cache_str.encode()).hexdigest()

    def _get_cached(self, endpoint: str, params: dict) -> Optional[dict]:
        """Проверяет кэш и возвращает данные если не истекли."""
        cache_key = self._get_cache_key(endpoint, params)
        try:
            entry = FNSCache.objects.get(
                query_hash=cache_key,
                expires_at__gt=timezone.now(),
            )
            logger.info(f"FNS cache hit: {endpoint} [{cache_key[:12]}]")
            return entry.response_data
        except FNSCache.DoesNotExist:
            return None

    def _set_cache(self, endpoint: str, params: dict, data: dict) -> None:
        """Сохраняет ответ в кэш."""
        cache_key = self._get_cache_key(endpoint, params)
        ttl_hours = CACHE_TTL.get(endpoint, 24)
        expires_at = timezone.now() + timedelta(hours=ttl_hours)

        FNSCache.objects.update_or_create(
            query_hash=cache_key,
            defaults={
                'endpoint': endpoint,
                'query_params': params,
                'response_data': data,
                'expires_at': expires_at,
            },
        )
        logger.info(f"FNS cache set: {endpoint} [{cache_key[:12]}] TTL={ttl_hours}h")

    def _request(self, endpoint: str, params: dict, use_cache: bool = True) -> dict:
        """
        Выполняет HTTP-запрос к API-FNS.

        Args:
            endpoint: Метод API (search, egr, check, bo, stat, ac, multinfo)
            params: Параметры запроса (без ключа)
            use_cache: Использовать кэш

        Returns:
            JSON-ответ API

        Raises:
            FNSClientError: При ошибке запроса
        """
        # Проверяем кэш
        if use_cache:
            cached = self._get_cached(endpoint, params)
            if cached is not None:
                return cached

        # Добавляем ключ
        request_params = {**params, 'key': self.api_key}
        url = f"{self.BASE_URL}/{endpoint}"

        try:
            with httpx.Client(timeout=HTTP_TIMEOUT) as client:
                response = client.get(url, params=request_params)
                response.raise_for_status()
                data = response.json()
        except httpx.TimeoutException:
            logger.error(f"FNS API timeout: {endpoint} params={params}")
            raise FNSClientError(f"Таймаут запроса к API-FNS ({endpoint})")
        except httpx.HTTPStatusError as e:
            body = e.response.text[:500]
            logger.error(f"FNS API HTTP {e.response.status_code} {endpoint}: {body}")
            if e.response.status_code == 403:
                raise FNSClientError(
                    "API-FNS: доступ запрещён (IP-адрес не разрешён или ключ невалиден)"
                )
            raise FNSClientError(f"Ошибка API-FNS: HTTP {e.response.status_code}")
        except httpx.RequestError as e:
            logger.error(f"FNS API request error: {e}")
            raise FNSClientError(f"Ошибка соединения с API-FNS: {e}")
        except ValueError:
            logger.error(f"FNS API invalid JSON: {endpoint}")
            raise FNSClientError("API-FNS вернул невалидный JSON")

        # Сохраняем в кэш
        if use_cache:
            self._set_cache(endpoint, params, data)

        return data

    # ─── Публичные методы ────────────────────────────────────────────

    def search(self, query: str, page: int = 1) -> dict:
        """
        Поиск компаний по ИНН, ОГРН, названию или ФИО.

        Args:
            query: Строка поиска (ИНН, ОГРН, название, ФИО)
            page: Номер страницы (100 результатов на страницу)

        Returns:
            dict с ключами: items (список), Count (общее количество)
        """
        return self._request('search', {'q': query, 'page': page})

    def autocomplete(self, query: str) -> dict:
        """
        Автодополнение (typeahead) по первым буквам/цифрам.
        Минимум 3 символа для названий, 5 для ИНН.

        Args:
            query: Начало названия, ФИО или ИНН

        Returns:
            dict с подсказками
        """
        return self._request('ac', {'q': query})

    def get_egr(self, inn_or_ogrn: str) -> dict:
        """
        Полные данные ЕГРЮЛ/ЕГРИП по ИНН или ОГРН.

        Включает: реквизиты, адрес, директор, учредители, ОКВЭД,
        капитал, история изменений, лицензии и т.д.

        Args:
            inn_or_ogrn: ИНН (10/12 цифр) или ОГРН (13/15 цифр)

        Returns:
            Полный JSON из ЕГРЮЛ/ЕГРИП
        """
        return self._request('egr', {'req': inn_or_ogrn})

    def get_check(self, inn_or_ogrn: str) -> dict:
        """
        Проверка контрагента — позитивные и негативные факторы.

        Негативные: массовый адрес, дисквалификация, блокировки счетов,
        налоговые задолженности, недостоверные данные и т.д.

        Позитивные: лицензии, филиалы, реестр МСП, численность сотрудников.

        Args:
            inn_or_ogrn: ИНН или ОГРН

        Returns:
            dict с ключами Позитив и Негатив (списки факторов)
        """
        return self._request('check', {'req': inn_or_ogrn})

    def get_bo(self, inn_or_ogrn: str) -> dict:
        """
        Бухгалтерская отчетность (баланс, P&L) с 2019 года.
        Только для юридических лиц.

        Args:
            inn_or_ogrn: ИНН (10 цифр) или ОГРН (13 цифр)

        Returns:
            dict с финансовыми данными по годам
        """
        return self._request('bo', {'req': inn_or_ogrn})

    def get_multinfo(self, inns: list[str]) -> dict:
        """
        Краткие данные по нескольким компаниям (до 100).

        Args:
            inns: Список ИНН/ОГРН (до 100 штук)

        Returns:
            dict с данными по каждой компании
        """
        req = ','.join(inns[:100])
        return self._request('multinfo', {'req': req})

    def get_stats(self) -> dict:
        """
        Статистика использования API-ключа.

        Returns:
            dict с лимитами и использованием по каждому методу,
            статусом ключа (FREE/VIP), сроком действия
        """
        return self._request('stat', {}, use_cache=True)

    # ─── Утилиты ─────────────────────────────────────────────────────

    # Маппинг кодов ОКОПФ на правовые формы в нашей системе
    OKOPF_MAP = {
        '12300': 'ooo',   # Общества с ограниченной ответственностью
        '12200': 'ooo',   # Акционерные общества (ближайший аналог)
        '12247': 'ooo',   # Непубличные АО
        '12267': 'ooo',   # Публичные АО
        '50102': 'ip',    # Индивидуальные предприниматели
        '50000': 'ip',    # Физлица, осуществляющие деятельность
        '91200': 'fiz',   # Физические лица
    }

    @staticmethod
    def _detect_legal_form(
        item: dict,
        inn: str,
        full_name: str,
        okopf_code: str = '',
        okopf_name: str = '',
    ) -> str:
        """
        Определяет правовую форму контрагента по данным ФНС.

        Приоритет:
        1. КодОКОПФ (если есть в маппинге)
        2. Текст ОКОПФ (по ключевым словам)
        3. Ключ ИП в item
        4. Длина ИНН (12 = ИП/физлицо)
        5. Полное наименование (по ключевым словам)
        6. Fallback: 'ooo'
        """
        # 1. По коду ОКОПФ
        if okopf_code and okopf_code in FNSClient.OKOPF_MAP:
            return FNSClient.OKOPF_MAP[okopf_code]

        # 2. По тексту ОКОПФ
        if okopf_name:
            okopf_lower = okopf_name.lower()
            if 'индивидуальн' in okopf_lower:
                return 'ip'
            if 'ограниченной ответственностью' in okopf_lower:
                return 'ooo'

        # 3. Ключ ИП в item (EGR: {"ИП": {...}})
        if 'ИП' in item:
            return 'ip'

        # 4. Длина ИНН
        if len(inn) == 12:
            return 'ip'

        # 5. По полному наименованию
        if full_name:
            name_lower = full_name.lower()
            if 'индивидуальный предприниматель' in name_lower:
                return 'ip'

        return 'ooo'

    @staticmethod
    def _extract_contacts(contacts_data) -> str:
        """
        Извлекает контактную информацию из данных ФНС.

        API-FNS возвращает: {"Телефон": [...], "e-mail": [...], "Сайт": [...]}
        Формирует строку вида: "Тел: +7..., +7... | Email: a@b.c | Сайт: site.ru"
        """
        if not isinstance(contacts_data, dict):
            return ''

        parts = []

        phones = contacts_data.get('Телефон', [])
        if isinstance(phones, list) and phones:
            parts.append(f"Тел: {', '.join(phones)}")
        elif isinstance(phones, str) and phones:
            parts.append(f"Тел: {phones}")

        emails = contacts_data.get('e-mail', [])
        if isinstance(emails, list) and emails:
            parts.append(f"Email: {', '.join(emails)}")
        elif isinstance(emails, str) and emails:
            parts.append(f"Email: {emails}")

        sites = contacts_data.get('Сайт', [])
        if isinstance(sites, list) and sites:
            parts.append(f"Сайт: {', '.join(sites)}")
        elif isinstance(sites, str) and sites:
            parts.append(f"Сайт: {sites}")

        return ' | '.join(parts)

    @staticmethod
    def _extract_address(value) -> str:
        """
        Извлекает адрес из значения, которое может быть строкой или dict.

        API-FNS возвращает адрес в разных форматах:
        - строка: "123456, г. Москва, ул. Ленина, д. 1"
        - dict с вложенным полным адресом:
          {"АдресПолн": "обл. Московская, ...", "Индекс": "143003", "АдресДетали": {...}}
        """
        if isinstance(value, str):
            return value
        if isinstance(value, dict):
            # Приоритет 1: готовая строка АдресПолн внутри dict
            full_addr = value.get('АдресПолн', '')
            if full_addr and isinstance(full_addr, str):
                return full_addr
            # Приоритет 2: АдресПолнФИАС (верхний регистр)
            fias_addr = value.get('АдресПолнФИАС', '')
            if fias_addr and isinstance(fias_addr, str):
                return fias_addr
            # Приоритет 3: собрать из строковых полей верхнего уровня
            parts = []
            for key in ('Индекс', 'Регион', 'Район', 'Город', 'НаселПункт',
                        'Улица', 'Дом', 'Корпус', 'Кварт'):
                v = value.get(key, '')
                if v and isinstance(v, str):
                    parts.append(v)
            if parts:
                return ', '.join(parts)
            # Fallback: склеить все строковые значения
            str_vals = [str(v) for v in value.values() if v and isinstance(v, str)]
            return ', '.join(str_vals) if str_vals else ''
        return str(value) if value else ''

    @staticmethod
    def parse_egr_requisites(raw_data: dict) -> dict:
        """
        Извлекает реквизиты из EGR-ответа для предзаполнения формы.

        Returns:
            dict с ключами: inn, name, short_name, kpp, ogrn,
            address, legal_form, director, okved, capital
        """
        items = raw_data.get('items', [])
        if not items:
            return {}

        item = items[0]
        # EGR: items[0] = { "ЮЛ": {...} } или { "ИП": {...} }
        data = item.get('ЮЛ') or item.get('ИП') or item

        inn = data.get('ИНН', '') or data.get('ИННФЛ', '')
        ogrn = data.get('ОГРН', '') or data.get('ОГРНИП', '')
        full_name = data.get('НаимПолнЮЛ', '') or data.get('ФИОПолн', '')
        short_name = data.get('НаимСокрЮЛ', '')
        kpp = data.get('КПП', '')
        raw_address = data.get('АдресПолн', '') or data.get('Адрес', '')
        address = FNSClient._extract_address(raw_address)
        status = data.get('Статус', '')
        reg_date = data.get('ДатаРег', '') or data.get('ДатаОГРН', '')

        # Директор / руководитель
        director = ''
        if isinstance(data.get('Руководитель'), dict):
            director = data['Руководитель'].get('ФИО', '')
        elif isinstance(data.get('Руководитель'), list) and data['Руководитель']:
            director = data['Руководитель'][0].get('ФИО', '')

        # ОКВЭД
        okved = ''
        okved_name = ''
        if isinstance(data.get('ОснВидДеят'), dict):
            okved = data['ОснВидДеят'].get('Код', '')
            okved_name = data['ОснВидДеят'].get('Текст', '')

        # Уставный капитал
        capital = data.get('УставКап', '')

        # Контактная информация
        contact_info = FNSClient._extract_contacts(data.get('Контакты'))

        # Определяем правовую форму
        legal_form = FNSClient._detect_legal_form(
            item=item, inn=inn, full_name=full_name,
            okopf_code=data.get('КодОКОПФ', ''),
            okopf_name=data.get('ОКОПФ', ''),
        )

        return {
            'inn': inn,
            'name': full_name or short_name,
            'short_name': short_name,
            'kpp': kpp,
            'ogrn': ogrn,
            'address': address,
            'legal_form': legal_form,
            'status': status,
            'registration_date': reg_date,
            'director': director,
            'okved': okved,
            'okved_name': okved_name,
            'capital': str(capital) if capital else '',
            'contact_info': contact_info,
        }

    @staticmethod
    def parse_search_results(raw_data: dict) -> list[dict]:
        """
        Парсит результаты поиска API-FNS в унифицированный формат.

        Args:
            raw_data: Сырой ответ от search/ac

        Returns:
            Список словарей с ключами: inn, name, short_name, kpp, ogrn,
            address, legal_form, status, registration_date
        """
        results = []
        items = raw_data.get('items', [])

        for item in items:
            # API-FNS: items[i] = { "ЮЛ": {...} } или { "ИП": {...} }
            data = item.get('ЮЛ') or item.get('ИП') or item.get('НР') or item
            inn = data.get('ИНН', '') or data.get('ИННФЛ', '')
            ogrn = data.get('ОГРН', '') or data.get('ОГРНИП', '')
            full_name = data.get('НаимПолнЮЛ', '') or data.get('ФИОПолн', '')
            short_name = data.get('НаимСокрЮЛ', '')
            raw_address = data.get('АдресПолн', '') or data.get('Адрес', '')
            address = FNSClient._extract_address(raw_address)
            status = data.get('Статус', '')
            reg_date = data.get('ДатаРег', '') or data.get('ДатаОГРН', '')

            # Определяем правовую форму
            legal_form = FNSClient._detect_legal_form(
                item=item, inn=inn, full_name=full_name,
                okopf_code=data.get('КодОКОПФ', ''),
                okopf_name=data.get('ОКОПФ', ''),
            )

            # КПП (есть в autocomplete, может отсутствовать в search)
            kpp = data.get('КПП', '')

            results.append({
                'inn': inn,
                'name': full_name or short_name,
                'short_name': short_name,
                'kpp': kpp,
                'ogrn': ogrn,
                'address': address,
                'legal_form': legal_form,
                'status': status,
                'registration_date': reg_date,
            })

        return results

    @staticmethod
    def parse_check_summary(raw_data: dict) -> dict:
        """
        Извлекает краткую сводку из отчета check.

        Returns:
            dict с ключами:
            - positive: list[str] — позитивные факторы
            - negative: list[str] — негативные факторы
            - positive_count: int
            - negative_count: int
            - risk_level: str — 'low', 'medium', 'high'
        """
        items = raw_data.get('items', [])
        if not items:
            return {
                'positive': [],
                'negative': [],
                'positive_count': 0,
                'negative_count': 0,
                'risk_level': 'unknown',
            }

        # API-FNS: items[0] = { "ЮЛ": {...} } или { "ИП": {...} } или { "items": [ { "ЮЛ": {...} } ] }
        top = items[0]
        if isinstance(top, dict) and 'items' in top:
            inner_items = top.get('items', [])
            top = inner_items[0] if inner_items else {}
        # Извлекаем данные из ЮЛ или ИП
        company_data = top.get('ЮЛ') or top.get('ИП') or top
        positive = []
        negative = []

        # Парсим позитивные факторы
        pos_data = company_data.get('Позитив', {}) if isinstance(company_data, dict) else {}
        if isinstance(pos_data, dict):
            for key, value in pos_data.items():
                if value:
                    positive.append(f"{key}: {value}" if not isinstance(value, bool) else key)

        # Парсим негативные факторы
        neg_data = company_data.get('Негатив', {}) if isinstance(company_data, dict) else {}
        if isinstance(neg_data, dict):
            for key, value in neg_data.items():
                if value:
                    negative.append(f"{key}: {value}" if not isinstance(value, bool) else key)

        # Определяем уровень риска
        neg_count = len(negative)
        if neg_count == 0:
            risk_level = 'low'
        elif neg_count <= 2:
            risk_level = 'medium'
        else:
            risk_level = 'high'

        return {
            'positive': positive,
            'negative': negative,
            'positive_count': len(positive),
            'negative_count': neg_count,
            'risk_level': risk_level,
        }

    @staticmethod
    def parse_stats(raw_data: dict) -> dict:
        """
        Парсит статистику использования API-ключа в удобный формат.

        Returns:
            dict с ключами:
            - status: str (FREE/VIP)
            - start_date: str
            - end_date: str
            - methods: list[dict] — по каждому методу: name, limit, used, remaining
        """
        items = raw_data.get('items', [{}])
        stat_data = items[0] if items else {}

        status = stat_data.get('Статус', 'UNKNOWN')
        start_date = stat_data.get('ДатаНач', '')
        end_date = stat_data.get('ДатаКон', '')

        methods = []
        # API-FNS возвращает лимиты в формате: "МетодЛимит": число, "МетодИсп": число
        # Извлекаем все методы
        known_methods = [
            ('Поиск', 'search'),
            ('ЕГРЮЛ', 'egr'),
            ('Проверка', 'check'),
            ('БухОтч', 'bo'),
            ('МультИнфо', 'multinfo'),
            ('Автодоп', 'ac'),
            ('Выписка', 'vyp'),
            ('БлокСчета', 'nalogbi'),
            ('Изменения', 'changes'),
            ('Мониторинг', 'mon'),
            ('ИННфл', 'innfl'),
            ('СтатусФЛ', 'fl_status'),
        ]

        for ru_name, en_name in known_methods:
            limit_key = f"{ru_name}Лимит"
            used_key = f"{ru_name}Исп"
            limit = stat_data.get(limit_key, 0)
            used = stat_data.get(used_key, 0)

            if limit > 0 or used > 0:
                methods.append({
                    'name': en_name,
                    'display_name': ru_name,
                    'limit': limit,
                    'used': used,
                    'remaining': max(0, limit - used),
                })

        return {
            'status': status,
            'start_date': start_date,
            'end_date': end_date,
            'methods': methods,
        }

    @staticmethod
    def cleanup_expired_cache() -> int:
        """Удаляет истекшие записи кэша. Возвращает количество удаленных."""
        deleted, _ = FNSCache.objects.filter(expires_at__lt=timezone.now()).delete()
        logger.info(f"FNS cache cleanup: deleted {deleted} expired entries")
        return deleted

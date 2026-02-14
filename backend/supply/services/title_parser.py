"""
TitleParser — парсинг заголовка карточки Битрикс24.

Формат заголовка (примеры):
  "115 Озёры ЖК-расходка (диски). Все Инструменты ( сч.2602-421014-33318 )"
  "115 Озёры ЖК - расходка (диски)"
  "42 Клиника на Арбате"

Алгоритм:
  1. Первое число в строке → номер договора
  2. Текст после числа до первого разделителя (-, —, (, .) → название объекта
"""

import re
import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class ParsedTitle:
    """Результат парсинга заголовка карточки."""
    contract_number: Optional[str] = None
    object_name: Optional[str] = None
    raw_title: str = ''


def parse_deal_title(title: str) -> ParsedTitle:
    """
    Парсинг заголовка карточки канбана Битрикс24.

    Args:
        title: Заголовок карточки

    Returns:
        ParsedTitle с извлечёнными данными
    """
    if not title or not title.strip():
        return ParsedTitle(raw_title=title or '')

    title = title.strip()
    result = ParsedTitle(raw_title=title)

    # 1. Извлечь номер договора (первое число в строке)
    contract_match = re.match(r'^\s*(\d+)\s+', title)
    if contract_match:
        result.contract_number = contract_match.group(1)
        remaining = title[contract_match.end():]
    else:
        # Нет числа в начале — попробуем найти число где-либо
        number_match = re.search(r'\b(\d{1,5})\b', title)
        if number_match:
            result.contract_number = number_match.group(1)
        remaining = title

    # 2. Извлечь название объекта
    # Берём текст до первого разделителя: -, —, (, ., запятая
    if remaining:
        # Убираем лидирующие пробелы
        remaining = remaining.strip()
        # Разделители, которые отделяют объект от остальной информации
        object_match = re.match(r'^([^\-—\(\.,;]+)', remaining)
        if object_match:
            object_name = object_match.group(1).strip()
            # Убираем слишком короткие результаты (1-2 символа — это мусор)
            if len(object_name) >= 3:
                result.object_name = object_name

    logger.debug(
        'Parsed title "%s" -> contract=%s, object=%s',
        title, result.contract_number, result.object_name,
    )

    return result

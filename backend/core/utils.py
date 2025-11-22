"""
Утилиты для работы с датами и валидацией
"""
from datetime import date
from typing import Optional, Tuple
from rest_framework.exceptions import ValidationError


def parse_date_param(date_str: Optional[str], param_name: str = 'date') -> Optional[date]:
    """
    Парсит строку даты из query параметра
    
    Args:
        date_str: Строка даты в формате YYYY-MM-DD
        param_name: Название параметра для сообщения об ошибке
    
    Returns:
        date объект или None
    
    Raises:
        ValidationError: Если формат даты неверный
    """
    if not date_str:
        return None
    
    try:
        return date.fromisoformat(date_str)
    except ValueError:
        raise ValidationError({
            param_name: f'Неверный формат даты. Ожидается формат YYYY-MM-DD, получено: {date_str}'
        })


def validate_date_range(start_date: Optional[date], end_date: Optional[date]) -> None:
    """
    Валидирует диапазон дат
    
    Args:
        start_date: Начало периода
        end_date: Конец периода
    
    Raises:
        ValidationError: Если start_date > end_date
    """
    if start_date and end_date and start_date > end_date:
        raise ValidationError({
            'start_date': 'Дата начала не может быть позже даты окончания'
        })


def format_decimal_for_response(value) -> str:
    """
    Преобразует Decimal в строку для JSON ответа
    
    Args:
        value: Decimal или другое значение
    
    Returns:
        Строковое представление значения
    """
    return str(value) if value is not None else None


def format_date_for_response(date_obj: Optional[date]) -> Optional[str]:
    """
    Преобразует date объект в строку ISO формата для JSON ответа
    
    Args:
        date_obj: date объект или None
    
    Returns:
        Строка в формате YYYY-MM-DD или None
    """
    return date_obj.isoformat() if date_obj else None


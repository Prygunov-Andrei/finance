"""
Валидаторы для проверки данных при импорте
"""
from typing import List, Dict, Any, Tuple
from decimal import Decimal, InvalidOperation
from datetime import datetime


class ValidationError(Exception):
    """Ошибка валидации данных"""
    pass


def validate_required_fields(
    row: Dict[str, Any],
    required_fields: List[str],
    row_number: int
) -> List[str]:
    """
    Проверяет наличие обязательных полей в строке
    
    Args:
        row: Словарь с данными строки
        required_fields: Список обязательных полей
        row_number: Номер строки для сообщения об ошибке
    
    Returns:
        List[str]: Список ошибок (пустой, если ошибок нет)
    """
    errors = []
    for field in required_fields:
        if field not in row or not row[field] or str(row[field]).strip() == '':
            errors.append(
                f'Строка {row_number}: отсутствует обязательное поле "{field}"'
            )
    return errors


def validate_date(
    date_value: Any,
    field_name: str,
    row_number: int
) -> Tuple[Optional[datetime.date], List[str]]:
    """
    Валидирует и преобразует значение даты
    
    Args:
        date_value: Значение даты (может быть строкой, datetime, date)
        field_name: Название поля для сообщения об ошибке
        row_number: Номер строки
    
    Returns:
        Tuple[Optional[datetime.date], List[str]]: Дата и список ошибок
    """
    errors = []
    
    if date_value is None or str(date_value).strip() == '':
        errors.append(
            f'Строка {row_number}: поле "{field_name}" не может быть пустым'
        )
        return None, errors
    
    # Если уже date объект
    if isinstance(date_value, datetime.date):
        return date_value, errors
    
    # Если datetime объект
    if isinstance(date_value, datetime):
        return date_value.date(), errors
    
    # Попытка парсинга строки
    date_str = str(date_value).strip()
    date_formats = ['%Y-%m-%d', '%d.%m.%Y', '%d/%m/%Y', '%Y/%m/%d']
    
    for date_format in date_formats:
        try:
            parsed_date = datetime.strptime(date_str, date_format).date()
            return parsed_date, errors
        except ValueError:
            continue
    
    errors.append(
        f'Строка {row_number}: поле "{field_name}" имеет неверный формат даты: "{date_str}"'
    )
    return None, errors


def validate_decimal(
    amount_value: Any,
    field_name: str,
    row_number: int,
    min_value: Optional[Decimal] = None,
    max_value: Optional[Decimal] = None
) -> Tuple[Optional[Decimal], List[str]]:
    """
    Валидирует и преобразует значение суммы
    
    Args:
        amount_value: Значение суммы
        field_name: Название поля для сообщения об ошибке
        row_number: Номер строки
        min_value: Минимальное значение (опционально)
        max_value: Максимальное значение (опционально)
    
    Returns:
        Tuple[Optional[Decimal], List[str]]: Сумма и список ошибок
    """
    errors = []
    
    if amount_value is None or str(amount_value).strip() == '':
        errors.append(
            f'Строка {row_number}: поле "{field_name}" не может быть пустым'
        )
        return None, errors
    
    # Если уже Decimal
    if isinstance(amount_value, Decimal):
        amount = amount_value
    else:
        try:
            # Замена запятой на точку для русских форматов
            amount_str = str(amount_value).strip().replace(',', '.')
            amount = Decimal(amount_str)
        except (InvalidOperation, ValueError):
            errors.append(
                f'Строка {row_number}: поле "{field_name}" имеет неверный формат числа: "{amount_value}"'
            )
            return None, errors
    
    if min_value is not None and amount < min_value:
        errors.append(
            f'Строка {row_number}: поле "{field_name}" ({amount}) меньше минимального значения ({min_value})'
        )
    
    if max_value is not None and amount > max_value:
        errors.append(
            f'Строка {row_number}: поле "{field_name}" ({amount}) больше максимального значения ({max_value})'
        )
    
    return amount, errors


def validate_choice(
    value: Any,
    field_name: str,
    valid_choices: List[str],
    row_number: int,
    case_sensitive: bool = False
) -> Tuple[Optional[str], List[str]]:
    """
    Валидирует значение из списка допустимых вариантов
    
    Args:
        value: Значение для проверки
        field_name: Название поля
        valid_choices: Список допустимых значений
        row_number: Номер строки
        case_sensitive: Учитывать регистр при сравнении
    
    Returns:
        Tuple[Optional[str], List[str]]: Валидное значение и список ошибок
    """
    errors = []
    
    if value is None or str(value).strip() == '':
        errors.append(
            f'Строка {row_number}: поле "{field_name}" не может быть пустым'
        )
        return None, errors
    
    value_str = str(value).strip()
    
    if not case_sensitive:
        value_str = value_str.lower()
        valid_choices_lower = [choice.lower() for choice in valid_choices]
        if value_str in valid_choices_lower:
            # Возвращаем оригинальное значение из списка
            index = valid_choices_lower.index(value_str)
            return valid_choices[index], errors
    else:
        if value_str in valid_choices:
            return value_str, errors
    
    errors.append(
        f'Строка {row_number}: поле "{field_name}" имеет недопустимое значение "{value}". '
        f'Допустимые значения: {", ".join(valid_choices)}'
    )
    return None, errors


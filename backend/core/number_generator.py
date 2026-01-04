"""
Утилиты для генерации номеров документов.

Централизованные функции для генерации последовательных номеров
документов в различных форматах.
"""
from datetime import date
from typing import Optional, Type, Union
from django.db import models

# Константа по умолчанию (можно переопределить в settings)
_DEFAULT_TKP_START_NUMBER = 210


def generate_sequential_number(
    model_class: Type[models.Model],
    prefix: str,
    field_name: str = 'number',
    year: Optional[int] = None,
    digits: int = 3,
    separator: str = '-'
) -> str:
    """
    Генерирует последовательный номер формата {prefix}{separator}{year}{separator}{sequence}.
    
    Args:
        model_class: Класс модели Django
        prefix: Префикс номера (например, 'СМ', 'МС', 'РД')
        field_name: Имя поля с номером
        year: Год (по умолчанию текущий)
        digits: Количество цифр в порядковом номере
        separator: Разделитель между частями номера
    
    Returns:
        Сгенерированный номер (например, 'СМ-2025-001')
    
    Examples:
        >>> generate_sequential_number(Estimate, 'СМ')
        'СМ-2025-001'
        
        >>> generate_sequential_number(FrameworkContract, 'РД', digits=3)
        'РД-2025-001'
    """
    year = year or date.today().year
    full_prefix = f'{prefix}{separator}{year}{separator}'
    
    filter_kwargs = {f'{field_name}__startswith': full_prefix}
    last_record = model_class.objects.filter(**filter_kwargs).order_by(f'-{field_name}').first()
    
    if last_record:
        last_number_str = getattr(last_record, field_name)
        try:
            # Извлекаем последнюю часть номера после последнего разделителя
            last_num = int(last_number_str.split(separator)[-1])
            new_num = last_num + 1
        except (ValueError, IndexError):
            new_num = 1
    else:
        new_num = 1
    
    return f'{full_prefix}{new_num:0{digits}d}'


def generate_tkp_number(proposal_date: date) -> str:
    """
    Генерация номера ТКП.
    Формат: {порядковый_номер}_{дата_ДД.ММ.ГГ}
    Пример: 210_12.12.25, 211_15.01.26
    
    Args:
        proposal_date: Дата ТКП
    
    Returns:
        Сгенерированный номер ТКП
    """
    from django.conf import settings
    from django.apps import apps
    import re
    
    start_number = getattr(settings, 'COMMERCIAL_PROPOSAL_START_NUMBER', _DEFAULT_TKP_START_NUMBER)
    
    # Используем apps.get_model для избежания циклических зависимостей
    TechnicalProposal = apps.get_model('proposals', 'TechnicalProposal')
    
    # Ищем максимальный номер среди всех ТКП
    max_num = start_number - 1
    
    for tkp in TechnicalProposal.objects.exclude(number='').only('number'):
        match = re.match(r'^(\d+)_', tkp.number)
        if match:
            num = int(match.group(1))
            max_num = max(max_num, num)
    
    next_num = max_num + 1
    date_str = proposal_date.strftime('%d.%m.%y')
    return f"{next_num}_{date_str}"


def generate_mp_number(parent_tkp=None, proposal_date: Optional[date] = None) -> str:
    """
    Генерация номера МП.
    
    Если есть parent_tkp:
        Формат: {номер_ТКП}-{порядковый}
        Пример: 210_12.12.25-01, 210_12.12.25-02
    
    Если без parent_tkp:
        Формат: МП-{год}-{порядковый}
        Пример: МП-2025-001
    
    Args:
        parent_tkp: Родительское ТКП (опционально)
        proposal_date: Дата МП (по умолчанию сегодня)
    
    Returns:
        Сгенерированный номер МП
    """
    from django.apps import apps
    import re
    
    MountingProposal = apps.get_model('proposals', 'MountingProposal')
    
    if parent_tkp:
        # Находим максимальный номер МП для этого ТКП
        existing_mps = MountingProposal.objects.filter(
            parent_tkp=parent_tkp
        ).exclude(number='').only('number')
        
        max_mp_num = 0
        for mp in existing_mps:
            match = re.search(r'-(\d+)$', mp.number)
            if match:
                num = int(match.group(1))
                max_mp_num = max(max_mp_num, num)
        
        next_mp_num = max_mp_num + 1
        return f"{parent_tkp.number}-{next_mp_num:02d}"
    else:
        # Автономное МП
        proposal_date = proposal_date or date.today()
        return generate_sequential_number(
            MountingProposal,
            prefix='МП',
            year=proposal_date.year,
            digits=3
        )

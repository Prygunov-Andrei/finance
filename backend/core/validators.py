"""
Reusable validators for financial fields.
"""
from decimal import Decimal
from django.core.exceptions import ValidationError


def validate_positive_amount(value):
    """Reject negative amounts on financial fields."""
    if value is not None and value < 0:
        raise ValidationError('Сумма не может быть отрицательной.')


def validate_non_negative(value):
    """Allow zero, reject negatives."""
    if value is not None and value < Decimal('0'):
        raise ValidationError('Значение не может быть отрицательным.')


def validate_max_digits_18_2(value):
    """Ensure value fits in Decimal(18, 2) — max 9_999_999_999_999_999.99."""
    if value is None:
        return
    val = Decimal(str(value))
    if val.as_tuple().exponent < -2:
        raise ValidationError('Максимальная точность — 2 знака после запятой.')
    if abs(val) > Decimal('9999999999999999.99'):
        raise ValidationError('Слишком большое значение суммы.')

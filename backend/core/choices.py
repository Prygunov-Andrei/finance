"""
Централизованные choices для всего приложения.
Используйте эти классы вместо повторяющихся choices в моделях.
"""

from django.db import models


class CurrencyChoices(models.TextChoices):
    """Валюты"""
    RUB = 'RUB', 'Российский рубль'
    USD = 'USD', 'Доллар США'
    EUR = 'EUR', 'Евро'
    CNY = 'CNY', 'Китайский юань'


class UnitChoices(models.TextChoices):
    """Единицы измерения"""
    PIECE = 'шт', 'Штука'
    LINEAR_METER = 'м.п.', 'Метр погонный'
    SQUARE_METER = 'м²', 'Метр квадратный'
    CUBIC_METER = 'м³', 'Метр кубический'
    SET = 'компл', 'Комплект'
    UNIT = 'ед', 'Единица'
    HOUR = 'ч', 'Час'
    KILOGRAM = 'кг', 'Килограмм'
    TON = 'т', 'Тонна'
    POINT = 'точка', 'Точка'


class CounterpartyTypeChoices(models.TextChoices):
    """Типы контрагентов"""
    CUSTOMER = 'customer', 'Заказчик'
    VENDOR = 'vendor', 'Исполнитель/Поставщик'
    BOTH = 'both', 'Заказчик и Исполнитель'


class VatRateChoices(models.TextChoices):
    """Ставки НДС"""
    ZERO = '0', '0%'
    TEN = '10', '10%'
    TWENTY = '20', '20%'
    NO_VAT = 'no_vat', 'Без НДС'


class BaseStatusChoices(models.TextChoices):
    """Базовые статусы (черновик, активный и т.д.)"""
    DRAFT = 'draft', 'Черновик'
    ACTIVE = 'active', 'Активный'
    COMPLETED = 'completed', 'Завершён'
    CANCELLED = 'cancelled', 'Отменён'


class ContractStatusChoices(models.TextChoices):
    """Статусы договоров"""
    DRAFT = 'draft', 'Черновик'
    PLANNED = 'planned', 'Планируется'
    ACTIVE = 'active', 'Действующий'
    COMPLETED = 'completed', 'Завершён'
    SUSPENDED = 'suspended', 'Приостановлен'
    TERMINATED = 'terminated', 'Расторгнут'


class ContractTypeChoices(models.TextChoices):
    """Типы договоров"""
    INCOME = 'income', 'Доходный (Заказчик)'
    EXPENSE = 'expense', 'Расходный (Подрядчик)'


class PaymentStatusChoices(models.TextChoices):
    """Статусы платежей"""
    PENDING = 'pending', 'Ожидает'
    PAID = 'paid', 'Оплачен'
    CANCELLED = 'cancelled', 'Отменён'


class PaymentTypeChoices(models.TextChoices):
    """Типы платежей"""
    INCOME = 'income', 'Приход'
    EXPENSE = 'expense', 'Расход'


class FrameworkContractStatusChoices(models.TextChoices):
    """Статусы рамочных договоров"""
    DRAFT = 'draft', 'Черновик'
    ACTIVE = 'active', 'Действующий'
    EXPIRED = 'expired', 'Истёк срок'
    TERMINATED = 'terminated', 'Расторгнут'


class ObjectStatusChoices(models.TextChoices):
    """Статусы объектов строительства"""
    PLANNED = 'planned', 'Планируется'
    ACTIVE = 'active', 'Активный'
    COMPLETED = 'completed', 'Завершён'
    SUSPENDED = 'suspended', 'Приостановлен'


class EstimateStatusChoices(models.TextChoices):
    """Статусы смет"""
    DRAFT = 'draft', 'Черновик'
    IN_PROGRESS = 'in_progress', 'В работе'
    CHECKING = 'checking', 'На проверке'
    APPROVED = 'approved', 'Согласован'
    SENT = 'sent', 'Отправлен'
    AGREED = 'agreed', 'Согласован заказчиком'
    REJECTED = 'rejected', 'Отклонён'


class TKPStatusChoices(models.TextChoices):
    """Статусы ТКП"""
    DRAFT = 'draft', 'Черновик'
    IN_PROGRESS = 'in_progress', 'В работе'
    CHECKING = 'checking', 'На проверке'
    APPROVED = 'approved', 'Согласован'
    SENT = 'sent', 'Отправлен'


class MPStatusChoices(models.TextChoices):
    """Статусы МП"""
    DRAFT = 'draft', 'Черновик'
    PUBLISHED = 'published', 'Опубликован'
    SENT = 'sent', 'Отправлен'
    APPROVED = 'approved', 'Согласован'
    REJECTED = 'rejected', 'Отклонён'


class PriceListStatusChoices(models.TextChoices):
    """Статусы прайс-листов"""
    DRAFT = 'draft', 'Черновик'
    ACTIVE = 'active', 'Активный'
    ARCHIVED = 'archived', 'Архив'


class ActStatusChoices(models.TextChoices):
    """Статусы актов"""
    DRAFT = 'draft', 'Черновик'
    SENT = 'sent', 'Отправлен'
    SIGNED = 'signed', 'Подписан'
    REJECTED = 'rejected', 'Отклонён'


class CorrespondenceTypeChoices(models.TextChoices):
    """Типы корреспонденции"""
    INCOMING = 'incoming', 'Входящее'
    OUTGOING = 'outgoing', 'Исходящее'


class CorrespondenceCategoryChoices(models.TextChoices):
    """Категории корреспонденции"""
    NOTIFICATION = 'уведомление', 'Уведомление'
    CLAIM = 'претензия', 'Претензия'
    REQUEST = 'запрос', 'Запрос'
    RESPONSE = 'ответ', 'Ответ'
    OTHER = 'прочее', 'Прочее'


class CorrespondenceStatusChoices(models.TextChoices):
    """Статусы корреспонденции"""
    NEW = 'новое', 'Новое'
    IN_PROGRESS = 'в работе', 'В работе'
    ANSWERED = 'отвечено', 'Отвечено'
    CLOSED = 'закрыто', 'Закрыто'


class ProjectStageChoices(models.TextChoices):
    """Стадии проекта"""
    P = 'П', 'Проектная'
    RD = 'РД', 'Рабочая документация'


class PaymentRegistryStatusChoices(models.TextChoices):
    """Статусы реестра платежей"""
    PLANNED = 'planned', 'Запланирован'
    APPROVED = 'approved', 'Одобрен'
    PAID = 'paid', 'Оплачен'
    CANCELLED = 'cancelled', 'Отменён'

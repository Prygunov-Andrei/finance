"""
Сервисный слой для бизнес-логики.

Этот модуль содержит базовые классы и сервисы для инкапсуляции
сложной бизнес-логики, которая не должна находиться в моделях
или сериализаторах.

Использование:
    from core.services import VersioningService, EstimateService
    
    # Создание новой версии
    new_version = VersioningService.create_version(estimate, copy_relations=True)
    
    # Расчёт маржи
    margin = ContractService.calculate_margin(contract)
"""
from decimal import Decimal
from typing import TYPE_CHECKING, Optional, List, Dict, Any, Type
from django.db import models, transaction
from django.db.models import Sum, F
from django.db.models.functions import Coalesce

if TYPE_CHECKING:
    from estimates.models import Estimate, MountingEstimate
    from proposals.models import TechnicalProposal, MountingProposal
    from contracts.models import Contract
    from pricelists.models import PriceList, WorkItem


class VersioningService:
    """
    Сервис для создания версий объектов.
    
    Централизует логику версионирования, которая была дублирована
    в методах create_new_version() различных моделей.
    """
    
    @staticmethod
    @transaction.atomic
    def create_version(
        obj: models.Model,
        fields_to_copy: Optional[List[str]] = None,
        exclude_fields: Optional[List[str]] = None,
        update_fields: Optional[Dict[str, Any]] = None
    ) -> models.Model:
        """
        Создаёт новую версию объекта.
        
        Args:
            obj: Объект для версионирования
            fields_to_copy: Список полей для копирования (если None - все поля)
            exclude_fields: Поля, которые не нужно копировать
            update_fields: Словарь с полями, которые нужно изменить в новой версии
        
        Returns:
            Новая версия объекта
        """
        # Стандартные поля для исключения
        default_exclude = {'id', 'pk', 'created_at', 'updated_at', 'parent_version'}
        exclude_set = default_exclude | set(exclude_fields or [])
        
        # Помечаем текущую версию как неактуальную
        if hasattr(obj, 'is_current'):
            obj.is_current = False
            obj.save(update_fields=['is_current'])
        
        # Определяем номер новой версии
        if hasattr(obj, 'get_next_version_number'):
            new_version_number = obj.get_next_version_number()
        elif hasattr(obj, 'version_number'):
            new_version_number = obj.version_number + 1
        else:
            new_version_number = 1
        
        # Собираем данные для новой версии
        new_data = {}
        model_class = obj.__class__
        
        for field in model_class._meta.get_fields():
            # Пропускаем связи ManyToMany, обратные связи и исключённые поля
            if field.many_to_many or field.one_to_many or field.name in exclude_set:
                continue
            
            # Пропускаем auto_now и auto_now_add поля
            if getattr(field, 'auto_now', False) or getattr(field, 'auto_now_add', False):
                continue
            
            # Проверяем список полей для копирования
            if fields_to_copy and field.name not in fields_to_copy:
                continue
            
            # Получаем значение поля
            if hasattr(field, 'attname'):
                field_name = field.attname if hasattr(field, 'remote_field') and field.remote_field else field.name
                if hasattr(obj, field_name):
                    new_data[field.name] = getattr(obj, field_name)
        
        # Добавляем версионные поля
        new_data['parent_version'] = obj
        new_data['version_number'] = new_version_number
        new_data['is_current'] = True
        
        # Применяем обновления
        if update_fields:
            new_data.update(update_fields)
        
        # Создаём новый объект
        new_obj = model_class.objects.create(**new_data)
        
        return new_obj
    
    @staticmethod
    def copy_related_objects(
        source: models.Model,
        target: models.Model,
        relation_name: str,
        fk_field: str
    ) -> List[models.Model]:
        """
        Копирует связанные объекты из source в target через bulk_create.
        
        Args:
            source: Исходный объект
            target: Целевой объект
            relation_name: Имя связи (related_name)
            fk_field: Имя FK поля в связанной модели
        
        Returns:
            Список созданных копий
        """
        related_manager = getattr(source, relation_name, None)
        
        if related_manager is None:
            return []
        
        # Получаем все связанные объекты
        related_objects = list(related_manager.all())
        if not related_objects:
            return []
        
        # Подготавливаем копии для bulk_create
        copies = []
        for related_obj in related_objects:
            related_obj.pk = None
            setattr(related_obj, fk_field, target)
            copies.append(related_obj)
        
        # Получаем модель и создаём через bulk_create
        model_class = type(related_objects[0])
        model_class.objects.bulk_create(copies)
        
        return copies


class ContractService:
    """Сервис для работы с договорами"""
    
    @staticmethod
    def calculate_margin(contract: 'Contract') -> Dict[str, Decimal]:
        """
        Вычисляет маржу договора оптимизированным способом.
        
        Использует агрегацию на уровне БД вместо итерации по объектам.
        
        Returns:
            {
                'revenue': Decimal,      # Сумма договора
                'expenses': Decimal,     # Сумма расходов
                'margin': Decimal,       # Маржа в рублях
                'margin_percent': Decimal # Маржа в процентах
            }
        """
        from payments.models import Payment
        
        revenue = contract.amount or Decimal('0')
        
        # Агрегируем расходы одним запросом
        expenses = Payment.objects.filter(
            contract=contract,
            payment_type=Payment.PaymentType.EXPENSE,
            status__in=[Payment.Status.PAID, Payment.Status.SCHEDULED]
        ).aggregate(
            total=Coalesce(Sum('amount'), Decimal('0'))
        )['total']
        
        margin = revenue - expenses
        margin_percent = (margin / revenue * 100) if revenue else Decimal('0')
        
        return {
            'revenue': revenue,
            'expenses': expenses,
            'margin': margin,
            'margin_percent': margin_percent.quantize(Decimal('0.01'))
        }
    
    @staticmethod
    def get_payment_stats(contract: 'Contract') -> Dict[str, Decimal]:
        """
        Возвращает статистику платежей по договору.
        
        Uses database aggregation for performance.
        """
        from payments.models import Payment
        from django.db.models import Q
        
        stats = Payment.objects.filter(contract=contract).aggregate(
            total_income=Coalesce(
                Sum('amount', filter=Q(payment_type=Payment.PaymentType.INCOME, status=Payment.Status.PAID)),
                Decimal('0')
            ),
            total_expense=Coalesce(
                Sum('amount', filter=Q(payment_type=Payment.PaymentType.EXPENSE, status=Payment.Status.PAID)),
                Decimal('0')
            ),
            pending_income=Coalesce(
                Sum('amount', filter=Q(payment_type=Payment.PaymentType.INCOME, status=Payment.Status.SCHEDULED)),
                Decimal('0')
            ),
            pending_expense=Coalesce(
                Sum('amount', filter=Q(payment_type=Payment.PaymentType.EXPENSE, status=Payment.Status.SCHEDULED)),
                Decimal('0')
            )
        )
        
        return stats


class EstimateService:
    """Сервис для работы со сметами"""
    
    @staticmethod
    def calculate_totals(estimate: 'Estimate') -> Dict[str, Decimal]:
        """
        Вычисляет итоговые суммы по смете через агрегацию.
        
        Returns:
            {
                'materials_purchase': Decimal,
                'materials_sale': Decimal,
                'works_purchase': Decimal,
                'works_sale': Decimal,
                'total_purchase': Decimal,
                'total_sale': Decimal,
                'profit': Decimal,
                'profit_percent': Decimal
            }
        """
        from estimates.models import EstimateSubsection
        
        # Агрегируем данные по подразделам одним запросом
        totals = EstimateSubsection.objects.filter(
            section__estimate=estimate
        ).aggregate(
            materials_purchase=Coalesce(Sum('materials_purchase_total'), Decimal('0')),
            materials_sale=Coalesce(Sum('materials_sale_total'), Decimal('0')),
            works_purchase=Coalesce(Sum('works_purchase_total'), Decimal('0')),
            works_sale=Coalesce(Sum('works_sale_total'), Decimal('0')),
        )
        
        totals['total_purchase'] = totals['materials_purchase'] + totals['works_purchase']
        totals['total_sale'] = totals['materials_sale'] + totals['works_sale']
        totals['profit'] = totals['total_sale'] - totals['total_purchase']
        
        if totals['total_sale']:
            totals['profit_percent'] = (
                totals['profit'] / totals['total_sale'] * 100
            ).quantize(Decimal('0.01'))
        else:
            totals['profit_percent'] = Decimal('0')
        
        return totals


class PriceListService:
    """Сервис для работы с прайс-листами"""
    
    @staticmethod
    def calculate_total_cost(price_list: 'PriceList') -> Decimal:
        """
        Вычисляет общую стоимость прайс-листа через агрегацию.
        
        Оптимизированная версия, заменяющая N+1 запросы.
        """
        from pricelists.models import PriceListItem
        
        # Получаем позиции с предзагруженными работами
        items = PriceListItem.objects.filter(
            price_list=price_list,
            is_included=True
        ).select_related('work_item', 'work_item__grade')
        
        total = Decimal('0')
        for item in items:
            # Используем переопределённые значения или значения из работы
            hours = item.custom_hours or item.work_item.hours
            coefficient = item.custom_coefficient or item.work_item.coefficient
            
            # Получаем ставку для разряда
            grade_num = item.work_item.grade.grade_number if item.work_item.grade else 1
            rate = price_list.get_rate_for_grade(grade_num)
            
            cost = hours * coefficient * rate
            total += cost
        
        return total

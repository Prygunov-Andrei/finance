"""
Утилиты для расчёта cash-flow
"""
from decimal import Decimal
from datetime import date
from typing import Optional, Dict, List
from django.db.models import Sum, Q, DecimalField
from django.db.models.functions import Coalesce
from payments.models import Payment


class CashFlowCalculator:
    """Калькулятор cash-flow для объектов и договоров"""
    
    @staticmethod
    def calculate(
        object_id: Optional[int] = None,
        contract_id: Optional[int] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> Dict[str, Decimal]:
        """
        Рассчитывает cash-flow за период
        
        Args:
            object_id: ID объекта (опционально)
            contract_id: ID договора (опционально)
            start_date: Начало периода (опционально)
            end_date: Конец периода (опционально)
        
        Returns:
            Dict с ключами: income, expense, cash_flow
        
        Note:
            Если указаны и object_id и contract_id, используется contract_id
        """
        # Базовый фильтр
        base_filter = Q()
        
        if contract_id:
            base_filter &= Q(contract_id=contract_id)
        elif object_id:
            from contracts.models import Contract
            contract_ids = Contract.objects.filter(object_id=object_id).values_list('id', flat=True)
            base_filter &= Q(contract_id__in=contract_ids)
        
        # Фильтр по дате
        if start_date:
            base_filter &= Q(payment_date__gte=start_date)
        if end_date:
            base_filter &= Q(payment_date__lte=end_date)
        
        # Оптимизированный запрос: один запрос вместо двух
        result = Payment.objects.filter(base_filter).aggregate(
            income=Coalesce(
                Sum('amount', filter=Q(payment_type=Payment.PaymentType.INCOME)),
                Decimal('0'),
                output_field=DecimalField()
            ),
            expense=Coalesce(
                Sum('amount', filter=Q(payment_type=Payment.PaymentType.EXPENSE)),
                Decimal('0'),
                output_field=DecimalField()
            )
        )
        
        income = result['income'] or Decimal('0')
        expense = result['expense'] or Decimal('0')
        cash_flow = income - expense
        
        return {
            'income': income,
            'expense': expense,
            'cash_flow': cash_flow,
        }
    
    @staticmethod
    def calculate_for_object(
        object_id: int,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> Dict[str, Decimal]:
        """
        Рассчитывает cash-flow для объекта за период
        
        Args:
            object_id: ID объекта
            start_date: Начало периода (опционально)
            end_date: Конец периода (опционально)
        
        Returns:
            Dict с ключами: income, expense, cash_flow
        """
        return CashFlowCalculator.calculate(
            object_id=object_id,
            start_date=start_date,
            end_date=end_date
        )
    
    @staticmethod
    def calculate_for_contract(
        contract_id: int,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> Dict[str, Decimal]:
        """
        Рассчитывает cash-flow для договора за период
        
        Args:
            contract_id: ID договора
            start_date: Начало периода (опционально)
            end_date: Конец периода (опционально)
        
        Returns:
            Dict с ключами: income, expense, cash_flow
        """
        return CashFlowCalculator.calculate(
            contract_id=contract_id,
            start_date=start_date,
            end_date=end_date
        )
    
    @staticmethod
    def calculate_for_all_objects(
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> Dict[str, Decimal]:
        """
        Рассчитывает cash-flow для всех объектов (по всей компании)
        
        Args:
            start_date: Начало периода (опционально)
            end_date: Конец периода (опционально)
        
        Returns:
            Dict с ключами: income, expense, cash_flow
        """
        return CashFlowCalculator.calculate(
            start_date=start_date,
            end_date=end_date
        )
    
    @staticmethod
    def calculate_by_periods(
        object_id: Optional[int] = None,
        contract_id: Optional[int] = None,
        period_type: str = 'month',
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> List[Dict[str, any]]:
        """
        Рассчитывает cash-flow с разбивкой по периодам
        
        Args:
            object_id: ID объекта (опционально)
            contract_id: ID договора (опционально)
            period_type: Тип периода ('month', 'week', 'day')
            start_date: Начало периода (опционально)
            end_date: Конец периода (опционально)
        
        Returns:
            List[Dict] с данными по каждому периоду
        
        Note:
            Если указаны и object_id и contract_id, используется contract_id
        """
        from django.db.models.functions import TruncMonth, TruncWeek, TruncDay
        from django.db.models import Count
        
        # Базовый фильтр
        base_filter = Q()
        
        if contract_id:
            base_filter &= Q(contract_id=contract_id)
        elif object_id:
            from contracts.models import Contract
            contract_ids = Contract.objects.filter(object_id=object_id).values_list('id', flat=True)
            base_filter &= Q(contract_id__in=contract_ids)
        
        if start_date:
            base_filter &= Q(payment_date__gte=start_date)
        if end_date:
            base_filter &= Q(payment_date__lte=end_date)
        
        # Выбор функции для группировки
        if period_type == 'month':
            trunc_func = TruncMonth('payment_date')
        elif period_type == 'week':
            trunc_func = TruncWeek('payment_date')
        elif period_type == 'day':
            trunc_func = TruncDay('payment_date')
        else:
            raise ValueError(f"Неизвестный тип периода: {period_type}")
        
        # Оптимизированная группировка по периодам: один запрос вместо нескольких
        periods = Payment.objects.filter(base_filter).annotate(
            period=trunc_func
        ).values('period').annotate(
            income=Coalesce(
                Sum('amount', filter=Q(payment_type=Payment.PaymentType.INCOME)),
                Decimal('0'),
                output_field=DecimalField()
            ),
            expense=Coalesce(
                Sum('amount', filter=Q(payment_type=Payment.PaymentType.EXPENSE)),
                Decimal('0'),
                output_field=DecimalField()
            ),
            count=Count('id')
        ).order_by('period')
        
        # Вычисляем cash-flow для каждого периода
        result = []
        for period_data in periods:
            period_date = period_data['period']
            income = period_data['income'] or Decimal('0')
            expense = period_data['expense'] or Decimal('0')
            cash_flow = income - expense
            
            result.append({
                'period': period_date,
                'income': income,
                'expense': expense,
                'cash_flow': cash_flow,
                'count': period_data['count'],
            })
        
        return result


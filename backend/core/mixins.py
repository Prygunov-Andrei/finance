"""
Миксины для ViewSets
"""
from rest_framework.decorators import action
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema
from core.cashflow import CashFlowCalculator
from core.utils import (
    parse_date_param,
    validate_date_range,
    format_decimal_for_response,
    format_date_for_response
)


class CashFlowMixin:
    """
    Миксин для добавления cash-flow методов в ViewSets
    
    Требует, чтобы класс имел метод get_object() и атрибут с объектом
    (например, self.get_object() возвращает Object или Contract)
    """
    
    def get_cash_flow_params(self):
        """
        Возвращает параметры для расчёта cash-flow
        
        Должен быть переопределён в дочерних классах для указания:
        - entity_id: ID сущности (object_id или contract_id)
        - entity_name: Название сущности для ответа
        - entity_id_key: Ключ для ID в ответе (например, 'object_id' или 'contract_id')
        
        Returns:
            dict с ключами: entity_id, entity_name, entity_id_key
        """
        raise NotImplementedError("Метод get_cash_flow_params должен быть переопределён")
    
    @extend_schema(
        summary='Cash-flow',
        description='Рассчитать cash-flow (поступления - расходы) за указанный период',
        parameters=[
            {
                'name': 'start_date',
                'in': 'query',
                'description': 'Начало периода (формат: YYYY-MM-DD)',
                'required': False,
                'schema': {'type': 'string', 'format': 'date'},
            },
            {
                'name': 'end_date',
                'in': 'query',
                'description': 'Конец периода (формат: YYYY-MM-DD)',
                'required': False,
                'schema': {'type': 'string', 'format': 'date'},
            },
        ],
    )
    @action(detail=True, methods=['get'])
    def cash_flow(self, request, pk=None):
        """Получить cash-flow за период"""
        entity = self.get_object()
        params = self.get_cash_flow_params()
        
        # Парсим и валидируем даты
        start_date = parse_date_param(
            request.query_params.get('start_date'),
            'start_date'
        )
        end_date = parse_date_param(
            request.query_params.get('end_date'),
            'end_date'
        )
        validate_date_range(start_date, end_date)
        
        # Рассчитываем cash-flow
        calc_params = {
            'start_date': start_date,
            'end_date': end_date
        }
        calc_params[params['entity_id_key']] = params['entity_id']
        
        result = CashFlowCalculator.calculate(**calc_params)
        
        # Формируем ответ
        response_data = {
            params['entity_id_key']: params['entity_id'],
            params['entity_name_key']: params['entity_name'],
            'start_date': format_date_for_response(start_date),
            'end_date': format_date_for_response(end_date),
            **{k: format_decimal_for_response(v) for k, v in result.items()}
        }
        
        return Response(response_data)
    
    @extend_schema(
        summary='Cash-flow по периодам',
        description='Получить cash-flow с разбивкой по периодам (месяц/неделя/день)',
        parameters=[
            {
                'name': 'period_type',
                'in': 'query',
                'description': 'Тип периода: month, week или day',
                'required': False,
                'schema': {'type': 'string', 'enum': ['month', 'week', 'day'], 'default': 'month'},
            },
            {
                'name': 'start_date',
                'in': 'query',
                'description': 'Начало периода (формат: YYYY-MM-DD)',
                'required': False,
                'schema': {'type': 'string', 'format': 'date'},
            },
            {
                'name': 'end_date',
                'in': 'query',
                'description': 'Конец периода (формат: YYYY-MM-DD)',
                'required': False,
                'schema': {'type': 'string', 'format': 'date'},
            },
        ],
    )
    @action(detail=True, methods=['get'])
    def cash_flow_periods(self, request, pk=None):
        """Получить cash-flow с разбивкой по периодам"""
        entity = self.get_object()
        params = self.get_cash_flow_params()
        
        period_type = request.query_params.get('period_type', 'month')
        if period_type not in ['month', 'week', 'day']:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({
                'period_type': 'Тип периода должен быть: month, week или day'
            })
        
        # Парсим и валидируем даты
        start_date = parse_date_param(
            request.query_params.get('start_date'),
            'start_date'
        )
        end_date = parse_date_param(
            request.query_params.get('end_date'),
            'end_date'
        )
        validate_date_range(start_date, end_date)
        
        # Рассчитываем cash-flow по периодам
        calc_params = {
            'period_type': period_type,
            'start_date': start_date,
            'end_date': end_date
        }
        calc_params[params['entity_id_key']] = params['entity_id']
        
        periods = CashFlowCalculator.calculate_by_periods(**calc_params)
        
        # Преобразуем Decimal и date в строки для JSON
        result = []
        for period in periods:
            result.append({
                'period': format_date_for_response(period['period']),
                'income': format_decimal_for_response(period['income']),
                'expense': format_decimal_for_response(period['expense']),
                'cash_flow': format_decimal_for_response(period['cash_flow']),
                'count': period['count'],
            })
        
        # Формируем ответ
        response_data = {
            params['entity_id_key']: params['entity_id'],
            params['entity_name_key']: params['entity_name'],
            'period_type': period_type,
            'start_date': format_date_for_response(start_date),
            'end_date': format_date_for_response(end_date),
            'periods': result
        }
        
        return Response(response_data)


"""
Миксины для ViewSets для устранения дублирования кода.
"""

from datetime import datetime
from django.db.models import Count
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from core.cashflow import CashFlowCalculator


class CashFlowMixin:
    """
    Миксин для добавления cash-flow функциональности к ViewSet.
    
    Требует реализации метода get_cash_flow_params() в ViewSet:
        def get_cash_flow_params(self):
            return {
                'entity_id': obj.id,
                'entity_name': obj.name,
                'entity_id_key': 'object_id',  # или 'contract_id'
                'entity_name_key': 'object_name',  # или 'contract_name'
            }
    """
    
    def get_cash_flow_params(self):
        """Переопределите в ViewSet для возврата параметров"""
        raise NotImplementedError("ViewSet должен реализовать get_cash_flow_params()")
    
    def _parse_date(self, date_str):
        """Парсит строку даты в объект date"""
        if not date_str:
            return None
        try:
            return datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            return None
    
    @action(detail=True, methods=['get'], url_path='cash-flow')
    def cash_flow(self, request, pk=None):
        """
        Рассчитать cash-flow для сущности.
        
        Query params:
            start_date: Начало периода (YYYY-MM-DD)
            end_date: Конец периода (YYYY-MM-DD)
        """
        params = self.get_cash_flow_params()
        
        start_date = self._parse_date(request.query_params.get('start_date'))
        end_date = self._parse_date(request.query_params.get('end_date'))
        
        # Определяем какой калькулятор использовать
        if params['entity_id_key'] == 'object_id':
            result = CashFlowCalculator.calculate_for_object(
                object_id=params['entity_id'],
                start_date=start_date,
                end_date=end_date
            )
        else:
            result = CashFlowCalculator.calculate_for_contract(
                contract_id=params['entity_id'],
                start_date=start_date,
                end_date=end_date
            )
        
        return Response({
            params['entity_name_key']: params['entity_name'],
            'start_date': start_date,
            'end_date': end_date,
            'income': result['income'],
            'expense': result['expense'],
            'cash_flow': result['cash_flow'],
        })
    
    @action(detail=True, methods=['get'], url_path='cash-flow-periods')
    def cash_flow_periods(self, request, pk=None):
        """
        Получить cash-flow с разбивкой по периодам.
        
        Query params:
            period_type: Тип периода (month/week/day), default: month
            start_date: Начало периода (YYYY-MM-DD)
            end_date: Конец периода (YYYY-MM-DD)
        """
        params = self.get_cash_flow_params()
        
        period_type = request.query_params.get('period_type', 'month')
        start_date = self._parse_date(request.query_params.get('start_date'))
        end_date = self._parse_date(request.query_params.get('end_date'))
        
        # Валидация period_type
        if period_type not in ('month', 'week', 'day'):
            return Response(
                {'error': 'period_type должен быть: month, week или day'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Определяем параметры для калькулятора
        if params['entity_id_key'] == 'object_id':
            result = CashFlowCalculator.calculate_by_periods(
                object_id=params['entity_id'],
                period_type=period_type,
                start_date=start_date,
                end_date=end_date
            )
        else:
            result = CashFlowCalculator.calculate_by_periods(
                contract_id=params['entity_id'],
                period_type=period_type,
                start_date=start_date,
                end_date=end_date
            )
        
        return Response({
            params['entity_name_key']: params['entity_name'],
            'period_type': period_type,
            'start_date': start_date,
            'end_date': end_date,
            'periods': result,
        })


class ListDetailSerializerMixin:
    """
    Миксин для выбора разных сериализаторов для списка и детального представления.
    
    Использование:
        class MyViewSet(ListDetailSerializerMixin, viewsets.ModelViewSet):
            serializer_class = MyDetailSerializer
            list_serializer_class = MyListSerializer
    """
    list_serializer_class = None

    def get_serializer_class(self):
        if self.action == 'list' and self.list_serializer_class:
            return self.list_serializer_class
        return super().get_serializer_class()


class AutoCreatedByMixin:
    """
    Миксин для автоматической установки created_by из request.user.
    
    Использование:
        class MyViewSet(AutoCreatedByMixin, viewsets.ModelViewSet):
            created_by_field = 'created_by'  # по умолчанию
    """
    created_by_field = 'created_by'

    def perform_create(self, serializer):
        serializer.save(**{self.created_by_field: self.request.user})


class AnnotateCountMixin:
    """
    Миксин для добавления аннотаций Count к queryset.
    
    Использование:
        class MyViewSet(AnnotateCountMixin, viewsets.ModelViewSet):
            annotate_fields = {
                'items_count': 'items',
                'children_count': 'children',
            }
    """
    annotate_fields: dict = {}
    annotate_actions = ['list', 'retrieve']

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action in self.annotate_actions and self.annotate_fields:
            annotations = {
                field_name: Count(related_field)
                for field_name, related_field in self.annotate_fields.items()
            }
            queryset = queryset.annotate(**annotations)
        return queryset


class CurrentVersionFilterMixin:
    """
    Миксин для фильтрации по is_current для версионированных моделей.
    По умолчанию показывает только актуальные версии.
    
    Использование:
        class MyViewSet(CurrentVersionFilterMixin, viewsets.ModelViewSet):
            default_filter_current = True
    """
    default_filter_current = True
    current_field = 'is_current'

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.default_filter_current and self.current_field not in self.request.query_params:
            queryset = queryset.filter(**{self.current_field: True})
        return queryset


class BulkActionMixin:
    """
    Миксин для массовых действий (bulk_delete, bulk_update).
    
    Использование:
        class MyViewSet(BulkActionMixin, viewsets.ModelViewSet):
            pass
        
        # POST /api/my-model/bulk_delete/
        # {"ids": [1, 2, 3]}
    """

    def bulk_delete(self, request):
        """Массовое удаление объектов"""
        ids = request.data.get('ids', [])
        if not ids:
            return Response(
                {'error': 'Не указаны ID для удаления'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        queryset = self.get_queryset().filter(pk__in=ids)
        deleted_count = queryset.count()
        queryset.delete()
        
        return Response({
            'deleted_count': deleted_count,
            'message': f'Удалено объектов: {deleted_count}'
        })


class SoftDeleteMixin:
    """
    Миксин для мягкого удаления (установка is_active=False вместо удаления).
    
    Использование:
        class MyViewSet(SoftDeleteMixin, viewsets.ModelViewSet):
            soft_delete_field = 'is_active'
    """
    soft_delete_field = 'is_active'

    def perform_destroy(self, instance):
        setattr(instance, self.soft_delete_field, False)
        instance.save(update_fields=[self.soft_delete_field])


class TreeBuildMixin:
    """
    Миксин для построения древовидной структуры.
    
    Использование:
        class MyViewSet(TreeBuildMixin, viewsets.ModelViewSet):
            tree_fields = ['id', 'name', 'parent_id']
            tree_order_by = ['order', 'name']
            tree_parent_field = 'parent_id'
    """
    tree_fields = ['id', 'name', 'parent_id']
    tree_order_by = ['order', 'name']
    tree_parent_field = 'parent_id'
    tree_filter = {'is_active': True}

    def build_tree(self, items, parent_id=None):
        """Рекурсивно строит дерево из плоского списка"""
        from collections import defaultdict
        
        items_by_parent = defaultdict(list)
        for item in items:
            items_by_parent[item.get(self.tree_parent_field)].append(item)
        
        def _build(pid):
            result = []
            for item in items_by_parent.get(pid, []):
                node = {k: v for k, v in item.items() if k != self.tree_parent_field}
                node['children'] = _build(item['id'])
                result.append(node)
            return result
        
        return _build(parent_id)

    def get_tree_queryset(self):
        """Получает queryset для построения дерева"""
        return self.get_queryset().filter(**self.tree_filter).order_by(*self.tree_order_by)


# ============================================
# Миксины для моделей
# ============================================

class DateRangeValidationMixin:
    """
    Миксин для валидации диапазона дат в моделях.
    
    Использование:
        class MyModel(DateRangeValidationMixin, models.Model):
            start_date_field = 'start_date'
            end_date_field = 'end_date'
    """
    start_date_field = 'start_date'
    end_date_field = 'end_date'

    def clean(self):
        from django.core.exceptions import ValidationError
        super().clean()
        
        start = getattr(self, self.start_date_field, None)
        end = getattr(self, self.end_date_field, None)
        
        if start and end and start > end:
            raise ValidationError({
                self.end_date_field: 'Дата окончания не может быть раньше даты начала.'
            })


class TimestampMixin:
    """
    Миксин для добавления полей created_at и updated_at.
    Используйте как абстрактную модель.
    """
    # Используется как абстрактная модель в Django
    pass

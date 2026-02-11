import logging

from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Prefetch

from .models import Employee, PositionRecord, SalaryHistory
from .serializers import (
    EmployeeListSerializer,
    EmployeeDetailSerializer,
    PositionRecordSerializer,
    SalaryHistorySerializer,
)

logger = logging.getLogger(__name__)


class EmployeeViewSet(viewsets.ModelViewSet):
    """CRUD для сотрудников + вложенные действия."""

    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None  # Отключаем пагинацию — сотрудников обычно немного

    def get_queryset(self):
        qs = Employee.objects.prefetch_related(
            'supervisors',
            'subordinates',
            Prefetch(
                'positions',
                queryset=PositionRecord.objects.select_related('legal_entity').order_by('-start_date'),
            ),
            Prefetch(
                'salary_history',
                queryset=SalaryHistory.objects.order_by('-effective_date'),
            ),
        ).select_related('user', 'counterparty')

        # Фильтр по ЮЛ
        legal_entity_id = self.request.query_params.get('legal_entity')
        if legal_entity_id:
            qs = qs.filter(
                positions__legal_entity_id=legal_entity_id,
                positions__is_current=True,
            ).distinct()

        # Фильтр по статусу
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == 'true')

        # Поиск по ФИО
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(full_name__icontains=search)

        return qs

    def get_serializer_class(self):
        if self.action == 'list':
            return EmployeeListSerializer
        return EmployeeDetailSerializer

    # ---------- Вложенные: должности ----------
    @action(detail=True, methods=['get', 'post'], url_path='positions')
    def positions(self, request, pk=None):
        employee = self.get_object()

        if request.method == 'GET':
            records = employee.positions.select_related('legal_entity').order_by('-start_date')
            serializer = PositionRecordSerializer(records, many=True)
            return Response(serializer.data)

        # POST — создание новой записи
        data = request.data.copy()
        data['employee'] = employee.pk
        serializer = PositionRecordSerializer(data=data)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        # Обновляем денормализованное поле
        current = employee.positions.filter(is_current=True).first()
        if current:
            employee.current_position = current.position_title
            employee.save(update_fields=['current_position'])

        return Response(serializer.data, status=status.HTTP_201_CREATED)

    # ---------- Вложенные: история оклада ----------
    @action(detail=True, methods=['get', 'post'], url_path='salary-history')
    def salary_history_action(self, request, pk=None):
        employee = self.get_object()

        if request.method == 'GET':
            records = employee.salary_history.order_by('-effective_date')
            serializer = SalaryHistorySerializer(records, many=True)
            return Response(serializer.data)

        # POST — создание новой записи
        data = request.data.copy()
        data['employee'] = employee.pk
        serializer = SalaryHistorySerializer(data=data)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        # Обновляем денормализованные поля
        employee.salary_full = serializer.validated_data['salary_full']
        employee.salary_official = serializer.validated_data['salary_official']
        employee.save(update_fields=['salary_full', 'salary_official'])

        return Response(serializer.data, status=status.HTTP_201_CREATED)

    # ---------- Создание контрагента из сотрудника ----------
    @action(detail=True, methods=['post'], url_path='create-counterparty')
    def create_counterparty(self, request, pk=None):
        from accounting.models import Counterparty

        employee = self.get_object()

        if employee.counterparty:
            return Response(
                {'error': 'У сотрудника уже есть привязанный контрагент.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        counterparty = Counterparty.objects.create(
            name=employee.full_name,
            short_name=employee.full_name,
            type='employee',
            legal_form='fiz',
            inn='',
        )
        employee.counterparty = counterparty
        employee.save(update_fields=['counterparty'])

        return Response(
            {
                'id': counterparty.id,
                'name': counterparty.name,
                'message': 'Контрагент создан и привязан к сотруднику.',
            },
            status=status.HTTP_201_CREATED,
        )


class OrgChartView(viewsets.ViewSet):
    """Данные для визуализации оргструктуры."""

    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def list(self, request):
        employees = Employee.objects.filter(is_active=True).prefetch_related(
            'supervisors',
            Prefetch(
                'positions',
                queryset=PositionRecord.objects.filter(is_current=True).select_related('legal_entity'),
            ),
        )

        # Фильтр по ЮЛ
        legal_entity_id = request.query_params.get('legal_entity')
        if legal_entity_id:
            employees = employees.filter(
                positions__legal_entity_id=legal_entity_id,
                positions__is_current=True,
            ).distinct()

        nodes = []
        edges = []
        employee_ids = set()

        for emp in employees:
            employee_ids.add(emp.id)
            current_positions = emp.positions.all()
            nodes.append({
                'id': emp.id,
                'full_name': emp.full_name,
                'current_position': emp.current_position,
                'is_active': emp.is_active,
                'legal_entities': [
                    {
                        'id': p.legal_entity.id,
                        'short_name': p.legal_entity.short_name,
                        'position_title': p.position_title,
                    }
                    for p in current_positions
                ],
            })

        # Собираем рёбра (только между видимыми сотрудниками)
        for emp in employees:
            for supervisor in emp.supervisors.all():
                if supervisor.id in employee_ids:
                    edges.append({
                        'source': supervisor.id,
                        'target': emp.id,
                    })

        return Response({'nodes': nodes, 'edges': edges})


class PositionRecordViewSet(viewsets.ModelViewSet):
    """CRUD для записей о должностях (для прямого доступа)."""

    serializer_class = PositionRecordSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        return PositionRecord.objects.select_related(
            'employee', 'legal_entity'
        ).order_by('-start_date')


class SalaryHistoryViewSet(viewsets.ModelViewSet):
    """CRUD для записей об окладах (для прямого доступа)."""

    serializer_class = SalaryHistorySerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        return SalaryHistory.objects.select_related('employee').order_by('-effective_date')

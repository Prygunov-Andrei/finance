import logging

from django.contrib.auth.models import User
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Prefetch

from .models import Employee, PositionRecord, SalaryHistory
from .permissions import ERPSectionPermission
from .serializers import (
    EmployeeListSerializer,
    EmployeeDetailSerializer,
    EmployeeCreateUserSerializer,
    EmployeeSetPasswordSerializer,
    PositionRecordSerializer,
    SalaryHistorySerializer,
)
from .services import (
    create_position_record,
    create_salary_record,
    create_counterparty_for_employee,
    build_org_chart,
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

        create_position_record(employee, serializer.validated_data, serializer.save)

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

        create_salary_record(employee, serializer.validated_data, serializer.save)

        return Response(serializer.data, status=status.HTTP_201_CREATED)

    # ---------- Создание учётной записи (User) для сотрудника ----------
    @action(
        detail=True,
        methods=['post'],
        url_path='create-user',
        permission_classes=[permissions.IsAuthenticated, ERPSectionPermission],
    )
    def create_user(self, request, pk=None):
        employee = self.get_object()
        if employee.user_id:
            return Response(
                {'detail': 'К сотруднику уже привязана учётная запись'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = EmployeeCreateUserSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.create(username=serializer.validated_data['username'])
        user.set_unusable_password()
        user.save()
        employee.user = user
        employee.save(update_fields=['user'])
        return Response(
            {'id': user.id, 'username': user.username},
            status=status.HTTP_201_CREATED,
        )

    # ---------- Установка пароля для User сотрудника ----------
    @action(
        detail=True,
        methods=['post'],
        url_path='set-password',
        permission_classes=[permissions.IsAuthenticated, ERPSectionPermission],
    )
    def set_password(self, request, pk=None):
        employee = self.get_object()
        if not employee.user_id:
            return Response(
                {'detail': 'К сотруднику не привязана учётная запись'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = EmployeeSetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = employee.user
        user.set_password(serializer.validated_data['new_password'])
        user.save(update_fields=['password'])
        return Response({'status': 'password_set'})

    # ---------- Создание контрагента из сотрудника ----------
    @action(detail=True, methods=['post'], url_path='create-counterparty')
    def create_counterparty(self, request, pk=None):
        employee = self.get_object()

        try:
            counterparty = create_counterparty_for_employee(employee)
        except ValueError as exc:
            return Response(
                {'error': str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

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

        return Response(build_org_chart(employees))


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

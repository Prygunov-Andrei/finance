from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Employee, PositionRecord, SalaryHistory, ERP_SECTIONS, PERMISSION_LEVELS


class PositionRecordSerializer(serializers.ModelSerializer):
    legal_entity_name = serializers.CharField(
        source='legal_entity.short_name', read_only=True
    )

    class Meta:
        model = PositionRecord
        fields = [
            'id', 'employee', 'legal_entity', 'legal_entity_name',
            'position_title', 'start_date', 'end_date',
            'is_current', 'order_number', 'notes',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class SalaryHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = SalaryHistory
        fields = [
            'id', 'employee', 'salary_full', 'salary_official',
            'effective_date', 'reason',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class SupervisorBriefSerializer(serializers.ModelSerializer):
    """Краткий сериализатор для отображения руководителей/подчинённых."""

    class Meta:
        model = Employee
        fields = ['id', 'full_name', 'current_position']


class EmployeeListSerializer(serializers.ModelSerializer):
    """Компактный сериализатор для списка сотрудников."""

    current_legal_entities = serializers.SerializerMethodField()
    supervisors_brief = SupervisorBriefSerializer(
        source='supervisors', many=True, read_only=True
    )

    class Meta:
        model = Employee
        fields = [
            'id', 'full_name', 'date_of_birth', 'gender',
            'current_position', 'hire_date',
            'salary_full', 'salary_official',
            'is_active', 'current_legal_entities',
            'supervisors_brief',
            'created_at', 'updated_at',
        ]

    def get_current_legal_entities(self, obj):
        current_positions = obj.positions.filter(is_current=True).select_related('legal_entity')
        return [
            {
                'id': p.legal_entity.id,
                'short_name': p.legal_entity.short_name,
                'position_title': p.position_title,
            }
            for p in current_positions
        ]


class EmployeeDetailSerializer(serializers.ModelSerializer):
    """Полный сериализатор для карточки сотрудника."""

    positions = PositionRecordSerializer(many=True, read_only=True)
    salary_history = SalaryHistorySerializer(many=True, read_only=True)
    supervisors_brief = SupervisorBriefSerializer(
        source='supervisors', many=True, read_only=True
    )
    subordinates_brief = SupervisorBriefSerializer(
        source='subordinates', many=True, read_only=True
    )
    supervisor_ids = serializers.PrimaryKeyRelatedField(
        source='supervisors',
        queryset=Employee.objects.all(),
        many=True,
        required=False,
        write_only=True,
    )
    user_username = serializers.CharField(
        source='user.username', read_only=True, default=None
    )
    counterparty_name = serializers.CharField(
        source='counterparty.name', read_only=True, default=None
    )

    class Meta:
        model = Employee
        fields = [
            'id', 'full_name', 'date_of_birth', 'gender',
            'current_position', 'hire_date',
            'salary_full', 'salary_official',
            'responsibilities',
            # Банковские реквизиты
            'bank_name', 'bank_bik', 'bank_corr_account',
            'bank_account', 'bank_card_number',
            # Связи
            'user', 'user_username',
            'counterparty', 'counterparty_name',
            'supervisor_ids',
            'supervisors_brief', 'subordinates_brief',
            # Права
            'erp_permissions',
            'is_active',
            # Вложенные
            'positions', 'salary_history',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_erp_permissions(self, value):
        """Валидация структуры erp_permissions."""
        if not isinstance(value, dict):
            raise serializers.ValidationError('erp_permissions должен быть словарём.')
        valid_sections = {code for code, _ in ERP_SECTIONS}
        for key, level in value.items():
            if key not in valid_sections:
                raise serializers.ValidationError(f'Неизвестный раздел: {key}')
            if level not in PERMISSION_LEVELS:
                raise serializers.ValidationError(
                    f'Недопустимый уровень доступа "{level}" для раздела "{key}". '
                    f'Допустимые: {", ".join(PERMISSION_LEVELS)}'
                )
        return value


class OrgChartNodeSerializer(serializers.Serializer):
    """Узел для оргсхемы."""
    id = serializers.IntegerField()
    full_name = serializers.CharField()
    current_position = serializers.CharField()
    is_active = serializers.BooleanField()
    legal_entities = serializers.ListField(child=serializers.DictField())


class OrgChartEdgeSerializer(serializers.Serializer):
    """Ребро для оргсхемы (подчинение)."""
    source = serializers.IntegerField()  # supervisor id
    target = serializers.IntegerField()  # subordinate id

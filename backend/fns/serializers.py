from rest_framework import serializers
from .models import FNSReport


class FNSReportSerializer(serializers.ModelSerializer):
    """Сериализатор отчета ФНС (чтение)."""

    report_type_display = serializers.CharField(
        source='get_report_type_display', read_only=True
    )
    requested_by_username = serializers.CharField(
        source='requested_by.username', read_only=True, default=None
    )
    counterparty_name = serializers.CharField(
        source='counterparty.name', read_only=True
    )

    class Meta:
        model = FNSReport
        fields = [
            'id',
            'counterparty',
            'counterparty_name',
            'report_type',
            'report_type_display',
            'inn',
            'report_date',
            'data',
            'summary',
            'requested_by',
            'requested_by_username',
            'created_at',
        ]
        read_only_fields = [
            'id', 'inn', 'report_date', 'data', 'summary',
            'requested_by', 'created_at',
        ]


class FNSReportListSerializer(serializers.ModelSerializer):
    """Сериализатор отчета ФНС для списка (без полного data)."""

    report_type_display = serializers.CharField(
        source='get_report_type_display', read_only=True
    )
    requested_by_username = serializers.CharField(
        source='requested_by.username', read_only=True, default=None
    )
    counterparty_name = serializers.CharField(
        source='counterparty.name', read_only=True
    )

    class Meta:
        model = FNSReport
        fields = [
            'id',
            'counterparty',
            'counterparty_name',
            'report_type',
            'report_type_display',
            'inn',
            'report_date',
            'summary',
            'requested_by_username',
            'created_at',
        ]


class FNSReportCreateSerializer(serializers.Serializer):
    """Сериализатор для создания отчетов ФНС."""

    counterparty_id = serializers.IntegerField(
        help_text='ID контрагента для проверки'
    )
    report_types = serializers.ListField(
        child=serializers.ChoiceField(choices=['check', 'egr', 'bo']),
        min_length=1,
        max_length=3,
        help_text='Типы отчетов: check, egr, bo',
    )


class FNSSuggestResultSerializer(serializers.Serializer):
    """Сериализатор одного результата подсказки."""

    inn = serializers.CharField()
    name = serializers.CharField()
    short_name = serializers.CharField(allow_blank=True, default='')
    kpp = serializers.CharField(allow_blank=True, default='')
    ogrn = serializers.CharField(allow_blank=True, default='')
    address = serializers.CharField(allow_blank=True, default='')
    legal_form = serializers.CharField(default='ooo')
    status = serializers.CharField(allow_blank=True, default='')
    registration_date = serializers.CharField(allow_blank=True, default='')
    is_local = serializers.BooleanField(default=False)
    local_id = serializers.IntegerField(allow_null=True, default=None)


class FNSSuggestResponseSerializer(serializers.Serializer):
    """Сериализатор ответа suggest endpoint."""

    source = serializers.ChoiceField(choices=['local', 'fns', 'mixed'])
    results = FNSSuggestResultSerializer(many=True)
    total = serializers.IntegerField()


class FNSStatsMethodSerializer(serializers.Serializer):
    """Сериализатор одного метода в статистике."""

    name = serializers.CharField()
    display_name = serializers.CharField()
    limit = serializers.IntegerField()
    used = serializers.IntegerField()
    remaining = serializers.IntegerField()


class FNSStatsSerializer(serializers.Serializer):
    """Сериализатор статистики API-FNS."""

    status = serializers.CharField()
    start_date = serializers.CharField(allow_blank=True)
    end_date = serializers.CharField(allow_blank=True)
    methods = FNSStatsMethodSerializer(many=True)
    is_configured = serializers.BooleanField()

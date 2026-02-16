from rest_framework import serializers
from django.contrib.auth.models import User
from .models import (
    FrontOfWorkItem,
    MountingCondition,
    TechnicalProposal,
    TKPEstimateSection,
    TKPEstimateSubsection,
    TKPCharacteristic,
    TKPFrontOfWork,
    MountingProposal,
)


def get_estimate_queryset():
    """Lazy import для избежания циклических зависимостей"""
    from estimates.models import Estimate
    return Estimate.objects.all()


class FrontOfWorkItemSerializer(serializers.ModelSerializer):
    """Сериализатор для справочника "Фронт работ" """
    
    class Meta:
        model = FrontOfWorkItem
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']


class MountingConditionSerializer(serializers.ModelSerializer):
    """Сериализатор для справочника "Условия для МП" """
    
    class Meta:
        model = MountingCondition
        fields = '__all__'
        read_only_fields = ['id', 'created_at', 'updated_at']


class TKPEstimateSubsectionSerializer(serializers.ModelSerializer):
    """Сериализатор для подраздела сметы в ТКП"""
    total_sale = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    total_purchase = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    
    class Meta:
        model = TKPEstimateSubsection
        fields = '__all__'
        read_only_fields = ['id', 'created_at']


class TKPEstimateSectionSerializer(serializers.ModelSerializer):
    """Сериализатор для раздела сметы в ТКП"""
    subsections = TKPEstimateSubsectionSerializer(many=True, read_only=True)
    total_sale = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    total_purchase = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    
    class Meta:
        model = TKPEstimateSection
        fields = '__all__'
        read_only_fields = ['id', 'created_at']


class TKPCharacteristicSerializer(serializers.ModelSerializer):
    """Сериализатор для характеристики ТКП"""
    
    class Meta:
        model = TKPCharacteristic
        fields = '__all__'
        read_only_fields = ['id', 'created_at']


class TKPFrontOfWorkSerializer(serializers.ModelSerializer):
    """Сериализатор для фронта работ в ТКП"""
    front_item_name = serializers.CharField(source='front_item.name', read_only=True)
    front_item_category = serializers.CharField(source='front_item.category', read_only=True)
    
    class Meta:
        model = TKPFrontOfWork
        fields = '__all__'
        read_only_fields = ['id', 'created_at']


class TechnicalProposalListSerializer(serializers.ModelSerializer):
    """Сериализатор для списка ТКП"""
    object_name = serializers.CharField(source='object.name', read_only=True)
    object_address = serializers.CharField(source='object.address', read_only=True)
    legal_entity_name = serializers.CharField(source='legal_entity.short_name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    total_amount = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    total_with_vat = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    validity_date = serializers.DateField(read_only=True)
    
    class Meta:
        model = TechnicalProposal
        fields = [
            'id', 'number', 'outgoing_number', 'name', 'date', 'object', 'object_name',
            'object_address', 'object_area', 'legal_entity', 'legal_entity_name',
            'status', 'validity_days', 'validity_date', 'created_by', 'created_by_name',
            'checked_by', 'approved_by', 'approved_at', 'total_amount', 'total_with_vat',
            'version_number', 'parent_version', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'number', 'created_at', 'updated_at', 'total_amount', 'total_with_vat', 'validity_date']


class TechnicalProposalDetailSerializer(serializers.ModelSerializer):
    """Сериализатор для детальной информации ТКП"""
    object_name = serializers.CharField(source='object.name', read_only=True)
    object_address = serializers.CharField(source='object.address', read_only=True)
    legal_entity_name = serializers.CharField(source='legal_entity.short_name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    checked_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    signatory_name = serializers.CharField(read_only=True)
    signatory_position = serializers.CharField(read_only=True)
    estimates = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=get_estimate_queryset(),
        required=False
    )
    estimate_sections = TKPEstimateSectionSerializer(many=True, read_only=True)
    characteristics = TKPCharacteristicSerializer(many=True, read_only=True)
    front_of_work = TKPFrontOfWorkSerializer(many=True, read_only=True)
    total_amount = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    total_with_vat = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    total_profit = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    profit_percent = serializers.DecimalField(max_digits=5, decimal_places=2, read_only=True)
    total_man_hours = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    validity_date = serializers.DateField(read_only=True)
    currency_rates = serializers.DictField(read_only=True)
    file_url = serializers.SerializerMethodField()
    versions_count = serializers.SerializerMethodField()
    
    
    class Meta:
        model = TechnicalProposal
        fields = '__all__'
        read_only_fields = [
            'id', 'number', 'created_at', 'updated_at', 'total_amount', 'total_with_vat',
            'total_profit', 'profit_percent', 'total_man_hours', 'validity_date',
            'currency_rates', 'file_url', 'versions_count', 'signatory_name', 'signatory_position',
            'created_by'
        ]
    
    def get_checked_by_name(self, obj):
        return obj.checked_by.get_full_name() if obj.checked_by else None
    
    def get_approved_by_name(self, obj):
        return obj.approved_by.get_full_name() if obj.approved_by else None
    
    def get_file_url(self, obj):
        if obj.file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return None
    
    def get_versions_count(self, obj):
        """Использует annotated поле если доступно (оптимизация N+1)"""
        if hasattr(obj, 'annotated_versions_count'):
            return obj.annotated_versions_count
        return obj.child_versions.count()


def get_mounting_estimate_queryset():
    """Lazy import для избежания циклических зависимостей"""
    from estimates.models import MountingEstimate
    return MountingEstimate.objects.all()


class MountingProposalListSerializer(serializers.ModelSerializer):
    """Сериализатор для списка МП"""
    object_name = serializers.CharField(source='object.name', read_only=True)
    counterparty_name = serializers.CharField(source='counterparty.short_name', read_only=True)
    parent_tkp_number = serializers.CharField(source='parent_tkp.number', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    mounting_estimates = serializers.PrimaryKeyRelatedField(many=True, read_only=True)
    
    class Meta:
        model = MountingProposal
        fields = [
            'id', 'number', 'name', 'date', 'object', 'object_name',
            'counterparty', 'counterparty_name', 'parent_tkp', 'parent_tkp_number',
            'mounting_estimates', 'total_amount', 'man_hours', 'status',
            'telegram_published', 'telegram_published_at', 'created_by',
            'created_by_name', 'version_number', 'parent_version',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'number', 'created_at', 'updated_at']


class MountingProposalDetailSerializer(serializers.ModelSerializer):
    """Сериализатор для детальной информации МП"""
    object_name = serializers.CharField(source='object.name', read_only=True)
    counterparty_name = serializers.CharField(source='counterparty.short_name', read_only=True)
    parent_tkp_number = serializers.CharField(source='parent_tkp.number', read_only=True)
    parent_tkp_name = serializers.CharField(source='parent_tkp.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    mounting_estimates_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=get_mounting_estimate_queryset(),
        source='mounting_estimates',
        write_only=True,
        required=False
    )
    mounting_estimates = serializers.PrimaryKeyRelatedField(many=True, read_only=True)
    conditions = MountingConditionSerializer(many=True, read_only=True)
    conditions_ids = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=MountingCondition.objects.all(),
        source='conditions',
        write_only=True,
        required=False
    )
    file_url = serializers.SerializerMethodField()
    versions_count = serializers.SerializerMethodField()
    
    class Meta:
        model = MountingProposal
        fields = '__all__'
        read_only_fields = [
            'id', 'number', 'created_at', 'updated_at', 'file_url', 'versions_count',
            'created_by'
        ]
        extra_kwargs = {
            'conditions': {'read_only': True},
            'mounting_estimates': {'read_only': True}
        }
    
    def get_file_url(self, obj):
        if obj.file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return None
    
    def get_versions_count(self, obj):
        """Использует annotated поле если доступно (оптимизация N+1)"""
        if hasattr(obj, 'annotated_versions_count'):
            return obj.annotated_versions_count
        return obj.child_versions.count()


class TechnicalProposalAddEstimatesSerializer(serializers.Serializer):
    """Сериализатор для добавления смет в ТКП"""
    estimate_ids = serializers.ListField(
        child=serializers.IntegerField(),
        help_text='Список ID смет для добавления'
    )
    copy_data = serializers.BooleanField(
        default=True,
        help_text='Копировать данные из смет (разделы, подразделы, характеристики)'
    )


class TechnicalProposalRemoveEstimatesSerializer(serializers.Serializer):
    """Сериализатор для удаления смет из ТКП"""
    estimate_ids = serializers.ListField(
        child=serializers.IntegerField(),
        help_text='Список ID смет для удаления'
    )

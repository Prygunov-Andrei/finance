from rest_framework import serializers
from decimal import Decimal
from django.contrib.auth.models import User

from .models import (
    Project, ProjectNote, Estimate, EstimateSection,
    EstimateSubsection, EstimateCharacteristic, MountingEstimate
)
from accounting.serializers import CounterpartySerializer


class ProjectNoteSerializer(serializers.ModelSerializer):
    """Сериализатор для замечаний к проекту"""
    
    author = serializers.SerializerMethodField()
    
    class Meta:
        model = ProjectNote
        fields = [
            'id', 'project', 'author', 'text',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_author(self, obj):
        return {
            'id': obj.author.id,
            'username': obj.author.username
        }


class ProjectListSerializer(serializers.ModelSerializer):
    """Упрощённый сериализатор для списков проектов"""
    
    object_name = serializers.CharField(source='object.name', read_only=True)
    stage_display = serializers.CharField(source='get_stage_display', read_only=True)
    
    class Meta:
        model = Project
        fields = [
            'id', 'cipher', 'name', 'date', 'stage', 'stage_display',
            'object', 'object_name', 'is_approved_for_production',
            'primary_check_done', 'secondary_check_done',
            'version_number', 'is_current', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'version_number', 'is_current', 'created_at', 'updated_at'
        ]


class ProjectSerializer(serializers.ModelSerializer):
    """Полный сериализатор для проекта"""
    
    project_notes = ProjectNoteSerializer(many=True, read_only=True)
    object_name = serializers.CharField(source='object.name', read_only=True)
    stage_display = serializers.CharField(source='get_stage_display', read_only=True)
    primary_check_by_username = serializers.CharField(
        source='primary_check_by.username',
        read_only=True,
        allow_null=True
    )
    secondary_check_by_username = serializers.CharField(
        source='secondary_check_by.username',
        read_only=True,
        allow_null=True
    )
    
    class Meta:
        model = Project
        fields = [
            'id', 'cipher', 'name', 'date', 'stage', 'stage_display',
            'object', 'object_name', 'file', 'notes',
            'is_approved_for_production', 'production_approval_file',
            'production_approval_date', 'primary_check_done',
            'primary_check_by', 'primary_check_by_username',
            'primary_check_date', 'secondary_check_done',
            'secondary_check_by', 'secondary_check_by_username',
            'secondary_check_date', 'parent_version', 'version_number',
            'is_current', 'project_notes', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'version_number', 'is_current', 'parent_version',
            'created_at', 'updated_at'
        ]


class EstimateSubsectionSerializer(serializers.ModelSerializer):
    """Сериализатор для подраздела сметы"""
    
    total_sale = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        read_only=True
    )
    total_purchase = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        read_only=True
    )
    
    class Meta:
        model = EstimateSubsection
        fields = [
            'id', 'section', 'name', 'materials_sale', 'works_sale',
            'materials_purchase', 'works_purchase', 'sort_order',
            'total_sale', 'total_purchase', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class EstimateSectionSerializer(serializers.ModelSerializer):
    """Сериализатор для раздела сметы"""
    
    subsections = EstimateSubsectionSerializer(many=True, read_only=True)
    total_materials_sale = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        read_only=True
    )
    total_works_sale = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        read_only=True
    )
    total_materials_purchase = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        read_only=True
    )
    total_works_purchase = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        read_only=True
    )
    total_sale = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        read_only=True
    )
    total_purchase = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        read_only=True
    )
    
    class Meta:
        model = EstimateSection
        fields = [
            'id', 'estimate', 'name', 'sort_order', 'subsections',
            'total_materials_sale', 'total_works_sale',
            'total_materials_purchase', 'total_works_purchase',
            'total_sale', 'total_purchase', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class EstimateCharacteristicSerializer(serializers.ModelSerializer):
    """Сериализатор для характеристики сметы"""
    
    source_type_display = serializers.CharField(
        source='get_source_type_display',
        read_only=True
    )
    
    class Meta:
        model = EstimateCharacteristic
        fields = [
            'id', 'estimate', 'name', 'purchase_amount', 'sale_amount',
            'is_auto_calculated', 'source_type', 'source_type_display',
            'sort_order', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def update(self, instance, validated_data):
        """При обновлении суммы сбрасываем is_auto_calculated"""
        if 'purchase_amount' in validated_data or 'sale_amount' in validated_data:
            validated_data['is_auto_calculated'] = False
        return super().update(instance, validated_data)


class EstimateSerializer(serializers.ModelSerializer):
    """Полный сериализатор для сметы"""
    
    sections = EstimateSectionSerializer(many=True, read_only=True)
    characteristics = EstimateCharacteristicSerializer(many=True, read_only=True)
    projects = serializers.SerializerMethodField()
    object_name = serializers.CharField(source='object.name', read_only=True)
    legal_entity_name = serializers.CharField(
        source='legal_entity.short_name',
        read_only=True
    )
    price_list_name = serializers.CharField(
        source='price_list.name',
        read_only=True,
        allow_null=True
    )
    status_display = serializers.CharField(
        source='get_status_display',
        read_only=True
    )
    created_by_username = serializers.CharField(
        source='created_by.username',
        read_only=True
    )
    checked_by_username = serializers.CharField(
        source='checked_by.username',
        read_only=True,
        allow_null=True
    )
    approved_by_username = serializers.CharField(
        source='approved_by.username',
        read_only=True,
        allow_null=True
    )
    
    # Вычисляемые поля
    total_materials_sale = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        read_only=True
    )
    total_works_sale = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        read_only=True
    )
    total_materials_purchase = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        read_only=True
    )
    total_works_purchase = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        read_only=True
    )
    total_sale = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        read_only=True
    )
    total_purchase = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        read_only=True
    )
    vat_amount = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        read_only=True
    )
    total_with_vat = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        read_only=True
    )
    profit_amount = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        read_only=True
    )
    profit_percent = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
        read_only=True
    )
    
    class Meta:
        model = Estimate
        fields = [
            'id', 'number', 'name', 'object', 'object_name',
            'legal_entity', 'legal_entity_name', 'with_vat', 'vat_rate',
            'projects', 'price_list', 'price_list_name', 'man_hours',
            'usd_rate', 'eur_rate', 'cny_rate', 'file', 'status',
            'status_display', 'approved_by_customer', 'approved_date',
            'created_by', 'created_by_username', 'checked_by',
            'checked_by_username', 'approved_by', 'approved_by_username',
            'parent_version', 'version_number', 'sections', 'characteristics',
            'total_materials_sale', 'total_works_sale',
            'total_materials_purchase', 'total_works_purchase',
            'total_sale', 'total_purchase', 'vat_amount', 'total_with_vat',
            'profit_amount', 'profit_percent', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'number', 'version_number', 'parent_version',
            'created_at', 'updated_at'
        ]
    
    def get_projects(self, obj):
        """Возвращает краткую информацию о проектах"""
        return [
            {
                'id': p.id,
                'cipher': p.cipher,
                'name': p.name
            }
            for p in obj.projects.all()
        ]


class EstimateCreateSerializer(serializers.ModelSerializer):
    """Сериализатор для создания сметы"""
    
    projects = serializers.PrimaryKeyRelatedField(
        many=True,
        queryset=Project.objects.all(),
        required=False
    )
    number = serializers.CharField(read_only=True)  # Добавляем number как read_only
    
    class Meta:
        model = Estimate
        fields = [
            'id', 'object', 'legal_entity', 'name', 'with_vat', 'vat_rate',
            'projects', 'price_list', 'man_hours', 'usd_rate', 'eur_rate',
            'cny_rate', 'number'
        ]
        read_only_fields = ['id', 'number']
    
    def create(self, validated_data):
        projects = validated_data.pop('projects', [])
        created_by = self.context['request'].user
        
        estimate = Estimate.objects.create(
            **validated_data,
            created_by=created_by
        )
        
        if projects:
            estimate.projects.set(projects)
        
        # Создаём начальные характеристики
        estimate.create_initial_characteristics()
        
        return estimate


class MountingEstimateSerializer(serializers.ModelSerializer):
    """Сериализатор для монтажной сметы"""
    
    source_estimate = serializers.SerializerMethodField()
    agreed_counterparty = CounterpartySerializer(read_only=True)
    object_name = serializers.CharField(source='object.name', read_only=True)
    status_display = serializers.CharField(
        source='get_status_display',
        read_only=True
    )
    created_by_username = serializers.CharField(
        source='created_by.username',
        read_only=True
    )
    
    class Meta:
        model = MountingEstimate
        fields = [
            'id', 'number', 'name', 'object', 'object_name',
            'source_estimate', 'total_amount', 'man_hours', 'file',
            'status', 'status_display', 'agreed_counterparty',
            'agreed_date', 'created_by', 'created_by_username',
            'parent_version', 'version_number', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'number', 'version_number', 'parent_version',
            'created_by', 'created_at', 'updated_at'
        ]
    
    def get_source_estimate(self, obj):
        """Возвращает краткую информацию об исходной смете"""
        if obj.source_estimate:
            return {
                'id': obj.source_estimate.id,
                'number': obj.source_estimate.number,
                'name': obj.source_estimate.name
            }
        return None


class MountingEstimateCreateFromEstimateSerializer(serializers.Serializer):
    """Сериализатор для создания монтажной сметы из обычной сметы"""
    
    estimate_id = serializers.IntegerField()
    
    def validate_estimate_id(self, value):
        try:
            Estimate.objects.get(id=value)
        except Estimate.DoesNotExist:
            raise serializers.ValidationError("Смета с указанным ID не найдена")
        return value
    
    def create(self, validated_data):
        estimate = Estimate.objects.get(id=validated_data['estimate_id'])
        created_by = self.context['request'].user
        return MountingEstimate.create_from_estimate(estimate, created_by)

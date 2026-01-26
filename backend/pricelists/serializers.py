from rest_framework import serializers
from decimal import Decimal
from .models import (
    WorkerGrade, WorkSection, WorkerGradeSkills,
    WorkItem, PriceList, PriceListAgreement, PriceListItem
)
from accounting.serializers import CounterpartySerializer


class WorkerGradeSerializer(serializers.ModelSerializer):
    """Сериализатор для разрядов рабочих"""
    
    class Meta:
        model = WorkerGrade
        fields = [
            'id', 'grade', 'name', 'default_hourly_rate',
            'is_active', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class WorkSectionSerializer(serializers.ModelSerializer):
    """Сериализатор для разделов работ"""
    
    children = serializers.SerializerMethodField()
    parent_name = serializers.CharField(source='parent.name', read_only=True, allow_null=True)

    class Meta:
        model = WorkSection
        fields = [
            'id', 'code', 'name', 'parent', 'parent_name',
            'is_active', 'sort_order', 'children',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_children(self, obj):
        """
        Возвращает дочерние разделы.
        
        Использует prefetch_related данные если доступны,
        чтобы избежать N+1 запросов.
        """
        # Проверяем есть ли уже предзагруженные данные
        if hasattr(obj, '_prefetched_objects_cache') and 'children' in obj._prefetched_objects_cache:
            children = [c for c in obj._prefetched_objects_cache['children'] if c.is_active]
        else:
            children = obj.children.filter(is_active=True)
        
        return WorkSectionSerializer(children, many=True, read_only=True).data


class WorkerGradeSkillsSerializer(serializers.ModelSerializer):
    """Сериализатор для навыков разряда"""
    
    grade_detail = WorkerGradeSerializer(source='grade', read_only=True)
    section_detail = WorkSectionSerializer(source='section', read_only=True)

    class Meta:
        model = WorkerGradeSkills
        fields = [
            'id', 'grade', 'grade_detail', 'section', 'section_detail',
            'description', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class WorkItemSerializer(serializers.ModelSerializer):
    """Полный сериализатор для работ"""
    
    section_detail = WorkSectionSerializer(source='section', read_only=True)
    grade_detail = WorkerGradeSerializer(source='grade', read_only=True)
    grade_number = serializers.IntegerField(source='grade.grade', read_only=True, help_text='Номер разряда (1-5)')

    class Meta:
        model = WorkItem
        fields = [
            'id', 'article', 'section', 'section_detail',
            'name', 'unit', 'hours',
            'grade', 'grade_number', 'grade_detail', 'required_grade', 'composition', 'comment', 'coefficient',
            'parent_version', 'version_number', 'is_current',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'article', 'version_number', 'is_current',
            'parent_version', 'created_at', 'updated_at'
        ]

    def create(self, validated_data):
        # Автоматическая генерация артикула
        section = validated_data.get('section')
        prefix = section.code[0] if section else 'W'
        
        # Получаем последний артикул в секции
        last_item = WorkItem.objects.filter(
            article__startswith=f"{prefix}-"
        ).order_by('-article').first()
        
        if last_item:
            # Извлекаем номер из артикула (например, V-001 -> 1)
            try:
                last_num = int(last_item.article.split('-')[1].split('-v')[0])
                new_num = last_num + 1
            except (ValueError, IndexError):
                new_num = 1
        else:
            new_num = 1
        
        validated_data['article'] = f"{prefix}-{new_num:03d}"
        # Если часы не указаны, подставляем 0
        if 'hours' not in validated_data or validated_data.get('hours') is None:
            validated_data['hours'] = Decimal('0')
        return super().create(validated_data)


class WorkItemListSerializer(serializers.ModelSerializer):
    """Упрощённый сериализатор для списков работ (без composition)"""
    
    section_name = serializers.CharField(source='section.name', read_only=True)
    grade_name = serializers.CharField(source='grade.name', read_only=True)
    grade_number = serializers.IntegerField(source='grade.grade', read_only=True, help_text='Номер базового разряда (1-5)')

    class Meta:
        model = WorkItem
        fields = [
            'id', 'article', 'section', 'section_name',
            'name', 'unit', 'hours',
            'grade', 'grade_number', 'grade_name', 'required_grade', 'coefficient',
            'version_number', 'is_current'
        ]


class PriceListItemSerializer(serializers.ModelSerializer):
    """Сериализатор для позиций прайс-листа"""
    
    work_item_detail = WorkItemListSerializer(source='work_item', read_only=True)
    effective_hours = serializers.DecimalField(
        max_digits=8, decimal_places=2, read_only=True
    )
    effective_coefficient = serializers.DecimalField(
        max_digits=5, decimal_places=2, read_only=True
    )
    effective_grade = serializers.DecimalField(
        max_digits=4, decimal_places=2, read_only=True,
        help_text='Эффективный разряд (может быть дробным, например 3.65)'
    )
    calculated_cost = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True
    )

    class Meta:
        model = PriceListItem
        fields = [
            'id', 'price_list', 'work_item', 'work_item_detail',
            'hours_override', 'coefficient_override', 'grade_override',
            'effective_hours', 'effective_coefficient', 'effective_grade',
            'calculated_cost', 'is_included', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']


class PriceListAgreementSerializer(serializers.ModelSerializer):
    """Сериализатор для согласований прайс-листа"""
    
    counterparty_detail = CounterpartySerializer(source='counterparty', read_only=True)

    class Meta:
        model = PriceListAgreement
        fields = [
            'id', 'price_list', 'counterparty', 'counterparty_detail',
            'agreed_date', 'notes', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']


class PriceListSerializer(serializers.ModelSerializer):
    """Полный сериализатор для прайс-листов"""
    
    items = PriceListItemSerializer(many=True, read_only=True)
    agreements = PriceListAgreementSerializer(many=True, read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    items_count = serializers.SerializerMethodField()
    total_cost = serializers.SerializerMethodField()

    class Meta:
        model = PriceList
        fields = [
            'id', 'number', 'name', 'date', 'status', 'status_display',
            'grade_1_rate', 'grade_2_rate', 'grade_3_rate',
            'grade_4_rate', 'grade_5_rate',
            'parent_version', 'version_number',
            'items', 'agreements', 'items_count', 'total_cost',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'version_number', 'parent_version', 'created_at', 'updated_at']

    def get_items_count(self, obj):
        """Использует annotated поле если доступно (оптимизация N+1)"""
        if hasattr(obj, 'annotated_items_count'):
            return obj.annotated_items_count
        return obj.items.filter(is_included=True).count()

    def get_total_cost(self, obj):
        """
        Возвращает общую стоимость прайс-листа.
        Используем prefetched items если доступны.
        """
        # Если items уже prefetched (из PriceListViewSet), используем их
        if hasattr(obj, '_prefetched_objects_cache') and 'items' in obj._prefetched_objects_cache:
            items = [i for i in obj._prefetched_objects_cache['items'] if i.is_included]
        else:
            items = obj.items.filter(is_included=True)
        
        total = sum(item.calculated_cost for item in items)
        return str(total)


class PriceListListSerializer(serializers.ModelSerializer):
    """Упрощённый сериализатор для списка прайс-листов"""
    
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    items_count = serializers.SerializerMethodField()
    agreements_count = serializers.SerializerMethodField()

    class Meta:
        model = PriceList
        fields = [
            'id', 'number', 'name', 'date', 'status', 'status_display',
            'version_number', 'items_count', 'agreements_count',
            'created_at', 'updated_at'
        ]

    def get_items_count(self, obj):
        """
        Использует annotated поле если доступно (оптимизация),
        иначе вычисляет через запрос (fallback).
        """
        if hasattr(obj, 'annotated_items_count'):
            return obj.annotated_items_count
        return obj.items.filter(is_included=True).count()

    def get_agreements_count(self, obj):
        """
        Использует annotated поле если доступно (оптимизация),
        иначе вычисляет через запрос (fallback).
        """
        if hasattr(obj, 'annotated_agreements_count'):
            return obj.annotated_agreements_count
        return obj.agreements.count()


class PriceListCreateSerializer(serializers.ModelSerializer):
    """Сериализатор для создания прайс-листа"""
    
    work_items = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        write_only=True,
        help_text='Список ID работ для включения'
    )
    populate_rates = serializers.BooleanField(
        default=True,
        write_only=True,
        help_text='Заполнить ставки из справочника разрядов'
    )

    class Meta:
        model = PriceList
        fields = [
            'id', 'number', 'name', 'date', 'status',
            'grade_1_rate', 'grade_2_rate', 'grade_3_rate',
            'grade_4_rate', 'grade_5_rate',
            'work_items', 'populate_rates',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def create(self, validated_data):
        work_item_ids = validated_data.pop('work_items', [])
        populate_rates = validated_data.pop('populate_rates', True)
        
        price_list = PriceList(**validated_data)
        
        if populate_rates:
            price_list.populate_rates_from_grades()
        
        price_list.save()
        
        # Добавляем работы через bulk_create для оптимизации
        if work_item_ids:
            work_items = WorkItem.objects.filter(id__in=work_item_ids, is_current=True)
            price_list_items = [
                PriceListItem(price_list=price_list, work_item=work_item)
                for work_item in work_items
            ]
            PriceListItem.objects.bulk_create(price_list_items)
        
        return price_list


class AddRemoveItemsSerializer(serializers.Serializer):
    """Сериализатор для добавления/удаления работ из прайс-листа"""
    
    work_item_ids = serializers.ListField(
        child=serializers.IntegerField(),
        help_text='Список ID работ'
    )

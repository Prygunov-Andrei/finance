from rest_framework import serializers
from .models import Category, Product, ProductAlias, ProductPriceHistory


class CategorySerializer(serializers.ModelSerializer):
    """Сериализатор категории"""
    
    parent_name = serializers.CharField(source='parent.name', read_only=True, allow_null=True)
    full_path = serializers.SerializerMethodField()
    children_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Category
        fields = [
            'id', 'name', 'code', 'parent', 'parent_name', 'full_path',
            'description', 'level', 'sort_order', 'is_active', 'children_count',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'level', 'full_path', 'children_count', 'created_at', 'updated_at']
    
    def get_full_path(self, obj):
        return obj.get_full_path()
    
    def get_children_count(self, obj):
        """Использует annotated поле если доступно (оптимизация N+1)"""
        if hasattr(obj, 'annotated_children_count'):
            return obj.annotated_children_count
        return obj.children.filter(is_active=True).count()


class CategoryTreeSerializer(serializers.ModelSerializer):
    """
    Сериализатор для дерева категорий.
    
    DEPRECATED: Использовать CategoryViewSet.tree() action вместо этого сериализатора.
    Этот сериализатор имеет N+1 проблему при рекурсивных вызовах.
    Оставлен для обратной совместимости.
    """
    
    children = serializers.SerializerMethodField()
    
    class Meta:
        model = Category
        fields = ['id', 'name', 'code', 'level', 'children']
    
    def get_children(self, obj):
        """
        ВНИМАНИЕ: Имеет N+1 проблему! Используйте CategoryViewSet.tree() вместо этого.
        """
        children = obj.children.filter(is_active=True).order_by('sort_order', 'name')
        return CategoryTreeSerializer(children, many=True).data


class ProductAliasSerializer(serializers.ModelSerializer):
    """Сериализатор синонима товара"""
    
    class Meta:
        model = ProductAlias
        fields = ['id', 'alias_name', 'source_payment', 'created_at']
        read_only_fields = ['id', 'created_at']


class ProductPriceHistorySerializer(serializers.ModelSerializer):
    """Сериализатор истории цен"""
    
    counterparty_name = serializers.CharField(source='counterparty.name', read_only=True)
    
    class Meta:
        model = ProductPriceHistory
        fields = [
            'id', 'counterparty', 'counterparty_name', 'price', 'unit',
            'invoice_date', 'invoice_number', 'payment', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']


class ProductSerializer(serializers.ModelSerializer):
    """Сериализатор товара/услуги"""
    
    category_name = serializers.CharField(source='category.name', read_only=True, allow_null=True)
    category_path = serializers.SerializerMethodField()
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    aliases = ProductAliasSerializer(many=True, read_only=True)
    aliases_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Product
        fields = [
            'id', 'name', 'normalized_name', 'category', 'category_name', 'category_path',
            'default_unit', 'is_service', 'status', 'status_display',
            'merged_into', 'aliases', 'aliases_count',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'normalized_name', 'status_display', 'aliases', 'created_at', 'updated_at']
    
    def get_category_path(self, obj):
        if obj.category:
            return obj.category.get_full_path()
        return None
    
    def get_aliases_count(self, obj):
        """Использует annotated поле если доступно (оптимизация N+1)"""
        if hasattr(obj, 'annotated_aliases_count'):
            return obj.annotated_aliases_count
        return obj.aliases.count()


class ProductListSerializer(serializers.ModelSerializer):
    """Упрощённый сериализатор для списка"""
    
    category_name = serializers.CharField(source='category.name', read_only=True, allow_null=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    aliases_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Product
        fields = [
            'id', 'name', 'category_name', 'default_unit', 'is_service',
            'status', 'status_display', 'aliases_count'
        ]
    
    def get_aliases_count(self, obj):
        """Использует annotated поле если доступно (оптимизация N+1)"""
        if hasattr(obj, 'annotated_aliases_count'):
            return obj.annotated_aliases_count
        return obj.aliases.count()


class ProductMergeSerializer(serializers.Serializer):
    """Сериализатор для объединения товаров"""
    
    source_ids = serializers.ListField(
        child=serializers.IntegerField(),
        min_length=1,
        help_text='ID товаров, которые нужно объединить в целевой'
    )
    target_id = serializers.IntegerField(
        help_text='ID целевого товара, в который объединяем'
    )
    
    def validate(self, data):
        if data['target_id'] in data['source_ids']:
            raise serializers.ValidationError('Целевой товар не может быть в списке источников')
        return data

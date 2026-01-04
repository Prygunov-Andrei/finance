# Детальный план внедрения: Парсинг счетов — Backend

**Версия:** 1.0  
**Дата:** 04.01.2026  
**Базовый документ:** `PLANNING_INVOICE_PARSING.md`

---

## Содержание

1. [Фаза 1: Приложение catalog](#фаза-1-приложение-catalog) → 🚀 **Старт Frontend: Каталог**
2. [Фаза 2: Приложение llm_services](#фаза-2-приложение-llm_services)
3. [Фаза 3: Расширение payments](#фаза-3-расширение-payments)
4. [Фаза 4: LLM-провайдеры](#фаза-4-llm-провайдеры)
5. [Фаза 5: Сервисы сопоставления](#фаза-5-сервисы-сопоставления)
6. [Фаза 6: Интеграция с платежами](#фаза-6-интеграция-с-платежами) → 🚀 **Старт Frontend: Парсинг**
7. [Фаза 7: Management-команды](#фаза-7-management-команды)
8. [Фаза 8: Тесты](#фаза-8-тесты) → ✅ **Backend готов**

---

## Фаза 1: Приложение catalog

### 1.1. Создание приложения

```bash
cd backend
python manage.py startapp catalog
```

### 1.2. Модели

#### catalog/models.py

```python
from django.db import models
from django.core.exceptions import ValidationError
from core.models import TimestampedModel


class Category(TimestampedModel):
    """Категория товаров/услуг с неограниченной вложенностью"""
    
    name = models.CharField(max_length=255, verbose_name='Название')
    code = models.CharField(
        max_length=100, 
        unique=True, 
        verbose_name='Код',
        help_text='Уникальный код категории (например: ventilation_fans)'
    )
    parent = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        related_name='children',
        null=True,
        blank=True,
        verbose_name='Родительская категория'
    )
    description = models.TextField(blank=True, verbose_name='Описание')
    level = models.PositiveIntegerField(
        default=0,
        verbose_name='Уровень вложенности',
        help_text='Автоматически рассчитывается при сохранении'
    )
    sort_order = models.PositiveIntegerField(default=0, verbose_name='Порядок сортировки')
    is_active = models.BooleanField(default=True, verbose_name='Активна')

    class Meta:
        verbose_name = 'Категория товаров'
        verbose_name_plural = 'Категории товаров'
        ordering = ['level', 'sort_order', 'name']
        indexes = [
            models.Index(fields=['parent', 'is_active']),
            models.Index(fields=['code']),
        ]

    def __str__(self):
        return self.get_full_path()

    def get_full_path(self) -> str:
        """Возвращает полный путь: Родитель → Ребёнок → ..."""
        if self.parent:
            return f"{self.parent.get_full_path()} → {self.name}"
        return self.name

    def clean(self):
        # Проверка на циклическую ссылку
        if self.parent:
            parent = self.parent
            while parent:
                if parent.pk == self.pk:
                    raise ValidationError('Нельзя создать циклическую ссылку')
                parent = parent.parent

    def save(self, *args, **kwargs):
        # Автоматический расчёт уровня
        if self.parent:
            self.level = self.parent.level + 1
        else:
            self.level = 0
        super().save(*args, **kwargs)


class Product(TimestampedModel):
    """Товар или услуга из счетов"""
    
    class Status(models.TextChoices):
        NEW = 'new', 'Новый'
        VERIFIED = 'verified', 'Проверен'
        MERGED = 'merged', 'Объединён'
        ARCHIVED = 'archived', 'Архив'

    class UnitType(models.TextChoices):
        PIECE = 'шт', 'Штука'
        METER = 'м', 'Метр'
        SQ_METER = 'м²', 'Квадратный метр'
        CUB_METER = 'м³', 'Кубический метр'
        KG = 'кг', 'Килограмм'
        TON = 'т', 'Тонна'
        LITER = 'л', 'Литр'
        SET = 'компл', 'Комплект'
        HOUR = 'ч', 'Час'
        SERVICE = 'усл', 'Услуга'
        OTHER = 'ед', 'Единица'

    name = models.CharField(max_length=500, verbose_name='Наименование')
    normalized_name = models.CharField(
        max_length=500,
        db_index=True,
        verbose_name='Нормализованное название',
        help_text='Lowercase, без спецсимволов, для поиска'
    )
    category = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL,
        related_name='products',
        null=True,
        blank=True,
        verbose_name='Категория'
    )
    default_unit = models.CharField(
        max_length=20,
        choices=UnitType.choices,
        default=UnitType.PIECE,
        verbose_name='Единица измерения по умолчанию'
    )
    is_service = models.BooleanField(
        default=False,
        verbose_name='Это услуга',
        help_text='Услуга, а не товар'
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.NEW,
        verbose_name='Статус'
    )
    merged_into = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        related_name='merged_products',
        null=True,
        blank=True,
        verbose_name='Объединён в',
        help_text='Если товар объединён с другим'
    )
    created_from_payment = models.ForeignKey(
        'payments.Payment',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_products',
        verbose_name='Создан из платежа'
    )

    class Meta:
        verbose_name = 'Товар/Услуга'
        verbose_name_plural = 'Товары/Услуги'
        ordering = ['name']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['normalized_name']),
            models.Index(fields=['category', 'status']),
        ]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        # Нормализация названия
        self.normalized_name = self.normalize_name(self.name)
        super().save(*args, **kwargs)

    @staticmethod
    def normalize_name(name: str) -> str:
        """Нормализует название для поиска"""
        import re
        # Lowercase
        normalized = name.lower()
        # Удаляем спецсимволы, оставляем буквы, цифры, пробелы
        normalized = re.sub(r'[^\w\s]', ' ', normalized)
        # Убираем множественные пробелы
        normalized = re.sub(r'\s+', ' ', normalized).strip()
        return normalized


class ProductAlias(TimestampedModel):
    """Альтернативные названия товара из разных счетов"""
    
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='aliases',
        verbose_name='Товар'
    )
    alias_name = models.CharField(max_length=500, verbose_name='Альтернативное название')
    normalized_alias = models.CharField(
        max_length=500,
        db_index=True,
        verbose_name='Нормализованный алиас'
    )
    source_payment = models.ForeignKey(
        'payments.Payment',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='product_aliases',
        verbose_name='Источник (платёж)'
    )

    class Meta:
        verbose_name = 'Синоним товара'
        verbose_name_plural = 'Синонимы товаров'
        unique_together = ['product', 'normalized_alias']

    def __str__(self):
        return f"{self.alias_name} → {self.product.name}"

    def save(self, *args, **kwargs):
        self.normalized_alias = Product.normalize_name(self.alias_name)
        super().save(*args, **kwargs)


class ProductPriceHistory(TimestampedModel):
    """История цен товара от разных поставщиков"""
    
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='price_history',
        verbose_name='Товар'
    )
    counterparty = models.ForeignKey(
        'accounting.Counterparty',
        on_delete=models.CASCADE,
        related_name='product_prices',
        verbose_name='Поставщик'
    )
    price = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        verbose_name='Цена за единицу'
    )
    unit = models.CharField(max_length=20, verbose_name='Единица измерения')
    invoice_date = models.DateField(verbose_name='Дата счёта')
    invoice_number = models.CharField(
        max_length=100,
        blank=True,
        verbose_name='Номер счёта'
    )
    payment = models.ForeignKey(
        'payments.Payment',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='product_prices',
        verbose_name='Платёж-источник'
    )

    class Meta:
        verbose_name = 'История цен'
        verbose_name_plural = 'История цен'
        ordering = ['-invoice_date']
        indexes = [
            models.Index(fields=['product', 'counterparty']),
            models.Index(fields=['invoice_date']),
        ]

    def __str__(self):
        return f"{self.product.name}: {self.price} ({self.counterparty.short_name or self.counterparty.name})"
```

### 1.3. Сериализаторы

#### catalog/serializers.py

```python
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
        return obj.children.filter(is_active=True).count()


class CategoryTreeSerializer(serializers.ModelSerializer):
    """Сериализатор для дерева категорий"""
    
    children = serializers.SerializerMethodField()
    
    class Meta:
        model = Category
        fields = ['id', 'name', 'code', 'level', 'children']
    
    def get_children(self, obj):
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


class ProductDuplicatesSerializer(serializers.Serializer):
    """Сериализатор для поиска дубликатов"""
    
    product = ProductListSerializer()
    similar_products = serializers.SerializerMethodField()
    similarity_score = serializers.FloatField()
    
    def get_similar_products(self, obj):
        return ProductListSerializer(obj.get('similar_products', []), many=True).data
```

### 1.4. Views

#### catalog/views.py

```python
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Count
from drf_spectacular.utils import extend_schema, extend_schema_view

from .models import Category, Product, ProductAlias, ProductPriceHistory
from .serializers import (
    CategorySerializer, CategoryTreeSerializer,
    ProductSerializer, ProductListSerializer, ProductMergeSerializer,
    ProductAliasSerializer, ProductPriceHistorySerializer
)
from .services import ProductMatcher


@extend_schema_view(
    list=extend_schema(summary='Список категорий', tags=['Каталог']),
    retrieve=extend_schema(summary='Детали категории', tags=['Каталог']),
    create=extend_schema(summary='Создать категорию', tags=['Каталог']),
    update=extend_schema(summary='Обновить категорию', tags=['Каталог']),
    partial_update=extend_schema(summary='Частично обновить категорию', tags=['Каталог']),
    destroy=extend_schema(summary='Удалить категорию', tags=['Каталог']),
)
class CategoryViewSet(viewsets.ModelViewSet):
    """ViewSet для управления категориями товаров"""
    
    queryset = Category.objects.select_related('parent').all()
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['parent', 'is_active', 'level']
    search_fields = ['name', 'code', 'description']
    ordering_fields = ['name', 'sort_order', 'level']
    ordering = ['level', 'sort_order', 'name']

    @extend_schema(summary='Дерево категорий', tags=['Каталог'])
    @action(detail=False, methods=['get'])
    def tree(self, request):
        """Возвращает иерархическое дерево категорий"""
        root_categories = Category.objects.filter(
            parent__isnull=True,
            is_active=True
        ).order_by('sort_order', 'name')
        serializer = CategoryTreeSerializer(root_categories, many=True)
        return Response(serializer.data)


@extend_schema_view(
    list=extend_schema(summary='Список товаров', tags=['Каталог']),
    retrieve=extend_schema(summary='Детали товара', tags=['Каталог']),
    create=extend_schema(summary='Создать товар', tags=['Каталог']),
    update=extend_schema(summary='Обновить товар', tags=['Каталог']),
    partial_update=extend_schema(summary='Частично обновить товар', tags=['Каталог']),
    destroy=extend_schema(summary='Удалить товар', tags=['Каталог']),
)
class ProductViewSet(viewsets.ModelViewSet):
    """ViewSet для управления товарами/услугами"""
    
    queryset = Product.objects.select_related('category', 'merged_into').all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['category', 'status', 'is_service']
    search_fields = ['name', 'normalized_name']
    ordering_fields = ['name', 'created_at', 'status']
    ordering = ['-created_at']

    def get_serializer_class(self):
        if self.action == 'list':
            return ProductListSerializer
        return ProductSerializer

    @extend_schema(summary='Поиск дубликатов', tags=['Каталог'])
    @action(detail=False, methods=['get'])
    def duplicates(self, request):
        """Находит потенциальные дубликаты товаров"""
        threshold = float(request.query_params.get('threshold', 0.8))
        limit = int(request.query_params.get('limit', 50))
        
        matcher = ProductMatcher()
        duplicates = matcher.find_duplicates(threshold=threshold, limit=limit)
        
        return Response(duplicates)

    @extend_schema(summary='Объединить товары', tags=['Каталог'])
    @action(detail=False, methods=['post'])
    def merge(self, request):
        """Объединяет несколько товаров в один"""
        serializer = ProductMergeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        source_ids = serializer.validated_data['source_ids']
        target_id = serializer.validated_data['target_id']
        
        try:
            target = Product.objects.get(pk=target_id)
            sources = Product.objects.filter(pk__in=source_ids)
            
            merged_count = 0
            for source in sources:
                # Переносим алиасы
                ProductAlias.objects.filter(product=source).update(product=target)
                
                # Добавляем название как алиас
                ProductAlias.objects.get_or_create(
                    product=target,
                    normalized_alias=source.normalized_name,
                    defaults={'alias_name': source.name}
                )
                
                # Переносим историю цен
                ProductPriceHistory.objects.filter(product=source).update(product=target)
                
                # Помечаем как объединённый
                source.status = Product.Status.MERGED
                source.merged_into = target
                source.save()
                merged_count += 1
            
            return Response({
                'message': f'Объединено {merged_count} товаров в "{target.name}"',
                'target': ProductSerializer(target).data
            })
        except Product.DoesNotExist:
            return Response(
                {'error': 'Товар не найден'},
                status=status.HTTP_404_NOT_FOUND
            )

    @extend_schema(summary='История цен товара', tags=['Каталог'])
    @action(detail=True, methods=['get'])
    def prices(self, request, pk=None):
        """Возвращает историю цен товара"""
        product = self.get_object()
        prices = ProductPriceHistory.objects.filter(
            product=product
        ).select_related('counterparty').order_by('-invoice_date')
        
        serializer = ProductPriceHistorySerializer(prices, many=True)
        return Response(serializer.data)

    @extend_schema(summary='Подтвердить товар', tags=['Каталог'])
    @action(detail=True, methods=['post'])
    def verify(self, request, pk=None):
        """Переводит товар в статус 'verified'"""
        product = self.get_object()
        product.status = Product.Status.VERIFIED
        product.save()
        return Response(ProductSerializer(product).data)

    @extend_schema(summary='Архивировать товар', tags=['Каталог'])
    @action(detail=True, methods=['post'])
    def archive(self, request, pk=None):
        """Переводит товар в архив"""
        product = self.get_object()
        product.status = Product.Status.ARCHIVED
        product.save()
        return Response(ProductSerializer(product).data)
```

### 1.5. Сервисы

#### catalog/services.py

```python
from typing import List, Dict, Optional
from django.db.models import Q
from fuzzywuzzy import fuzz
from .models import Product, ProductAlias


class ProductMatcher:
    """Сервис для поиска и сопоставления товаров"""
    
    EXACT_THRESHOLD = 0.9
    ALIAS_THRESHOLD = 0.7
    
    def find_or_create_product(
        self,
        name: str,
        unit: str = 'шт',
        payment=None
    ) -> tuple[Product, bool]:
        """
        Ищет товар по названию или создаёт новый.
        
        Returns:
            tuple: (Product, created: bool)
        """
        normalized = Product.normalize_name(name)
        
        # 1. Точное совпадение по normalized_name
        exact_match = Product.objects.filter(
            normalized_name=normalized,
            status__in=[Product.Status.NEW, Product.Status.VERIFIED]
        ).first()
        
        if exact_match:
            return exact_match, False
        
        # 2. Поиск в алиасах
        alias_match = ProductAlias.objects.filter(
            normalized_alias=normalized,
            product__status__in=[Product.Status.NEW, Product.Status.VERIFIED]
        ).select_related('product').first()
        
        if alias_match:
            return alias_match.product, False
        
        # 3. Fuzzy поиск
        similar = self.find_similar(normalized, threshold=self.EXACT_THRESHOLD, limit=1)
        if similar:
            product = similar[0]['product']
            # Создаём алиас
            ProductAlias.objects.create(
                product=product,
                alias_name=name,
                source_payment=payment
            )
            return product, False
        
        # 4. Создаём новый
        product = Product.objects.create(
            name=name,
            default_unit=unit,
            status=Product.Status.NEW,
            created_from_payment=payment
        )
        return product, True
    
    def find_similar(
        self,
        name: str,
        threshold: float = 0.7,
        limit: int = 10
    ) -> List[Dict]:
        """Находит похожие товары по названию"""
        normalized = Product.normalize_name(name) if not name.islower() else name
        
        # Получаем все активные товары
        products = Product.objects.filter(
            status__in=[Product.Status.NEW, Product.Status.VERIFIED]
        ).values_list('id', 'name', 'normalized_name')
        
        results = []
        for prod_id, prod_name, prod_normalized in products:
            # Используем token_set_ratio для лучшего сравнения
            score = fuzz.token_set_ratio(normalized, prod_normalized) / 100.0
            
            if score >= threshold:
                results.append({
                    'product_id': prod_id,
                    'product_name': prod_name,
                    'score': score
                })
        
        # Сортируем по score и берём limit
        results.sort(key=lambda x: x['score'], reverse=True)
        return results[:limit]
    
    def find_duplicates(self, threshold: float = 0.8, limit: int = 50) -> List[Dict]:
        """Находит потенциальные дубликаты среди товаров"""
        products = list(Product.objects.filter(
            status=Product.Status.NEW
        ).values_list('id', 'name', 'normalized_name'))
        
        duplicates = []
        checked = set()
        
        for i, (id1, name1, norm1) in enumerate(products):
            if id1 in checked:
                continue
                
            similar = []
            for j, (id2, name2, norm2) in enumerate(products[i+1:], start=i+1):
                if id2 in checked:
                    continue
                    
                score = fuzz.token_set_ratio(norm1, norm2) / 100.0
                if score >= threshold:
                    similar.append({
                        'id': id2,
                        'name': name2,
                        'score': score
                    })
                    checked.add(id2)
            
            if similar:
                checked.add(id1)
                duplicates.append({
                    'product': {'id': id1, 'name': name1},
                    'similar': similar
                })
                
            if len(duplicates) >= limit:
                break
        
        return duplicates
```

### 1.6. URLs

#### catalog/urls.py

```python
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CategoryViewSet, ProductViewSet

router = DefaultRouter()
router.register(r'categories', CategoryViewSet, basename='category')
router.register(r'products', ProductViewSet, basename='product')

urlpatterns = [
    path('catalog/', include(router.urls)),
]
```

### 1.7. Регистрация приложения

#### finans_assistant/settings.py

```python
INSTALLED_APPS = [
    # ...
    'catalog',
]
```

#### finans_assistant/urls.py

```python
urlpatterns = [
    # ...
    path('api/v1/', include('catalog.urls')),
]
```

### 1.8. Миграции

```bash
python manage.py makemigrations catalog
python manage.py migrate
```

---

> ### 🚀 ТОЧКА СТАРТА FRONTEND
> 
> **После завершения Фазы 1 можно начинать на Frontend:**
> - **Этап 2: Каталог товаров** — страницы категорий и товаров
> - **Этап 3: Модерация товаров** — поиск дубликатов, объединение
> - **Этап 4: История цен** — компонент истории цен
> 
> **Готовые API:**
> - `GET/POST /api/v1/catalog/categories/` — CRUD категорий
> - `GET /api/v1/catalog/categories/tree/` — дерево категорий
> - `GET/POST /api/v1/catalog/products/` — CRUD товаров
> - `GET /api/v1/catalog/products/duplicates/` — поиск дубликатов
> - `POST /api/v1/catalog/products/merge/` — объединение
> - `GET /api/v1/catalog/products/{id}/prices/` — история цен
> - `POST /api/v1/catalog/products/{id}/verify/` — подтверждение
> - `POST /api/v1/catalog/products/{id}/archive/` — архивация

---

## Фаза 2: Приложение llm_services

### 2.1. Создание приложения

```bash
python manage.py startapp llm_services
```

### 2.2. Модели

#### llm_services/models.py

```python
import os
from django.db import models
from django.conf import settings
from core.models import TimestampedModel


class LLMProvider(TimestampedModel):
    """Настройка LLM-провайдера"""
    
    class ProviderType(models.TextChoices):
        OPENAI = 'openai', 'OpenAI'
        GEMINI = 'gemini', 'Google Gemini'
        GROK = 'grok', 'xAI Grok'
    
    provider_type = models.CharField(
        max_length=20,
        choices=ProviderType.choices,
        verbose_name='Тип провайдера'
    )
    model_name = models.CharField(
        max_length=100,
        verbose_name='Название модели',
        help_text='Например: gpt-4o, gemini-1.5-pro, grok-2-vision'
    )
    env_key_name = models.CharField(
        max_length=100,
        verbose_name='Имя ENV переменной',
        help_text='Например: OPENAI_API_KEY'
    )
    is_active = models.BooleanField(default=True, verbose_name='Активен')
    is_default = models.BooleanField(default=False, verbose_name='По умолчанию')
    
    class Meta:
        verbose_name = 'LLM-провайдер'
        verbose_name_plural = 'LLM-провайдеры'
        ordering = ['-is_default', 'provider_type']
    
    def __str__(self):
        default_mark = ' (по умолчанию)' if self.is_default else ''
        return f"{self.get_provider_type_display()}: {self.model_name}{default_mark}"
    
    def get_api_key(self) -> str:
        """Получает API-ключ из ENV"""
        key = os.environ.get(self.env_key_name)
        if not key:
            raise ValueError(f"Не найден API-ключ в переменной окружения: {self.env_key_name}")
        return key
    
    def save(self, *args, **kwargs):
        # Если ставим is_default=True, сбрасываем у других
        if self.is_default:
            LLMProvider.objects.filter(is_default=True).exclude(pk=self.pk).update(is_default=False)
        super().save(*args, **kwargs)
    
    @classmethod
    def get_default(cls) -> 'LLMProvider':
        """Возвращает провайдер по умолчанию"""
        provider = cls.objects.filter(is_default=True, is_active=True).first()
        if not provider:
            provider = cls.objects.filter(is_active=True).first()
        if not provider:
            raise ValueError("Нет доступных LLM-провайдеров")
        return provider


class ParsedDocument(TimestampedModel):
    """Результат парсинга документа через LLM"""
    
    class Status(models.TextChoices):
        PENDING = 'pending', 'В обработке'
        SUCCESS = 'success', 'Успешно'
        FAILED = 'failed', 'Ошибка'
        NEEDS_REVIEW = 'needs_review', 'Требует проверки'
    
    file_hash = models.CharField(
        max_length=64,
        unique=True,
        db_index=True,
        verbose_name='SHA256 хэш файла'
    )
    original_filename = models.CharField(
        max_length=255,
        verbose_name='Исходное имя файла'
    )
    file = models.FileField(
        upload_to='parsed_documents/%Y/%m/',
        verbose_name='Файл',
        null=True,
        blank=True
    )
    payment = models.ForeignKey(
        'payments.Payment',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='parsed_documents',
        verbose_name='Связанный платёж'
    )
    provider = models.ForeignKey(
        LLMProvider,
        on_delete=models.SET_NULL,
        null=True,
        related_name='parsed_documents',
        verbose_name='Использованный провайдер'
    )
    raw_response = models.JSONField(
        null=True,
        blank=True,
        verbose_name='Сырой ответ LLM'
    )
    parsed_data = models.JSONField(
        null=True,
        blank=True,
        verbose_name='Распарсенные данные'
    )
    confidence_score = models.FloatField(
        null=True,
        blank=True,
        verbose_name='Уверенность (0.0-1.0)'
    )
    processing_time_ms = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name='Время обработки (мс)'
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        verbose_name='Статус'
    )
    error_message = models.TextField(
        blank=True,
        verbose_name='Сообщение об ошибке'
    )
    
    class Meta:
        verbose_name = 'Распарсенный документ'
        verbose_name_plural = 'Распарсенные документы'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['file_hash']),
            models.Index(fields=['status']),
        ]
    
    def __str__(self):
        return f"{self.original_filename} ({self.get_status_display()})"
```

### 2.3. Схема данных счёта

#### llm_services/schemas.py

```python
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import date
from decimal import Decimal


class VendorInfo(BaseModel):
    """Информация о поставщике"""
    name: str = Field(..., description="Название организации")
    inn: str = Field(..., description="ИНН")
    kpp: Optional[str] = Field(None, description="КПП")


class BuyerInfo(BaseModel):
    """Информация о покупателе (наша компания)"""
    name: str = Field(..., description="Название организации")
    inn: str = Field(..., description="ИНН")


class InvoiceInfo(BaseModel):
    """Информация о счёте"""
    number: str = Field(..., description="Номер счёта")
    date: date = Field(..., description="Дата счёта")


class TotalsInfo(BaseModel):
    """Итоговые суммы"""
    amount_gross: Decimal = Field(..., description="Сумма с НДС")
    vat_amount: Decimal = Field(..., description="Сумма НДС")


class InvoiceItem(BaseModel):
    """Позиция счёта"""
    name: str = Field(..., description="Наименование товара/услуги")
    quantity: Decimal = Field(..., description="Количество")
    unit: str = Field(..., description="Единица измерения")
    price_per_unit: Decimal = Field(..., description="Цена за единицу")


class FutureFields(BaseModel):
    """Поля для будущего расширения"""
    contract_number: Optional[str] = None
    manager_name: Optional[str] = None
    manager_phone: Optional[str] = None
    manager_email: Optional[str] = None
    valid_until: Optional[date] = None
    delivery_address: Optional[str] = None
    shipping_terms: Optional[str] = None


class ParsedInvoice(BaseModel):
    """Полная структура распарсенного счёта"""
    vendor: VendorInfo
    buyer: BuyerInfo
    invoice: InvoiceInfo
    totals: TotalsInfo
    items: List[InvoiceItem]
    confidence: float = Field(..., ge=0.0, le=1.0, description="Уверенность парсинга")
    _future: Optional[FutureFields] = None
    
    class Config:
        json_encoders = {
            Decimal: lambda v: str(v),
            date: lambda v: v.isoformat(),
        }
```

### 2.4. Сериализаторы

#### llm_services/serializers.py

```python
from rest_framework import serializers
from .models import LLMProvider, ParsedDocument


class LLMProviderSerializer(serializers.ModelSerializer):
    """Сериализатор LLM-провайдера"""
    
    provider_type_display = serializers.CharField(
        source='get_provider_type_display',
        read_only=True
    )
    
    class Meta:
        model = LLMProvider
        fields = [
            'id', 'provider_type', 'provider_type_display',
            'model_name', 'env_key_name', 'is_active', 'is_default',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'provider_type_display', 'created_at', 'updated_at']


class ParsedDocumentSerializer(serializers.ModelSerializer):
    """Сериализатор распарсенного документа"""
    
    status_display = serializers.CharField(
        source='get_status_display',
        read_only=True
    )
    provider_name = serializers.CharField(
        source='provider.get_provider_type_display',
        read_only=True,
        allow_null=True
    )
    
    class Meta:
        model = ParsedDocument
        fields = [
            'id', 'file_hash', 'original_filename', 'file',
            'payment', 'provider', 'provider_name',
            'parsed_data', 'confidence_score', 'processing_time_ms',
            'status', 'status_display', 'error_message',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'file_hash', 'created_at', 'updated_at']
```

### 2.5. Миграции

```bash
python manage.py makemigrations llm_services
python manage.py migrate
```

---

## Фаза 3: Расширение payments

### 3.1. Новая модель PaymentItem

#### payments/models.py (дополнение)

```python
class PaymentItem(TimestampedModel):
    """Позиция в платёжном документе (товар/услуга из счёта)"""
    
    payment = models.ForeignKey(
        'Payment',
        on_delete=models.CASCADE,
        related_name='items',
        verbose_name='Платёж'
    )
    product = models.ForeignKey(
        'catalog.Product',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='payment_items',
        verbose_name='Товар из каталога'
    )
    raw_name = models.CharField(
        max_length=500,
        verbose_name='Исходное название из счёта'
    )
    quantity = models.DecimalField(
        max_digits=14,
        decimal_places=3,
        verbose_name='Количество'
    )
    unit = models.CharField(
        max_length=20,
        verbose_name='Единица измерения'
    )
    price_per_unit = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        verbose_name='Цена за единицу'
    )
    amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        verbose_name='Сумма'
    )
    vat_amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name='НДС по позиции'
    )
    
    class Meta:
        verbose_name = 'Позиция платежа'
        verbose_name_plural = 'Позиции платежей'
        ordering = ['id']
    
    def __str__(self):
        return f"{self.raw_name} x{self.quantity}"
    
    def save(self, *args, **kwargs):
        # Автоматический расчёт суммы
        if not self.amount:
            self.amount = self.quantity * self.price_per_unit
        super().save(*args, **kwargs)
```

### 3.2. Валидация файла в модели Payment

#### payments/models.py (изменение)

```python
from django.core.validators import FileExtensionValidator

class Payment(TimestampedModel):
    # ... существующие поля ...
    
    scan_file = models.FileField(
        upload_to=payment_scan_path,
        verbose_name='Документ (счёт/акт)',
        help_text='PDF для расходов, любой формат для доходов'
    )
    
    def clean(self):
        # ... существующая валидация ...
        
        # Валидация формата файла
        if self.scan_file and self.payment_type == self.PaymentType.EXPENSE:
            filename = self.scan_file.name.lower()
            if not filename.endswith('.pdf'):
                raise ValidationError({
                    'scan_file': 'Для расходных платежей допускается только формат PDF'
                })
```

### 3.3. Сериализаторы для PaymentItem

#### payments/serializers.py (дополнение)

```python
from .models import PaymentItem


class PaymentItemSerializer(serializers.ModelSerializer):
    """Сериализатор позиции платежа"""
    
    product_name = serializers.CharField(source='product.name', read_only=True, allow_null=True)
    product_category = serializers.CharField(source='product.category.name', read_only=True, allow_null=True)
    
    class Meta:
        model = PaymentItem
        fields = [
            'id', 'raw_name', 'product', 'product_name', 'product_category',
            'quantity', 'unit', 'price_per_unit', 'amount', 'vat_amount',
            'created_at'
        ]
        read_only_fields = ['id', 'product_name', 'product_category', 'created_at']


class PaymentItemCreateSerializer(serializers.ModelSerializer):
    """Сериализатор для создания позиций платежа"""
    
    class Meta:
        model = PaymentItem
        fields = ['raw_name', 'quantity', 'unit', 'price_per_unit', 'vat_amount']


# Обновляем PaymentSerializer для включения items
class PaymentSerializer(serializers.ModelSerializer):
    # ... существующие поля ...
    
    items = PaymentItemSerializer(many=True, read_only=True)
    items_input = PaymentItemCreateSerializer(many=True, write_only=True, required=False)
    items_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Payment
        fields = [
            # ... существующие поля ...
            'items', 'items_input', 'items_count'
        ]
    
    def get_items_count(self, obj):
        return obj.items.count()
    
    def create(self, validated_data):
        items_data = validated_data.pop('items_input', [])
        payment = super().create(validated_data)
        
        # Создаём позиции платежа
        if items_data:
            from catalog.services import ProductMatcher
            from catalog.models import ProductPriceHistory
            
            matcher = ProductMatcher()
            
            for item_data in items_data:
                # Ищем или создаём товар в каталоге
                product, created = matcher.find_or_create_product(
                    name=item_data['raw_name'],
                    unit=item_data.get('unit', 'шт'),
                    payment=payment
                )
                
                # Создаём позицию платежа
                payment_item = PaymentItem.objects.create(
                    payment=payment,
                    product=product,
                    **item_data
                )
                
                # Записываем историю цен
                if payment.vendor:
                    ProductPriceHistory.objects.create(
                        product=product,
                        counterparty=payment.vendor,
                        price=item_data['price_per_unit'],
                        unit=item_data.get('unit', 'шт'),
                        invoice_date=payment.date,
                        invoice_number=payment.description or '',
                        payment=payment
                    )
        
        return payment
```

**Примечание:** Позиции создаются вместе с платежом через поле `items_input`.

### 3.4. Миграции

```bash
python manage.py makemigrations payments
python manage.py migrate
```

---

## Фаза 4: LLM-провайдеры

### 4.1. Базовый класс провайдера

#### llm_services/providers/base.py

```python
from abc import ABC, abstractmethod
from typing import Optional
import hashlib
from ..schemas import ParsedInvoice


class BaseLLMProvider(ABC):
    """Базовый класс для LLM-провайдеров"""
    
    def __init__(self, api_key: str, model_name: str):
        self.api_key = api_key
        self.model_name = model_name
    
    @abstractmethod
    def parse_invoice(self, pdf_content: bytes) -> ParsedInvoice:
        """
        Парсит PDF-счёт и возвращает структурированные данные.
        
        Args:
            pdf_content: Содержимое PDF-файла в байтах
            
        Returns:
            ParsedInvoice: Структурированные данные счёта
        """
        pass
    
    def get_system_prompt(self) -> str:
        """Системный промпт для LLM"""
        return """Ты — эксперт по распознаванию российских счетов на оплату.
        
Твоя задача — извлечь все данные из счёта и вернуть их в формате JSON.

Обязательные поля:
- vendor: информация о поставщике (name, inn, kpp)
- buyer: информация о покупателе (name, inn)  
- invoice: номер и дата счёта (number, date в формате YYYY-MM-DD)
- totals: итоговые суммы (amount_gross — сумма с НДС, vat_amount — сумма НДС)
- items: массив позиций (name, quantity, unit, price_per_unit)
- confidence: твоя уверенность в корректности данных от 0.0 до 1.0

Правила:
1. Если не можешь определить значение — используй null
2. ИНН должен быть строкой из 10 или 12 цифр
3. Цены и суммы — десятичные числа
4. Единицы измерения: шт, м, м², м³, кг, т, л, компл, ч, усл, ед
5. Дата в формате YYYY-MM-DD

Верни ТОЛЬКО валидный JSON без markdown-форматирования."""
    
    @staticmethod
    def calculate_file_hash(content: bytes) -> str:
        """Вычисляет SHA256 хэш файла"""
        return hashlib.sha256(content).hexdigest()
```

### 4.2. OpenAI провайдер

#### llm_services/providers/openai_provider.py

```python
import base64
import json
import time
from typing import Optional
import fitz  # PyMuPDF
from openai import OpenAI

from .base import BaseLLMProvider
from ..schemas import ParsedInvoice


class OpenAIProvider(BaseLLMProvider):
    """Провайдер OpenAI GPT-4 Vision"""
    
    def __init__(self, api_key: str, model_name: str = "gpt-4o"):
        super().__init__(api_key, model_name)
        self.client = OpenAI(api_key=api_key)
    
    def parse_invoice(self, pdf_content: bytes) -> tuple[ParsedInvoice, int]:
        """
        Парсит PDF через GPT-4 Vision.
        
        Returns:
            tuple: (ParsedInvoice, processing_time_ms)
        """
        start_time = time.time()
        
        # Конвертируем PDF в изображения
        images = self._pdf_to_images(pdf_content)
        
        # Формируем сообщения с изображениями
        messages = [
            {"role": "system", "content": self.get_system_prompt()},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Распарси этот счёт на оплату:"},
                    *[
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{img}",
                                "detail": "high"
                            }
                        }
                        for img in images
                    ]
                ]
            }
        ]
        
        response = self.client.chat.completions.create(
            model=self.model_name,
            messages=messages,
            max_tokens=4096,
            temperature=0.1,
            response_format={"type": "json_object"}
        )
        
        processing_time = int((time.time() - start_time) * 1000)
        
        # Парсим ответ
        content = response.choices[0].message.content
        data = json.loads(content)
        
        parsed = ParsedInvoice(**data)
        return parsed, processing_time
    
    def _pdf_to_images(self, pdf_content: bytes, dpi: int = 150) -> list[str]:
        """Конвертирует PDF в base64-изображения"""
        doc = fitz.open(stream=pdf_content, filetype="pdf")
        images = []
        
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            # Увеличиваем разрешение для лучшего распознавания
            mat = fitz.Matrix(dpi / 72, dpi / 72)
            pix = page.get_pixmap(matrix=mat)
            img_bytes = pix.tobytes("png")
            img_base64 = base64.b64encode(img_bytes).decode()
            images.append(img_base64)
        
        doc.close()
        return images
```

### 4.3. Google Gemini провайдер

#### llm_services/providers/gemini_provider.py

```python
import base64
import json
import time
import fitz
import google.generativeai as genai

from .base import BaseLLMProvider
from ..schemas import ParsedInvoice


class GeminiProvider(BaseLLMProvider):
    """Провайдер Google Gemini"""
    
    def __init__(self, api_key: str, model_name: str = "gemini-1.5-pro"):
        super().__init__(api_key, model_name)
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(model_name)
    
    def parse_invoice(self, pdf_content: bytes) -> tuple[ParsedInvoice, int]:
        """Парсит PDF через Gemini"""
        start_time = time.time()
        
        # Конвертируем PDF в изображения
        images = self._pdf_to_images(pdf_content)
        
        # Формируем контент
        content = [self.get_system_prompt(), "Распарси этот счёт:"]
        for img_bytes in images:
            content.append({
                "mime_type": "image/png",
                "data": img_bytes
            })
        
        response = self.model.generate_content(
            content,
            generation_config=genai.GenerationConfig(
                temperature=0.1,
                response_mime_type="application/json"
            )
        )
        
        processing_time = int((time.time() - start_time) * 1000)
        
        data = json.loads(response.text)
        parsed = ParsedInvoice(**data)
        return parsed, processing_time
    
    def _pdf_to_images(self, pdf_content: bytes, dpi: int = 150) -> list[bytes]:
        """Конвертирует PDF в bytes изображений"""
        doc = fitz.open(stream=pdf_content, filetype="pdf")
        images = []
        
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            mat = fitz.Matrix(dpi / 72, dpi / 72)
            pix = page.get_pixmap(matrix=mat)
            images.append(pix.tobytes("png"))
        
        doc.close()
        return images
```

### 4.4. Grok провайдер

#### llm_services/providers/grok_provider.py

```python
import base64
import json
import time
import fitz
import httpx

from .base import BaseLLMProvider
from ..schemas import ParsedInvoice


class GrokProvider(BaseLLMProvider):
    """Провайдер xAI Grok"""
    
    BASE_URL = "https://api.x.ai/v1"
    
    def __init__(self, api_key: str, model_name: str = "grok-2-vision-1212"):
        super().__init__(api_key, model_name)
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
    
    def parse_invoice(self, pdf_content: bytes) -> tuple[ParsedInvoice, int]:
        """Парсит PDF через Grok Vision"""
        start_time = time.time()
        
        images = self._pdf_to_images(pdf_content)
        
        # Формируем запрос в формате OpenAI-совместимого API
        content = [
            {"type": "text", "text": "Распарси этот счёт на оплату:"}
        ]
        for img_b64 in images:
            content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/png;base64,{img_b64}",
                    "detail": "high"
                }
            })
        
        payload = {
            "model": self.model_name,
            "messages": [
                {"role": "system", "content": self.get_system_prompt()},
                {"role": "user", "content": content}
            ],
            "temperature": 0.1,
            "response_format": {"type": "json_object"}
        }
        
        with httpx.Client(timeout=60.0) as client:
            response = client.post(
                f"{self.BASE_URL}/chat/completions",
                headers=self.headers,
                json=payload
            )
            response.raise_for_status()
        
        processing_time = int((time.time() - start_time) * 1000)
        
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        parsed_data = json.loads(content)
        
        parsed = ParsedInvoice(**parsed_data)
        return parsed, processing_time
    
    def _pdf_to_images(self, pdf_content: bytes, dpi: int = 150) -> list[str]:
        """Конвертирует PDF в base64"""
        doc = fitz.open(stream=pdf_content, filetype="pdf")
        images = []
        
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            mat = fitz.Matrix(dpi / 72, dpi / 72)
            pix = page.get_pixmap(matrix=mat)
            img_bytes = pix.tobytes("png")
            images.append(base64.b64encode(img_bytes).decode())
        
        doc.close()
        return images
```

### 4.5. Фабрика провайдеров

#### llm_services/providers/__init__.py

```python
from .base import BaseLLMProvider
from .openai_provider import OpenAIProvider
from .gemini_provider import GeminiProvider
from .grok_provider import GrokProvider
from ..models import LLMProvider


def get_provider(provider_model: LLMProvider = None) -> BaseLLMProvider:
    """
    Фабрика для создания LLM-провайдера.
    
    Args:
        provider_model: Модель провайдера из БД. Если None — берёт по умолчанию.
    
    Returns:
        Экземпляр провайдера
    """
    if provider_model is None:
        provider_model = LLMProvider.get_default()
    
    api_key = provider_model.get_api_key()
    
    providers_map = {
        LLMProvider.ProviderType.OPENAI: OpenAIProvider,
        LLMProvider.ProviderType.GEMINI: GeminiProvider,
        LLMProvider.ProviderType.GROK: GrokProvider,
    }
    
    provider_class = providers_map.get(provider_model.provider_type)
    if not provider_class:
        raise ValueError(f"Неизвестный тип провайдера: {provider_model.provider_type}")
    
    return provider_class(api_key=api_key, model_name=provider_model.model_name)
```

---

## Фаза 5: Сервисы сопоставления

### 5.1. Сопоставление контрагентов

#### llm_services/services/entity_matcher.py

```python
from typing import Optional, List, Dict
from fuzzywuzzy import fuzz
from accounting.models import Counterparty, LegalEntity


class CounterpartyMatcher:
    """Сервис для сопоставления контрагентов"""
    
    EXACT_THRESHOLD = 0.95
    SIMILAR_THRESHOLD = 0.8
    
    def find_by_inn(self, inn: str) -> Optional[Counterparty]:
        """Точный поиск по ИНН"""
        return Counterparty.objects.filter(inn=inn, is_active=True).first()
    
    def find_similar_by_name(
        self,
        name: str,
        limit: int = 5
    ) -> List[Dict]:
        """Fuzzy-поиск по названию"""
        counterparties = Counterparty.objects.filter(
            is_active=True
        ).values_list('id', 'name', 'short_name', 'inn')
        
        results = []
        name_lower = name.lower()
        
        for cp_id, cp_name, cp_short, cp_inn in counterparties:
            # Сравниваем с полным и коротким названием
            score_full = fuzz.token_set_ratio(name_lower, cp_name.lower()) / 100.0
            score_short = 0
            if cp_short:
                score_short = fuzz.token_set_ratio(name_lower, cp_short.lower()) / 100.0
            
            max_score = max(score_full, score_short)
            
            if max_score >= self.SIMILAR_THRESHOLD:
                results.append({
                    'id': cp_id,
                    'name': cp_name,
                    'short_name': cp_short,
                    'inn': cp_inn,
                    'score': max_score
                })
        
        results.sort(key=lambda x: x['score'], reverse=True)
        return results[:limit]
    
    def match(self, name: str, inn: str) -> Dict:
        """
        Полный поиск контрагента.
        
        Returns:
            {
                'match_type': 'exact' | 'similar' | 'not_found',
                'counterparty': Counterparty | None,
                'suggestions': [...]
            }
        """
        # 1. Точный поиск по ИНН
        if inn:
            exact = self.find_by_inn(inn)
            if exact:
                return {
                    'match_type': 'exact',
                    'counterparty': exact,
                    'suggestions': []
                }
        
        # 2. Fuzzy-поиск по названию
        similar = self.find_similar_by_name(name)
        if similar and similar[0]['score'] >= self.EXACT_THRESHOLD:
            counterparty = Counterparty.objects.get(pk=similar[0]['id'])
            return {
                'match_type': 'exact',
                'counterparty': counterparty,
                'suggestions': []
            }
        
        if similar:
            return {
                'match_type': 'similar',
                'counterparty': None,
                'suggestions': similar
            }
        
        return {
            'match_type': 'not_found',
            'counterparty': None,
            'suggestions': []
        }


class LegalEntityMatcher:
    """Сервис для сопоставления наших юрлиц"""
    
    def find_by_inn(self, inn: str) -> Optional[LegalEntity]:
        """Точный поиск по ИНН"""
        return LegalEntity.objects.filter(inn=inn, is_active=True).first()
    
    def match(self, name: str, inn: str) -> Dict:
        """
        Поиск нашего юрлица.
        
        Returns:
            {
                'match_type': 'exact' | 'not_found',
                'legal_entity': LegalEntity | None,
                'error': str | None
            }
        """
        if inn:
            entity = self.find_by_inn(inn)
            if entity:
                return {
                    'match_type': 'exact',
                    'legal_entity': entity,
                    'error': None
                }
        
        return {
            'match_type': 'not_found',
            'legal_entity': None,
            'error': f'Юридическое лицо с ИНН {inn} не найдено в системе'
        }
```

### 5.2. Главный сервис парсинга

#### llm_services/services/document_parser.py

```python
import logging
from typing import Optional, Dict, Any
from django.db import transaction

from ..models import LLMProvider, ParsedDocument
from ..providers import get_provider, BaseLLMProvider
from ..schemas import ParsedInvoice
from .entity_matcher import CounterpartyMatcher, LegalEntityMatcher
from catalog.services import ProductMatcher

logger = logging.getLogger(__name__)


class RateLimitError(Exception):
    """Ошибка превышения лимита запросов"""
    pass


class DocumentParser:
    """Главный сервис для парсинга документов"""
    
    CONFIDENCE_THRESHOLD = 0.7
    MAX_RETRIES = 2
    
    def __init__(self, provider: LLMProvider = None):
        self.provider_model = provider or LLMProvider.get_default()
        self.provider = get_provider(self.provider_model)
        self.counterparty_matcher = CounterpartyMatcher()
        self.legal_entity_matcher = LegalEntityMatcher()
        self.product_matcher = ProductMatcher()
    
    def parse_invoice(
        self,
        pdf_content: bytes,
        filename: str,
        payment=None
    ) -> Dict[str, Any]:
        """
        Парсит счёт и возвращает структурированные данные.
        
        Args:
            pdf_content: Содержимое PDF
            filename: Имя файла
            payment: Связанный платёж (опционально)
        
        Returns:
            {
                'success': bool,
                'parsed_document': ParsedDocument,
                'data': {...},  # Распарсенные данные
                'matches': {...},  # Результаты сопоставления
                'warnings': [...],
                'error': str | None
            }
        """
        file_hash = BaseLLMProvider.calculate_file_hash(pdf_content)
        
        # Проверяем кэш
        cached = ParsedDocument.objects.filter(
            file_hash=file_hash,
            status=ParsedDocument.Status.SUCCESS
        ).first()
        
        if cached:
            logger.info(f"Используем кэш для файла {filename}")
            return self._build_response(cached, from_cache=True)
        
        # Парсим через LLM
        parsed_doc = ParsedDocument.objects.create(
            file_hash=file_hash,
            original_filename=filename,
            payment=payment,
            provider=self.provider_model,
            status=ParsedDocument.Status.PENDING
        )
        
        try:
            parsed_invoice, processing_time = self._parse_with_retries(pdf_content)
            
            parsed_doc.parsed_data = parsed_invoice.model_dump(mode='json')
            parsed_doc.confidence_score = parsed_invoice.confidence
            parsed_doc.processing_time_ms = processing_time
            
            if parsed_invoice.confidence < self.CONFIDENCE_THRESHOLD:
                parsed_doc.status = ParsedDocument.Status.NEEDS_REVIEW
            else:
                parsed_doc.status = ParsedDocument.Status.SUCCESS
            
            parsed_doc.save()
            
            return self._build_response(parsed_doc)
            
        except RateLimitError as e:
            parsed_doc.status = ParsedDocument.Status.FAILED
            parsed_doc.error_message = "Превышен лимит запросов. Попробуйте позже."
            parsed_doc.save()
            raise
            
        except Exception as e:
            logger.exception(f"Ошибка парсинга: {e}")
            parsed_doc.status = ParsedDocument.Status.FAILED
            parsed_doc.error_message = str(e)
            parsed_doc.save()
            
            return {
                'success': False,
                'parsed_document': parsed_doc,
                'data': None,
                'matches': None,
                'warnings': [],
                'error': str(e)
            }
    
    def _parse_with_retries(self, pdf_content: bytes) -> tuple[ParsedInvoice, int]:
        """Парсинг с retry-логикой"""
        last_error = None
        
        for attempt in range(self.MAX_RETRIES + 1):
            try:
                return self.provider.parse_invoice(pdf_content)
            except Exception as e:
                last_error = e
                error_str = str(e).lower()
                
                # Проверяем rate limit
                if '429' in error_str or 'rate limit' in error_str:
                    raise RateLimitError(str(e))
                
                if attempt < self.MAX_RETRIES:
                    logger.warning(f"Попытка {attempt + 1} не удалась, повторяем...")
                    continue
        
        raise last_error
    
    def _build_response(
        self,
        parsed_doc: ParsedDocument,
        from_cache: bool = False
    ) -> Dict[str, Any]:
        """Формирует ответ с сопоставлениями"""
        data = parsed_doc.parsed_data
        warnings = []
        
        # Сопоставляем контрагента
        vendor_match = self.counterparty_matcher.match(
            name=data['vendor']['name'],
            inn=data['vendor'].get('inn', '')
        )
        if vendor_match['match_type'] == 'similar':
            warnings.append('Контрагент найден неточно, требуется подтверждение')
        elif vendor_match['match_type'] == 'not_found':
            warnings.append('Контрагент не найден, будет предложено создать нового')
        
        # Сопоставляем наше юрлицо
        buyer_match = self.legal_entity_matcher.match(
            name=data['buyer']['name'],
            inn=data['buyer'].get('inn', '')
        )
        if buyer_match['match_type'] == 'not_found':
            warnings.append(buyer_match['error'])
        
        # Сопоставляем товары (без сохранения — только поиск)
        products_matches = []
        for item in data.get('items', []):
            similar = self.product_matcher.find_similar(item['name'], threshold=0.7, limit=3)
            products_matches.append({
                'raw_name': item['name'],
                'similar_products': similar
            })
        
        # Низкая уверенность
        if parsed_doc.confidence_score and parsed_doc.confidence_score < self.CONFIDENCE_THRESHOLD:
            warnings.append(f'Низкая уверенность парсинга: {parsed_doc.confidence_score:.0%}')
        
        return {
            'success': True,
            'from_cache': from_cache,
            'parsed_document': parsed_doc,
            'data': data,
            'matches': {
                'vendor': vendor_match,
                'buyer': buyer_match,
                'products': products_matches
            },
            'warnings': warnings,
            'error': None
        }
```

---

## Фаза 6: Интеграция с платежами

### 6.1. API для парсинга

#### llm_services/views.py

```python
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser
from drf_spectacular.utils import extend_schema

from .models import LLMProvider, ParsedDocument
from .serializers import LLMProviderSerializer, ParsedDocumentSerializer
from .services.document_parser import DocumentParser, RateLimitError


class LLMProviderViewSet(viewsets.ModelViewSet):
    """ViewSet для управления LLM-провайдерами"""
    
    queryset = LLMProvider.objects.all()
    serializer_class = LLMProviderSerializer
    permission_classes = [IsAuthenticated]
    
    @extend_schema(summary='Установить провайдер по умолчанию', tags=['LLM'])
    @action(detail=True, methods=['post'])
    def set_default(self, request, pk=None):
        """Устанавливает провайдер как default"""
        provider = self.get_object()
        provider.is_default = True
        provider.save()
        return Response(LLMProviderSerializer(provider).data)


@extend_schema(summary='Парсинг PDF-счёта', tags=['LLM'])
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def parse_invoice(request):
    """
    Парсит загруженный PDF-счёт через LLM.
    
    Возвращает структурированные данные и результаты сопоставления.
    """
    if 'file' not in request.FILES:
        return Response(
            {'error': 'Файл не загружен'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    file = request.FILES['file']
    
    if not file.name.lower().endswith('.pdf'):
        return Response(
            {'error': 'Допускается только PDF формат'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    pdf_content = file.read()
    
    parser = DocumentParser()
    
    try:
        result = parser.parse_invoice(
            pdf_content=pdf_content,
            filename=file.name
        )
        
        return Response({
            'success': result['success'],
            'from_cache': result.get('from_cache', False),
            'document_id': result['parsed_document'].id if result['parsed_document'] else None,
            'data': result['data'],
            'matches': {
                'vendor': {
                    'match_type': result['matches']['vendor']['match_type'],
                    'counterparty_id': (
                        result['matches']['vendor']['counterparty'].id
                        if result['matches']['vendor']['counterparty'] else None
                    ),
                    'suggestions': result['matches']['vendor']['suggestions']
                },
                'buyer': {
                    'match_type': result['matches']['buyer']['match_type'],
                    'legal_entity_id': (
                        result['matches']['buyer']['legal_entity'].id
                        if result['matches']['buyer']['legal_entity'] else None
                    ),
                    'error': result['matches']['buyer'].get('error')
                },
                'products': result['matches']['products']
            },
            'warnings': result['warnings'],
            'error': result['error']
        })
        
    except RateLimitError:
        return Response(
            {'error': 'Превышен лимит запросов к LLM. Попробуйте позже.'},
            status=status.HTTP_429_TOO_MANY_REQUESTS
        )
```

### 6.2. URLs

#### llm_services/urls.py

```python
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import LLMProviderViewSet, parse_invoice

router = DefaultRouter()
router.register(r'llm-providers', LLMProviderViewSet, basename='llm-provider')

urlpatterns = [
    path('', include(router.urls)),
    path('llm/parse-invoice/', parse_invoice, name='parse-invoice'),
]
```

### 6.3. Регистрация приложения

#### finans_assistant/settings.py

```python
INSTALLED_APPS = [
    # ...
    'llm_services',
]
```

#### finans_assistant/urls.py

```python
urlpatterns = [
    # ...
    path('api/v1/', include('llm_services.urls')),
]
```

---

> ### 🚀 ТОЧКА СТАРТА FRONTEND (ОСНОВНАЯ)
> 
> **После завершения Фазы 6 можно начинать на Frontend:**
> - **Этап 1: Расширение формы платежа** — загрузка PDF, парсинг, предзаполнение
> - **Этап 5: Настройки LLM** — страница выбора провайдера
> 
> **Готовые API:**
> - `POST /api/v1/llm/parse-invoice/` — парсинг PDF-счёта через LLM
> - `GET /api/v1/llm-providers/` — список провайдеров
> - `POST /api/v1/llm-providers/{id}/set_default/` — установить по умолчанию
> 
> **Ответ parse-invoice содержит:**
> - Распарсенные данные счёта (контрагент, суммы, позиции)
> - Результаты сопоставления с БД (vendor, buyer, products)
> - Warnings для пользователя
> 
> **⚠️ Важно:** Этап 1 Frontend — самый сложный, рекомендуется начинать после полной готовности API.

---

## Фаза 7: Management-команды

### 7.1. Импорт счетов

#### llm_services/management/commands/import_invoices.py

```python
import os
import sys
from pathlib import Path
from django.core.management.base import BaseCommand, CommandError
from llm_services.models import LLMProvider
from llm_services.services.document_parser import DocumentParser, RateLimitError


class Command(BaseCommand):
    help = 'Массовый импорт PDF-счетов из директории'
    
    def add_arguments(self, parser):
        parser.add_argument(
            'directory',
            type=str,
            help='Путь к директории с PDF-файлами'
        )
        parser.add_argument(
            '--provider',
            type=str,
            default='openai',
            choices=['openai', 'gemini', 'grok'],
            help='LLM-провайдер для парсинга'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Только показать файлы, не парсить'
        )
    
    def handle(self, *args, **options):
        directory = Path(options['directory'])
        
        if not directory.exists():
            raise CommandError(f'Директория не найдена: {directory}')
        
        # Получаем провайдер
        provider = LLMProvider.objects.filter(
            provider_type=options['provider'],
            is_active=True
        ).first()
        
        if not provider:
            raise CommandError(f'Провайдер {options["provider"]} не настроен')
        
        # Собираем PDF-файлы
        pdf_files = list(directory.glob('**/*.pdf'))
        
        self.stdout.write(f'Найдено {len(pdf_files)} PDF-файлов')
        
        if options['dry_run']:
            for f in pdf_files:
                self.stdout.write(f'  - {f.name}')
            return
        
        parser = DocumentParser(provider=provider)
        
        success_count = 0
        error_count = 0
        skip_count = 0
        
        for i, pdf_path in enumerate(pdf_files, 1):
            self.stdout.write(f'[{i}/{len(pdf_files)}] {pdf_path.name}... ', ending='')
            
            try:
                with open(pdf_path, 'rb') as f:
                    content = f.read()
                
                result = parser.parse_invoice(
                    pdf_content=content,
                    filename=pdf_path.name
                )
                
                if result['from_cache']:
                    self.stdout.write(self.style.WARNING('КЭШИРОВАНО'))
                    skip_count += 1
                elif result['success']:
                    self.stdout.write(self.style.SUCCESS('OK'))
                    success_count += 1
                else:
                    self.stdout.write(self.style.ERROR(f'ОШИБКА: {result["error"]}'))
                    error_count += 1
                    
            except RateLimitError:
                self.stdout.write(self.style.ERROR('RATE LIMIT'))
                self.stdout.write(self.style.WARNING('Достигнут лимит запросов. Остановка.'))
                break
                
            except Exception as e:
                self.stdout.write(self.style.ERROR(f'ОШИБКА: {e}'))
                error_count += 1
        
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS(f'Успешно: {success_count}'))
        self.stdout.write(self.style.WARNING(f'Из кэша: {skip_count}'))
        self.stdout.write(self.style.ERROR(f'Ошибки: {error_count}'))
```

### 7.2. Наполнение провайдеров

#### llm_services/management/commands/setup_llm_providers.py

```python
from django.core.management.base import BaseCommand
from llm_services.models import LLMProvider


class Command(BaseCommand):
    help = 'Настройка LLM-провайдеров'
    
    def handle(self, *args, **options):
        providers = [
            {
                'provider_type': LLMProvider.ProviderType.OPENAI,
                'model_name': 'gpt-4o',
                'env_key_name': 'OPENAI_API_KEY',
                'is_default': True,
            },
            {
                'provider_type': LLMProvider.ProviderType.GEMINI,
                'model_name': 'gemini-1.5-pro',
                'env_key_name': 'GOOGLE_AI_API_KEY',
                'is_default': False,
            },
            {
                'provider_type': LLMProvider.ProviderType.GROK,
                'model_name': 'grok-2-vision-1212',
                'env_key_name': 'GROK_API_KEY',
                'is_default': False,
            },
        ]
        
        for data in providers:
            provider, created = LLMProvider.objects.update_or_create(
                provider_type=data['provider_type'],
                defaults=data
            )
            action = 'Создан' if created else 'Обновлён'
            self.stdout.write(f'{action}: {provider}')
        
        self.stdout.write(self.style.SUCCESS('Провайдеры настроены'))
```

---

## Фаза 8: Тесты

> **Требование:** Высокое покрытие кода (>80%). Все основные сценарии должны быть покрыты тестами.

### 8.1. Тесты catalog — модели

#### catalog/tests/test_models.py

```python
from django.test import TestCase
from django.core.exceptions import ValidationError
from catalog.models import Category, Product, ProductAlias, ProductPriceHistory
from accounting.models import Counterparty


class CategoryModelTest(TestCase):
    """Тесты модели Category"""
    
    def test_create_root_category(self):
        """Создание корневой категории"""
        category = Category.objects.create(
            name='Оборудование',
            code='equipment'
        )
        self.assertEqual(category.level, 0)
        self.assertIsNone(category.parent)
        self.assertEqual(category.get_full_path(), 'Оборудование')
    
    def test_create_nested_category(self):
        """Создание вложенной категории"""
        root = Category.objects.create(name='Оборудование', code='equipment')
        child = Category.objects.create(
            name='Вентиляция',
            code='ventilation',
            parent=root
        )
        self.assertEqual(child.level, 1)
        self.assertEqual(child.get_full_path(), 'Оборудование → Вентиляция')
    
    def test_category_deep_nesting(self):
        """Глубокая вложенность категорий (3+ уровня)"""
        l1 = Category.objects.create(name='L1', code='l1')
        l2 = Category.objects.create(name='L2', code='l2', parent=l1)
        l3 = Category.objects.create(name='L3', code='l3', parent=l2)
        l4 = Category.objects.create(name='L4', code='l4', parent=l3)
        
        self.assertEqual(l4.level, 3)
        self.assertEqual(l4.get_full_path(), 'L1 → L2 → L3 → L4')
    
    def test_category_code_unique(self):
        """Уникальность кода категории"""
        Category.objects.create(name='Test', code='test')
        with self.assertRaises(Exception):
            Category.objects.create(name='Test 2', code='test')
    
    def test_get_children(self):
        """Получение дочерних категорий"""
        parent = Category.objects.create(name='Parent', code='parent')
        child1 = Category.objects.create(name='Child 1', code='child1', parent=parent)
        child2 = Category.objects.create(name='Child 2', code='child2', parent=parent)
        
        children = parent.children.all()
        self.assertEqual(children.count(), 2)
        self.assertIn(child1, children)
        self.assertIn(child2, children)


class ProductModelTest(TestCase):
    """Тесты модели Product"""
    
    def setUp(self):
        self.category = Category.objects.create(name='Test', code='test')
    
    def test_create_product(self):
        """Создание товара"""
        product = Product.objects.create(
            name='Вентилятор канальный ВКК-125',
            category=self.category
        )
        self.assertEqual(product.status, Product.Status.NEW)
        self.assertIsNotNone(product.normalized_name)
    
    def test_normalize_name(self):
        """Нормализация названия товара"""
        name = 'Вентилятор ВКК-125 (220В)'
        normalized = Product.normalize_name(name)
        
        # Должен быть lowercase и без лишних символов
        self.assertEqual(normalized, normalized.lower())
        self.assertNotIn('(', normalized)
        self.assertNotIn(')', normalized)
    
    def test_auto_normalize_on_save(self):
        """Автоматическая нормализация при сохранении"""
        product = Product.objects.create(
            name='ВЕНТИЛЯТОР ВКК-125'
        )
        self.assertIsNotNone(product.normalized_name)
        self.assertEqual(product.normalized_name, product.normalized_name.lower())
    
    def test_product_is_service_flag(self):
        """Флаг услуги"""
        service = Product.objects.create(
            name='Монтажные работы',
            is_service=True
        )
        self.assertTrue(service.is_service)
    
    def test_product_status_transitions(self):
        """Переходы статусов товара"""
        product = Product.objects.create(name='Test')
        
        # new -> verified
        product.status = Product.Status.VERIFIED
        product.save()
        self.assertEqual(product.status, Product.Status.VERIFIED)
        
        # verified -> archived
        product.status = Product.Status.ARCHIVED
        product.save()
        self.assertEqual(product.status, Product.Status.ARCHIVED)
    
    def test_product_merge(self):
        """Объединение товаров"""
        target = Product.objects.create(name='Target Product')
        source = Product.objects.create(name='Source Product')
        
        source.status = Product.Status.MERGED
        source.merged_into = target
        source.save()
        
        self.assertEqual(source.status, Product.Status.MERGED)
        self.assertEqual(source.merged_into, target)


class ProductAliasModelTest(TestCase):
    """Тесты модели ProductAlias"""
    
    def setUp(self):
        self.product = Product.objects.create(name='Вентилятор ВКК-125')
    
    def test_create_alias(self):
        """Создание синонима"""
        alias = ProductAlias.objects.create(
            product=self.product,
            alias_name='ВКК 125 вентилятор'
        )
        self.assertIsNotNone(alias.normalized_alias)
    
    def test_alias_normalized(self):
        """Нормализация синонима"""
        alias = ProductAlias.objects.create(
            product=self.product,
            alias_name='ВЕНТИЛЯТОР ВКК-125 (Канальный)'
        )
        self.assertEqual(alias.normalized_alias, alias.normalized_alias.lower())


class ProductPriceHistoryTest(TestCase):
    """Тесты модели ProductPriceHistory"""
    
    def setUp(self):
        self.product = Product.objects.create(name='Test Product')
        self.counterparty = Counterparty.objects.create(
            name='Тест Поставщик',
            inn='1234567890'
        )
    
    def test_create_price_history(self):
        """Создание записи истории цен"""
        from datetime import date
        from decimal import Decimal
        
        price = ProductPriceHistory.objects.create(
            product=self.product,
            counterparty=self.counterparty,
            price=Decimal('1500.00'),
            unit='шт',
            invoice_date=date.today(),
            invoice_number='СЧ-001'
        )
        self.assertEqual(price.product, self.product)
        self.assertEqual(price.counterparty, self.counterparty)
    
    def test_price_history_ordering(self):
        """Сортировка по дате (новые первые)"""
        from datetime import date, timedelta
        from decimal import Decimal
        
        old = ProductPriceHistory.objects.create(
            product=self.product,
            counterparty=self.counterparty,
            price=Decimal('1000.00'),
            unit='шт',
            invoice_date=date.today() - timedelta(days=30),
            invoice_number='СЧ-001'
        )
        new = ProductPriceHistory.objects.create(
            product=self.product,
            counterparty=self.counterparty,
            price=Decimal('1100.00'),
            unit='шт',
            invoice_date=date.today(),
            invoice_number='СЧ-002'
        )
        
        prices = list(ProductPriceHistory.objects.filter(product=self.product))
        self.assertEqual(prices[0], new)
        self.assertEqual(prices[1], old)
```

### 8.2. Тесты catalog — сервисы

#### catalog/tests/test_services.py

```python
from django.test import TestCase
from catalog.models import Product, ProductAlias
from catalog.services import ProductMatcher


class ProductMatcherTest(TestCase):
    """Тесты сервиса ProductMatcher"""
    
    def setUp(self):
        self.matcher = ProductMatcher()
        
        # Создаём тестовые товары
        self.product1 = Product.objects.create(
            name='Вентилятор канальный ВКК-125',
            status=Product.Status.VERIFIED
        )
        self.product2 = Product.objects.create(
            name='Вентилятор радиальный ВР-80',
            status=Product.Status.VERIFIED
        )
        self.product3 = Product.objects.create(
            name='Гвозди строительные 50мм',
            status=Product.Status.NEW
        )
    
    def test_find_similar_exact_match(self):
        """Поиск точного совпадения"""
        similar = self.matcher.find_similar(
            'Вентилятор канальный ВКК-125',
            threshold=0.9
        )
        self.assertTrue(len(similar) > 0)
        self.assertEqual(similar[0]['product_id'], self.product1.id)
        self.assertGreaterEqual(similar[0]['score'], 0.9)
    
    def test_find_similar_fuzzy_match(self):
        """Fuzzy-поиск похожих товаров"""
        similar = self.matcher.find_similar(
            'ВКК-125 вентилятор канальный',  # Другой порядок слов
            threshold=0.7
        )
        self.assertTrue(len(similar) > 0)
        self.assertEqual(similar[0]['product_id'], self.product1.id)
    
    def test_find_similar_no_match(self):
        """Нет совпадений"""
        similar = self.matcher.find_similar(
            'Совершенно уникальный товар XYZ-999',
            threshold=0.8
        )
        self.assertEqual(len(similar), 0)
    
    def test_find_similar_respects_threshold(self):
        """Порог схожести работает"""
        similar_high = self.matcher.find_similar('Вентилятор', threshold=0.9)
        similar_low = self.matcher.find_similar('Вентилятор', threshold=0.3)
        
        # При низком пороге должно быть больше результатов
        self.assertGreaterEqual(len(similar_low), len(similar_high))
    
    def test_find_or_create_existing(self):
        """Поиск существующего товара"""
        product, created = self.matcher.find_or_create_product(
            'Вентилятор канальный ВКК-125'
        )
        self.assertFalse(created)
        self.assertEqual(product.id, self.product1.id)
    
    def test_find_or_create_new(self):
        """Создание нового товара"""
        product, created = self.matcher.find_or_create_product(
            'Абсолютно новый уникальный товар XYZ'
        )
        self.assertTrue(created)
        self.assertEqual(product.status, Product.Status.NEW)
    
    def test_find_or_create_creates_alias(self):
        """Создание синонима при похожем совпадении"""
        # Создаём товар с немного другим названием
        product, created = self.matcher.find_or_create_product(
            'Канальный вентилятор ВКК 125'  # Похоже на product1
        )
        
        # Должен найти существующий и создать alias
        self.assertFalse(created)
        self.assertEqual(product.id, self.product1.id)
        
        # Проверяем что alias создан
        alias_exists = ProductAlias.objects.filter(
            product=self.product1,
            alias_name='Канальный вентилятор ВКК 125'
        ).exists()
        self.assertTrue(alias_exists)
    
    def test_find_duplicates(self):
        """Поиск дубликатов"""
        # Создаём потенциальный дубликат
        Product.objects.create(
            name='Гвозди строит. 50 мм',  # Похоже на product3
            status=Product.Status.NEW
        )
        
        duplicates = self.matcher.find_duplicates(threshold=0.7)
        
        # Должен найти группу дубликатов
        self.assertTrue(len(duplicates) > 0)
    
    def test_find_similar_by_alias(self):
        """Поиск по синониму"""
        # Создаём alias
        ProductAlias.objects.create(
            product=self.product1,
            alias_name='Канальник ВКК125'
        )
        
        product, created = self.matcher.find_or_create_product('Канальник ВКК125')
        
        self.assertFalse(created)
        self.assertEqual(product.id, self.product1.id)
```

### 8.3. Тесты catalog — API

#### catalog/tests/test_api.py

```python
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from catalog.models import Category, Product, ProductAlias


User = get_user_model()


class CategoryAPITest(APITestCase):
    """Тесты API категорий"""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.client.force_authenticate(user=self.user)
        
        self.category = Category.objects.create(
            name='Оборудование',
            code='equipment'
        )
    
    def test_list_categories(self):
        """GET /api/v1/catalog/categories/"""
        url = reverse('category-list')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data), 1)
    
    def test_create_category(self):
        """POST /api/v1/catalog/categories/"""
        url = reverse('category-list')
        data = {
            'name': 'Материалы',
            'code': 'materials'
        }
        response = self.client.post(url, data)
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'Материалы')
    
    def test_create_nested_category(self):
        """Создание вложенной категории"""
        url = reverse('category-list')
        data = {
            'name': 'Вентиляция',
            'code': 'ventilation',
            'parent': self.category.id
        }
        response = self.client.post(url, data)
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['level'], 1)
    
    def test_get_category_tree(self):
        """GET /api/v1/catalog/categories/tree/"""
        # Создаём вложенную структуру
        child = Category.objects.create(
            name='Вентиляция',
            code='vent',
            parent=self.category
        )
        
        url = reverse('category-tree')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Проверяем что есть дети
        root = response.data[0]
        self.assertTrue(len(root.get('children', [])) > 0)
    
    def test_update_category(self):
        """PATCH /api/v1/catalog/categories/{id}/"""
        url = reverse('category-detail', args=[self.category.id])
        data = {'name': 'Оборудование обновлённое'}
        response = self.client.patch(url, data)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Оборудование обновлённое')
    
    def test_delete_category(self):
        """DELETE /api/v1/catalog/categories/{id}/"""
        url = reverse('category-detail', args=[self.category.id])
        response = self.client.delete(url)
        
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)


class ProductAPITest(APITestCase):
    """Тесты API товаров"""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.client.force_authenticate(user=self.user)
        
        self.category = Category.objects.create(name='Test', code='test')
        self.product = Product.objects.create(
            name='Тестовый товар',
            category=self.category,
            status=Product.Status.NEW
        )
    
    def test_list_products(self):
        """GET /api/v1/catalog/products/"""
        url = reverse('product-list')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
    
    def test_filter_products_by_status(self):
        """Фильтрация по статусу"""
        url = reverse('product-list')
        response = self.client.get(url, {'status': 'new'})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for product in response.data:
            self.assertEqual(product['status'], 'new')
    
    def test_filter_products_by_category(self):
        """Фильтрация по категории"""
        url = reverse('product-list')
        response = self.client.get(url, {'category': self.category.id})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
    
    def test_search_products(self):
        """Поиск товаров"""
        url = reverse('product-list')
        response = self.client.get(url, {'search': 'Тестовый'})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(len(response.data) > 0)
    
    def test_get_product_detail(self):
        """GET /api/v1/catalog/products/{id}/"""
        url = reverse('product-detail', args=[self.product.id])
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Тестовый товар')
    
    def test_verify_product(self):
        """POST /api/v1/catalog/products/{id}/verify/"""
        url = reverse('product-verify', args=[self.product.id])
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'verified')
    
    def test_archive_product(self):
        """POST /api/v1/catalog/products/{id}/archive/"""
        url = reverse('product-archive', args=[self.product.id])
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'archived')
    
    def test_get_product_prices(self):
        """GET /api/v1/catalog/products/{id}/prices/"""
        url = reverse('product-prices', args=[self.product.id])
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)
    
    def test_find_duplicates(self):
        """GET /api/v1/catalog/products/duplicates/"""
        # Создаём похожие товары
        Product.objects.create(name='Тестовый товар 1')
        Product.objects.create(name='Тестовый товар 2')
        
        url = reverse('product-duplicates')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
    
    def test_merge_products(self):
        """POST /api/v1/catalog/products/merge/"""
        source = Product.objects.create(name='Source Product')
        
        url = reverse('product-merge')
        data = {
            'source_ids': [source.id],
            'target_id': self.product.id
        }
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        source.refresh_from_db()
        self.assertEqual(source.status, Product.Status.MERGED)
        self.assertEqual(source.merged_into_id, self.product.id)
    
    def test_merge_products_invalid_target(self):
        """Объединение с несуществующим target"""
        source = Product.objects.create(name='Source')
        
        url = reverse('product-merge')
        data = {
            'source_ids': [source.id],
            'target_id': 99999
        }
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class ProductAliasAPITest(APITestCase):
    """Тесты API синонимов"""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.client.force_authenticate(user=self.user)
        self.product = Product.objects.create(name='Test Product')
    
    def test_product_includes_aliases(self):
        """Товар включает список синонимов"""
        ProductAlias.objects.create(
            product=self.product,
            alias_name='Alias 1'
        )
        
        url = reverse('product-detail', args=[self.product.id])
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(len(response.data['aliases']) > 0)
```

### 8.4. Тесты llm_services — провайдеры

#### llm_services/tests/test_providers.py

```python
from unittest.mock import Mock, patch, MagicMock
from django.test import TestCase
from llm_services.providers.openai import OpenAIProvider
from llm_services.providers.gemini import GeminiProvider
from llm_services.providers.grok import GrokProvider
from llm_services.schemas import ParsedInvoice


class OpenAIProviderTest(TestCase):
    """Тесты OpenAI провайдера"""
    
    def setUp(self):
        self.provider = OpenAIProvider(
            api_key='test-key',
            model_name='gpt-4o'
        )
    
    @patch('llm_services.providers.openai.openai')
    def test_parse_invoice_success(self, mock_openai):
        """Успешный парсинг через OpenAI"""
        # Мокаем ответ OpenAI
        mock_response = MagicMock()
        mock_response.choices[0].message.content = '''
        {
            "vendor": {"name": "ООО Тест", "inn": "1234567890", "kpp": null},
            "buyer": {"name": "ООО Наша", "inn": "0987654321"},
            "invoice": {"number": "123", "date": "2024-01-15"},
            "totals": {"amount_gross": "10000.00", "vat_amount": "1666.67"},
            "items": [
                {"name": "Товар 1", "quantity": "10", "unit": "шт", "price_per_unit": "1000.00"}
            ],
            "confidence": 0.95
        }
        '''
        mock_openai.chat.completions.create.return_value = mock_response
        
        result = self.provider.parse_invoice(b'fake pdf content')
        
        self.assertIsInstance(result, ParsedInvoice)
        self.assertEqual(result.vendor.inn, '1234567890')
        self.assertEqual(result.confidence, 0.95)
    
    @patch('llm_services.providers.openai.openai')
    def test_parse_invoice_rate_limit(self, mock_openai):
        """Обработка rate limit"""
        from llm_services.services.document_parser import RateLimitError
        import openai
        
        mock_openai.chat.completions.create.side_effect = openai.RateLimitError(
            message='Rate limit exceeded',
            response=Mock(),
            body={}
        )
        
        with self.assertRaises(RateLimitError):
            self.provider.parse_invoice(b'fake pdf')
    
    def test_get_system_prompt(self):
        """Системный промпт содержит нужные инструкции"""
        prompt = self.provider.get_system_prompt()
        
        self.assertIn('JSON', prompt)
        self.assertIn('счёт', prompt.lower())


class GeminiProviderTest(TestCase):
    """Тесты Google Gemini провайдера"""
    
    def setUp(self):
        self.provider = GeminiProvider(
            api_key='test-key',
            model_name='gemini-1.5-pro'
        )
    
    @patch('llm_services.providers.gemini.genai')
    def test_parse_invoice_success(self, mock_genai):
        """Успешный парсинг через Gemini"""
        mock_model = MagicMock()
        mock_response = MagicMock()
        mock_response.text = '''
        {
            "vendor": {"name": "ООО Тест", "inn": "1234567890", "kpp": null},
            "buyer": {"name": "ООО Наша", "inn": "0987654321"},
            "invoice": {"number": "123", "date": "2024-01-15"},
            "totals": {"amount_gross": "10000.00", "vat_amount": "1666.67"},
            "items": [],
            "confidence": 0.9
        }
        '''
        mock_model.generate_content.return_value = mock_response
        mock_genai.GenerativeModel.return_value = mock_model
        
        result = self.provider.parse_invoice(b'fake pdf')
        
        self.assertIsInstance(result, ParsedInvoice)


class GrokProviderTest(TestCase):
    """Тесты Grok провайдера"""
    
    def setUp(self):
        self.provider = GrokProvider(
            api_key='test-key',
            model_name='grok-2-vision'
        )
    
    @patch('llm_services.providers.grok.httpx')
    def test_parse_invoice_success(self, mock_httpx):
        """Успешный парсинг через Grok"""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            'choices': [{
                'message': {
                    'content': '''
                    {
                        "vendor": {"name": "ООО Тест", "inn": "1234567890", "kpp": null},
                        "buyer": {"name": "ООО Наша", "inn": "0987654321"},
                        "invoice": {"number": "123", "date": "2024-01-15"},
                        "totals": {"amount_gross": "10000.00", "vat_amount": "1666.67"},
                        "items": [],
                        "confidence": 0.85
                    }
                    '''
                }
            }]
        }
        mock_response.status_code = 200
        mock_httpx.Client.return_value.__enter__.return_value.post.return_value = mock_response
        
        result = self.provider.parse_invoice(b'fake pdf')
        
        self.assertIsInstance(result, ParsedInvoice)
```

### 8.5. Тесты llm_services — сервис парсинга

#### llm_services/tests/test_document_parser.py

```python
from unittest.mock import Mock, patch, MagicMock
from django.test import TestCase
from django.core.files.uploadedfile import SimpleUploadedFile
from llm_services.models import LLMProvider, ParsedDocument
from llm_services.services.document_parser import DocumentParser, RateLimitError
from llm_services.schemas import ParsedInvoice


class DocumentParserTest(TestCase):
    """Тесты DocumentParser"""
    
    def setUp(self):
        self.provider = LLMProvider.objects.create(
            provider_type='openai',
            model_name='gpt-4o',
            env_key_name='OPENAI_API_KEY',
            is_active=True,
            is_default=True
        )
    
    @patch('llm_services.services.document_parser.get_provider')
    @patch.dict('os.environ', {'OPENAI_API_KEY': 'test-key'})
    def test_parse_invoice_success(self, mock_get_provider):
        """Успешный парсинг счёта"""
        # Мокаем провайдер
        mock_provider = MagicMock()
        mock_provider.parse_invoice.return_value = ParsedInvoice(
            vendor={'name': 'ООО Тест', 'inn': '1234567890', 'kpp': None},
            buyer={'name': 'ООО Наша', 'inn': '0987654321'},
            invoice={'number': '123', 'date': '2024-01-15'},
            totals={'amount_gross': '10000.00', 'vat_amount': '1666.67'},
            items=[],
            confidence=0.95
        )
        mock_get_provider.return_value = mock_provider
        
        parser = DocumentParser()
        result = parser.parse_invoice(
            pdf_content=b'fake pdf content',
            filename='test.pdf'
        )
        
        self.assertTrue(result['success'])
        self.assertIsNotNone(result['data'])
        self.assertIsNotNone(result['parsed_document'])
    
    @patch('llm_services.services.document_parser.get_provider')
    @patch.dict('os.environ', {'OPENAI_API_KEY': 'test-key'})
    def test_parse_invoice_caching(self, mock_get_provider):
        """Кэширование по хэшу файла"""
        mock_provider = MagicMock()
        mock_provider.parse_invoice.return_value = ParsedInvoice(
            vendor={'name': 'ООО Тест', 'inn': '1234567890', 'kpp': None},
            buyer={'name': 'ООО Наша', 'inn': '0987654321'},
            invoice={'number': '123', 'date': '2024-01-15'},
            totals={'amount_gross': '10000.00', 'vat_amount': '1666.67'},
            items=[],
            confidence=0.95
        )
        mock_get_provider.return_value = mock_provider
        
        pdf_content = b'same pdf content'
        parser = DocumentParser()
        
        # Первый вызов
        result1 = parser.parse_invoice(pdf_content, 'test.pdf')
        self.assertFalse(result1.get('from_cache', False))
        
        # Второй вызов с тем же файлом — должен вернуть из кэша
        result2 = parser.parse_invoice(pdf_content, 'test.pdf')
        self.assertTrue(result2.get('from_cache', False))
        
        # Провайдер должен был вызваться только один раз
        self.assertEqual(mock_provider.parse_invoice.call_count, 1)
    
    @patch('llm_services.services.document_parser.get_provider')
    @patch.dict('os.environ', {'OPENAI_API_KEY': 'test-key'})
    def test_parse_invoice_rate_limit(self, mock_get_provider):
        """Обработка rate limit ошибки"""
        mock_provider = MagicMock()
        mock_provider.parse_invoice.side_effect = RateLimitError('Rate limit')
        mock_get_provider.return_value = mock_provider
        
        parser = DocumentParser()
        
        with self.assertRaises(RateLimitError):
            parser.parse_invoice(b'pdf', 'test.pdf')
    
    def test_calculate_file_hash(self):
        """Вычисление хэша файла"""
        parser = DocumentParser()
        
        content1 = b'content 1'
        content2 = b'content 2'
        
        hash1 = parser._calculate_hash(content1)
        hash2 = parser._calculate_hash(content2)
        hash1_again = parser._calculate_hash(content1)
        
        self.assertNotEqual(hash1, hash2)
        self.assertEqual(hash1, hash1_again)
        self.assertEqual(len(hash1), 64)  # SHA256
```

### 8.6. Тесты llm_services — сопоставление

#### llm_services/tests/test_entity_matcher.py

```python
from django.test import TestCase
from accounting.models import Counterparty, LegalEntity
from llm_services.services.entity_matcher import CounterpartyMatcher, LegalEntityMatcher


class CounterpartyMatcherTest(TestCase):
    """Тесты сопоставления контрагентов"""
    
    def setUp(self):
        self.matcher = CounterpartyMatcher()
        
        self.counterparty1 = Counterparty.objects.create(
            name='ООО "Вентиляционные системы"',
            short_name='Вентсистемы',
            inn='1234567890'
        )
        self.counterparty2 = Counterparty.objects.create(
            name='АО "Климатические технологии"',
            inn='0987654321'
        )
    
    def test_match_by_inn_exact(self):
        """Точное совпадение по ИНН"""
        result = self.matcher.match(
            name='Какое-то название',
            inn='1234567890'
        )
        
        self.assertEqual(result['match_type'], 'exact')
        self.assertEqual(result['counterparty'].id, self.counterparty1.id)
    
    def test_match_by_name_similar(self):
        """Похожее совпадение по названию"""
        result = self.matcher.match(
            name='Вентиляционные системы ООО',
            inn='9999999999'  # Несуществующий ИНН
        )
        
        self.assertEqual(result['match_type'], 'similar')
        self.assertTrue(len(result['suggestions']) > 0)
    
    def test_match_not_found(self):
        """Контрагент не найден"""
        result = self.matcher.match(
            name='Абсолютно неизвестная компания XYZ',
            inn='5555555555'
        )
        
        self.assertEqual(result['match_type'], 'not_found')
        self.assertIsNone(result['counterparty'])


class LegalEntityMatcherTest(TestCase):
    """Тесты сопоставления юрлиц"""
    
    def setUp(self):
        self.matcher = LegalEntityMatcher()
        
        self.legal_entity = LegalEntity.objects.create(
            name='ООО "Наша Компания"',
            inn='1111111111',
            kpp='222222222'
        )
    
    def test_match_by_inn_exact(self):
        """Точное совпадение по ИНН"""
        result = self.matcher.match(inn='1111111111')
        
        self.assertEqual(result['match_type'], 'exact')
        self.assertEqual(result['legal_entity'].id, self.legal_entity.id)
    
    def test_match_not_found(self):
        """Юрлицо не найдено"""
        result = self.matcher.match(inn='9999999999')
        
        self.assertEqual(result['match_type'], 'not_found')
        self.assertIsNone(result['legal_entity'])
        self.assertIn('error', result)  # Должно быть сообщение об ошибке
```

### 8.7. Тесты API парсинга

#### llm_services/tests/test_api.py

```python
from unittest.mock import patch, MagicMock
from django.urls import reverse
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from llm_services.models import LLMProvider
from llm_services.services.document_parser import RateLimitError


User = get_user_model()


class ParseInvoiceAPITest(APITestCase):
    """Тесты API парсинга счетов"""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.client.force_authenticate(user=self.user)
        
        self.provider = LLMProvider.objects.create(
            provider_type='openai',
            model_name='gpt-4o',
            env_key_name='OPENAI_API_KEY',
            is_active=True,
            is_default=True
        )
    
    def test_parse_invoice_no_file(self):
        """POST без файла"""
        url = reverse('parse-invoice')
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', response.data)
    
    def test_parse_invoice_wrong_format(self):
        """POST с не-PDF файлом"""
        url = reverse('parse-invoice')
        file = SimpleUploadedFile('test.txt', b'not a pdf')
        response = self.client.post(url, {'file': file})
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('PDF', response.data['error'])
    
    @patch('llm_services.views.DocumentParser')
    def test_parse_invoice_success(self, mock_parser_class):
        """Успешный парсинг"""
        mock_parser = MagicMock()
        mock_parser.parse_invoice.return_value = {
            'success': True,
            'from_cache': False,
            'parsed_document': MagicMock(id=1),
            'data': {
                'vendor': {'name': 'Test', 'inn': '123', 'kpp': None},
                'buyer': {'name': 'Our', 'inn': '456'},
                'invoice': {'number': '1', 'date': '2024-01-01'},
                'totals': {'amount_gross': '1000', 'vat_amount': '100'},
                'items': [],
                'confidence': 0.9
            },
            'matches': {
                'vendor': {'match_type': 'not_found', 'counterparty': None, 'suggestions': []},
                'buyer': {'match_type': 'exact', 'legal_entity': MagicMock(id=1)},
                'products': []
            },
            'warnings': [],
            'error': None
        }
        mock_parser_class.return_value = mock_parser
        
        url = reverse('parse-invoice')
        file = SimpleUploadedFile('test.pdf', b'%PDF-1.4 fake pdf')
        response = self.client.post(url, {'file': file})
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])
    
    @patch('llm_services.views.DocumentParser')
    def test_parse_invoice_rate_limit(self, mock_parser_class):
        """Обработка rate limit"""
        mock_parser = MagicMock()
        mock_parser.parse_invoice.side_effect = RateLimitError('Rate limit')
        mock_parser_class.return_value = mock_parser
        
        url = reverse('parse-invoice')
        file = SimpleUploadedFile('test.pdf', b'%PDF-1.4 fake pdf')
        response = self.client.post(url, {'file': file})
        
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)


class LLMProviderAPITest(APITestCase):
    """Тесты API провайдеров"""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.client.force_authenticate(user=self.user)
        
        self.provider = LLMProvider.objects.create(
            provider_type='openai',
            model_name='gpt-4o',
            env_key_name='OPENAI_API_KEY',
            is_active=True,
            is_default=True
        )
    
    def test_list_providers(self):
        """GET /api/v1/llm-providers/"""
        url = reverse('llm-provider-list')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(len(response.data) > 0)
    
    def test_set_default_provider(self):
        """POST /api/v1/llm-providers/{id}/set_default/"""
        new_provider = LLMProvider.objects.create(
            provider_type='gemini',
            model_name='gemini-1.5-pro',
            env_key_name='GOOGLE_AI_API_KEY',
            is_active=True,
            is_default=False
        )
        
        url = reverse('llm-provider-set-default', args=[new_provider.id])
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['is_default'])
        
        # Старый провайдер должен быть не default
        self.provider.refresh_from_db()
        self.assertFalse(self.provider.is_default)
```

### 8.8. Тесты payments — PaymentItem

#### payments/tests/test_payment_items.py

```python
from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase
from rest_framework import status
from django.urls import reverse

from payments.models import Payment, PaymentItem
from accounting.models import Counterparty, LegalEntity, PaymentCategory
from catalog.models import Product


User = get_user_model()


class PaymentItemModelTest(TestCase):
    """Тесты модели PaymentItem"""
    
    def setUp(self):
        self.legal_entity = LegalEntity.objects.create(
            name='Тест ООО',
            inn='1234567890'
        )
        self.counterparty = Counterparty.objects.create(
            name='Поставщик',
            inn='0987654321'
        )
        self.category = PaymentCategory.objects.create(
            name='Тест категория',
            payment_type='expense'
        )
        self.product = Product.objects.create(name='Тест товар')
        
        self.payment = Payment.objects.create(
            legal_entity=self.legal_entity,
            vendor=self.counterparty,
            category=self.category,
            payment_type='expense',
            amount=Decimal('10000.00'),
            scan_file=SimpleUploadedFile('test.pdf', b'%PDF')
        )
    
    def test_create_payment_item(self):
        """Создание позиции платежа"""
        item = PaymentItem.objects.create(
            payment=self.payment,
            product=self.product,
            raw_name='Тестовый товар',
            quantity=Decimal('10'),
            unit='шт',
            price_per_unit=Decimal('100.00')
        )
        
        self.assertEqual(item.payment, self.payment)
        self.assertEqual(item.product, self.product)
    
    def test_auto_calculate_amount(self):
        """Автоматический расчёт суммы"""
        item = PaymentItem.objects.create(
            payment=self.payment,
            raw_name='Товар',
            quantity=Decimal('5'),
            unit='шт',
            price_per_unit=Decimal('200.00')
        )
        
        self.assertEqual(item.amount, Decimal('1000.00'))
    
    def test_payment_items_relation(self):
        """Связь платежа с позициями"""
        PaymentItem.objects.create(
            payment=self.payment,
            raw_name='Товар 1',
            quantity=Decimal('1'),
            unit='шт',
            price_per_unit=Decimal('100')
        )
        PaymentItem.objects.create(
            payment=self.payment,
            raw_name='Товар 2',
            quantity=Decimal('2'),
            unit='шт',
            price_per_unit=Decimal('200')
        )
        
        self.assertEqual(self.payment.items.count(), 2)


class PaymentWithItemsAPITest(APITestCase):
    """Тесты API платежей с позициями"""
    
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        self.client.force_authenticate(user=self.user)
        
        self.legal_entity = LegalEntity.objects.create(
            name='Тест ООО',
            inn='1234567890'
        )
        self.counterparty = Counterparty.objects.create(
            name='Поставщик',
            inn='0987654321'
        )
        self.category = PaymentCategory.objects.create(
            name='Тест',
            payment_type='expense',
            requires_contract=False
        )
    
    def test_create_payment_with_items(self):
        """Создание платежа с позициями"""
        url = reverse('payment-list')
        
        pdf_file = SimpleUploadedFile(
            'invoice.pdf',
            b'%PDF-1.4 fake content',
            content_type='application/pdf'
        )
        
        data = {
            'legal_entity': self.legal_entity.id,
            'vendor': self.counterparty.id,
            'category': self.category.id,
            'payment_type': 'expense',
            'amount': '5000.00',
            'scan_file': pdf_file,
            'items_input': [
                {
                    'raw_name': 'Товар 1',
                    'quantity': '10',
                    'unit': 'шт',
                    'price_per_unit': '300.00'
                },
                {
                    'raw_name': 'Товар 2',
                    'quantity': '5',
                    'unit': 'м',
                    'price_per_unit': '400.00'
                }
            ]
        }
        
        response = self.client.post(url, data, format='multipart')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['items_count'], 2)
    
    def test_payment_detail_includes_items(self):
        """Детали платежа включают позиции"""
        # Создаём платёж с позицией
        payment = Payment.objects.create(
            legal_entity=self.legal_entity,
            vendor=self.counterparty,
            category=self.category,
            payment_type='expense',
            amount=Decimal('1000'),
            scan_file=SimpleUploadedFile('test.pdf', b'%PDF')
        )
        PaymentItem.objects.create(
            payment=payment,
            raw_name='Test Item',
            quantity=Decimal('1'),
            unit='шт',
            price_per_unit=Decimal('1000')
        )
        
        url = reverse('payment-detail', args=[payment.id])
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('items', response.data)
        self.assertEqual(len(response.data['items']), 1)
```

---

## Чек-лист внедрения

### Фаза 1: catalog
- [ ] Создать приложение
- [ ] Модели: Category, Product, ProductAlias, ProductPriceHistory
- [ ] Сериализаторы
- [ ] Views с actions (tree, merge, duplicates, verify, archive)
- [ ] Сервис ProductMatcher
- [ ] URLs и регистрация
- [ ] Миграции

### Фаза 2: llm_services
- [ ] Создать приложение
- [ ] Модели: LLMProvider, ParsedDocument
- [ ] Схемы Pydantic
- [ ] Миграции

### Фаза 3: payments
- [ ] Модель PaymentItem
- [ ] Валидация PDF для expense
- [ ] Миграции

### Фаза 4: LLM-провайдеры
- [ ] BaseLLMProvider
- [ ] OpenAIProvider
- [ ] GeminiProvider
- [ ] GrokProvider
- [ ] Фабрика провайдеров

### Фаза 5: Сервисы
- [ ] CounterpartyMatcher
- [ ] LegalEntityMatcher
- [ ] DocumentParser

### Фаза 6: API
- [ ] Endpoint parse-invoice
- [ ] LLMProviderViewSet
- [ ] URLs

### Фаза 7: Management
- [ ] setup_llm_providers
- [ ] import_invoices

### Фаза 8: Тесты (покрытие >80%)
- [ ] catalog/tests/test_models.py — модели Category, Product, ProductAlias, ProductPriceHistory
- [ ] catalog/tests/test_services.py — ProductMatcher (find_similar, find_or_create, find_duplicates)
- [ ] catalog/tests/test_api.py — CRUD категорий, товаров, actions (merge, verify, archive)
- [ ] llm_services/tests/test_providers.py — OpenAI, Gemini, Grok провайдеры (с моками)
- [ ] llm_services/tests/test_document_parser.py — парсинг, кэширование, обработка ошибок
- [ ] llm_services/tests/test_entity_matcher.py — сопоставление контрагентов и юрлиц
- [ ] llm_services/tests/test_api.py — parse-invoice, LLM providers API
- [ ] payments/tests/test_payment_items.py — PaymentItem, создание платежа с позициями

---

## ENV переменные

```bash
# .env
OPENAI_API_KEY=sk-...
GOOGLE_AI_API_KEY=...
GROK_API_KEY=...
```

---

> ### ✅ BACKEND ПОЛНОСТЬЮ ГОТОВ
> 
> **После завершения всех фаз:**
> - Весь API готов к использованию
> - Management-команда `import_invoices` готова для массовой загрузки
> - Тесты покрывают основные сценарии
> 
> **Рекомендуемый порядок тестирования перед Frontend:**
> 1. `python manage.py setup_llm_providers` — настроить провайдеры
> 2. Проверить парсинг через Swagger: `POST /api/v1/llm/parse-invoice/`
> 3. Проверить каталог: `GET /api/v1/catalog/products/`
> 4. Опционально: `python manage.py import_invoices /path/to/pdfs/ --dry-run`

---

## Сводка точек старта Frontend

| После фазы | Можно начинать | Этапы Frontend |
|------------|----------------|----------------|
| **Фаза 1** | Каталог | Этап 2, 3, 4 |
| **Фаза 6** | Парсинг + настройки | Этап 1, 5 |
| **Фаза 8** | Всё готово | Финальная интеграция |

---

*Документ готов к реализации.*

from django.contrib import admin
from .models import Category, Product, ProductAlias, ProductPriceHistory, ProductWorkMapping


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'parent', 'level', 'is_active', 'sort_order']
    list_filter = ['is_active', 'level']
    search_fields = ['name', 'code']
    readonly_fields = ['level', 'created_at', 'updated_at']


class ProductAliasInline(admin.TabularInline):
    model = ProductAlias
    extra = 0
    readonly_fields = ['created_at', 'updated_at']


class ProductPriceHistoryInline(admin.TabularInline):
    model = ProductPriceHistory
    extra = 0
    readonly_fields = ['created_at', 'updated_at']


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ['name', 'category', 'default_unit', 'is_service', 'status']
    list_filter = ['status', 'is_service', 'category']
    search_fields = ['name', 'normalized_name']
    readonly_fields = ['normalized_name', 'created_at', 'updated_at']
    inlines = [ProductAliasInline, ProductPriceHistoryInline]


@admin.register(ProductAlias)
class ProductAliasAdmin(admin.ModelAdmin):
    list_display = ['alias_name', 'product']
    search_fields = ['alias_name', 'product__name']
    readonly_fields = ['normalized_alias', 'created_at', 'updated_at']


@admin.register(ProductPriceHistory)
class ProductPriceHistoryAdmin(admin.ModelAdmin):
    list_display = ['product', 'counterparty', 'price', 'unit', 'invoice_date']
    list_filter = ['counterparty', 'invoice_date']
    search_fields = ['product__name', 'invoice_number']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(ProductWorkMapping)
class ProductWorkMappingAdmin(admin.ModelAdmin):
    list_display = ['product', 'work_item', 'confidence', 'source', 'usage_count']
    list_filter = ['source']
    search_fields = ['product__name', 'work_item__name']
    raw_id_fields = ['product', 'work_item']
    readonly_fields = ['created_at', 'updated_at']

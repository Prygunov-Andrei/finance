from django.contrib import admin
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


@admin.register(FrontOfWorkItem)
class FrontOfWorkItemAdmin(admin.ModelAdmin):
    list_display = ['name', 'category', 'is_active', 'sort_order']
    list_filter = ['is_active', 'category']
    search_fields = ['name']
    ordering = ['sort_order', 'name']


@admin.register(MountingCondition)
class MountingConditionAdmin(admin.ModelAdmin):
    list_display = ['name', 'is_active', 'sort_order']
    list_filter = ['is_active']
    search_fields = ['name']
    ordering = ['sort_order', 'name']


class TKPEstimateSubsectionInline(admin.TabularInline):
    model = TKPEstimateSubsection
    extra = 0
    fields = ['name', 'materials_sale', 'works_sale', 'materials_purchase', 'works_purchase', 'sort_order']


class TKPEstimateSectionInline(admin.TabularInline):
    model = TKPEstimateSection
    extra = 0
    fields = ['name', 'source_estimate', 'source_section', 'sort_order']


class TKPCharacteristicInline(admin.TabularInline):
    model = TKPCharacteristic
    extra = 0
    fields = ['name', 'purchase_amount', 'sale_amount', 'sort_order']


class TKPFrontOfWorkInline(admin.TabularInline):
    model = TKPFrontOfWork
    extra = 0
    fields = ['front_item', 'when_text', 'when_date', 'sort_order']


@admin.register(TechnicalProposal)
class TechnicalProposalAdmin(admin.ModelAdmin):
    list_display = ['number', 'name', 'object', 'legal_entity', 'date', 'status']
    list_filter = ['status', 'legal_entity', 'date']
    search_fields = ['number', 'name', 'object__name']
    filter_horizontal = ['estimates']
    inlines = [TKPEstimateSectionInline, TKPCharacteristicInline, TKPFrontOfWorkInline]
    fieldsets = (
        ('Основная информация', {
            'fields': ('number', 'outgoing_number', 'name', 'date', 'object', 'object_area', 'legal_entity')
        }),
        ('Сметы', {
            'fields': ('estimates',)
        }),
        ('Содержание', {
            'fields': ('advance_required', 'work_duration', 'validity_days', 'notes')
        }),
        ('Статус и согласование', {
            'fields': ('status', 'created_by', 'checked_by', 'approved_by', 'approved_at')
        }),
        ('Версии', {
            'fields': ('parent_version', 'version_number')
        }),
        ('Файлы', {
            'fields': ('file',)
        }),
    )


@admin.register(MountingProposal)
class MountingProposalAdmin(admin.ModelAdmin):
    list_display = ['number', 'name', 'object', 'counterparty', 'date', 'status', 'telegram_published']
    list_filter = ['status', 'telegram_published', 'date']
    search_fields = ['number', 'name', 'object__name', 'counterparty__name']
    filter_horizontal = ['conditions']
    fieldsets = (
        ('Основная информация', {
            'fields': ('number', 'name', 'date', 'object', 'counterparty')
        }),
        ('Связи', {
            'fields': ('parent_tkp', 'mounting_estimate')
        }),
        ('Финансы', {
            'fields': ('total_amount', 'man_hours')
        }),
        ('Содержание', {
            'fields': ('notes', 'conditions')
        }),
        ('Статус', {
            'fields': ('status', 'created_by', 'telegram_published', 'telegram_published_at')
        }),
        ('Версии', {
            'fields': ('parent_version', 'version_number')
        }),
        ('Файлы', {
            'fields': ('file',)
        }),
    )

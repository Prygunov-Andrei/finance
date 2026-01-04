from django.contrib import admin
from .models import (
    WorkerGrade, WorkSection, WorkerGradeSkills,
    WorkItem, PriceList, PriceListItem, PriceListAgreement
)


@admin.register(WorkerGrade)
class WorkerGradeAdmin(admin.ModelAdmin):
    list_display = ['grade', 'name', 'default_hourly_rate', 'is_active']
    list_filter = ['is_active']
    ordering = ['grade']


@admin.register(WorkSection)
class WorkSectionAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'parent', 'is_active', 'sort_order']
    list_filter = ['is_active', 'parent']
    search_fields = ['code', 'name']
    ordering = ['sort_order', 'name']


@admin.register(WorkerGradeSkills)
class WorkerGradeSkillsAdmin(admin.ModelAdmin):
    list_display = ['grade', 'section']
    list_filter = ['grade', 'section']


@admin.register(WorkItem)
class WorkItemAdmin(admin.ModelAdmin):
    list_display = ['article', 'name', 'section', 'unit', 'hours', 'grade', 'coefficient', 'is_current', 'version_number']
    list_filter = ['section', 'grade', 'is_current', 'unit']
    search_fields = ['article', 'name', 'comment']
    readonly_fields = ['article', 'version_number', 'is_current', 'parent_version', 'created_at', 'updated_at']
    ordering = ['section', 'article']
    fieldsets = (
        (None, {
            'fields': ('article', 'section', 'name', 'unit', 'hours', 'grade', 'coefficient')
        }),
        ('Описание', {
            'fields': ('composition', 'comment'),
            'classes': ('collapse',)
        }),
        ('Версионирование', {
            'fields': ('version_number', 'is_current', 'parent_version'),
            'classes': ('collapse',)
        }),
        ('Служебные поля', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


class PriceListItemInline(admin.TabularInline):
    model = PriceListItem
    extra = 0
    readonly_fields = ['created_at']
    autocomplete_fields = ['work_item']


class PriceListAgreementInline(admin.TabularInline):
    model = PriceListAgreement
    extra = 0
    readonly_fields = ['created_at']


@admin.register(PriceList)
class PriceListAdmin(admin.ModelAdmin):
    list_display = ['number', 'name', 'date', 'status', 'version_number', 'get_items_count']
    list_filter = ['status', 'date']
    search_fields = ['number', 'name']
    readonly_fields = ['version_number', 'parent_version', 'created_at', 'updated_at']
    inlines = [PriceListItemInline, PriceListAgreementInline]
    ordering = ['-date', '-created_at']
    fieldsets = (
        (None, {
            'fields': ('number', 'name', 'date', 'status')
        }),
        ('Ставки по разрядам', {
            'fields': (
                'grade_1_rate', 'grade_2_rate', 'grade_3_rate',
                'grade_4_rate', 'grade_5_rate'
            )
        }),
        ('Версионирование', {
            'fields': ('version_number', 'parent_version'),
            'classes': ('collapse',)
        }),
        ('Служебные поля', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    def get_items_count(self, obj):
        return obj.items.filter(is_included=True).count()
    get_items_count.short_description = 'Кол-во работ'


@admin.register(PriceListItem)
class PriceListItemAdmin(admin.ModelAdmin):
    list_display = ['price_list', 'work_item', 'hours_override', 'coefficient_override', 'grade_override', 'is_included']
    list_filter = ['price_list', 'is_included']
    search_fields = ['work_item__article', 'work_item__name']
    readonly_fields = ['created_at']


@admin.register(PriceListAgreement)
class PriceListAgreementAdmin(admin.ModelAdmin):
    list_display = ['price_list', 'counterparty', 'agreed_date']
    list_filter = ['agreed_date', 'price_list']
    search_fields = ['counterparty__name', 'price_list__number']
    readonly_fields = ['created_at']

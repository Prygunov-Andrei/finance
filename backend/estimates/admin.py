from django.contrib import admin
from .models import (
    Project, ProjectNote, Estimate, EstimateSection,
    EstimateSubsection, EstimateCharacteristic, MountingEstimate
)


class ProjectNoteInline(admin.TabularInline):
    model = ProjectNote
    extra = 0
    readonly_fields = ['created_at', 'updated_at']


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = [
        'cipher', 'name', 'object', 'stage', 'date', 'is_current',
        'primary_check_done', 'secondary_check_done'
    ]
    list_filter = [
        'stage', 'is_current', 'primary_check_done',
        'secondary_check_done', 'is_approved_for_production'
    ]
    search_fields = ['cipher', 'name']
    inlines = [ProjectNoteInline]
    readonly_fields = [
        'version_number', 'parent_version', 'created_at', 'updated_at'
    ]


@admin.register(ProjectNote)
class ProjectNoteAdmin(admin.ModelAdmin):
    list_display = ['project', 'author', 'created_at']
    list_filter = ['project', 'author', 'created_at']
    search_fields = ['text', 'project__cipher', 'project__name']
    readonly_fields = ['created_at', 'updated_at']


class EstimateSectionInline(admin.TabularInline):
    model = EstimateSection
    extra = 0
    readonly_fields = ['created_at', 'updated_at']


class EstimateCharacteristicInline(admin.TabularInline):
    model = EstimateCharacteristic
    extra = 0
    readonly_fields = ['created_at', 'updated_at']


@admin.register(Estimate)
class EstimateAdmin(admin.ModelAdmin):
    list_display = [
        'number', 'name', 'object', 'legal_entity', 'status',
        'with_vat', 'approved_by_customer'
    ]
    list_filter = ['status', 'with_vat', 'approved_by_customer', 'legal_entity']
    search_fields = ['number', 'name']
    inlines = [EstimateSectionInline, EstimateCharacteristicInline]
    readonly_fields = [
        'number', 'version_number', 'parent_version',
        'created_at', 'updated_at'
    ]


class EstimateSubsectionInline(admin.TabularInline):
    model = EstimateSubsection
    extra = 0
    readonly_fields = ['created_at', 'updated_at']


@admin.register(EstimateSection)
class EstimateSectionAdmin(admin.ModelAdmin):
    list_display = ['name', 'estimate', 'sort_order']
    list_filter = ['estimate']
    inlines = [EstimateSubsectionInline]
    readonly_fields = ['created_at', 'updated_at']


@admin.register(EstimateSubsection)
class EstimateSubsectionAdmin(admin.ModelAdmin):
    list_display = [
        'name', 'section', 'materials_sale', 'works_sale',
        'materials_purchase', 'works_purchase'
    ]
    list_filter = ['section__estimate']
    search_fields = ['name', 'section__name']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(EstimateCharacteristic)
class EstimateCharacteristicAdmin(admin.ModelAdmin):
    list_display = [
        'name', 'estimate', 'purchase_amount', 'sale_amount',
        'is_auto_calculated', 'source_type'
    ]
    list_filter = ['estimate', 'is_auto_calculated', 'source_type']
    search_fields = ['name', 'estimate__number']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(MountingEstimate)
class MountingEstimateAdmin(admin.ModelAdmin):
    list_display = [
        'number', 'name', 'object', 'total_amount', 'status',
        'agreed_counterparty'
    ]
    list_filter = ['status']
    search_fields = ['number', 'name']
    readonly_fields = [
        'number', 'version_number', 'parent_version',
        'created_at', 'updated_at'
    ]

from django.contrib import admin
from .models import (
    Project, ProjectNote, ProjectFileType, ProjectFile,
    Estimate, EstimateSection,
    EstimateSubsection, EstimateCharacteristic, EstimateItem,
    MountingEstimate, SpecificationItem, EstimateMarkupDefaults
)


class ProjectNoteInline(admin.TabularInline):
    model = ProjectNote
    extra = 0
    readonly_fields = ['created_at', 'updated_at']


class ProjectFileInline(admin.TabularInline):
    model = ProjectFile
    extra = 0
    readonly_fields = ['created_at', 'updated_at', 'uploaded_by']


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
    inlines = [ProjectNoteInline, ProjectFileInline]
    readonly_fields = [
        'version_number', 'parent_version', 'created_at', 'updated_at'
    ]


@admin.register(ProjectFileType)
class ProjectFileTypeAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'sort_order', 'is_active']
    list_filter = ['is_active']
    search_fields = ['name', 'code']


@admin.register(ProjectFile)
class ProjectFileAdmin(admin.ModelAdmin):
    list_display = ['original_filename', 'project', 'file_type', 'uploaded_by', 'created_at']
    list_filter = ['file_type', 'project']
    search_fields = ['original_filename', 'title', 'project__cipher']
    readonly_fields = ['created_at', 'updated_at']


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


@admin.register(EstimateMarkupDefaults)
class EstimateMarkupDefaultsAdmin(admin.ModelAdmin):
    list_display = ['material_markup_percent', 'work_markup_percent']

    def has_add_permission(self, request):
        return not EstimateMarkupDefaults.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


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


class EstimateItemInline(admin.TabularInline):
    model = EstimateItem
    extra = 0
    readonly_fields = ['created_at', 'updated_at']
    raw_id_fields = ['product', 'work_item', 'source_price_history']
    fields = [
        'item_number', 'name', 'model_name', 'unit', 'quantity',
        'material_unit_price', 'work_unit_price', 'product',
        'work_item', 'is_analog', 'sort_order',
    ]


@admin.register(EstimateItem)
class EstimateItemAdmin(admin.ModelAdmin):
    list_display = [
        'item_number', 'name', 'estimate', 'section', 'unit',
        'quantity', 'material_unit_price', 'work_unit_price', 'is_analog',
    ]
    list_filter = ['estimate', 'section', 'is_analog']
    search_fields = ['name', 'model_name', 'original_name']
    raw_id_fields = ['product', 'work_item', 'source_price_history']
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


@admin.register(SpecificationItem)
class SpecificationItemAdmin(admin.ModelAdmin):
    list_display = [
        'name', 'model_name', 'brand', 'unit', 'quantity',
        'section_name', 'page_number', 'request',
    ]
    list_filter = ['section_name', 'request']
    search_fields = ['name', 'model_name', 'brand']
    raw_id_fields = ['request', 'source_file']
    readonly_fields = ['created_at', 'updated_at']

from django.contrib import admin
from .models import Employee, PositionRecord, SalaryHistory


class PositionRecordInline(admin.TabularInline):
    model = PositionRecord
    extra = 0


class SalaryHistoryInline(admin.TabularInline):
    model = SalaryHistory
    extra = 0


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = ('full_name', 'current_position', 'hire_date', 'salary_full', 'is_active')
    list_filter = ('is_active', 'gender')
    search_fields = ('full_name',)
    inlines = [PositionRecordInline, SalaryHistoryInline]


@admin.register(PositionRecord)
class PositionRecordAdmin(admin.ModelAdmin):
    list_display = ('employee', 'legal_entity', 'position_title', 'start_date', 'end_date', 'is_current')
    list_filter = ('is_current', 'legal_entity')


@admin.register(SalaryHistory)
class SalaryHistoryAdmin(admin.ModelAdmin):
    list_display = ('employee', 'salary_full', 'salary_official', 'effective_date', 'reason')

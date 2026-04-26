"""Custom Django AdminSite — урезанная версия для AC Rating.

После Ф8D `/admin/` показывает только:
  - AC Methodology (MethodologyVersion, Criterion, RatingPreset) — для
    клонирования методики (1-2 раза в год).
  - auth.User, auth.Group — управление пользователями.
  - admin.LogEntry — read-only audit log.

Всё остальное (ERP-операции, HVAC-новости, AC Rating уже покрытое
новой админкой /erp/hvac-rating/) — в Django-admin не показывается.

Backup-доступ к полному admin: `/hvac-admin/` (см. urls.py).
"""
from __future__ import annotations

from django.contrib.admin import AdminSite, ModelAdmin
from django.contrib.admin.models import LogEntry
from django.contrib.auth.admin import GroupAdmin, UserAdmin
from django.contrib.auth.models import Group, User


class ACAdminSite(AdminSite):
    site_header = "AC Rating · Методика и пользователи"
    site_title = "AC Rating Admin"
    index_title = "Управление методикой и пользователями"


# name='ac_admin' — изолированный instance namespace для урезанного /admin/.
# Default namespace 'admin' остаётся за полным admin.site, который mount'ится
# на /hvac-admin/ напрямую (см. urls.py). Внутренние reverse'ы Django admin
# везде используют current_app=self.name, поэтому каждый сайт находит свои
# patterns без коллизий.
ac_admin_site = ACAdminSite(name="ac_admin")


ac_admin_site.register(User, UserAdmin)
ac_admin_site.register(Group, GroupAdmin)


class ReadOnlyLogEntryAdmin(ModelAdmin):
    list_display = (
        "action_time",
        "user",
        "content_type",
        "object_repr",
        "action_flag_display",
    )
    list_filter = ("action_time", "action_flag", "user")
    search_fields = ("object_repr", "change_message", "user__username")
    readonly_fields = [
        f.name for f in LogEntry._meta.get_fields()
        if not f.is_relation or f.many_to_one
    ]

    @staticmethod
    def action_flag_display(obj):
        return obj.get_action_flag_display()
    action_flag_display.short_description = "Action"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return request.method in ("GET", "HEAD", "OPTIONS")

    def has_delete_permission(self, request, obj=None):
        return False


ac_admin_site.register(LogEntry, ReadOnlyLogEntryAdmin)

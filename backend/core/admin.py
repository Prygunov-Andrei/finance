from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User
from .models import Release, UserProfile


class UserProfileInline(admin.StackedInline):
    """Инлайн для профиля пользователя в админке"""
    model = UserProfile
    can_delete = False
    verbose_name_plural = 'Профиль'


class UserAdmin(BaseUserAdmin):
    """Расширенная админка пользователя с профилем"""
    inlines = (UserProfileInline,)


# Перерегистрируем UserAdmin
admin.site.unregister(User)
admin.site.register(User, UserAdmin)

# Регистрируем UserProfile отдельно (опционально)
admin.site.register(UserProfile)


@admin.register(Release)
class ReleaseAdmin(admin.ModelAdmin):
    """Админка для релизов (changelog)."""

    list_display = ('version', 'released_at', 'is_published', 'commit_count', 'git_sha_short')
    list_filter = ('is_published',)
    search_fields = ('version', 'description', 'git_sha')
    readonly_fields = ('version', 'released_at', 'git_sha', 'prev_version', 'commits', 'created_at', 'updated_at')
    fields = ('version', 'released_at', 'git_sha', 'prev_version', 'is_published', 'description', 'commits', 'created_at', 'updated_at')
    ordering = ('-released_at',)

    @admin.display(description='Коммитов')
    def commit_count(self, obj):
        return len(obj.commits or [])

    @admin.display(description='SHA')
    def git_sha_short(self, obj):
        return (obj.git_sha or '')[:7]



from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User
from .models import UserProfile


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



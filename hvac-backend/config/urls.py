"""
URL configuration for config project.
"""
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.static import serve
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

urlpatterns = [
    path('hvac-admin/', admin.site.urls),

    # Auth & Users
    path('api/hvac/auth/users/', include('users.urls')),
    path('api/hvac/auth/jwt/create/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/hvac/auth/jwt/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # References
    path('api/hvac/references/', include('references.urls')),

    # News
    path('api/hvac/', include('news.urls')),

    # Feedback
    path('api/hvac/', include('feedback.urls')),
]

# Всегда отдаём медиа и статику через Django (в Docker нет отдельного файлового сервера)
urlpatterns += [
    re_path(r'^hvac-media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
    re_path(r'^hvac-static/(?P<path>.*)$', serve, {'document_root': settings.STATIC_ROOT}),
]

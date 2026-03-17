"""
URL configuration for config project.
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
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

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

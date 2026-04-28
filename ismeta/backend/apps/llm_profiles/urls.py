"""URL config для llm_profiles (E18-2).

Подключается в ismeta/urls.py под префиксом /api/v1/.
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ImportLogViewSet, LLMProfileViewSet

router = DefaultRouter()
router.register(r"llm-profiles", LLMProfileViewSet, basename="llm-profile")
router.register(r"import-logs", ImportLogViewSet, basename="import-log")

urlpatterns = [
    path("", include(router.urls)),
]

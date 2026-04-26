"""URL-конфиг recognition_jobs (E19-2).

Подключается в ismeta/urls.py: path("api/v1/", include("apps.recognition_jobs.urls")).
"""

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import RecognitionJobViewSet

router = DefaultRouter()
router.register(r"recognition-jobs", RecognitionJobViewSet, basename="recognition-job")

urlpatterns = [
    path("", include(router.urls)),
]

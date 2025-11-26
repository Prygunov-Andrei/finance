from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import CorrespondenceViewSet

router = DefaultRouter()
router.register(r'correspondence', CorrespondenceViewSet)

urlpatterns = [
    path('', include(router.urls)),
]


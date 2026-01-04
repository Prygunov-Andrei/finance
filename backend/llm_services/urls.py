from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import LLMProviderViewSet, parse_invoice

router = DefaultRouter()
router.register(r'llm-providers', LLMProviderViewSet, basename='llm-provider')

urlpatterns = [
    path('', include(router.urls)),
    path('llm/parse-invoice/', parse_invoice, name='parse-invoice'),
]

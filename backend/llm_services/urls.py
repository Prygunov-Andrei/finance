from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import LLMProviderViewSet, LLMTaskConfigViewSet, parse_invoice, parse_specification, llm_health

router = DefaultRouter()
router.register(r'llm-providers', LLMProviderViewSet, basename='llm-provider')
router.register(r'llm-task-configs', LLMTaskConfigViewSet, basename='llm-task-config')

urlpatterns = [
    path('', include(router.urls)),
    path('llm/parse-invoice/', parse_invoice, name='parse-invoice'),
    path('specifications/parse/', parse_specification, name='parse-specification'),
    path('health/llm/', llm_health, name='llm-health'),
]

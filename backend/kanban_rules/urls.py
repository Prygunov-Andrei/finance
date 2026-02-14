from rest_framework.routers import DefaultRouter

from kanban_rules.views import RuleViewSet


router = DefaultRouter()
router.register(r'v1/rules', RuleViewSet, basename='kanban-rule')

urlpatterns = router.urls


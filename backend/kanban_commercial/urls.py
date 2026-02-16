from rest_framework.routers import DefaultRouter

from kanban_commercial.views import CommercialCaseViewSet


router = DefaultRouter()
router.register(r'v1/commercial/cases', CommercialCaseViewSet, basename='commercial-case')

urlpatterns = router.urls

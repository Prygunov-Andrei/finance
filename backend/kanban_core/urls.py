from rest_framework.routers import DefaultRouter

from kanban_core.views import BoardViewSet, ColumnViewSet, CardViewSet, AttachmentViewSet


router = DefaultRouter()
router.register(r'v1/boards', BoardViewSet, basename='kanban-board')
router.register(r'v1/columns', ColumnViewSet, basename='kanban-column')
router.register(r'v1/cards', CardViewSet, basename='kanban-card')
router.register(r'v1/attachments', AttachmentViewSet, basename='kanban-attachment')

urlpatterns = router.urls


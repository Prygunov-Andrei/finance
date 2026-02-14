from rest_framework.routers import DefaultRouter

from kanban_object_tasks.views import ObjectTaskViewSet


router = DefaultRouter()
router.register(r'v1/object-tasks', ObjectTaskViewSet, basename='object-task')

urlpatterns = router.urls


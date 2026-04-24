from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    NewsPostViewSet, CommentViewSet, MediaUploadViewSet, NewsAuthorViewSet,
    SearchConfigurationViewSet, NewsDiscoveryRunViewSet, DiscoveryAPICallViewSet,
    RatingCriterionViewSet, RatingConfigurationViewSet, RatingRunViewSet,
)

router = DefaultRouter()
router.register(r'news', NewsPostViewSet, basename='news')
router.register(r'news-authors', NewsAuthorViewSet, basename='news-authors')
router.register(r'comments', CommentViewSet, basename='comments')
router.register(r'media', MediaUploadViewSet, basename='media')
router.register(r'search-config', SearchConfigurationViewSet, basename='search-config')
router.register(r'discovery-runs', NewsDiscoveryRunViewSet, basename='discovery-runs')
router.register(r'discovery-calls', DiscoveryAPICallViewSet, basename='discovery-calls')
router.register(r'rating-criteria', RatingCriterionViewSet, basename='rating-criteria')
router.register(r'rating-config', RatingConfigurationViewSet, basename='rating-config')
router.register(r'rating-runs', RatingRunViewSet, basename='rating-runs')

urlpatterns = [
    path('', include(router.urls)),
]


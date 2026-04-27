from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .admin_views import FeaturedNewsSettingsAdminView
from .views import (
    NewsPostViewSet, CommentViewSet, MediaUploadViewSet, NewsAuthorViewSet,
    NewsCategoryViewSet, NewsBulkCategoryView, FeaturedNewsView,
    SearchConfigurationViewSet, NewsDiscoveryRunViewSet, DiscoveryAPICallViewSet,
    RatingCriterionViewSet, RatingConfigurationViewSet, RatingRunViewSet,
)

router = DefaultRouter()
router.register(r'news', NewsPostViewSet, basename='news')
router.register(r'news-authors', NewsAuthorViewSet, basename='news-authors')
router.register(r'news-categories', NewsCategoryViewSet, basename='news-categories')
router.register(r'comments', CommentViewSet, basename='comments')
router.register(r'media', MediaUploadViewSet, basename='media')
router.register(r'search-config', SearchConfigurationViewSet, basename='search-config')
router.register(r'discovery-runs', NewsDiscoveryRunViewSet, basename='discovery-runs')
router.register(r'discovery-calls', DiscoveryAPICallViewSet, basename='discovery-calls')
router.register(r'rating-criteria', RatingCriterionViewSet, basename='rating-criteria')
router.register(r'rating-config', RatingConfigurationViewSet, basename='rating-config')
router.register(r'rating-runs', RatingRunViewSet, basename='rating-runs')

urlpatterns = [
    path('news/bulk-update-category/', NewsBulkCategoryView.as_view(), name='news-bulk-update-category'),
    path('featured-news/', FeaturedNewsView.as_view(), name='featured-news'),
    path('admin/featured-settings/', FeaturedNewsSettingsAdminView.as_view(), name='admin-featured-settings'),
    path('', include(router.urls)),
]

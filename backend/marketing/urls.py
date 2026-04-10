from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register('executor-profiles', views.ExecutorProfileViewSet, basename='executor-profile')
router.register('avito/keywords', views.AvitoSearchKeywordViewSet, basename='avito-keyword')
router.register('avito/listings', views.AvitoListingViewSet, basename='avito-listing')
router.register('avito/published', views.AvitoPublishedListingViewSet, basename='avito-published')
router.register('campaigns', views.CampaignViewSet, basename='campaign')
router.register('sync-logs', views.MarketingSyncLogViewSet, basename='sync-log')

urlpatterns = [
    path('marketing/', include(router.urls)),
    path('marketing/avito/config/', views.AvitoConfigView.as_view(), name='avito-config'),
    path('marketing/unisender/config/', views.UnisenderConfigView.as_view(), name='unisender-config'),
    path('marketing/avito/scan/', views.trigger_avito_scan, name='avito-scan'),
    path('marketing/avito/publish-mp/<int:mp_id>/', views.publish_mp_to_avito, name='avito-publish-mp'),
    path('marketing/dashboard/', views.marketing_dashboard, name='marketing-dashboard'),
]

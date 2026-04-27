from rest_framework import generics

from hvac_bridge.permissions import IsHvacAdminProxyAllowed

from .admin_serializers import FeaturedNewsSettingsSerializer
from .models import FeaturedNewsSettings


class FeaturedNewsSettingsAdminView(generics.RetrieveUpdateAPIView):
    """GET/PATCH singleton FeaturedNewsSettings.

    GET — текущая категория (или null).
    PATCH с {"category": "<slug>"} — сменить.
    PATCH с {"category": null} — сброс (берётся latest из всех категорий).
    """

    permission_classes = [IsHvacAdminProxyAllowed]
    serializer_class = FeaturedNewsSettingsSerializer
    http_method_names = ["get", "patch", "head", "options"]

    def get_object(self):
        instance, _created = FeaturedNewsSettings.objects.get_or_create(pk=1)
        return instance

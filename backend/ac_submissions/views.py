from __future__ import annotations

from django.utils.decorators import method_decorator
from django_ratelimit.decorators import ratelimit
from rest_framework import generics, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from ac_brands.models import Brand

from .models import ACSubmission, SubmissionPhoto
from .serializers import ACSubmissionCreateSerializer, BrandListSerializer

MAX_PHOTOS = 20
MAX_PHOTO_SIZE = 10 * 1024 * 1024  # 10 MB


def _client_ip(request) -> str | None:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


class BrandListView(generics.ListAPIView):
    serializer_class = BrandListSerializer
    queryset = Brand.objects.filter(is_active=True).order_by("name")
    pagination_class = None
    permission_classes = [AllowAny]


class ACSubmissionCreateView(generics.CreateAPIView):
    serializer_class = ACSubmissionCreateSerializer
    queryset = ACSubmission.objects.all()
    permission_classes = [AllowAny]

    @method_decorator(ratelimit(key="ip", rate="3/h", block=True))
    def post(self, request, *args, **kwargs):
        return super().post(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        photos = request.FILES.getlist("photos")
        if not photos:
            return Response(
                {"photos": ["Загрузите хотя бы одно фото измерений."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(photos) > MAX_PHOTOS:
            return Response(
                {"photos": [f"Максимум {MAX_PHOTOS} фото."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        for f in photos:
            if f.size > MAX_PHOTO_SIZE:
                return Response(
                    {"photos": [f"Файл «{f.name}» превышает 10 МБ."]},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        submission = serializer.save(ip_address=_client_ip(self.request))
        for i, f in enumerate(self.request.FILES.getlist("photos")):
            SubmissionPhoto.objects.create(
                submission=submission, image=f, order=i,
            )

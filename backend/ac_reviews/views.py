from __future__ import annotations

from django.utils.decorators import method_decorator
from django_ratelimit.decorators import ratelimit
from rest_framework import generics
from rest_framework.permissions import AllowAny

from .models import Review
from .serializers import ReviewCreateSerializer, ReviewSerializer


def _client_ip(request) -> str | None:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


class ReviewListView(generics.ListAPIView):
    """Список одобренных отзывов для конкретной модели."""

    serializer_class = ReviewSerializer
    pagination_class = None  # короткие списки — без пагинации
    permission_classes = [AllowAny]

    def get_queryset(self):
        return Review.objects.filter(
            model_id=self.kwargs["model_id"],
            is_approved=True,
        )


class ReviewCreateView(generics.CreateAPIView):
    """Приём нового отзыва. Сохраняется как is_approved=False (премодерация)."""

    serializer_class = ReviewCreateSerializer
    queryset = Review.objects.all()
    permission_classes = [AllowAny]

    @method_decorator(ratelimit(key="ip", rate="5/h", block=True))
    def post(self, request, *args, **kwargs):
        return super().post(request, *args, **kwargs)

    def perform_create(self, serializer):
        serializer.save(is_approved=False, ip_address=_client_ip(self.request))

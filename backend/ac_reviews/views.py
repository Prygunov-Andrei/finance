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
    """Список одобренных отзывов для конкретной модели.

    Anonymous видят только status=approved; staff — все статусы (для дашборда модерации).
    """

    serializer_class = ReviewSerializer
    pagination_class = None  # короткие списки — без пагинации
    permission_classes = [AllowAny]

    def get_queryset(self):
        qs = Review.objects.filter(model_id=self.kwargs["model_id"])
        user = self.request.user
        if not (user.is_authenticated and user.is_staff):
            qs = qs.filter(status=Review.Status.APPROVED)
        return qs


class ReviewCreateView(generics.CreateAPIView):
    """Приём нового отзыва. Сохраняется со status=pending (премодерация).

    status read-only в сериализаторе — пользователь не может выставить approved.
    """

    serializer_class = ReviewCreateSerializer
    queryset = Review.objects.all()
    permission_classes = [AllowAny]

    @method_decorator(ratelimit(key="ip", rate="5/h", block=True))
    def post(self, request, *args, **kwargs):
        return super().post(request, *args, **kwargs)

    def perform_create(self, serializer):
        # status default=pending в модели; явно не передаём, чтобы не было
        # соблазна обойти модерацию через perform_create.
        serializer.save(ip_address=_client_ip(self.request))

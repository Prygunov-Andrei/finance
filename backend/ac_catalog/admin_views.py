"""Админский API каталога моделей кондиционеров (/api/hvac/rating/...).

Ф8A — CRUD для `ACModel`, photo upload/reorder, recalculate, справочники
EquipmentType / Region. Вся бизнес-логика расчёта индекса переиспользует
`ac_scoring.engine.update_model_total_index` (тот же путь, что Django-admin
action и signal).

Ф8B-1 — `GenerateProsConsView`: AI-генерация плюсов/минусов модели через
общий LLM-хаб (`llm_services`). Провайдер выбирается через
`LLMTaskConfig.get_provider_for_task('ac_pros_cons')` — оператор настраивает
его в Django-admin (по умолчанию fallback на `LLMProvider.get_default()`).
"""
from __future__ import annotations

import logging

from django.core.files.uploadedfile import UploadedFile
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import filters, generics, status, viewsets
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from ac_methodology.models import MethodologyVersion
from ac_scoring.engine import compute_scores_for_model, update_model_total_index
from hvac_bridge.permissions import IsHvacAdminProxyAllowed
from llm_services.models import LLMTaskConfig
from llm_services.providers import get_provider

from .admin_serializers import (
    AdminACModelDetailSerializer,
    AdminACModelListSerializer,
    AdminACModelPhotoSerializer,
    EquipmentTypeAdminSerializer,
)
from .models import ACModel, ACModelPhoto, EquipmentType, ModelRawValue, ModelRegion


MAX_PHOTOS = 6

logger = logging.getLogger("ac_pros_cons")

PROS_CONS_HIGH_THRESHOLD = 80.0
PROS_CONS_LOW_THRESHOLD = 25.0
PROS_CONS_MAX_HIGH = 8
PROS_CONS_MAX_LOW = 8
PROS_CONS_MAX_CONTEXT = 6

PROS_CONS_SYSTEM_PROMPT = (
    "Ты — редактор технического обзора бытовых сплит-кондиционеров.\n"
    "Твоя задача — сгенерировать 3 плюса и 3 минуса конкретной модели "
    "кондиционера на основе её характеристик и оценок по критериям.\n\n"
    "Стиль:\n"
    "- 3 плюса + 3 минуса\n"
    "- Каждая строка 2–6 слов\n"
    "- С заглавной буквы, БЕЗ точки в конце\n"
    "- Конкретно и по существу: называй параметры и числа\n"
    "- Без маркетинговой воды («лучший», «премиум», «инновационный»)\n"
    "- Без сравнения с другими моделями\n\n"
    "Примеры формулировок (стиль для подражания):\n"
    "- «Класс энергоэффективности А+++»\n"
    "- «Подогрев поддона дренажа»\n"
    "- «Гарантия семь лет от бренда»\n"
    "- «Пульт без русского меню»\n"
    "- «Бренд совсем новый»\n"
    "- «Без датчика присутствия»\n\n"
    "Верни ТОЛЬКО валидный JSON: "
    '{"pros": ["...", "...", "..."], "cons": ["...", "...", "..."]}\n'
    "Никакого markdown, комментариев или текста до/после JSON."
)


def get_pros_cons_provider():
    """Возвращает экземпляр LLM-провайдера для задачи `ac_pros_cons`.

    Тонкая обёртка над `LLMTaskConfig.get_provider_for_task` + фабрикой
    `get_provider`. Вынесена для удобства мока в тестах
    (`patch('ac_catalog.admin_views.get_pros_cons_provider')`).
    """
    provider_model = LLMTaskConfig.get_provider_for_task(
        LLMTaskConfig.TaskType.AC_PROS_CONS,
    )
    return get_provider(provider_model)


def _format_value(rv: ModelRawValue | None) -> str:
    if rv is None:
        return "—"
    if rv.numeric_value is not None:
        return str(rv.numeric_value)
    return rv.raw_value or "—"


def _build_pros_cons_user_prompt(
    model: ACModel,
    score_rows: list[dict],
    raw_values_by_code: dict[str, ModelRawValue],
) -> str:
    """Собирает user-prompt со структурированным контекстом по модели."""
    brand = model.brand
    header_lines = [
        f"Модель: {brand.name} {model.series} {model.inner_unit} / "
        f"{model.outer_unit}".strip(),
    ]
    if model.nominal_capacity:
        header_lines.append(
            f"Номинальная мощность: {model.nominal_capacity} Вт",
        )
    brand_line = f"Бренд: {brand.name}"
    if getattr(brand, "sales_start_year_ru", None):
        brand_line += f", год начала продаж в РФ: {brand.sales_start_year_ru}"
    header_lines.append(brand_line)

    high = [r for r in score_rows if r["normalized_score"] >= PROS_CONS_HIGH_THRESHOLD]
    low = [r for r in score_rows if r["normalized_score"] <= PROS_CONS_LOW_THRESHOLD]

    high_sorted = sorted(high, key=lambda r: -r["normalized_score"])[:PROS_CONS_MAX_HIGH]
    low_sorted = sorted(low, key=lambda r: r["normalized_score"])[:PROS_CONS_MAX_LOW]

    def _row_line(row: dict) -> str:
        mc = row["criterion"]
        crit = mc.criterion
        unit = f" {crit.unit}" if crit.unit else ""
        return (
            f"- {crit.name_ru} ({crit.code}): {row['raw_value'] or '—'}{unit} "
            f"→ {row['normalized_score']:.0f}/100"
        )

    high_block = "\n".join(_row_line(r) for r in high_sorted) or "(нет)"
    low_block = "\n".join(_row_line(r) for r in low_sorted) or "(нет)"

    # Контекст: остальные критерии — берём raw_values, которые НЕ попали ни
    # в high, ни в low (чтобы не дублировать), приоритет — те, у которых
    # есть осмысленное значение.
    used_codes = {r["criterion"].criterion.code for r in high_sorted + low_sorted}
    extra_lines: list[str] = []
    for code, rv in raw_values_by_code.items():
        if code in used_codes:
            continue
        if not (rv.raw_value or rv.numeric_value is not None):
            continue
        if rv.criterion is None:
            continue
        extra_lines.append(
            f"- {rv.criterion.name_ru} ({code}): {_format_value(rv)}"
        )
        if len(extra_lines) >= PROS_CONS_MAX_CONTEXT:
            break
    extra_block = "\n".join(extra_lines) or "(нет)"

    return (
        "\n".join(header_lines)
        + "\n\nВЫСОКИЕ оценки (≥80 из 100):\n"
        + high_block
        + "\n\nНИЗКИЕ оценки (≤25 из 100):\n"
        + low_block
        + "\n\nКонтекст по интересным критериям:\n"
        + extra_block
    )


def _normalize_lines(value) -> list[str]:
    """LLM может вернуть list[str] или строку. Нормализуем в список строк."""
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        return [line.strip() for line in value.splitlines() if line.strip()]
    return []


class ACModelAdminViewSet(viewsets.ModelViewSet):
    """CRUD моделей кондиционеров для ERP-операторов.

    Список фильтров (query string):
      - `brand=<id>` (повторяется для multi)
      - `publish_status=draft|review|published|archived`
      - `equipment_type=<id>`
      - `region=<code>` (`ru`/`eu`)
      - `search=<q>` — по `inner_unit`, `outer_unit`, `series`, `brand__name`
      - `ordering=<field>` — `total_index`, `inner_unit`, `created_at` (с `-` для DESC)
    """

    permission_classes = [IsHvacAdminProxyAllowed]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["inner_unit", "outer_unit", "series", "brand__name"]
    ordering_fields = ["total_index", "inner_unit", "created_at"]
    ordering = ["-total_index"]

    def get_serializer_class(self):
        if self.action == "list":
            return AdminACModelListSerializer
        return AdminACModelDetailSerializer

    def get_queryset(self):
        qs = ACModel.objects.select_related(
            "brand", "brand__origin_class", "equipment_type",
        ).prefetch_related(
            "photos", "suppliers", "regions",
            "raw_values__criterion",
        )

        params = self.request.query_params

        brands = params.getlist("brand")
        if brands:
            qs = qs.filter(brand_id__in=[b for b in brands if str(b).isdigit()])

        publish_status = params.get("publish_status")
        if publish_status:
            qs = qs.filter(publish_status=publish_status)

        equipment_type = params.get("equipment_type")
        if equipment_type and str(equipment_type).isdigit():
            qs = qs.filter(equipment_type_id=int(equipment_type))

        region = params.get("region")
        if region:
            qs = qs.filter(regions__region_code=region).distinct()

        return qs


class ACModelRecalculateView(APIView):
    """Пересчитать `total_index` одной модели (использует тот же путь,
    что Django-admin action: `ac_scoring.engine.update_model_total_index`).
    """

    permission_classes = [IsHvacAdminProxyAllowed]

    def post(self, request, pk: int):
        model = get_object_or_404(
            ACModel.objects.select_related("brand", "brand__origin_class"),
            pk=pk,
        )
        if not MethodologyVersion.objects.filter(is_active=True).exists():
            return Response(
                {"detail": "Нет активной методики — пересчёт невозможен."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        updated = update_model_total_index(model)
        # update_model_total_index пересохраняет total_index, но instance в
        # памяти — старый. Перечитываем из БД для актуального ответа.
        model.refresh_from_db()
        serializer = AdminACModelDetailSerializer(
            model, context={"request": request},
        )
        return Response(
            {
                "recalculated": bool(updated),
                "model": serializer.data,
            },
            status=status.HTTP_200_OK,
        )


class ACModelPhotoListCreateView(generics.ListCreateAPIView):
    """`GET /models/{model_id}/photos/`  — список фото модели.
    `POST /models/{model_id}/photos/` — multipart upload с лимитом MAX_PHOTOS.
    """

    permission_classes = [IsHvacAdminProxyAllowed]
    serializer_class = AdminACModelPhotoSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        return ACModelPhoto.objects.filter(model_id=self.kwargs["model_id"])

    def create(self, request, *args, **kwargs):
        model = get_object_or_404(ACModel, pk=self.kwargs["model_id"])

        if model.photos.count() >= MAX_PHOTOS:
            return Response(
                {"detail": f"Достигнут лимит фото на модель ({MAX_PHOTOS})."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        image = request.data.get("image")
        if not isinstance(image, UploadedFile):
            return Response(
                {"image": ["Файл изображения обязателен (multipart/form-data)."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # `order`: в хвост, если не указан явно.
        order = serializer.validated_data.get("order")
        if order is None:
            last = model.photos.order_by("-order").first()
            order = (last.order + 1) if last is not None else 0
        photo = ACModelPhoto.objects.create(
            model=model,
            image=image,
            alt=serializer.validated_data.get("alt", ""),
            order=order,
        )
        out = self.get_serializer(photo)
        headers = self.get_success_headers(out.data)
        return Response(out.data, status=status.HTTP_201_CREATED, headers=headers)


class ACModelPhotoDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsHvacAdminProxyAllowed]
    serializer_class = AdminACModelPhotoSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        return ACModelPhoto.objects.filter(model_id=self.kwargs["model_id"])


class ACModelPhotoReorderView(APIView):
    """`POST /models/{model_id}/photos/reorder/` `{"ids": [3, 1, 2]}`.

    Устанавливает `order` = индекс в массиве. Любой id, не принадлежащий
    модели, → 400 (валидация целостности payload).
    """

    permission_classes = [IsHvacAdminProxyAllowed]

    def post(self, request, model_id: int):
        model = get_object_or_404(ACModel, pk=model_id)
        ids = request.data.get("ids")
        if not isinstance(ids, list) or not all(isinstance(i, int) for i in ids):
            return Response(
                {"detail": "Поле 'ids' должно быть списком целых чисел."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        photos = list(model.photos.filter(id__in=ids))
        photos_by_id = {p.id: p for p in photos}
        if set(photos_by_id.keys()) != set(ids):
            return Response(
                {"detail": "Список ids не совпадает с фото этой модели."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        for index, pid in enumerate(ids):
            photo = photos_by_id[pid]
            if photo.order != index:
                photo.order = index
                photo.save(update_fields=["order"])

        out = AdminACModelPhotoSerializer(
            model.photos.order_by("order", "id"),
            many=True,
            context={"request": request},
        )
        return Response({"photos": out.data}, status=status.HTTP_200_OK)


class EquipmentTypeAdminViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only справочник типов оборудования для dropdown'ов админки."""

    permission_classes = [IsHvacAdminProxyAllowed]
    serializer_class = EquipmentTypeAdminSerializer
    queryset = EquipmentType.objects.all().order_by("name")
    pagination_class = None


class GenerateProsConsView(APIView):
    """`POST /models/{pk}/generate-pros-cons/` — AI-генерация плюсов/минусов.

    Логика:
      1. Проверяем активную методику и наличие raw_values.
      2. Считаем нормированные баллы через `compute_scores_for_model`.
      3. Отбираем HIGH (≥80) и LOW (≤25) критерии.
      4. Дёргаем LLM-провайдер (через `LLMTaskConfig`) с системным
         промптом-конфигом + структурированным контекстом.
      5. Парсим JSON `{pros: [...], cons: [...]}`, режем каждый блок до 3
         строк, сохраняем в `pros_text`/`cons_text` (через '\\n').
      6. Отвечаем `{model, generated, provider}`.

    Ошибки:
      - 400 — нет активной методики или модель пустая (нет данных для AI).
      - 503 — LLM провайдер недоступен / вернул невалидный JSON / упал.
    """

    permission_classes = [IsHvacAdminProxyAllowed]

    def post(self, request, pk: int):
        model = get_object_or_404(
            ACModel.objects.select_related("brand", "brand__origin_class"),
            pk=pk,
        )

        active_methodology = MethodologyVersion.objects.filter(is_active=True).first()
        if active_methodology is None:
            return Response(
                {"detail": "Не удалось вычислить scoring: нет активной методики."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw_values_qs = list(
            model.raw_values.select_related("criterion").all()
        )
        if not raw_values_qs:
            return Response(
                {
                    "detail": "Не удалось вычислить scoring: у модели нет "
                    "значений параметров (raw_values).",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        raw_values_by_code = {
            (rv.criterion.code if rv.criterion else rv.criterion_code): rv
            for rv in raw_values_qs
        }

        try:
            _, score_rows = compute_scores_for_model(model, active_methodology)
        except Exception as exc:
            logger.exception(
                "compute_scores_for_model failed for model %s: %s", model.pk, exc,
            )
            return Response(
                {"detail": f"Не удалось вычислить scoring: {exc}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not score_rows:
            return Response(
                {
                    "detail": "Не удалось вычислить scoring: ни один критерий "
                    "методики не дал результата (проверьте raw_values и "
                    "состав активной методики).",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            provider = get_pros_cons_provider()
        except Exception as exc:
            logger.exception(
                "LLM provider init failed for ac_pros_cons (model %s): %s",
                model.pk, exc,
            )
            return Response(
                {
                    "detail": "AI временно недоступен",
                    "error": str(exc),
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        user_prompt = _build_pros_cons_user_prompt(
            model, score_rows, raw_values_by_code,
        )

        try:
            llm_result = provider.chat_completion(
                PROS_CONS_SYSTEM_PROMPT,
                user_prompt,
                response_format="json",
            )
        except Exception as exc:
            logger.exception(
                "LLM chat_completion failed for ac_pros_cons (model %s): %s",
                model.pk, exc,
            )
            return Response(
                {
                    "detail": "AI временно недоступен",
                    "error": str(exc),
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        if not isinstance(llm_result, dict):
            logger.warning(
                "LLM returned non-dict response for model %s: %r",
                model.pk, llm_result,
            )
            return Response(
                {
                    "detail": "AI временно недоступен",
                    "error": "LLM вернул некорректный формат ответа.",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        pros = _normalize_lines(llm_result.get("pros"))[:3]
        cons = _normalize_lines(llm_result.get("cons"))[:3]
        if not pros or not cons:
            logger.warning(
                "LLM response is missing pros/cons for model %s: %r",
                model.pk, llm_result,
            )
            return Response(
                {
                    "detail": "AI временно недоступен",
                    "error": "LLM не вернул pros/cons в ожидаемом формате.",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        model.pros_text = "\n".join(pros)
        model.cons_text = "\n".join(cons)
        model.save(update_fields=["pros_text", "cons_text"])
        model.refresh_from_db()

        provider_type = type(provider).__name__
        provider_display = (
            f"{provider_type}: {provider.model_name}"
            if getattr(provider, "model_name", None)
            else provider_type
        )

        serializer = AdminACModelDetailSerializer(
            model, context={"request": request},
        )
        return Response(
            {
                "model": serializer.data,
                "generated": {"pros": pros, "cons": cons},
                "provider": provider_display,
            },
            status=status.HTTP_200_OK,
        )


class ModelRegionAdminViewSet(viewsets.GenericViewSet):
    """Read-only список регионов из `ModelRegion.RegionCode.choices`.

    Отдельной таблицы Region нет — отдаём константы. Фронт использует для
    multi-select при редактировании моделей.
    """

    permission_classes = [IsHvacAdminProxyAllowed]
    pagination_class = None

    def list(self, request):
        data = [
            {"code": code, "label": label}
            for code, label in ModelRegion.RegionCode.choices
        ]
        return Response(data, status=status.HTTP_200_OK)

"""PDF import — два режима:

- async (default, E19-2): создаём RecognitionJob → 202, дальше worker
  забирает и POST'ит на recognition с callback URL. Сметчик закрывает
  диалог и работает дальше.
- sync (?async=false, backward compat): синхронный вызов recognition,
  ждём ответ как раньше. Используется в тестах и для быстрых PDF.
"""

import logging
import secrets

from asgiref.sync import async_to_sync
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from apps.estimate.models import Estimate
from apps.integration.recognition_client import (
    RecognitionClient,
    RecognitionClientError,
)
from apps.llm_profiles.models import ImportLog, LLMProfile
from apps.llm_profiles.proxy import build_llm_headers
from apps.recognition_jobs.models import RecognitionJob
from apps.recognition_jobs.serializers import RecognitionJobSerializer

from .services.pdf_import_service import (
    PDFParseError,
    apply_parsed_items,
    parse_pdf_via_recognition,
)

logger = logging.getLogger(__name__)


def _get_workspace_id(request):
    return request.META.get("HTTP_X_WORKSPACE_ID") or request.query_params.get("workspace_id")


def _is_async_requested(request) -> bool:
    """`?async=true` — async через RecognitionJob (E19-2).
    Default — sync (старый backward-compat flow).

    E19 hotfix 2026-04-26: переключение на async **default** опасно — frontend
    ожидает sync PdfImportResult, на 202 + RecognitionJob ломается. Default
    остаётся sync, frontend начнёт передавать `?async=true` после E19-3.
    """
    raw = request.query_params.get("async", "false").strip().lower()
    return raw in ("true", "1", "yes", "on")


def _resolve_profile(request) -> tuple[LLMProfile | None, Response | None]:
    """Прочитать llm_profile_id из FormData, валидировать, вернуть профиль.

    Возвращает (profile, error_response). Если profile_id не передан →
    (None, None) — recognition использует defaults. Если передан, но не
    найден → (None, Response 400). Если передан валидный → (profile, None).
    """
    profile_id_raw = (request.POST.get("llm_profile_id") or "").strip()
    if not profile_id_raw:
        return None, None
    if not profile_id_raw.isdigit():
        return None, Response(
            {"llm_profile_id": "must be integer"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    profile = LLMProfile.objects.filter(id=int(profile_id_raw)).first()
    if not profile:
        return None, Response(
            {"llm_profile_id": "profile_not_found"},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return profile, None


@api_view(["POST"])
@parser_classes([MultiPartParser])
def import_pdf(request, estimate_pk):
    """POST /api/v1/estimates/{id}/import/pdf/?async=true (default).

    Async: создаёт RecognitionJob (status=queued) → возвращает 202 +
    сериализованный job. Worker подхватит и dispatch'нёт на recognition.

    Sync (`?async=false`): синхронный вызов recognition, item'ы создаются
    немедленно. Backward compat для существующих интеграций / тестов.

    E18-2: FormData может содержать llm_profile_id — id LLMProfile для
    переопределения провайдера/модели. Если передан, но профиль не найден →
    400. Если не передан → recognition использует свои env defaults.
    """
    workspace_id = _get_workspace_id(request)
    if not workspace_id:
        return Response({"workspace_id": "Required"}, status=status.HTTP_400_BAD_REQUEST)

    file = request.FILES.get("file")
    if not file:
        return Response({"file": "Required"}, status=status.HTTP_400_BAD_REQUEST)
    if not file.name.lower().endswith(".pdf"):
        return Response({"file": "Only PDF files"}, status=status.HTTP_400_BAD_REQUEST)

    profile, err = _resolve_profile(request)
    if err is not None:
        return err

    if _is_async_requested(request):
        return _create_async_job(request, estimate_pk, workspace_id, file, profile)
    return _sync_import_pdf(estimate_pk, workspace_id, file, profile, request.user)


def _create_async_job(request, estimate_pk, workspace_id, file, profile):
    """Создать RecognitionJob, вернуть 202 + serialized job.

    E18-2: profile (LLMProfile|None) уже разрезолвлен в import_pdf.
    Сохраняем profile.id в RecognitionJob.profile_id (IntegerField, без FK
    constraint) — worker позже прочитает и пробросит X-LLM-* headers.
    """
    estimate = get_object_or_404(
        Estimate, pk=estimate_pk, workspace_id=workspace_id
    )

    pdf_bytes = file.read()
    job = RecognitionJob.objects.create(
        estimate=estimate,
        workspace_id=workspace_id,
        file_name=file.name,
        file_type="pdf",
        file_blob=pdf_bytes,
        profile_id=profile.id if profile else None,
        cancellation_token=secrets.token_urlsafe(32),
        created_by=request.user if request.user.is_authenticated else None,
    )
    logger.info(
        "recognition_jobs created via import_pdf",
        extra={
            "job_id": str(job.id),
            "estimate_id": str(estimate.id),
            "file_name": file.name,
            "size_bytes": len(pdf_bytes),
        },
    )
    serializer = RecognitionJobSerializer(job)
    return Response(serializer.data, status=status.HTTP_202_ACCEPTED)


def _sync_import_pdf(estimate_pk, workspace_id, file, profile, user):
    """Старый flow до E19-2: ждём recognition синхронно.

    E18-2: profile (LLMProfile|None) → X-LLM-* headers через build_llm_headers.
    После успешного apply создаём ImportLog с llm_costs из recognition response.
    """
    extra_headers = build_llm_headers(profile) if profile else None
    file_bytes = file.read()
    file_name = file.name
    try:
        result = parse_pdf_via_recognition(
            file_bytes, file_name, extra_headers=extra_headers
        )
    except PDFParseError as e:
        logger.error("PDF parse failed: %s", e)
        return Response({"error": str(e), "code": e.code}, status=status.HTTP_502_BAD_GATEWAY)

    items = result.get("items", [])
    llm_costs = result.get("llm_costs") or {}
    if not items:
        return Response({
            "created": 0,
            "sections": 0,
            "errors": result.get("errors", ["Не удалось распознать позиции"]),
            "pages_total": result.get("pages_total", 0),
            "pages_processed": result.get("pages_processed", 0),
            "pages_summary": result.get("pages_summary", []),
            "llm_costs": llm_costs,
        })

    try:
        applied = apply_parsed_items(str(estimate_pk), workspace_id, items)
    except Exception as e:
        logger.error("PDF apply failed: %s", e)
        return Response(
            {"error": f"Ошибка создания позиций: {e}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    _create_import_log(
        estimate_id=str(estimate_pk),
        profile=profile,
        file_name=file_name,
        items_created=applied["created"],
        pages_processed=result.get("pages_processed", 0),
        llm_costs=llm_costs,
        user=user,
    )

    return Response({
        "created": applied["created"],
        "sections": applied["sections"],
        "errors": result.get("errors", []),
        "pages_total": result.get("pages_total", 0),
        "pages_processed": result.get("pages_processed", 0),
        "pages_summary": result.get("pages_summary", []),
        "llm_costs": llm_costs,
    })


def _create_import_log(
    *,
    estimate_id: str,
    profile,
    file_name: str,
    items_created: int,
    pages_processed: int,
    llm_costs: dict,
    user,
) -> None:
    """E18-2: создать ImportLog после успешного импорта PDF.

    cost_usd берётся из llm_costs.total_usd (E18-1 контракт). Если total_usd
    отсутствует или модель не в pricing.json — None (UI отрисует «—»).
    """
    total_usd = llm_costs.get("total_usd") if isinstance(llm_costs, dict) else None
    try:
        ImportLog.objects.create(
            estimate_id=estimate_id,
            file_type="pdf",
            file_name=file_name,
            profile=profile,
            cost_usd=total_usd,
            items_created=items_created,
            pages_processed=pages_processed,
            llm_metadata=llm_costs or {},
            created_by=user if getattr(user, "is_authenticated", False) else None,
        )
    except Exception as exc:  # noqa: BLE001 — лог не должен ломать import
        logger.warning(
            "import_log create failed",
            extra={"estimate_id": estimate_id, "error": str(exc)},
        )


@api_view(["POST"])
@parser_classes([MultiPartParser])
def probe_pdf(request, estimate_pk):
    """POST /api/v1/estimates/{id}/probe/pdf/ — прокси в Recognition /v1/probe.

    Дёшево (≤10с) считает pages_total/has_text_layer/estimated_seconds для
    прогресс-бара UI перед вызовом /import/pdf/. LLM не задействуется.
    """
    workspace_id = _get_workspace_id(request)
    if not workspace_id:
        return Response({"workspace_id": "Required"}, status=status.HTTP_400_BAD_REQUEST)

    file = request.FILES.get("file")
    if not file:
        return Response({"file": "Required"}, status=status.HTTP_400_BAD_REQUEST)
    if not file.name.lower().endswith(".pdf"):
        return Response({"file": "Only PDF files"}, status=status.HTTP_400_BAD_REQUEST)

    client = RecognitionClient()
    try:
        result = async_to_sync(client.probe)(file.read(), file.name)
    except RecognitionClientError as e:
        logger.warning("recognition probe failed: code=%s status=%s", e.code, e.status_code)
        return Response(
            {"error": str(e), "code": e.code},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    return Response(result)

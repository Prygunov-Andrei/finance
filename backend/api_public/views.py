"""
Публичное API портала смет.

Все эндпоинты под /api/public/v1/.
Аутентификация: OTP → verification_token → access_token (без JWT сотрудников).
"""
import logging

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from .models import EstimateRequest, EstimateRequestFile, CallbackRequest, PublicPortalConfig
from .otp import send_otp, verify_otp, check_verification_token
from .security import validate_file_magic, validate_file_extension, validate_file_size
from .serializers import (
    SendOTPSerializer, ConfirmOTPSerializer,
    CreateEstimateRequestSerializer, EstimateRequestStatusSerializer,
    EstimateRequestDetailSerializer, CallbackRequestSerializer,
)

logger = logging.getLogger(__name__)


# --- Rate Limiting ---

class EmailOTPThrottle(AnonRateThrottle):
    rate = '5/day'
    scope = 'email_otp'


class EstimateCreateThrottle(AnonRateThrottle):
    rate = '5/day'
    scope = 'estimate_create'


# --- OTP Views ---

@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([EmailOTPThrottle])
def verify_email_send(request):
    """POST /api/public/v1/verify-email/ — отправка OTP-кода."""
    serializer = SendOTPSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    email = serializer.validated_data['email']

    result = send_otp(email)
    if 'error' in result:
        return Response({'detail': result['error']}, status=status.HTTP_400_BAD_REQUEST)

    return Response({'detail': 'Код отправлен на email.'})


@api_view(['POST'])
@permission_classes([AllowAny])
def verify_email_confirm(request):
    """POST /api/public/v1/verify-email/confirm/ — подтверждение OTP."""
    serializer = ConfirmOTPSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    result = verify_otp(
        email=serializer.validated_data['email'],
        code=serializer.validated_data['code'],
    )

    if 'error' in result:
        return Response({'detail': result['error']}, status=status.HTTP_400_BAD_REQUEST)

    return Response({
        'verification_token': result['verification_token'],
    })


# --- Estimate Request Views ---

@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([EstimateCreateThrottle])
def create_estimate_request(request):
    """POST /api/public/v1/estimate-requests/ — создание запроса + загрузка файлов."""
    serializer = CreateEstimateRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    # Проверка verification_token
    email = check_verification_token(serializer.validated_data['verification_token'])
    if not email:
        return Response(
            {'detail': 'Невалидный или просроченный verification_token. Пройдите верификацию email.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    # Проверка файлов
    files = request.FILES.getlist('files')
    if not files:
        return Response(
            {'detail': 'Необходимо загрузить хотя бы один файл.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    config = PublicPortalConfig.get()
    if len(files) > config.max_files_per_request:
        return Response(
            {'detail': f'Максимум {config.max_files_per_request} файлов на запрос.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Валидация каждого файла
    for f in files:
        try:
            validate_file_extension(f.name)
            validate_file_size(f.size, f.name)
            validate_file_magic(f.read(2048), f.name)
            f.seek(0)
        except Exception as e:
            return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    # Создание запроса
    estimate_request = EstimateRequest.objects.create(
        email=email,
        project_name=serializer.validated_data['project_name'],
        company_name=serializer.validated_data.get('company_name', ''),
        contact_name=serializer.validated_data.get('contact_name', ''),
        phone=serializer.validated_data.get('phone', ''),
        project_description=serializer.validated_data.get('project_description', ''),
        total_files=len(files),
    )

    # Сохранение файлов
    for f in files:
        EstimateRequestFile.objects.create(
            request=estimate_request,
            file=f,
            original_filename=f.name,
            file_size=f.size,
        )

    # Запуск Celery-задачи
    from .tasks import process_public_estimate_request
    task = process_public_estimate_request.delay(estimate_request.id)
    estimate_request.task_id = task.id
    estimate_request.save(update_fields=['task_id'])

    logger.info(
        'Создан публичный запрос #%d: %s (%d файлов)',
        estimate_request.id, email, len(files),
    )

    return Response({
        'access_token': estimate_request.access_token,
        'status_url': f'/requests/{estimate_request.access_token}/',
    }, status=status.HTTP_201_CREATED)


def _get_request_or_404(access_token: str):
    """Получить EstimateRequest по access_token или вернуть ошибку."""
    try:
        req = EstimateRequest.objects.get(access_token=access_token)
    except EstimateRequest.DoesNotExist:
        return None, Response(
            {'detail': 'Запрос не найден.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    if req.is_expired:
        return None, Response(
            {'detail': 'Ссылка истекла.'},
            status=status.HTTP_410_GONE,
        )

    return req, None


@api_view(['GET'])
@permission_classes([AllowAny])
def estimate_request_detail(request, access_token):
    """GET /api/public/v1/estimate-requests/{access_token}/ — детали запроса."""
    req, error = _get_request_or_404(access_token)
    if error:
        return error

    serializer = EstimateRequestDetailSerializer(req)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([AllowAny])
def estimate_request_status(request, access_token):
    """GET /api/public/v1/estimate-requests/{access_token}/status/ — лёгкий polling."""
    req, error = _get_request_or_404(access_token)
    if error:
        return error

    serializer = EstimateRequestStatusSerializer(req)
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([AllowAny])
def estimate_request_download(request, access_token):
    """GET /api/public/v1/estimate-requests/{access_token}/download/ — скачать Excel."""
    req, error = _get_request_or_404(access_token)
    if error:
        return error

    if req.status not in ('ready', 'delivered'):
        return Response(
            {'detail': 'Смета ещё не готова.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    if not req.result_excel_file:
        return Response(
            {'detail': 'Файл сметы не найден.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    # Обновляем downloaded_at
    if not req.downloaded_at:
        req.downloaded_at = timezone.now()
        req.save(update_fields=['downloaded_at'])

    # Если status=ready → delivered
    if req.status == 'ready':
        req.status = EstimateRequest.Status.DELIVERED
        req.save(update_fields=['status'])

    # Presigned URL из MinIO
    url = req.result_excel_file.url
    return Response(
        status=status.HTTP_302_FOUND,
        headers={'Location': url},
    )


@api_view(['POST'])
@permission_classes([AllowAny])
def estimate_request_callback(request, access_token):
    """POST /api/public/v1/estimate-requests/{access_token}/callback/ — заявка на звонок."""
    req, error = _get_request_or_404(access_token)
    if error:
        return error

    serializer = CallbackRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    callback = CallbackRequest.objects.create(
        request=req,
        phone=serializer.validated_data['phone'],
        preferred_time=serializer.validated_data.get('preferred_time', ''),
        comment=serializer.validated_data.get('comment', ''),
    )

    logger.info('Callback request #%d для запроса #%d', callback.id, req.id)

    return Response({'detail': 'Заявка на звонок отправлена.'}, status=status.HTTP_201_CREATED)


# =============================================================================
# Work Matching (публичный API)
# =============================================================================

@api_view(['POST'])
@permission_classes([AllowAny])
def public_start_work_matching(request, access_token):
    """Запустить фоновый подбор работ для публичного запроса сметы."""
    req = get_object_or_404(EstimateRequest, access_token=access_token)
    if not req.estimate_id:
        return Response({'error': 'Смета ещё не создана'}, status=status.HTTP_400_BAD_REQUEST)

    from estimates.services.work_matching import WorkMatchingService
    svc = WorkMatchingService()

    try:
        result = svc.start_matching(estimate_id=req.estimate_id, user_id=0)
    except ValueError as e:
        msg = str(e)
        if msg.startswith('ALREADY_RUNNING:'):
            return Response(
                {'error': 'Подбор уже запущен', 'session_id': msg.split(':')[1]},
                status=status.HTTP_409_CONFLICT,
            )
        raise

    return Response(result, status=status.HTTP_202_ACCEPTED)


@api_view(['GET'])
@permission_classes([AllowAny])
def public_work_matching_progress(request, access_token, session_id):
    """Прогресс подбора работ для публичного запроса."""
    get_object_or_404(EstimateRequest, access_token=access_token)

    from estimates.services.work_matching import WorkMatchingService
    svc = WorkMatchingService()
    progress = svc.get_progress(session_id)
    if not progress:
        return Response({'error': 'Сессия не найдена'}, status=status.HTTP_404_NOT_FOUND)
    return Response(progress)


@api_view(['POST'])
@permission_classes([AllowAny])
def public_apply_work_matching(request, access_token):
    """Применить результаты подбора работ для публичного запроса."""
    req = get_object_or_404(EstimateRequest, access_token=access_token)
    session_id = request.data.get('session_id')
    items_data = request.data.get('items', [])
    if not session_id or not items_data:
        return Response({'error': 'Необходимы session_id и items'}, status=status.HTTP_400_BAD_REQUEST)

    from estimates.services.work_matching import WorkMatchingService
    svc = WorkMatchingService()
    result = svc.apply_results(session_id=session_id, items=items_data)
    return Response(result)

import logging
import uuid
from typing import Optional

from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes, parser_classes, throttle_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.throttling import UserRateThrottle
from drf_spectacular.utils import extend_schema, OpenApiParameter

from .models import LLMProvider
from .serializers import LLMProviderSerializer
from .services.document_parser import DocumentParser
from .services.exceptions import RateLimitError

logger = logging.getLogger(__name__)


class LLMParseThrottle(UserRateThrottle):
    """Ограничение частоты запросов на парсинг счетов"""
    rate = '30/hour'  # 30 запросов в час на пользователя
    scope = 'llm_parse'

# Лимиты на размер файлов
MAX_FILE_SIZE_MB = 10
MAX_PDF_PAGES = 20

# Magic bytes для определения типа файла
MAGIC_BYTES = {
    b'%PDF': 'pdf',
    b'\x89PNG': 'png',
    b'\xff\xd8\xff': 'jpg',  # JPEG
}


def detect_file_type(content: bytes) -> Optional[str]:
    """Определяет тип файла по magic bytes"""
    for magic, file_type in MAGIC_BYTES.items():
        if content.startswith(magic):
            return file_type
    return None


class LLMProviderViewSet(viewsets.ModelViewSet):
    """ViewSet для управления LLM-провайдерами"""
    
    queryset = LLMProvider.objects.all()
    serializer_class = LLMProviderSerializer
    permission_classes = [IsAuthenticated]
    
    @extend_schema(summary='Установить провайдер по умолчанию', tags=['LLM'])
    @action(detail=True, methods=['post'])
    def set_default(self, request, pk=None):
        """Устанавливает провайдер как default, сбрасывая предыдущий"""
        provider = self.get_object()
        # Сбрасываем is_default у всех остальных провайдеров
        LLMProvider.objects.exclude(pk=provider.pk).update(is_default=False)
        provider.is_default = True
        provider.save()
        return Response(LLMProviderSerializer(provider).data)


@extend_schema(
    summary='Парсинг PDF-счёта',
    tags=['LLM'],
    request={
        'multipart/form-data': {
            'type': 'object',
            'properties': {
                'file': {'type': 'string', 'format': 'binary'}
            },
            'required': ['file']
        }
    },
    responses={
        200: {
            'description': 'Успешный парсинг',
            'content': {
                'application/json': {
                    'example': {
                        'success': True,
                        'from_cache': False,
                        'document_id': 1,
                        'data': {},
                        'matches': {},
                        'warnings': [],
                        'error': None
                    }
                }
            }
        }
    }
)
@api_view(['POST', 'OPTIONS'])  # Добавлен OPTIONS для preflight
@permission_classes([IsAuthenticated])
@throttle_classes([LLMParseThrottle])  # 30 запросов/час на пользователя
@parser_classes([MultiPartParser, FormParser])
def parse_invoice(request):
    """
    Парсит загруженный PDF/PNG/JPG счёт через LLM.
    
    Возвращает структурированные данные и результаты сопоставления.
    Поддерживает форматы: PDF, PNG, JPG, JPEG.
    """
    # Для preflight OPTIONS запроса
    if request.method == 'OPTIONS':
        return Response(status=status.HTTP_200_OK)
    if 'file' not in request.FILES:
        return Response(
            {'error': 'Файл не загружен'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    file = request.FILES['file']
    
    # Проверяем размер файла
    if file.size > MAX_FILE_SIZE_MB * 1024 * 1024:
        return Response(
            {'error': f'Файл слишком большой. Максимальный размер: {MAX_FILE_SIZE_MB} MB'},
            status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
        )
    
    # Проверяем формат файла (PDF, PNG, JPG, JPEG)
    filename_lower = file.name.lower()
    allowed_extensions = ('.pdf', '.png', '.jpg', '.jpeg')
    if not filename_lower.endswith(allowed_extensions):
        return Response(
            {'error': 'Допускаются только файлы PDF, PNG, JPG, JPEG'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    file_content = file.read()
    
    # Проверяем magic bytes (защита от подмены расширения)
    detected_type = detect_file_type(file_content)
    expected_types = {'pdf': '.pdf', 'png': '.png', 'jpg': ('.jpg', '.jpeg')}
    
    if detected_type:
        expected_ext = expected_types.get(detected_type)
        if expected_ext:
            if isinstance(expected_ext, tuple):
                ext_match = filename_lower.endswith(expected_ext)
            else:
                ext_match = filename_lower.endswith(expected_ext)
            
            if not ext_match:
                return Response(
                    {'error': f'Расширение файла не соответствует содержимому. Обнаружен: {detected_type.upper()}'},
                    status=status.HTTP_400_BAD_REQUEST
                )
    else:
        # Неизвестный формат
        return Response(
            {'error': 'Не удалось определить тип файла. Убедитесь, что это корректный PDF, PNG или JPG.'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Проверяем количество страниц для PDF
    if filename_lower.endswith('.pdf'):
        try:
            import fitz
            doc = fitz.open(stream=file_content, filetype='pdf')
            page_count = len(doc)
            doc.close()
            
            if page_count > MAX_PDF_PAGES:
                return Response(
                    {'error': f'PDF содержит слишком много страниц ({page_count}). Максимум: {MAX_PDF_PAGES}'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        except Exception:
            pass  # Если не удалось открыть — продолжим, LLM обработает ошибку
    
    # Проверяем наличие активного LLM провайдера
    from .models import LLMProvider
    try:
        default_provider = LLMProvider.get_default()
    except LLMProvider.DoesNotExist:
        return Response(
            {
                'success': False,
                'error': 'Не настроен LLM провайдер. Запустите команду: python manage.py setup_providers',
                'data': None,
                'matches': None,
                'warnings': [],
                'from_cache': False,
                'document_id': None
            },
            status=status.HTTP_503_SERVICE_UNAVAILABLE
        )
    
    parser = DocumentParser(provider=default_provider)
    
    try:
        result = parser.parse_invoice(
            pdf_content=file_content,
            filename=file.name
        )
        
        # Если документ уже обрабатывается другим запросом
        if result.get('status') == 'processing':
            return Response(
                {
                    'success': False,
                    'status': 'processing',
                    'error': result['error'],
                    'retry_after': result.get('retry_after', 10)
                },
                status=status.HTTP_202_ACCEPTED
            )
        
        # Если парсинг не успешен
        if not result['success']:
            return Response(
                {
                    'success': False,
                    'error': result['error'],
                    'document_id': result['parsed_document'].id if result.get('parsed_document') else None,
                    'data': None,
                    'matches': None,
                    'warnings': result.get('warnings', [])
                },
                status=status.HTTP_200_OK
            )
        
        # Формируем ответ в нужном формате
        response_data = {
            'success': result['success'],
            'from_cache': result.get('from_cache', False),
            'document_id': result['parsed_document'].id if result['parsed_document'] else None,
            'data': result['data'],
            'matches': {
                'vendor': {
                    'match_type': result['matches']['vendor']['match_type'],
                    'counterparty_id': (
                        result['matches']['vendor']['counterparty'].id
                        if result['matches']['vendor'].get('counterparty') else None
                    ),
                    'suggestions': result['matches']['vendor']['suggestions']
                },
                'buyer': {
                    'match_type': result['matches']['buyer']['match_type'],
                    'legal_entity_id': (
                        result['matches']['buyer']['legal_entity'].id
                        if result['matches']['buyer'].get('legal_entity') else None
                    ),
                    'error': result['matches']['buyer'].get('error')
                },
                'products': result['matches']['products']
            },
            'warnings': result['warnings'],
            'error': result['error']
        }
        
        return Response(response_data)
        
    except RateLimitError as e:
        request_id = str(uuid.uuid4())[:8]
        logger.warning(f"[{request_id}] Rate limit exceeded: {e}")
        return Response(
            {
                'success': False,
                'error_code': 'RATE_LIMIT',
                'error': 'Превышен лимит запросов к LLM. Попробуйте позже.',
                'request_id': request_id
            },
            status=status.HTTP_429_TOO_MANY_REQUESTS
        )
    except Exception as e:
        request_id = str(uuid.uuid4())[:8]
        logger.exception(f"[{request_id}] Parse error: {e}")
        return Response(
            {
                'success': False,
                'error_code': 'PARSE_ERROR',
                'error': f'Ошибка парсинга: {str(e)}',
                'request_id': request_id
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

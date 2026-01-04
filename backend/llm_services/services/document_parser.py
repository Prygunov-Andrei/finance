import logging
from datetime import timedelta
from typing import Optional, Dict, Any, Tuple

from django.db import transaction
from django.utils import timezone

from ..models import LLMProvider, ParsedDocument
from ..providers import get_provider, BaseLLMProvider
from ..schemas import ParsedInvoice
from .entity_matcher import CounterpartyMatcher, LegalEntityMatcher
from .exceptions import RateLimitError

logger = logging.getLogger(__name__)

# Таймаут для "зависших" документов в статусе PENDING (минуты)
PENDING_TIMEOUT_MINUTES = 5
# Максимальное количество попыток парсинга одного файла
MAX_PARSE_ATTEMPTS = 3


class DocumentParser:
    """Главный сервис для парсинга документов"""
    
    CONFIDENCE_THRESHOLD = 0.7
    MAX_RETRIES = 2
    
    def __init__(self, provider: LLMProvider = None):
        self.provider_model = provider or LLMProvider.get_default()
        self.provider = get_provider(self.provider_model)
        self.counterparty_matcher = CounterpartyMatcher()
        self.legal_entity_matcher = LegalEntityMatcher()
        # Ленивый импорт ProductMatcher для избежания циклических зависимостей
        from catalog.services import ProductMatcher
        self.product_matcher = ProductMatcher()
    
    def parse_invoice(
        self,
        pdf_content: bytes,
        filename: str,
        payment=None
    ) -> Dict[str, Any]:
        """
        Парсит счёт и возвращает структурированные данные.
        
        Args:
            pdf_content: Содержимое PDF или изображения
            filename: Имя файла
            payment: Связанный платёж (опционально)
        
        Returns:
            {
                'success': bool,
                'parsed_document': ParsedDocument,
                'data': {...},  # Распарсенные данные
                'matches': {...},  # Результаты сопоставления
                'warnings': [...],
                'error': str | None
            }
        """
        file_hash = BaseLLMProvider.calculate_file_hash(pdf_content)
        
        # Проверяем кэш с блокировкой для предотвращения race condition
        parsed_doc = None
        
        with transaction.atomic():
            existing = ParsedDocument.objects.select_for_update(
                skip_locked=True
            ).filter(file_hash=file_hash).first()
            
            if existing:
                if existing.status == ParsedDocument.Status.SUCCESS:
                    logger.info(f"Используем кэш для файла {filename}")
                    return self._build_response(existing, from_cache=True)
                
                elif existing.status == ParsedDocument.Status.PENDING:
                    # Проверяем, не "завис" ли документ
                    pending_timeout = timezone.now() - timedelta(minutes=PENDING_TIMEOUT_MINUTES)
                    if existing.created_at > pending_timeout:
                        # Документ ещё обрабатывается другим запросом
                        logger.info(f"Документ {filename} уже обрабатывается")
                        return {
                            'success': False,
                            'parsed_document': None,
                            'data': None,
                            'matches': None,
                            'warnings': [],
                            'error': 'Документ уже обрабатывается. Попробуйте через несколько секунд.',
                            'status': 'processing',
                            'retry_after': 10
                        }
                    else:
                        # Документ "завис" — удаляем и парсим заново
                        logger.warning(f"Удаляем зависший документ {filename}")
                        existing.delete()
                        existing = None
                
                else:
                    # Статус FAILED или NEEDS_REVIEW — проверяем лимит попыток
                    if existing.retry_count >= MAX_PARSE_ATTEMPTS:
                        logger.warning(f"Превышен лимит попыток для файла {filename}")
                        return {
                            'success': False,
                            'parsed_document': existing,
                            'data': None,
                            'matches': None,
                            'warnings': [],
                            'error': f'Превышен лимит попыток парсинга ({MAX_PARSE_ATTEMPTS}). Файл не может быть обработан.'
                        }
                    
                    # Увеличиваем счётчик и пробуем снова
                    existing.retry_count += 1
                    existing.status = ParsedDocument.Status.PENDING
                    existing.error_message = ''
                    existing.save(update_fields=['retry_count', 'status', 'error_message', 'updated_at'])
                    parsed_doc = existing
                    logger.info(f"Повторная попытка #{existing.retry_count} для файла {filename}")
            
            # Создаём новую запись если нет существующей для retry
            if parsed_doc is None:
                parsed_doc = ParsedDocument.objects.create(
                    file_hash=file_hash,
                    original_filename=filename,
                    payment=payment,
                    provider=self.provider_model,
                    status=ParsedDocument.Status.PENDING
                )
        
        # Определяем тип файла
        file_type = self._get_file_type(filename)
        
        try:
            parsed_invoice, processing_time = self._parse_with_retries(pdf_content, file_type)
            
            parsed_doc.parsed_data = parsed_invoice.model_dump(mode='json')
            parsed_doc.confidence_score = parsed_invoice.confidence
            parsed_doc.processing_time_ms = processing_time
            
            if parsed_invoice.confidence < self.CONFIDENCE_THRESHOLD:
                parsed_doc.status = ParsedDocument.Status.NEEDS_REVIEW
            else:
                parsed_doc.status = ParsedDocument.Status.SUCCESS
            
            parsed_doc.save()
            
            return self._build_response(parsed_doc)
            
        except RateLimitError as e:
            parsed_doc.status = ParsedDocument.Status.FAILED
            parsed_doc.error_message = "Превышен лимит запросов. Попробуйте позже."
            parsed_doc.save()
            raise
            
        except Exception as e:
            logger.exception(f"Ошибка парсинга: {e}")
            parsed_doc.status = ParsedDocument.Status.FAILED
            parsed_doc.error_message = str(e)
            parsed_doc.save()
            
            return {
                'success': False,
                'parsed_document': parsed_doc,
                'data': None,
                'matches': None,
                'warnings': [],
                'error': str(e)
            }
    
    def _get_file_type(self, filename: str) -> str:
        """Определяет тип файла по расширению"""
        filename_lower = filename.lower()
        if filename_lower.endswith('.pdf'):
            return 'pdf'
        elif filename_lower.endswith(('.png', '.jpg', '.jpeg')):
            return 'png' if filename_lower.endswith('.png') else 'jpg'
        return 'pdf'  # По умолчанию PDF
    
    def _parse_with_retries(self, file_content: bytes, file_type: str = 'pdf') -> Tuple[ParsedInvoice, int]:
        """Парсинг с retry-логикой"""
        last_error = None
        
        for attempt in range(self.MAX_RETRIES + 1):
            try:
                return self.provider.parse_invoice(file_content, file_type=file_type)
            except Exception as e:
                last_error = e
                error_str = str(e).lower()
                
                # Проверяем rate limit
                if '429' in error_str or 'rate limit' in error_str or 'ratelimit' in error_str:
                    raise RateLimitError(str(e))
                
                if attempt < self.MAX_RETRIES:
                    logger.warning(f"Попытка {attempt + 1} не удалась, повторяем...")
                    continue
        
        raise last_error
    
    def _build_response(
        self,
        parsed_doc: ParsedDocument,
        from_cache: bool = False
    ) -> Dict[str, Any]:
        """Формирует ответ с сопоставлениями"""
        data = parsed_doc.parsed_data
        warnings = []
        
        # Сопоставляем контрагента
        vendor_match = self.counterparty_matcher.match(
            name=data['vendor']['name'],
            inn=data['vendor'].get('inn', '')
        )
        if vendor_match['match_type'] == 'similar':
            warnings.append('Контрагент найден неточно, требуется подтверждение')
        elif vendor_match['match_type'] == 'not_found':
            warnings.append('Контрагент не найден, будет предложено создать нового')
        
        # Сопоставляем наше юрлицо
        buyer_match = self.legal_entity_matcher.match(
            name=data['buyer']['name'],
            inn=data['buyer'].get('inn', '')
        )
        if buyer_match['match_type'] == 'not_found':
            warnings.append(buyer_match['error'])
        
        # Сопоставляем товары (без сохранения — только поиск)
        products_matches = []
        for item in data.get('items', []):
            similar = self.product_matcher.find_similar(item['name'], threshold=0.7, limit=3)
            products_matches.append({
                'raw_name': item['name'],
                'similar_products': similar
            })
        
        # Низкая уверенность
        if parsed_doc.confidence_score and parsed_doc.confidence_score < self.CONFIDENCE_THRESHOLD:
            warnings.append(f'Низкая уверенность парсинга: {parsed_doc.confidence_score:.0%}')
        
        return {
            'success': True,
            'from_cache': from_cache,
            'parsed_document': parsed_doc,
            'data': data,
            'matches': {
                'vendor': vendor_match,
                'buyer': buyer_match,
                'products': products_matches
            },
            'warnings': warnings,
            'error': None
        }

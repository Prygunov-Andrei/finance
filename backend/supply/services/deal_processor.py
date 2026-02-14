"""
DealProcessor — обработка сделок из Битрикс24.

Основной алгоритм:
1. Получить сделку: crm.deal.get
2. Проверить STAGE_ID == target_stage_id
3. Проверить что deal_id ещё не обработан
4. Получить комментарии: crm.timeline.comment.list
5. Разделить комментарии на запрос и счета
6. Маппинг Object/Contract
7. Создать SupplyRequest
8. Для каждого счёта — создать Invoice и запустить LLM-распознавание
"""

import logging
import re
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from django.core.files.base import ContentFile
from django.utils import timezone

from supply.models import BitrixIntegration, SupplyRequest
from supply.services.bitrix_client import BitrixAPIClient, BitrixAPIError
from supply.services.title_parser import parse_deal_title

logger = logging.getLogger(__name__)


class DealProcessorError(Exception):
    """Ошибка при обработке сделки."""
    pass


class DealProcessor:
    """
    Обработчик сделок из Битрикс24.

    Использование:
        processor = DealProcessor(integration)
        processor.process_deal(deal_id=12345)
    """

    REQUEST_KEYWORD = 'запрос'  # Ключевое слово для идентификации запроса

    def __init__(self, integration: BitrixIntegration):
        self.integration = integration
        self.client = BitrixAPIClient(
            webhook_url=integration.webhook_url,
            timeout=30,
        )

    def process_deal(self, deal_id: int) -> Optional[SupplyRequest]:
        """
        Полный цикл обработки сделки.

        Args:
            deal_id: ID сделки в Битрикс24

        Returns:
            Созданный SupplyRequest или None (если пропущен)
        """
        # 1. Проверить что deal_id ещё не обработан
        if SupplyRequest.objects.filter(bitrix_deal_id=deal_id).exists():
            logger.info('Deal %d already processed, skipping', deal_id)
            return None

        # 2. Загрузить данные сделки
        try:
            deal_data = self.client.get_deal(deal_id)
        except BitrixAPIError as exc:
            logger.error('Failed to fetch deal %d: %s', deal_id, exc)
            raise DealProcessorError(f'Failed to fetch deal: {exc}') from exc

        # 3. Проверить стадию
        stage_id = deal_data.get('STAGE_ID', '')
        if stage_id != self.integration.target_stage_id:
            logger.info(
                'Deal %d stage=%s, expected=%s. Skipping.',
                deal_id, stage_id, self.integration.target_stage_id,
            )
            return None

        # 4. Загрузить комментарии
        try:
            comments = self.client.get_deal_comments(deal_id)
        except BitrixAPIError as exc:
            logger.error('Failed to fetch comments for deal %d: %s', deal_id, exc)
            comments = []

        # 5. Разделить комментарии
        request_comments, invoice_comments = self._split_comments(comments)

        # 6. Маппинг Object/Contract
        obj, contract, mapping_errors = self._map_deal_to_erp(deal_data)

        # 7. Собрать текст запроса
        request_text = self._extract_request_text(request_comments)

        # 8. Определить статус
        status = SupplyRequest.Status.RECEIVED
        if mapping_errors:
            status = SupplyRequest.Status.ERROR

        # 9. Создать SupplyRequest
        supply_request = SupplyRequest.objects.create(
            bitrix_integration=self.integration,
            bitrix_deal_id=deal_id,
            bitrix_deal_title=deal_data.get('TITLE', ''),
            object=obj,
            contract=contract,
            request_text=request_text,
            notes=deal_data.get('COMMENTS', ''),
            amount=self._parse_amount(deal_data.get('OPPORTUNITY')),
            status=status,
            mapping_errors=mapping_errors,
            raw_deal_data=deal_data,
            raw_comments_data=comments,
            synced_at=timezone.now(),
        )

        # 10. Скачать файл запроса (первый файл из request_comments)
        self._save_request_file(supply_request, request_comments)

        # 11. Создать Invoice для каждого счёта
        self._create_invoices_from_comments(supply_request, invoice_comments)

        logger.info(
            'Deal %d processed: SupplyRequest #%d, status=%s',
            deal_id, supply_request.id, status,
        )
        return supply_request

    def _split_comments(
        self, comments: List[Dict]
    ) -> Tuple[List[Dict], List[Dict]]:
        """
        Разделить комментарии на запросы и счета.

        Комментарий считается запросом если текст содержит слово "запрос"
        (case-insensitive). Остальные с PDF-файлами — счета.
        """
        request_comments = []
        invoice_comments = []

        for comment in comments:
            text = (comment.get('COMMENT') or '').lower()
            if self.REQUEST_KEYWORD in text:
                request_comments.append(comment)
            elif self._has_pdf_files(comment):
                invoice_comments.append(comment)
            # Комментарии без "запрос" и без PDF — пропускаем

        return request_comments, invoice_comments

    def _has_pdf_files(self, comment: Dict) -> bool:
        """Есть ли PDF-файлы в комментарии."""
        files = comment.get('FILES', [])
        if not isinstance(files, list):
            return False
        for f in files:
            name = (f.get('name') or f.get('NAME') or '').lower()
            if name.endswith('.pdf'):
                return True
        return False

    def _extract_request_text(self, request_comments: List[Dict]) -> str:
        """Собрать текст запроса из всех request-комментариев."""
        texts = []
        for comment in request_comments:
            text = comment.get('COMMENT', '')
            if text:
                texts.append(text.strip())
        return '\n\n'.join(texts)

    def _map_deal_to_erp(
        self, deal_data: Dict
    ) -> Tuple[Optional[object], Optional[object], Dict]:
        """
        Маппинг данных сделки на Object и Contract в ERP.

        Стратегия:
        1. Кастомные поля (UF_CRM_xxx) если настроены
        2. Парсинг заголовка карточки (fallback)
        3. Если не удалось — mapping_errors

        Returns:
            (object_instance, contract_instance, mapping_errors_dict)
        """
        from objects.models import Object
        from contracts.models import Contract

        mapping_errors = {}
        obj = None
        contract = None

        # --- Попытка через кастомные поля ---
        contract_number = None
        object_name = None

        if self.integration.contract_field_mapping:
            contract_number = deal_data.get(self.integration.contract_field_mapping)
        if self.integration.object_field_mapping:
            object_name = deal_data.get(self.integration.object_field_mapping)

        # --- Fallback: парсинг заголовка ---
        if not contract_number or not object_name:
            parsed = parse_deal_title(deal_data.get('TITLE', ''))
            if not contract_number and parsed.contract_number:
                contract_number = parsed.contract_number
            if not object_name and parsed.object_name:
                object_name = parsed.object_name

        # --- Поиск Contract ---
        if contract_number:
            try:
                contract = Contract.objects.get(number=str(contract_number))
                # Если нашли договор, берём объект из него
                if contract.object and not obj:
                    obj = contract.object
            except Contract.DoesNotExist:
                mapping_errors['contract'] = f'Договор "{contract_number}" не найден в ERP'
            except Contract.MultipleObjectsReturned:
                mapping_errors['contract'] = f'Найдено несколько договоров с номером "{contract_number}"'
        else:
            mapping_errors['contract'] = 'Не удалось определить номер договора'

        # --- Поиск Object (если ещё не найден через Contract) ---
        if not obj and object_name:
            try:
                obj = Object.objects.get(name__iexact=object_name.strip())
            except Object.DoesNotExist:
                # Попробовать поиск по содержанию
                candidates = Object.objects.filter(name__icontains=object_name.strip()[:20])
                if candidates.count() == 1:
                    obj = candidates.first()
                else:
                    mapping_errors['object'] = f'Объект "{object_name}" не найден в ERP'
            except Object.MultipleObjectsReturned:
                mapping_errors['object'] = f'Найдено несколько объектов "{object_name}"'
        elif not obj and not object_name:
            if 'object' not in mapping_errors:
                mapping_errors['object'] = 'Не удалось определить название объекта'

        return obj, contract, mapping_errors

    def _save_request_file(
        self, supply_request: SupplyRequest, request_comments: List[Dict]
    ):
        """Скачать и сохранить первый файл из request-комментариев."""
        for comment in request_comments:
            files = comment.get('FILES', [])
            if not isinstance(files, list):
                continue
            for f in files:
                download_url = f.get('urlDownload') or f.get('url')
                if not download_url:
                    continue
                name = f.get('name') or f.get('NAME') or 'request_file'
                try:
                    content = self.client.download_file(download_url)
                    supply_request.request_file.save(
                        name, ContentFile(content), save=True,
                    )
                    logger.info(
                        'Saved request file "%s" for SupplyRequest #%d',
                        name, supply_request.id,
                    )
                    return  # Сохраняем только первый файл
                except BitrixAPIError as exc:
                    logger.error('Failed to download request file: %s', exc)

    def _create_invoices_from_comments(
        self, supply_request: SupplyRequest, invoice_comments: List[Dict]
    ):
        """Создать Invoice для каждого PDF-файла из invoice-комментариев."""
        from payments.models import Invoice

        for comment in invoice_comments:
            files = comment.get('FILES', [])
            if not isinstance(files, list):
                continue

            for f in files:
                name = (f.get('name') or f.get('NAME') or '').lower()
                if not name.endswith('.pdf'):
                    continue

                download_url = f.get('urlDownload') or f.get('url')
                if not download_url:
                    continue

                try:
                    content = self.client.download_file(download_url)
                except BitrixAPIError as exc:
                    logger.error('Failed to download invoice file: %s', exc)
                    continue

                # Создать Invoice
                invoice = Invoice.objects.create(
                    source=Invoice.Source.BITRIX,
                    supply_request=supply_request,
                    status=Invoice.Status.RECOGNITION,
                    object=supply_request.object,
                    contract=supply_request.contract,
                    description=f'Из Битрикс24: {supply_request.bitrix_deal_title}',
                )
                invoice.invoice_file.save(
                    f.get('name') or f.get('NAME') or 'invoice.pdf',
                    ContentFile(content),
                    save=True,
                )

                logger.info(
                    'Created Invoice #%d from deal %d',
                    invoice.id, supply_request.bitrix_deal_id,
                )

                # Запустить LLM-распознавание
                from supply.tasks import recognize_invoice
                recognize_invoice.delay(invoice.id)

    @staticmethod
    def _parse_amount(value) -> Optional[float]:
        """Безопасно парсить сумму из Битрикс."""
        if value is None:
            return None
        try:
            return float(value)
        except (ValueError, TypeError):
            return None

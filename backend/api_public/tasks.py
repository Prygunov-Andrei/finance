"""
Celery-задачи для публичного портала смет.

Все задачи маршрутизируются в очередь 'public_tasks' (CELERY_TASK_ROUTES в settings.py).
"""
import logging
from io import BytesIO

from celery import shared_task
from celery.exceptions import SoftTimeLimitExceeded
from django.core.files.base import ContentFile

from .models import (
    EstimateRequest, EstimateRequestFile, EstimateRequestVersion,
    PublicPortalConfig,
)
from .emails import (
    send_request_accepted, send_estimate_ready, send_estimate_error,
    send_operator_new_request, send_operator_review_ready, send_operator_error,
)

logger = logging.getLogger(__name__)


@shared_task(
    bind=True, max_retries=2, queue='public_tasks',
    soft_time_limit=3600,   # 60 мин — SoftTimeLimitExceeded
    time_limit=3900,        # 65 мин — жёсткий kill
)
def process_public_estimate_request(self, request_id: int):
    """Полный пайплайн обработки публичного запроса.

    Поток:
    files → SpecificationParser → SpecificationItem → Estimate → AutoMatcher → Excel

    Идемпотентность: при retry пропускаются уже обработанные файлы/этапы.
    """
    request = EstimateRequest.objects.get(id=request_id)
    config = PublicPortalConfig.get()

    # Email клиенту: запрос принят
    send_request_accepted(request)
    # Email оператору: новый запрос
    send_operator_new_request(request)

    try:
        # === ЭТАП 1: ПАРСИНГ ===
        request.status = EstimateRequest.Status.PARSING
        request.save(update_fields=['status'])

        _parse_all_files(request)

        # Проверка: есть что обрабатывать?
        has_items = request.spec_items.exists()
        all_error = not request.files.exclude(
            parse_status=EstimateRequestFile.ParseStatus.ERROR,
        ).exists()

        if not has_items or all_error:
            raise ValueError(
                'Не удалось извлечь позиции ни из одного файла. '
                'Проверьте, что загруженные файлы содержат спецификации оборудования.'
            )

        # === ЭТАП 2: СОЗДАНИЕ СМЕТЫ + ПОДБОР ===
        request.status = EstimateRequest.Status.MATCHING
        request.save(update_fields=['status'])

        if not request.estimate_id:
            from estimates.services.specification_transformer import (
                create_estimate_from_spec_items,
            )
            estimate = create_estimate_from_spec_items(request)
        else:
            estimate = request.estimate

        # Авто-подбор цен и работ
        from estimates.services.estimate_auto_matcher import EstimateAutoMatcher
        matcher = EstimateAutoMatcher()
        matcher.auto_fill(estimate)

        # Обновляем статистику
        _update_request_stats(request)

        # === ЭТАП 3: ПРОВЕРКА ИЛИ АВТОМАТИЧЕСКАЯ ОТПРАВКА ===
        if config.auto_approve:
            generate_and_deliver(request)
        else:
            request.status = EstimateRequest.Status.REVIEW
            request.save(update_fields=['status'])
            send_operator_review_ready(request)

    except SoftTimeLimitExceeded:
        request.status = EstimateRequest.Status.ERROR
        request.error_message = (
            f'Превышено время обработки (60 мин). '
            f'Обработано файлов: {request.processed_files}/{request.total_files}. '
            f'Попробуйте загрузить меньше файлов.'
        )
        request.save(update_fields=['status', 'error_message'])
        send_estimate_error(request, request.error_message)
        send_operator_error(request, request.error_message)

    except Exception as exc:
        logger.exception('Error processing request #%d', request_id)
        request.status = EstimateRequest.Status.ERROR
        request.error_message = str(exc)[:1000]
        request.save(update_fields=['status', 'error_message'])
        send_estimate_error(request, str(exc))
        send_operator_error(request, str(exc))
        # Retry для recoverable ошибок
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc, countdown=60 * (self.request.retries + 1))


def _parse_all_files(request: EstimateRequest):
    """Парсинг всех файлов запроса. Идемпотентный — пропускает уже обработанные."""
    from llm_services.services.specification_parser import SpecificationParser
    from estimates.models import SpecificationItem

    parser = SpecificationParser()

    files = request.files.exclude(
        parse_status__in=[
            EstimateRequestFile.ParseStatus.DONE,
            EstimateRequestFile.ParseStatus.PARTIAL,
            EstimateRequestFile.ParseStatus.SKIPPED,
        ],
    )

    for req_file in files:
        try:
            req_file.parse_status = EstimateRequestFile.ParseStatus.PARSING
            req_file.save(update_fields=['parse_status'])

            # Читаем содержимое файла
            file_content = req_file.file.read()
            req_file.file.seek(0)

            if not file_content:
                req_file.parse_status = EstimateRequestFile.ParseStatus.ERROR
                req_file.parse_error = 'Пустой файл'
                req_file.save(update_fields=['parse_status', 'parse_error'])
                continue

            def on_progress(page, total):
                req_file.pages_total = total
                req_file.pages_processed = page
                req_file.save(update_fields=['pages_total', 'pages_processed'])

            result = parser.parse_pdf(
                file_content, filename=req_file.original_filename,
                on_page_progress=on_progress,
            )

            # Сохраняем SpecificationItem
            for item_data in result['items']:
                SpecificationItem.objects.create(
                    request=request,
                    source_file=req_file,
                    name=item_data.get('name', ''),
                    model_name=item_data.get('model_name', ''),
                    brand=item_data.get('brand', ''),
                    unit=item_data.get('unit', 'шт'),
                    quantity=item_data.get('quantity', 1),
                    tech_specs_raw=item_data.get('tech_specs', ''),
                    section_name=item_data.get('section_name', ''),
                    page_number=item_data.get('page_number', 0),
                    sort_order=item_data.get('sort_order', 0),
                )

            # Статус файла
            status_map = {
                'done': EstimateRequestFile.ParseStatus.DONE,
                'partial': EstimateRequestFile.ParseStatus.PARTIAL,
                'error': EstimateRequestFile.ParseStatus.ERROR,
            }
            req_file.parse_status = status_map.get(
                result['status'], EstimateRequestFile.ParseStatus.ERROR,
            )
            req_file.parsed_data = result
            req_file.pages_total = result['pages_total']
            req_file.pages_processed = result['pages_processed']
            if result['errors']:
                req_file.parse_error = '\n'.join(result['errors'])
            req_file.save()

        except Exception as exc:
            logger.exception('Error parsing file %s', req_file.original_filename)
            req_file.parse_status = EstimateRequestFile.ParseStatus.ERROR
            req_file.parse_error = str(exc)[:500]
            req_file.save(update_fields=['parse_status', 'parse_error'])

        # Обновляем прогресс
        request.processed_files = request.files.exclude(
            parse_status=EstimateRequestFile.ParseStatus.PENDING,
        ).count()
        request.save(update_fields=['processed_files'])


def _update_request_stats(request: EstimateRequest):
    """Обновляет статистику запроса по данным Estimate."""
    if not request.estimate_id:
        return

    from estimates.models import EstimateItem

    items = EstimateItem.objects.filter(estimate=request.estimate)
    request.total_spec_items = items.count()
    request.matched_exact = items.filter(
        product__isnull=False, is_analog=False,
    ).count()
    request.matched_analog = items.filter(is_analog=True).count()
    request.unmatched = items.filter(
        product__isnull=True, material_unit_price=0,
    ).count()
    request.save(update_fields=[
        'total_spec_items', 'matched_exact', 'matched_analog', 'unmatched',
    ])


def generate_and_deliver(request: EstimateRequest, generated_by: str = 'auto'):
    """Генерация Excel + отправка клиенту.

    Вызывается автоматически (auto_approve) или после approve оператора.
    Наценка из PublicPricingConfig применяется ЗДЕСЬ, при генерации Excel.
    EstimateItem всегда хранит закупочную цену.
    """
    from estimates.services.estimate_excel_exporter import EstimateExcelExporter

    estimate = request.estimate
    buffer = EstimateExcelExporter(estimate).export_public()

    # Сохраняем Excel-файл
    filename = f'Смета_{estimate.number}.xlsx'
    excel_content = ContentFile(buffer.read(), name=filename)

    # Версионирование
    version_number = request.versions.count() + 1
    EstimateRequestVersion.objects.create(
        request=request,
        version_number=version_number,
        excel_file=excel_content,
        generated_by=generated_by,
    )

    request.result_excel_file = excel_content
    request.status = EstimateRequest.Status.READY
    request.save(update_fields=['result_excel_file', 'status'])

    # Email клиенту — отдельно, с обработкой ошибки
    try:
        send_estimate_ready(request)
        request.status = EstimateRequest.Status.DELIVERED
        request.notification_sent = True
        request.save(update_fields=['status', 'notification_sent'])
    except Exception as exc:
        # Email не отправился, но смета готова — клиент может скачать по ссылке
        logger.error('Email notification failed for request #%d: %s', request.pk, exc)
        send_operator_error(request, f'Не удалось отправить email клиенту: {exc}')

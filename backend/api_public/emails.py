"""
Email-уведомления для публичного портала смет.

Клиенту: запрос принят, смета готова, ошибка.
Оператору: новый запрос, готов к проверке, ошибка, заявка на звонок.
"""
import logging

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)


def _get_operator_emails():
    """Список email операторов из PublicPortalConfig."""
    from .models import PublicPortalConfig
    config = PublicPortalConfig.get()
    return config.operator_email_list


def _status_url(request):
    """URL страницы статуса для клиента."""
    portal_domain = getattr(settings, 'PORTAL_DOMAIN', '') or 'localhost:3002'
    scheme = 'https' if portal_domain != 'localhost:3002' else 'http'
    base_path = '/smeta' if portal_domain != 'localhost:3002' else ''
    return f'{scheme}://{portal_domain}{base_path}/requests/{request.access_token}/'


def _safe_send(subject, message, recipient_list, **kwargs):
    """Отправка email с обработкой ошибок (не роняет пайплайн)."""
    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=recipient_list,
            fail_silently=False,
            **kwargs,
        )
        return True
    except Exception as exc:
        logger.error('Email send failed to %s: %s', recipient_list, exc)
        return False


# =========================================================================
# Уведомления клиенту
# =========================================================================

def send_request_accepted(request):
    """Запрос принят — ссылка на статус."""
    url = _status_url(request)
    _safe_send(
        subject=f'Запрос на смету принят — {request.project_name}',
        message=(
            f'Здравствуйте!\n\n'
            f'Ваш запрос на расчёт сметы "{request.project_name}" принят в обработку.\n'
            f'Файлов загружено: {request.total_files}\n\n'
            f'Отслеживайте статус: {url}\n\n'
            f'Вы получите уведомление на email, когда смета будет готова.\n'
            f'Ссылка действительна 30 дней.'
        ),
        recipient_list=[request.email],
    )


def send_estimate_ready(request):
    """Смета готова — ссылка на скачивание.

    Raises:
        Exception: при ошибке отправки (для обработки в вызывающем коде).
    """
    url = _status_url(request)
    send_mail(
        subject=f'Смета готова — {request.project_name}',
        message=(
            f'Здравствуйте!\n\n'
            f'Смета по проекту "{request.project_name}" готова.\n\n'
            f'Найдено позиций: {request.total_spec_items}\n'
            f'  — Точных совпадений: {request.matched_exact}\n'
            f'  — Аналогов: {request.matched_analog}\n'
            f'  — Требует уточнения: {request.unmatched}\n\n'
            f'Скачать смету: {url}\n\n'
            f'Хотите заказать оборудование? Оставьте заявку на звонок на странице сметы.'
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[request.email],
        fail_silently=False,
    )


def send_estimate_error(request, error_message=''):
    """Ошибка обработки — описание + контакт."""
    _safe_send(
        subject=f'Ошибка обработки запроса — {request.project_name}',
        message=(
            f'Здравствуйте!\n\n'
            f'К сожалению, при обработке вашего запроса "{request.project_name}" '
            f'произошла ошибка.\n\n'
            f'{error_message}\n\n'
            f'Пожалуйста, попробуйте загрузить файлы повторно или свяжитесь с нами.'
        ),
        recipient_list=[request.email],
    )


# =========================================================================
# Уведомления оператору
# =========================================================================

def send_operator_new_request(request):
    """Новый запрос на смету."""
    emails = _get_operator_emails()
    if not emails:
        return
    company = request.company_name or request.email
    _safe_send(
        subject=f'Новый запрос на смету от {company} ({request.total_files} файлов)',
        message=(
            f'Новый запрос на портале смет:\n\n'
            f'Проект: {request.project_name}\n'
            f'Клиент: {company}\n'
            f'Email: {request.email}\n'
            f'Файлов: {request.total_files}\n'
            f'ID: #{request.pk}'
        ),
        recipient_list=emails,
    )


def send_operator_review_ready(request):
    """Запрос обработан, ждёт проверки оператором."""
    emails = _get_operator_emails()
    if not emails:
        return
    _safe_send(
        subject=f'Запрос #{request.pk} готов к проверке',
        message=(
            f'Запрос #{request.pk} "{request.project_name}" обработан и ждёт проверки.\n\n'
            f'Позиций: {request.total_spec_items}\n'
            f'  — Точных: {request.matched_exact}\n'
            f'  — Аналогов: {request.matched_analog}\n'
            f'  — Не найдено: {request.unmatched}\n\n'
            f'Откройте запрос в ERP для проверки и отправки клиенту.'
        ),
        recipient_list=emails,
    )


def send_operator_error(request, error_message=''):
    """Ошибка обработки запроса."""
    emails = _get_operator_emails()
    if not emails:
        return
    _safe_send(
        subject=f'Ошибка обработки запроса #{request.pk}',
        message=(
            f'Ошибка при обработке запроса #{request.pk} "{request.project_name}":\n\n'
            f'{error_message}\n\n'
            f'Клиент: {request.email}'
        ),
        recipient_list=emails,
    )


def send_operator_callback(callback):
    """Заявка на звонок от клиента."""
    emails = _get_operator_emails()
    if not emails:
        return
    req = callback.request
    company = req.company_name or req.email
    _safe_send(
        subject=f'Заявка на звонок по смете #{req.pk} от {company}',
        message=(
            f'Клиент просит перезвонить:\n\n'
            f'Телефон: {callback.phone}\n'
            f'Удобное время: {callback.preferred_time or "не указано"}\n'
            f'Комментарий: {callback.comment or "—"}\n\n'
            f'Проект: {req.project_name}\n'
            f'Компания: {company}\n'
            f'Email: {req.email}'
        ),
        recipient_list=emails,
    )

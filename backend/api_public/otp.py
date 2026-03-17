"""
OTP-верификация email через Redis.

Код хранится в Redis (TTL 10 мин). Без модели в БД.
Макс 3 попытки ввода, макс 5 отправок/день на email.
"""
import hashlib
import hmac
import logging
import random
import string

from django.conf import settings
from django.core.mail import send_mail

import redis

logger = logging.getLogger(__name__)

OTP_LENGTH = 6
OTP_TTL = 600           # 10 мин
OTP_MAX_ATTEMPTS = 3
OTP_MAX_SENDS_PER_DAY = 5
OTP_SEND_COUNTER_TTL = 86400  # 24 часа

# Verification token (подтверждённый email) — TTL 1 час
VERIFICATION_TOKEN_TTL = 3600


def _get_redis():
    """Получить Redis-клиент."""
    return redis.from_url(settings.CELERY_BROKER_URL, decode_responses=True)


def _otp_key(email: str) -> str:
    return f'email_otp:{email.lower().strip()}'


def _attempts_key(email: str) -> str:
    return f'email_otp_attempts:{email.lower().strip()}'


def _send_counter_key(email: str) -> str:
    return f'email_otp_sends:{email.lower().strip()}'


def _verification_key(token: str) -> str:
    return f'email_verified:{token}'


def generate_otp() -> str:
    """Генерирует 6-цифровой OTP-код."""
    return ''.join(random.choices(string.digits, k=OTP_LENGTH))


def generate_verification_token(email: str) -> str:
    """Генерирует verification_token на основе email + случайной строки."""
    secret = getattr(settings, 'SECRET_KEY', 'fallback')
    random_part = ''.join(random.choices(string.ascii_letters + string.digits, k=32))
    raw = f'{email}:{random_part}:{secret}'
    return hashlib.sha256(raw.encode()).hexdigest()


def send_otp(email: str) -> dict:
    """Отправляет OTP-код на email.

    Returns:
        {'ok': True} или {'error': str}
    """
    email = email.lower().strip()
    r = _get_redis()

    # Проверка лимита отправок
    send_count = r.get(_send_counter_key(email))
    if send_count and int(send_count) >= OTP_MAX_SENDS_PER_DAY:
        return {'error': 'Превышен лимит отправок кода. Попробуйте завтра.'}

    code = generate_otp()

    # Сохраняем в Redis
    r.setex(_otp_key(email), OTP_TTL, code)
    r.delete(_attempts_key(email))  # сброс попыток
    r.incr(_send_counter_key(email))
    r.expire(_send_counter_key(email), OTP_SEND_COUNTER_TTL)

    # Отправляем email
    try:
        send_mail(
            subject='Код подтверждения — Портал смет',
            message=f'Ваш код подтверждения: {code}\n\nКод действителен 10 минут.',
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
            fail_silently=False,
        )
    except Exception as exc:
        logger.error('OTP email send failed for %s: %s', email, exc)
        return {'error': 'Не удалось отправить email. Попробуйте позже.'}

    logger.info('OTP sent to %s', email)
    return {'ok': True}


def verify_otp(email: str, code: str) -> dict:
    """Проверяет OTP-код.

    Returns:
        {'ok': True, 'verification_token': str} или {'error': str}
    """
    email = email.lower().strip()
    r = _get_redis()

    # Проверка попыток
    attempts = r.get(_attempts_key(email))
    if attempts and int(attempts) >= OTP_MAX_ATTEMPTS:
        r.delete(_otp_key(email))
        return {'error': 'Превышено количество попыток. Запросите новый код.'}

    stored_code = r.get(_otp_key(email))
    if not stored_code:
        return {'error': 'Код истёк или не был отправлен. Запросите новый код.'}

    if stored_code != code.strip():
        r.incr(_attempts_key(email))
        r.expire(_attempts_key(email), OTP_TTL)
        remaining = OTP_MAX_ATTEMPTS - int(r.get(_attempts_key(email)) or 0)
        return {'error': f'Неверный код. Осталось попыток: {max(remaining, 0)}'}

    # Код верный — удаляем из Redis, создаём verification_token
    r.delete(_otp_key(email))
    r.delete(_attempts_key(email))

    token = generate_verification_token(email)
    r.setex(_verification_key(token), VERIFICATION_TOKEN_TTL, email)

    logger.info('OTP verified for %s', email)
    return {'ok': True, 'verification_token': token}


def check_verification_token(token: str) -> str:
    """Проверяет verification_token.

    Returns:
        email если токен валиден, иначе пустая строка.
    """
    if not token:
        return ''
    r = _get_redis()
    email = r.get(_verification_key(token))
    return email or ''

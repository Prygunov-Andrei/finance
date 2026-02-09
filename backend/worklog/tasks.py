import io
import logging
from celery import shared_task
from django.conf import settings

logger = logging.getLogger(__name__)


def _get_s3_client():
    """Создаёт и возвращает boto3 S3 client для MinIO."""
    import boto3
    return boto3.client(
        's3',
        endpoint_url=settings.WORKLOG_S3_ENDPOINT_URL,
        aws_access_key_id=settings.WORKLOG_S3_ACCESS_KEY,
        aws_secret_access_key=settings.WORKLOG_S3_SECRET_KEY,
        region_name=settings.WORKLOG_S3_REGION,
    )


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def download_media_from_telegram(self, media_id: str):
    """
    Скачивает файл из Telegram по file_id и сохраняет во временное хранилище.
    Затем запускает upload_media_to_s3.
    """
    import httpx
    from worklog.models import Media

    try:
        media = Media.objects.get(id=media_id)
    except Media.DoesNotExist:
        logger.error(f"Media {media_id} not found")
        return

    if not media.file_id:
        logger.warning(f"Media {media_id} has no file_id (type: {media.media_type})")
        return

    bot_token = settings.TELEGRAM_BOT_TOKEN
    if not bot_token:
        logger.error("TELEGRAM_BOT_TOKEN not configured")
        return

    try:
        # Получаем file_path из Telegram
        with httpx.Client(timeout=60) as client:
            file_info_resp = client.get(
                f"https://api.telegram.org/bot{bot_token}/getFile",
                params={"file_id": media.file_id},
            )
            file_info_resp.raise_for_status()
            file_info = file_info_resp.json()

            if not file_info.get('ok'):
                raise ValueError(f"Telegram API error: {file_info}")

            file_path = file_info['result']['file_path']
            file_size = file_info['result'].get('file_size', 0)

            # Скачиваем файл
            download_url = f"https://api.telegram.org/file/bot{bot_token}/{file_path}"
            download_resp = client.get(download_url)
            download_resp.raise_for_status()
            file_content = download_resp.content

        media.file_size = file_size or len(file_content)
        media.save(update_fields=['file_size'])

        # Запускаем upload
        upload_media_to_s3.delay(media_id, file_path)

        logger.info(f"Downloaded media {media_id}: {file_path} ({len(file_content)} bytes)")

    except Exception as exc:
        logger.error(f"Failed to download media {media_id}: {exc}")
        self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=30)
def upload_media_to_s3(self, media_id: str, original_file_path: str):
    """
    Скачивает файл из Telegram и загружает в MinIO/S3.
    Обновляет file_url и статус.
    """
    import httpx
    from worklog.models import Media

    try:
        media = Media.objects.get(id=media_id)
    except Media.DoesNotExist:
        logger.error(f"Media {media_id} not found")
        return

    bot_token = settings.TELEGRAM_BOT_TOKEN
    if not bot_token:
        logger.error("TELEGRAM_BOT_TOKEN not configured")
        return

    try:
        # Скачиваем файл
        download_url = f"https://api.telegram.org/file/bot{bot_token}/{original_file_path}"
        with httpx.Client(timeout=120) as client:
            resp = client.get(download_url)
            resp.raise_for_status()
            file_content = resp.content

        # Определяем S3-ключ
        ext = original_file_path.rsplit('.', 1)[-1] if '.' in original_file_path else 'bin'
        s3_key = f"{media.media_type}/{media.created_at.strftime('%Y/%m/%d')}/{media.id}.{ext}"

        # Загружаем в S3
        s3_client = _get_s3_client()
        bucket = settings.WORKLOG_S3_BUCKET_NAME

        s3_client.put_object(
            Bucket=bucket,
            Key=s3_key,
            Body=file_content,
            ContentType=_guess_content_type(ext),
        )

        # Формируем URL
        file_url = f"{settings.WORKLOG_S3_ENDPOINT_URL}/{bucket}/{s3_key}"

        media.file_url = file_url
        media.status = Media.Status.DOWNLOADED
        media.save(update_fields=['file_url', 'status'])

        logger.info(f"Uploaded media {media_id} to S3: {s3_key}")

        # Запускаем параллельно phash и thumbnail
        if media.media_type in ('photo', 'video'):
            compute_phash.delay(media_id)
            create_thumbnail.delay(media_id)

        # Транскрибация голосовых и аудио
        if media.media_type in ('voice', 'audio'):
            transcribe_voice.delay(media_id)

    except Exception as exc:
        logger.error(f"Failed to upload media {media_id}: {exc}")
        self.retry(exc=exc)


@shared_task(bind=True, max_retries=2, default_retry_delay=15)
def compute_phash(self, media_id: str):
    """Вычисляет perceptual hash изображения для дедупликации."""
    from worklog.models import Media

    try:
        media = Media.objects.get(id=media_id)
    except Media.DoesNotExist:
        return

    if not media.file_url:
        return

    try:
        import httpx
        import imagehash
        from PIL import Image

        # Скачиваем файл из S3
        with httpx.Client(timeout=30) as client:
            resp = client.get(media.file_url)
            resp.raise_for_status()

        img = Image.open(io.BytesIO(resp.content))
        phash_value = str(imagehash.phash(img))

        media.phash = phash_value
        media.save(update_fields=['phash'])

        logger.info(f"Computed phash for media {media_id}: {phash_value}")

    except Exception as exc:
        logger.warning(f"Failed to compute phash for media {media_id}: {exc}")
        self.retry(exc=exc)


@shared_task(bind=True, max_retries=2, default_retry_delay=15)
def create_thumbnail(self, media_id: str):
    """Создаёт превью (thumbnail) для фото/видео и загружает в S3."""
    from worklog.models import Media

    try:
        media = Media.objects.get(id=media_id)
    except Media.DoesNotExist:
        return

    if not media.file_url:
        return

    try:
        import httpx
        from PIL import Image

        # Скачиваем оригинал
        with httpx.Client(timeout=30) as client:
            resp = client.get(media.file_url)
            resp.raise_for_status()

        img = Image.open(io.BytesIO(resp.content))
        img.thumbnail((320, 320))

        # Сохраняем thumbnail в буфер
        thumb_buffer = io.BytesIO()
        img.save(thumb_buffer, format='JPEG', quality=75)
        thumb_buffer.seek(0)

        # Загружаем в S3
        s3_key = f"thumbnails/{media.created_at.strftime('%Y/%m/%d')}/{media.id}_thumb.jpg"
        s3_client = _get_s3_client()
        bucket = settings.WORKLOG_S3_BUCKET_NAME

        s3_client.put_object(
            Bucket=bucket,
            Key=s3_key,
            Body=thumb_buffer.getvalue(),
            ContentType='image/jpeg',
        )

        thumbnail_url = f"{settings.WORKLOG_S3_ENDPOINT_URL}/{bucket}/{s3_key}"
        media.thumbnail_url = thumbnail_url
        media.save(update_fields=['thumbnail_url'])

        logger.info(f"Created thumbnail for media {media_id}: {s3_key}")

    except Exception as exc:
        logger.warning(f"Failed to create thumbnail for media {media_id}: {exc}")
        self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=10)
def create_team_forum_topic(self, team_id: str):
    """
    Автоматически создаёт топик (тему) в Telegram-супергруппе при создании звена.

    1. Находит Team и связанную Supergroup (object + contractor).
    2. Через Telegram Bot API (синхронно, httpx) создаёт forum topic.
    3. Сохраняет message_thread_id в Team.topic_id.
    """
    import httpx
    from worklog.models import Team, Supergroup

    try:
        team = Team.objects.select_related('object', 'contractor', 'brigadier').get(id=team_id)
    except Team.DoesNotExist:
        logger.error(f"Team {team_id} not found for topic creation")
        return

    if team.topic_id:
        logger.info(f"Team {team_id} already has topic_id={team.topic_id}")
        return

    try:
        supergroup = Supergroup.objects.get(
            object=team.object,
            contractor=team.contractor,
        )
    except Supergroup.DoesNotExist:
        logger.warning(f"No supergroup for team {team_id} (object={team.object_id}, contractor={team.contractor_id})")
        return

    bot_token = settings.TELEGRAM_BOT_TOKEN
    if not bot_token:
        logger.error("TELEGRAM_BOT_TOKEN not configured — cannot create topic")
        return

    topic_name = team.topic_name or f"Звено {team.brigadier.name if team.brigadier else str(team.id)[:8]}"

    try:
        with httpx.Client(timeout=30) as client:
            resp = client.post(
                f"https://api.telegram.org/bot{bot_token}/createForumTopic",
                json={
                    "chat_id": supergroup.telegram_group_id,
                    "name": topic_name[:128],  # Telegram limit
                },
            )
            resp.raise_for_status()
            data = resp.json()

            if not data.get('ok'):
                raise ValueError(f"Telegram API error: {data}")

            thread_id = data['result']['message_thread_id']

        team.topic_id = thread_id
        team.topic_name = topic_name
        team.save(update_fields=['topic_id', 'topic_name'])

        logger.info(f"Created forum topic for team {team_id}: thread_id={thread_id}")

        # Отправляем приветственное сообщение в топик
        _send_topic_message(
            bot_token,
            supergroup.telegram_group_id,
            thread_id,
            f"🔧 <b>{topic_name}</b>\n\n"
            f"Звено создано. Отправляйте сюда фото и видео работ.\n"
            f"Все файлы автоматически фиксируются в системе.",
        )

    except Exception as exc:
        logger.error(f"Failed to create forum topic for team {team_id}: {exc}")
        self.retry(exc=exc)


@shared_task(bind=True, max_retries=2, default_retry_delay=10)
def notify_shift_closed(self, shift_id: str):
    """
    Отправляет уведомление о закрытии смены в топики всех звеньев этой смены.
    """
    import httpx
    from worklog.models import Shift, Team, Supergroup

    try:
        shift = Shift.objects.select_related('object', 'contractor').get(id=shift_id)
    except Shift.DoesNotExist:
        logger.error(f"Shift {shift_id} not found for closure notification")
        return

    bot_token = settings.TELEGRAM_BOT_TOKEN
    if not bot_token:
        logger.error("TELEGRAM_BOT_TOKEN not configured")
        return

    try:
        supergroup = Supergroup.objects.get(
            object=shift.object,
            contractor=shift.contractor,
        )
    except Supergroup.DoesNotExist:
        logger.warning(f"No supergroup for shift {shift_id}")
        return

    teams = Team.objects.filter(shift=shift, topic_id__isnull=False)
    chat_id = supergroup.telegram_group_id

    for team in teams:
        try:
            text = (
                f"🔒 <b>Смена закрыта</b>\n\n"
                f"Объект: {shift.object.name}\n"
                f"Дата: {shift.date.strftime('%d.%m.%Y')}\n"
                f"Тип: {shift.get_shift_type_display()}\n\n"
                f"Приём медиа завершён. Спасибо за работу!"
            )
            _send_topic_message(bot_token, chat_id, team.topic_id, text)
        except Exception as e:
            logger.error(f"Failed to notify team {team.id} about shift closure: {e}")


@shared_task
def send_report_warnings():
    """
    Отправляет предупреждения в топики звеньев за 30 минут до закрытия смены.

    Находит активные смены, где end_time наступит через 25–35 минут,
    и отправляет предупреждение в каждый топик.
    Запускается через Celery Beat каждые 10 минут.
    """
    import httpx
    from datetime import datetime, timedelta
    from django.utils import timezone
    from worklog.models import Shift, Team, Supergroup

    bot_token = settings.TELEGRAM_BOT_TOKEN
    if not bot_token:
        return

    now = timezone.now()
    today = now.date()
    current_time = now.time()

    # Ищем смены, которые заканчиваются через ~30 минут
    from datetime import time as dt_time
    warning_start = (datetime.combine(today, current_time) + timedelta(minutes=25)).time()
    warning_end = (datetime.combine(today, current_time) + timedelta(minutes=35)).time()

    shifts = Shift.objects.filter(
        status=Shift.Status.ACTIVE,
        extended_until__isnull=True,
        date=today,
        end_time__gte=warning_start,
        end_time__lte=warning_end,
    ).select_related('object', 'contractor')

    total_warnings = 0
    for shift in shifts:
        try:
            supergroup = Supergroup.objects.get(
                object=shift.object,
                contractor=shift.contractor,
            )
        except Supergroup.DoesNotExist:
            continue

        teams = Team.objects.filter(shift=shift, status='active', topic_id__isnull=False)
        for team in teams:
            try:
                text = (
                    f"⚠️ <b>Смена скоро закроется!</b>\n\n"
                    f"До закрытия: ~30 минут\n"
                    f"Окончание: {shift.end_time.strftime('%H:%M')}\n\n"
                    f"Убедитесь, что все фото и видео отправлены."
                )
                _send_topic_message(bot_token, supergroup.telegram_group_id, team.topic_id, text)
                total_warnings += 1
            except Exception as e:
                logger.error(f"Failed to send report warning to team {team.id}: {e}")

    if total_warnings > 0:
        logger.info(f"Sent {total_warnings} report warnings")

    return total_warnings


def _send_topic_message(bot_token: str, chat_id: int, thread_id: int, text: str):
    """Синхронная отправка сообщения в топик через Telegram Bot API (для Celery tasks)."""
    import httpx

    with httpx.Client(timeout=15) as client:
        resp = client.post(
            f"https://api.telegram.org/bot{bot_token}/sendMessage",
            json={
                "chat_id": chat_id,
                "message_thread_id": thread_id,
                "text": text,
                "parse_mode": "HTML",
            },
        )
        resp.raise_for_status()
        data = resp.json()
        if not data.get('ok'):
            raise ValueError(f"Telegram API error: {data}")
        return data['result']['message_id']


@shared_task
def auto_activate_scheduled_shifts():
    """
    Автоактивация запланированных смен, у которых наступило start_time.

    Активирует все смены, где:
    - status = 'scheduled'
    - date < сегодня (пропущенные смены) ИЛИ (date == сегодня И start_time <= текущее время)

    Запускается периодически через Celery Beat (каждые 5 минут).
    """
    from django.utils import timezone
    from worklog.models import Shift

    now = timezone.now()
    today = now.date()
    current_time = now.time()

    # Смены за прошлые дни — активируем (были пропущены)
    past_scheduled = Shift.objects.filter(
        status=Shift.Status.SCHEDULED,
        date__lt=today,
    )

    # Смены за сегодня, у которых start_time наступило
    today_ready = Shift.objects.filter(
        status=Shift.Status.SCHEDULED,
        date=today,
        start_time__lte=current_time,
    )

    total_activated = 0
    for qs in [past_scheduled, today_ready]:
        count = qs.update(status=Shift.Status.ACTIVE)
        total_activated += count

    if total_activated > 0:
        logger.info(f"Auto-activated {total_activated} scheduled shifts")

    return total_activated


@shared_task
def auto_close_expired_shifts():
    """
    Автозакрытие смен, у которых end_time прошёл.

    Закрывает все активные смены, где:
    - status = 'active'
    - date + end_time < текущее время (или extended_until < текущее время)

    Запускается периодически через Celery Beat (каждые 15 минут).
    """
    from datetime import datetime, timedelta
    from django.utils import timezone
    from worklog.models import Shift

    now = timezone.now()
    today = now.date()
    current_time = now.time()

    # Смены без extended_until — закрываем по end_time
    expired_normal = Shift.objects.filter(
        status=Shift.Status.ACTIVE,
        extended_until__isnull=True,
        date__lt=today,
    )

    # Смены за сегодня, у которых end_time прошло
    expired_today = Shift.objects.filter(
        status=Shift.Status.ACTIVE,
        extended_until__isnull=True,
        date=today,
        end_time__lte=current_time,
    )

    # Смены с extended_until, у которых время истекло
    expired_extended = Shift.objects.filter(
        status=Shift.Status.ACTIVE,
        extended_until__isnull=False,
        extended_until__lte=now,
    )

    # Собираем ID смен до закрытия (для уведомлений)
    shift_ids_to_close = set()
    for qs in [expired_normal, expired_today, expired_extended]:
        shift_ids_to_close.update(qs.values_list('id', flat=True))

    total_closed = 0
    for qs in [expired_normal, expired_today, expired_extended]:
        count = qs.update(status=Shift.Status.CLOSED)
        total_closed += count

    if total_closed > 0:
        logger.info(f"Auto-closed {total_closed} expired shifts")
        # Отправляем уведомления для каждой закрытой смены
        for shift_id in shift_ids_to_close:
            notify_shift_closed.delay(str(shift_id))

    return total_closed


@shared_task(bind=True, max_retries=2, default_retry_delay=30)
def transcribe_voice(self, media_id: str):
    """
    Транскрибирует голосовое/аудио сообщение через ElevenLabs Scribe v2.

    1. Скачивает файл из S3 (file_url).
    2. Отправляет на ElevenLabs Speech-to-Text API (модель scribe_v2).
    3. Сохраняет транскрипцию в Media.text_content.

    Поддерживаемые языки (ISO 639-3):
      ru → rus (отличная точность, WER ≤5%)
      uz → uzb (хорошая точность, WER 10-20%)
      tg → tgk (хорошая точность, WER 10-20%)
      ky → kir (хорошая точность, WER 10-20%)
    """
    import httpx
    from io import BytesIO
    from worklog.models import Media

    try:
        media = Media.objects.select_related('author').get(id=media_id)
    except Media.DoesNotExist:
        logger.error(f"Media {media_id} not found for transcription")
        return

    if media.media_type not in ('voice', 'audio'):
        logger.warning(f"Media {media_id} is {media.media_type}, skipping transcription")
        return

    if not media.file_url:
        logger.warning(f"Media {media_id} has no file_url yet")
        return

    if media.text_content:
        logger.info(f"Media {media_id} already has text_content, skipping")
        return

    elevenlabs_api_key = getattr(settings, 'ELEVENLABS_API_KEY', '')
    if not elevenlabs_api_key:
        logger.error("ELEVENLABS_API_KEY not configured — cannot transcribe")
        return

    try:
        # Скачиваем файл из S3
        with httpx.Client(timeout=60) as http_client:
            resp = http_client.get(media.file_url)
            resp.raise_for_status()
            audio_content = resp.content

        # Маппинг языков Worker.language → ElevenLabs ISO 639-3
        lang_map = {
            'ru': 'rus',
            'uz': 'uzb',
            'tg': 'tgk',
            'ky': 'kir',
        }
        language_code = lang_map.get(media.author.language, 'rus')

        # ElevenLabs Scribe v2 — транскрибация
        from elevenlabs.client import ElevenLabs

        client = ElevenLabs(api_key=elevenlabs_api_key)
        audio_data = BytesIO(audio_content)

        transcription = client.speech_to_text.convert(
            file=audio_data,
            model_id="scribe_v2",
            language_code=language_code,
            tag_audio_events=False,
            diarize=False,
        )

        text = transcription.text.strip() if transcription.text else ""

        if text:
            detected_lang = getattr(transcription, 'language_code', language_code)
            media.text_content = f"[Транскрипция ({detected_lang})] {text}"
            media.save(update_fields=['text_content'])
            logger.info(f"Transcribed media {media_id} via ElevenLabs Scribe v2: {len(text)} chars, lang={detected_lang}")
        else:
            logger.warning(f"Empty transcription for media {media_id}")

    except Exception as exc:
        logger.error(f"Failed to transcribe media {media_id}: {exc}")
        self.retry(exc=exc)


def _guess_content_type(ext: str) -> str:
    """Определяет Content-Type по расширению файла."""
    mapping = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'mp4': 'video/mp4',
        'avi': 'video/avi',
        'mov': 'video/quicktime',
        'ogg': 'audio/ogg',
        'oga': 'audio/ogg',
        'mp3': 'audio/mpeg',
        'pdf': 'application/pdf',
    }
    return mapping.get(ext.lower(), 'application/octet-stream')

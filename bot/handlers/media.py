"""Обработка медиа-сообщений из супергрупп (топиков)."""

import uuid
import logging
from aiogram import Router, types, F
from aiogram.enums import ReactionTypeType
from services.db import (
    find_worker_by_telegram_id,
    find_team_by_topic,
    is_worker_in_team,
    save_media,
)
from services.celery_client import schedule_media_download

logger = logging.getLogger(__name__)
router = Router()


async def _process_media(message: types.Message, media_type: str, file_id: str,
                         file_unique_id: str, file_size: int = 0, duration: int = 0):
    """Общая логика обработки любого медиа из топика."""
    # Только сообщения из супергрупп с топиками
    if not message.message_thread_id:
        return
    if not message.chat or message.chat.type != 'supergroup':
        return

    telegram_id = message.from_user.id
    chat_id = message.chat.id
    topic_id = message.message_thread_id

    # Проверяем: есть ли такой worker?
    worker = await find_worker_by_telegram_id(telegram_id)
    if not worker:
        return  # Не зарегистрирован — игнорируем

    # Проверяем: это пересылка?
    if message.forward_date or message.forward_from:
        try:
            await message.delete()
        except Exception:
            pass
        return

    # Ищем звено по chat_id + topic_id
    team = await find_team_by_topic(chat_id, topic_id)
    if not team:
        return  # Топик не привязан к звену

    # Проверяем: worker в этом звене?
    worker_id = str(worker['id'])
    team_id = str(team['id'])

    if not await is_worker_in_team(worker_id, team_id):
        # Автоматическая маршрутизация: TODO в будущем
        # Пока просто игнорируем
        logger.warning(f"Worker {worker_id} not in team {team_id}, ignoring media")
        return

    # Сохраняем метаданные в БД
    media_id = str(uuid.uuid4())
    text_content = message.caption or message.text or ""

    await save_media(
        media_id=media_id,
        team_id=team_id,
        author_id=worker_id,
        message_id=message.message_id,
        media_type=media_type,
        file_id=file_id,
        file_unique_id=file_unique_id,
        text_content=text_content,
        file_size=file_size,
        duration=duration,
    )

    # Ставим реакцию ✅
    try:
        await message.react([types.ReactionTypeEmoji(emoji="✅")])
    except Exception as e:
        # Если реакции отключены — отвечаем кратко
        logger.debug(f"Cannot set reaction: {e}")
        try:
            await message.reply("Принято ✅")
        except Exception:
            pass

    # Ставим задачу на скачивание (если есть file_id)
    if file_id:
        schedule_media_download(media_id)

    logger.info(f"Saved media {media_id} ({media_type}) from worker {worker_id} in team {team_id}")


# =============================================================================
# Обработчики по типу медиа
# =============================================================================

@router.message(F.photo, F.chat.type == 'supergroup')
async def handle_photo(message: types.Message):
    """Обработка фото."""
    photo = message.photo[-1]  # Берём наибольшее разрешение
    await _process_media(
        message=message,
        media_type='photo',
        file_id=photo.file_id,
        file_unique_id=photo.file_unique_id,
        file_size=photo.file_size or 0,
    )


@router.message(F.video, F.chat.type == 'supergroup')
async def handle_video(message: types.Message):
    """Обработка видео."""
    video = message.video
    await _process_media(
        message=message,
        media_type='video',
        file_id=video.file_id,
        file_unique_id=video.file_unique_id,
        file_size=video.file_size or 0,
        duration=video.duration or 0,
    )


@router.message(F.voice, F.chat.type == 'supergroup')
async def handle_voice(message: types.Message):
    """Обработка голосового сообщения."""
    voice = message.voice
    await _process_media(
        message=message,
        media_type='voice',
        file_id=voice.file_id,
        file_unique_id=voice.file_unique_id,
        file_size=voice.file_size or 0,
        duration=voice.duration or 0,
    )


@router.message(F.audio, F.chat.type == 'supergroup')
async def handle_audio(message: types.Message):
    """Обработка аудиофайла."""
    audio = message.audio
    await _process_media(
        message=message,
        media_type='audio',
        file_id=audio.file_id,
        file_unique_id=audio.file_unique_id,
        file_size=audio.file_size or 0,
        duration=audio.duration or 0,
    )


@router.message(F.document, F.chat.type == 'supergroup')
async def handle_document(message: types.Message):
    """Обработка документа."""
    document = message.document
    await _process_media(
        message=message,
        media_type='document',
        file_id=document.file_id,
        file_unique_id=document.file_unique_id,
        file_size=document.file_size or 0,
    )


@router.message(F.text, F.chat.type == 'supergroup')
async def handle_text(message: types.Message):
    """Обработка текстового сообщения (без медиа)."""
    # Игнорируем команды
    if message.text and message.text.startswith('/'):
        return

    await _process_media(
        message=message,
        media_type='text',
        file_id='',
        file_unique_id='',
        text_content=message.text or '',
    )

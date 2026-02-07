"""Общие фикстуры для тестов Telegram бота."""
import sys
import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Добавляем корень бота в sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def make_mock_user(user_id=12345, first_name="Test", last_name="User", username="testuser"):
    """Мок Telegram User."""
    user = MagicMock()
    user.id = user_id
    user.first_name = first_name
    user.last_name = last_name
    user.username = username
    return user


def make_mock_chat(chat_id=-1001234567890, chat_type="supergroup"):
    """Мок Telegram Chat."""
    chat = MagicMock()
    chat.id = chat_id
    chat.type = chat_type
    return chat


def make_mock_message(
    user_id=12345,
    chat_id=-1001234567890,
    chat_type="supergroup",
    message_thread_id=42,
    message_id=100,
    text=None,
    forward_date=None,
    forward_from=None,
    caption=None,
):
    """Мок Telegram Message."""
    message = AsyncMock()
    message.from_user = make_mock_user(user_id=user_id)
    message.chat = make_mock_chat(chat_id=chat_id, chat_type=chat_type)
    message.message_thread_id = message_thread_id
    message.message_id = message_id
    message.text = text
    message.caption = caption
    message.forward_date = forward_date
    message.forward_from = forward_from
    message.answer = AsyncMock()
    message.reply = AsyncMock()
    message.react = AsyncMock()
    message.delete = AsyncMock()
    return message


def make_mock_photo(file_id="AgACPhoto123", file_unique_id="unique_photo", file_size=50000):
    """Мок PhotoSize."""
    photo = MagicMock()
    photo.file_id = file_id
    photo.file_unique_id = file_unique_id
    photo.file_size = file_size
    return photo


def make_mock_video(file_id="BADCVideo456", file_unique_id="unique_video",
                    file_size=1000000, duration=30):
    """Мок Video."""
    video = MagicMock()
    video.file_id = file_id
    video.file_unique_id = file_unique_id
    video.file_size = file_size
    video.duration = duration
    return video


def make_mock_voice(file_id="AwVoice789", file_unique_id="unique_voice",
                    file_size=10000, duration=5):
    """Мок Voice."""
    voice = MagicMock()
    voice.file_id = file_id
    voice.file_unique_id = file_unique_id
    voice.file_size = file_size
    voice.duration = duration
    return voice


def make_mock_callback(user_id=12345, data="answer:uuid:0", message_id=200):
    """Мок CallbackQuery."""
    callback = AsyncMock()
    callback.from_user = make_mock_user(user_id=user_id)
    callback.data = data
    callback.answer = AsyncMock()
    callback.message = MagicMock()
    callback.message.message_id = message_id
    callback.message.edit_text = AsyncMock()
    return callback


WORKER_DICT = {
    'id': 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    'name': 'Иванов Иван',
    'role': 'worker',
    'language': 'ru',
    'contractor_id': 'cccccccc-dddd-eeee-ffff-111111111111',
    'bot_started': False,
}

TEAM_DICT = {
    'id': '11111111-2222-3333-4444-555555555555',
    'topic_name': 'Звено Альфа',
    'status': 'active',
    'shift_id': '66666666-7777-8888-9999-000000000000',
    'telegram_group_id': -1001234567890,
}

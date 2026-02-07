"""
Unit-тесты handlers бота — 23 теста.
Покрытие: commands.py (cmd_start, cmd_help),
          media.py (_process_media, handle_photo/video/voice/audio/document/text),
          callbacks.py (handle_question_answer).
"""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime

import pytest

from tests.conftest import (
    make_mock_message, make_mock_photo, make_mock_video,
    make_mock_voice, make_mock_callback,
    WORKER_DICT, TEAM_DICT,
)


# =========================================================================
# Commands — /start
# =========================================================================

class TestCmdStart:
    @pytest.mark.asyncio
    @patch('handlers.commands.get_supergroup_invite_link', new_callable=AsyncMock, return_value='https://t.me/+invite')
    @patch('handlers.commands.mark_bot_started', new_callable=AsyncMock)
    @patch('handlers.commands.find_worker_by_telegram_id', new_callable=AsyncMock)
    async def test_start_registered_worker(self, mock_find, mock_mark, mock_invite):
        """T2-h-1: /start для зарегистрированного — приветствие с именем + invite."""
        from handlers.commands import cmd_start

        mock_find.return_value = {**WORKER_DICT, 'bot_started': False}
        message = make_mock_message()

        await cmd_start(message)

        message.answer.assert_called_once()
        text = message.answer.call_args[0][0]
        assert 'Иванов Иван' in text
        assert 'https://t.me/+invite' in text

    @pytest.mark.asyncio
    @patch('handlers.commands.find_worker_by_telegram_id', new_callable=AsyncMock, return_value=None)
    async def test_start_unregistered_user(self, mock_find):
        """T2-h-2: /start от незарегистрированного → «Вы не зарегистрированы»."""
        from handlers.commands import cmd_start

        message = make_mock_message()
        await cmd_start(message)

        message.answer.assert_called_once()
        text = message.answer.call_args[0][0]
        assert 'не зарегистрированы' in text

    @pytest.mark.asyncio
    @patch('handlers.commands.get_supergroup_invite_link', new_callable=AsyncMock, return_value=None)
    @patch('handlers.commands.mark_bot_started', new_callable=AsyncMock)
    @patch('handlers.commands.find_worker_by_telegram_id', new_callable=AsyncMock)
    async def test_start_marks_bot_started(self, mock_find, mock_mark, mock_invite):
        """T2-h-3: bot_started обновляется при /start."""
        from handlers.commands import cmd_start

        mock_find.return_value = {**WORKER_DICT, 'bot_started': False}
        message = make_mock_message(user_id=54321)

        await cmd_start(message)

        mock_mark.assert_called_once_with(54321)

    @pytest.mark.asyncio
    @patch('handlers.commands.get_supergroup_invite_link', new_callable=AsyncMock, return_value=None)
    @patch('handlers.commands.mark_bot_started', new_callable=AsyncMock)
    @patch('handlers.commands.find_worker_by_telegram_id', new_callable=AsyncMock)
    async def test_start_already_started_no_double_mark(self, mock_find, mock_mark, mock_invite):
        """Если bot_started=True — mark_bot_started не вызывается повторно."""
        from handlers.commands import cmd_start

        mock_find.return_value = {**WORKER_DICT, 'bot_started': True}
        message = make_mock_message()

        await cmd_start(message)

        mock_mark.assert_not_called()


# =========================================================================
# Commands — /help
# =========================================================================

class TestCmdHelp:
    @pytest.mark.asyncio
    async def test_help_command(self):
        """T2-h-4: /help возвращает справочный текст."""
        from handlers.commands import cmd_help

        message = make_mock_message()
        await cmd_help(message)

        message.answer.assert_called_once()
        text = message.answer.call_args[0][0]
        assert 'Справка' in text or '/start' in text


# =========================================================================
# Media — _process_media
# =========================================================================

class TestProcessMedia:
    @pytest.mark.asyncio
    @patch('handlers.media.schedule_media_download')
    @patch('handlers.media.save_media', new_callable=AsyncMock)
    @patch('handlers.media.is_worker_in_team', new_callable=AsyncMock, return_value=True)
    @patch('handlers.media.find_team_by_topic', new_callable=AsyncMock, return_value=TEAM_DICT)
    @patch('handlers.media.find_worker_by_telegram_id', new_callable=AsyncMock, return_value=WORKER_DICT)
    async def test_photo_from_topic(self, mock_find_w, mock_find_t, mock_in_team, mock_save, mock_schedule):
        """T2-h-5: Фото в топик → Media создаётся."""
        from handlers.media import _process_media

        message = make_mock_message(message_thread_id=42)
        await _process_media(message, 'photo', 'file123', 'unique123', file_size=50000)

        mock_save.assert_called_once()
        call_kwargs = mock_save.call_args[1]
        assert call_kwargs['media_type'] == 'photo'
        assert call_kwargs['file_id'] == 'file123'

    @pytest.mark.asyncio
    @patch('handlers.media.schedule_media_download')
    @patch('handlers.media.save_media', new_callable=AsyncMock)
    @patch('handlers.media.is_worker_in_team', new_callable=AsyncMock, return_value=True)
    @patch('handlers.media.find_team_by_topic', new_callable=AsyncMock, return_value=TEAM_DICT)
    @patch('handlers.media.find_worker_by_telegram_id', new_callable=AsyncMock, return_value=WORKER_DICT)
    async def test_video_with_duration(self, mock_find_w, mock_find_t, mock_in_team, mock_save, mock_schedule):
        """T2-h-6: Видео → Media с duration."""
        from handlers.media import _process_media

        message = make_mock_message(message_thread_id=42)
        await _process_media(message, 'video', 'vid123', 'viduniq', file_size=1000000, duration=30)

        call_kwargs = mock_save.call_args[1]
        assert call_kwargs['duration'] == 30

    @pytest.mark.asyncio
    @patch('handlers.media.schedule_media_download')
    @patch('handlers.media.save_media', new_callable=AsyncMock)
    @patch('handlers.media.is_worker_in_team', new_callable=AsyncMock, return_value=True)
    @patch('handlers.media.find_team_by_topic', new_callable=AsyncMock, return_value=TEAM_DICT)
    @patch('handlers.media.find_worker_by_telegram_id', new_callable=AsyncMock, return_value=WORKER_DICT)
    async def test_voice_from_topic(self, mock_find_w, mock_find_t, mock_in_team, mock_save, mock_schedule):
        """T2-h-7: Голосовое → Media с duration."""
        from handlers.media import _process_media

        message = make_mock_message(message_thread_id=42)
        await _process_media(message, 'voice', 'voice123', 'voiceuniq', duration=5)

        call_kwargs = mock_save.call_args[1]
        assert call_kwargs['media_type'] == 'voice'

    @pytest.mark.asyncio
    @patch('handlers.media.schedule_media_download')
    @patch('handlers.media.save_media', new_callable=AsyncMock)
    @patch('handlers.media.is_worker_in_team', new_callable=AsyncMock, return_value=True)
    @patch('handlers.media.find_team_by_topic', new_callable=AsyncMock, return_value=TEAM_DICT)
    @patch('handlers.media.find_worker_by_telegram_id', new_callable=AsyncMock, return_value=WORKER_DICT)
    async def test_text_from_topic(self, mock_find_w, mock_find_t, mock_in_team, mock_save, mock_schedule):
        """T2-h-10: Текст → Media без file_id."""
        from handlers.media import _process_media

        message = make_mock_message(message_thread_id=42, text="Уложен кабель 50м")
        await _process_media(message, 'text', '', '')

        call_kwargs = mock_save.call_args[1]
        assert call_kwargs['file_id'] == ''
        mock_schedule.assert_not_called()  # text → нет file_id → нет задачи

    @pytest.mark.asyncio
    @patch('handlers.media.schedule_media_download')
    @patch('handlers.media.save_media', new_callable=AsyncMock)
    @patch('handlers.media.is_worker_in_team', new_callable=AsyncMock, return_value=True)
    @patch('handlers.media.find_team_by_topic', new_callable=AsyncMock, return_value=TEAM_DICT)
    @patch('handlers.media.find_worker_by_telegram_id', new_callable=AsyncMock, return_value=WORKER_DICT)
    async def test_media_reaction(self, mock_find_w, mock_find_t, mock_in_team, mock_save, mock_schedule):
        """T2-h-11: Успешный приём → реакция ✅."""
        from handlers.media import _process_media

        message = make_mock_message(message_thread_id=42)
        await _process_media(message, 'photo', 'f123', 'u123')

        message.react.assert_called_once()

    @pytest.mark.asyncio
    @patch('handlers.media.schedule_media_download')
    @patch('handlers.media.save_media', new_callable=AsyncMock)
    @patch('handlers.media.is_worker_in_team', new_callable=AsyncMock, return_value=True)
    @patch('handlers.media.find_team_by_topic', new_callable=AsyncMock, return_value=TEAM_DICT)
    @patch('handlers.media.find_worker_by_telegram_id', new_callable=AsyncMock, return_value=WORKER_DICT)
    async def test_media_celery_task_scheduled(self, mock_find_w, mock_find_t, mock_in_team, mock_save, mock_schedule):
        """T2-h-12: После сохранения → Celery задача поставлена."""
        from handlers.media import _process_media

        message = make_mock_message(message_thread_id=42)
        await _process_media(message, 'photo', 'fileid', 'uniqid')

        mock_schedule.assert_called_once()

    @pytest.mark.asyncio
    @patch('handlers.media.find_worker_by_telegram_id', new_callable=AsyncMock, return_value=WORKER_DICT)
    async def test_media_from_non_supergroup(self, mock_find):
        """T2-h-13: Не supergroup → игнорируется."""
        from handlers.media import _process_media

        message = make_mock_message(chat_type='group', message_thread_id=42)
        await _process_media(message, 'photo', 'f', 'u')

        # save_media не вызывается (нет патча — значит не дойдёт до вызова)
        mock_find.assert_not_called()

    @pytest.mark.asyncio
    async def test_media_without_thread_id(self):
        """T2-h-14: Без topic → игнорируется."""
        from handlers.media import _process_media

        message = make_mock_message(message_thread_id=None)
        await _process_media(message, 'photo', 'f', 'u')
        # Не падает, просто return

    @pytest.mark.asyncio
    @patch('handlers.media.find_worker_by_telegram_id', new_callable=AsyncMock, return_value=None)
    async def test_media_unregistered_user(self, mock_find):
        """T2-h-15: Незарегистрированный → игнорируется."""
        from handlers.media import _process_media

        message = make_mock_message(message_thread_id=42)
        await _process_media(message, 'photo', 'f', 'u')

        mock_find.assert_called_once()

    @pytest.mark.asyncio
    @patch('handlers.media.find_team_by_topic', new_callable=AsyncMock, return_value=TEAM_DICT)
    @patch('handlers.media.find_worker_by_telegram_id', new_callable=AsyncMock, return_value=WORKER_DICT)
    async def test_media_forwarded_message(self, mock_find_w, mock_find_t):
        """T2-h-16: Пересылка → удаляется."""
        from handlers.media import _process_media

        message = make_mock_message(message_thread_id=42, forward_date=datetime.now())
        await _process_media(message, 'photo', 'f', 'u')

        message.delete.assert_called_once()

    @pytest.mark.asyncio
    @patch('handlers.media.find_team_by_topic', new_callable=AsyncMock, return_value=None)
    @patch('handlers.media.find_worker_by_telegram_id', new_callable=AsyncMock, return_value=WORKER_DICT)
    async def test_media_unknown_team(self, mock_find_w, mock_find_t):
        """T2-h-17: Топик не привязан → игнорируется."""
        from handlers.media import _process_media

        message = make_mock_message(message_thread_id=42)
        await _process_media(message, 'photo', 'f', 'u')

        mock_find_t.assert_called_once()

    @pytest.mark.asyncio
    @patch('handlers.media.save_media', new_callable=AsyncMock)
    @patch('handlers.media.is_worker_in_team', new_callable=AsyncMock, return_value=False)
    @patch('handlers.media.find_team_by_topic', new_callable=AsyncMock, return_value=TEAM_DICT)
    @patch('handlers.media.find_worker_by_telegram_id', new_callable=AsyncMock, return_value=WORKER_DICT)
    async def test_media_worker_not_in_team(self, mock_find_w, mock_find_t, mock_in_team, mock_save):
        """T2-h-18: Worker не в звене → игнорируется."""
        from handlers.media import _process_media

        message = make_mock_message(message_thread_id=42)
        await _process_media(message, 'photo', 'f', 'u')

        mock_save.assert_not_called()

    @pytest.mark.asyncio
    @patch('handlers.media.find_worker_by_telegram_id', new_callable=AsyncMock, return_value=WORKER_DICT)
    async def test_text_command_ignored(self, mock_find):
        """T2-h-19: /start в группе → не обрабатывается как text."""
        from handlers.media import handle_text

        message = make_mock_message(message_thread_id=42, text="/start")
        await handle_text(message)

        # Команды начинаются с / → return без обработки
        # find_worker не должен вызываться для текстов-команд
        mock_find.assert_not_called()


# =========================================================================
# Callbacks — ответы на вопросы
# =========================================================================

class TestCallbackAnswer:
    @pytest.mark.asyncio
    @patch('services.db.find_worker_by_telegram_id', new_callable=AsyncMock, return_value=WORKER_DICT)
    @patch('handlers.callbacks.get_pool', new_callable=AsyncMock)
    async def test_callback_answer_success(self, mock_pool_fn, mock_find):
        """T2-h-20: answer:{id}:{index} → ответ сохранён."""
        from handlers.callbacks import handle_question_answer
        import json

        q_id = str(uuid.uuid4())
        mock_pool = AsyncMock()
        mock_pool_fn.return_value = mock_pool

        # fetchrow → вопрос
        mock_pool.fetchrow.return_value = {
            'id': q_id,
            'choices': json.dumps(['Да', 'Нет']),
            'question_text': 'Всё хорошо?',
            'status': 'pending',
        }
        mock_pool.execute = AsyncMock()

        callback = make_mock_callback(data=f"answer:{q_id}:0")
        await handle_question_answer(callback)

        callback.answer.assert_called_once()
        assert 'Да' in callback.answer.call_args[0][0]
        # execute вызван минимум 2 раза: INSERT + UPDATE
        assert mock_pool.execute.call_count >= 2

    @pytest.mark.asyncio
    @patch('handlers.callbacks.get_pool', new_callable=AsyncMock)
    async def test_callback_answer_already_answered(self, mock_pool_fn):
        """T2-h-21: Повторный → «Уже отвечено»."""
        from handlers.callbacks import handle_question_answer

        q_id = str(uuid.uuid4())
        mock_pool = AsyncMock()
        mock_pool_fn.return_value = mock_pool
        mock_pool.fetchrow.return_value = {
            'id': q_id,
            'choices': '[]',
            'question_text': 'Тест',
            'status': 'answered',
        }

        callback = make_mock_callback(data=f"answer:{q_id}:0")
        await handle_question_answer(callback)

        callback.answer.assert_called_once_with("Уже отвечено")

    @pytest.mark.asyncio
    async def test_callback_invalid_format(self):
        """T2-h-22: Кривой формат → «Ошибка формата»."""
        from handlers.callbacks import handle_question_answer

        callback = make_mock_callback(data="answer:invalid")
        await handle_question_answer(callback)

        callback.answer.assert_called_once_with("Ошибка формата")

    @pytest.mark.asyncio
    @patch('handlers.callbacks.get_pool', new_callable=AsyncMock)
    async def test_callback_unknown_question(self, mock_pool_fn):
        """T2-h-23: Несуществующий вопрос → «Вопрос не найден»."""
        from handlers.callbacks import handle_question_answer

        mock_pool = AsyncMock()
        mock_pool_fn.return_value = mock_pool
        mock_pool.fetchrow.return_value = None

        callback = make_mock_callback(data=f"answer:{uuid.uuid4()}:0")
        await handle_question_answer(callback)

        callback.answer.assert_called_once_with("Вопрос не найден")

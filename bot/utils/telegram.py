"""Утилиты для работы с Telegram Bot API."""

import logging
from typing import Optional, List

from aiogram import Bot
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton

logger = logging.getLogger(__name__)


async def create_forum_topic(
    bot: Bot,
    chat_id: int,
    name: str,
    icon_custom_emoji_id: Optional[str] = None,
) -> Optional[int]:
    """
    Создаёт топик (тему) в супергруппе с Forum Mode.

    Returns:
        message_thread_id нового топика или None при ошибке.
    """
    try:
        result = await bot.create_forum_topic(
            chat_id=chat_id,
            name=name,
            icon_custom_emoji_id=icon_custom_emoji_id,
        )
        logger.info(f"Created forum topic '{name}' in chat {chat_id}, thread_id={result.message_thread_id}")
        return result.message_thread_id
    except Exception as e:
        logger.error(f"Failed to create forum topic '{name}' in chat {chat_id}: {e}")
        return None


async def close_forum_topic(bot: Bot, chat_id: int, message_thread_id: int) -> bool:
    """Закрывает топик (тему) в супергруппе."""
    try:
        await bot.close_forum_topic(chat_id=chat_id, message_thread_id=message_thread_id)
        logger.info(f"Closed forum topic {message_thread_id} in chat {chat_id}")
        return True
    except Exception as e:
        logger.error(f"Failed to close forum topic {message_thread_id} in chat {chat_id}: {e}")
        return False


async def reopen_forum_topic(bot: Bot, chat_id: int, message_thread_id: int) -> bool:
    """Переоткрывает закрытый топик."""
    try:
        await bot.reopen_forum_topic(chat_id=chat_id, message_thread_id=message_thread_id)
        logger.info(f"Reopened forum topic {message_thread_id} in chat {chat_id}")
        return True
    except Exception as e:
        logger.error(f"Failed to reopen forum topic {message_thread_id} in chat {chat_id}: {e}")
        return False


async def rename_forum_topic(
    bot: Bot,
    chat_id: int,
    message_thread_id: int,
    name: str,
) -> bool:
    """Переименовывает топик."""
    try:
        await bot.edit_forum_topic(
            chat_id=chat_id,
            message_thread_id=message_thread_id,
            name=name,
        )
        logger.info(f"Renamed forum topic {message_thread_id} to '{name}' in chat {chat_id}")
        return True
    except Exception as e:
        logger.error(f"Failed to rename forum topic {message_thread_id}: {e}")
        return False


async def create_chat_invite_link(
    bot: Bot,
    chat_id: int,
    name: Optional[str] = None,
) -> Optional[str]:
    """
    Создаёт invite-ссылку для супергруппы.

    Returns:
        invite_link или None при ошибке.
    """
    try:
        result = await bot.create_chat_invite_link(
            chat_id=chat_id,
            name=name,
        )
        logger.info(f"Created invite link for chat {chat_id}: {result.invite_link}")
        return result.invite_link
    except Exception as e:
        logger.error(f"Failed to create invite link for chat {chat_id}: {e}")
        return None


async def send_to_topic(
    bot: Bot,
    chat_id: int,
    message_thread_id: int,
    text: str,
    reply_markup: Optional[InlineKeyboardMarkup] = None,
) -> Optional[int]:
    """
    Отправляет текстовое сообщение в конкретный топик супергруппы.

    Returns:
        message_id отправленного сообщения или None.
    """
    try:
        msg = await bot.send_message(
            chat_id=chat_id,
            message_thread_id=message_thread_id,
            text=text,
            reply_markup=reply_markup,
            parse_mode='HTML',
        )
        return msg.message_id
    except Exception as e:
        logger.error(f"Failed to send message to topic {message_thread_id} in chat {chat_id}: {e}")
        return None


def build_question_keyboard(
    question_id: str,
    choices: List[str],
) -> InlineKeyboardMarkup:
    """
    Формирует InlineKeyboardMarkup с вариантами ответа на вопрос.

    Callback data формат: answer:{question_id}:{choice_index}
    """
    buttons = []
    for i, choice in enumerate(choices):
        buttons.append([
            InlineKeyboardButton(
                text=choice,
                callback_data=f"answer:{question_id}:{i}",
            )
        ])
    return InlineKeyboardMarkup(inline_keyboard=buttons)


async def send_question_to_topic(
    bot: Bot,
    chat_id: int,
    message_thread_id: int,
    question_id: str,
    question_text: str,
    choices: List[str],
    author_name: str = "",
) -> Optional[int]:
    """
    Отправляет вопрос в топик с inline-кнопками для ответа.

    Args:
        bot: Экземпляр бота.
        chat_id: ID супергруппы.
        message_thread_id: ID топика (темы).
        question_id: UUID вопроса в БД.
        question_text: Текст вопроса.
        choices: Варианты ответов.
        author_name: Имя автора вопроса.

    Returns:
        message_id отправленного сообщения или None.
    """
    header = f"❓ <b>Вопрос от {author_name}</b>\n\n" if author_name else "❓ <b>Вопрос</b>\n\n"
    text = f"{header}{question_text}"

    keyboard = build_question_keyboard(question_id, choices)

    return await send_to_topic(
        bot=bot,
        chat_id=chat_id,
        message_thread_id=message_thread_id,
        text=text,
        reply_markup=keyboard,
    )


async def send_notification_to_topic(
    bot: Bot,
    chat_id: int,
    message_thread_id: int,
    text: str,
) -> Optional[int]:
    """
    Отправляет уведомление (без кнопок) в топик.
    Используется для системных уведомлений: создание звена, начало/конец смены.
    """
    return await send_to_topic(
        bot=bot,
        chat_id=chat_id,
        message_thread_id=message_thread_id,
        text=f"ℹ️ {text}",
    )


async def get_chat_member_count(bot: Bot, chat_id: int) -> int:
    """Получает количество участников чата."""
    try:
        return await bot.get_chat_member_count(chat_id)
    except Exception as e:
        logger.error(f"Failed to get member count for chat {chat_id}: {e}")
        return 0

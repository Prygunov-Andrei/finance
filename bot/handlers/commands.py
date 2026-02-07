"""Обработка команд: /start, /help."""

import logging
from aiogram import Router, types
from aiogram.filters import CommandStart, Command
from services.db import find_worker_by_telegram_id, mark_bot_started, get_supergroup_invite_link
from config import settings

logger = logging.getLogger(__name__)
router = Router()


@router.message(CommandStart())
async def cmd_start(message: types.Message):
    """Обработка /start — приветствие и invite-ссылка на супергруппу."""
    telegram_id = message.from_user.id
    worker = await find_worker_by_telegram_id(telegram_id)

    if not worker:
        await message.answer(
            "Вы не зарегистрированы в системе.\n"
            "Обратитесь к вашему Исполнителю для добавления в систему."
        )
        return

    # Помечаем что написал /start
    if not worker['bot_started']:
        await mark_bot_started(telegram_id)

    name = worker['name']
    invite_link = await get_supergroup_invite_link(telegram_id)

    text = f"Добро пожаловать, {name}!\n\n"
    text += "Вы зарегистрированы в системе фиксации работ.\n"

    if invite_link:
        text += f"\nПрисоединяйтесь к рабочей группе:\n{invite_link}\n"

    if settings.MINI_APP_URL:
        text += "\nДля регистрации на смену используйте мини-приложение."

    await message.answer(text)


@router.message(Command("help"))
async def cmd_help(message: types.Message):
    """Обработка /help."""
    await message.answer(
        "Система фиксации работ\n\n"
        "Как использовать:\n"
        "1. Зарегистрируйтесь на смену через мини-приложение\n"
        "2. Отправляйте фото/видео/голосовые в чат своего звена\n"
        "3. Бот подтвердит получение ✅\n\n"
        "Команды:\n"
        "/start — Начало работы\n"
        "/help — Справка"
    )

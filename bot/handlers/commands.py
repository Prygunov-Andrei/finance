"""Обработка команд: /start, /help."""

import logging
from aiogram import Router, types
from aiogram.filters import CommandStart, Command, CommandObject
from aiogram.fsm.context import FSMContext
from services.db import (
    find_worker_by_telegram_id,
    mark_bot_started,
    get_supergroup_invite_link,
    validate_invite_token,
)
from handlers.registration import RegistrationState
from config import settings

logger = logging.getLogger(__name__)
router = Router()


@router.message(CommandStart())
async def cmd_start(message: types.Message, command: CommandObject, state: FSMContext):
    """
    Обработка /start:
    - /start inv_XXXXX  -> регистрация через deep-link
    - /start             -> обычное приветствие
    """
    telegram_id = message.from_user.id
    deep_link = command.args  # "inv_ABC123" или None

    # --- Deep-link: регистрация через invite ---
    if deep_link and deep_link.startswith("inv_"):
        invite_code = deep_link[4:]  # убираем "inv_" префикс

        # Проверяем: может, пользователь уже зарегистрирован
        existing_worker = await find_worker_by_telegram_id(telegram_id)
        if existing_worker:
            if not existing_worker['bot_started']:
                await mark_bot_started(telegram_id)

            name = existing_worker['name']
            invite_link = await get_supergroup_invite_link(telegram_id)

            text = (
                f"Вы уже зарегистрированы как {name}!\n"
                "Приглашение не потрачено.\n"
            )
            if invite_link:
                text += f"\nПрисоединяйтесь к рабочей группе:\n{invite_link}"

            await message.answer(text)
            return

        # Валидируем invite-токен
        token_data = await validate_invite_token(invite_code)

        if not token_data:
            await message.answer(
                "Приглашение не найдено.\n"
                "Обратитесь к вашему Исполнителю за новой ссылкой."
            )
            return

        if not token_data.get('is_valid'):
            if token_data.get('used'):
                reason = "уже использовано"
            elif token_data.get('expired'):
                reason = "истекло"
            else:
                reason = "недействительно"

            await message.answer(
                f"Это приглашение {reason}.\n"
                "Обратитесь к вашему Исполнителю за новой ссылкой."
            )
            return

        # Invite валиден — начинаем FSM-диалог регистрации
        contractor_name = token_data.get('contractor_name', 'компания')
        role_name = 'Бригадир' if token_data.get('role') == 'brigadier' else 'Монтажник'

        await state.set_state(RegistrationState.waiting_name)
        await state.update_data(invite_code=invite_code)

        await message.answer(
            f"Добро пожаловать!\n\n"
            f"Вас приглашает: {contractor_name}\n"
            f"Роль: {role_name}\n\n"
            f"Для завершения регистрации введите ваше ФИО:"
        )

        logger.info(
            f"Deep-link registration started: tg_id={telegram_id}, "
            f"invite={invite_code}, contractor={contractor_name}"
        )
        return

    # --- Обычный /start (без deep-link) ---
    worker = await find_worker_by_telegram_id(telegram_id)

    if not worker:
        await message.answer(
            "Вы не зарегистрированы в системе.\n"
            "Обратитесь к вашему Исполнителю для добавления в систему.\n\n"
            "Если у вас есть ссылка-приглашение — нажмите на неё."
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

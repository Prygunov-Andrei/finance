"""FSM-диалог регистрации монтажника через deep-link invite."""

import logging
from aiogram import Router, types, F
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton

from services.db import (
    accept_invite_token,
    get_supergroup_invite_link,
    find_worker_by_telegram_id,
)

logger = logging.getLogger(__name__)
router = Router()


# =============================================================================
# FSM States
# =============================================================================

class RegistrationState(StatesGroup):
    waiting_name = State()
    waiting_language = State()


# =============================================================================
# Клавиатура выбора языка
# =============================================================================

LANGUAGE_KEYBOARD = InlineKeyboardMarkup(inline_keyboard=[
    [
        InlineKeyboardButton(text="🇷🇺 Русский", callback_data="reg_lang:ru"),
        InlineKeyboardButton(text="🇺🇿 O'zbek", callback_data="reg_lang:uz"),
    ],
    [
        InlineKeyboardButton(text="🇹🇯 Тоҷикӣ", callback_data="reg_lang:tg"),
        InlineKeyboardButton(text="🇰🇬 Кыргызча", callback_data="reg_lang:ky"),
    ],
])


# =============================================================================
# Handlers
# =============================================================================

@router.message(RegistrationState.waiting_name)
async def handle_name_input(message: types.Message, state: FSMContext):
    """Получаем ФИО от пользователя."""
    name = message.text.strip() if message.text else ""

    if not name or len(name) < 2:
        await message.answer(
            "Пожалуйста, введите ваше ФИО (минимум 2 символа):"
        )
        return

    if len(name) > 200:
        await message.answer(
            "Слишком длинное имя. Пожалуйста, введите ФИО покороче:"
        )
        return

    # Сохраняем имя в FSM и переходим к выбору языка
    await state.update_data(name=name)
    await state.set_state(RegistrationState.waiting_language)

    await message.answer(
        f"Отлично, {name}!\n\nВыберите язык интерфейса:",
        reply_markup=LANGUAGE_KEYBOARD,
    )


@router.callback_query(RegistrationState.waiting_language, F.data.startswith("reg_lang:"))
async def handle_language_choice(callback: types.CallbackQuery, state: FSMContext):
    """Получаем выбор языка и завершаем регистрацию."""
    language = callback.data.split(":")[1]

    if language not in ("ru", "uz", "tg", "ky"):
        await callback.answer("Неизвестный язык, попробуйте ещё раз.")
        return

    data = await state.get_data()
    invite_code = data.get("invite_code")
    name = data.get("name")
    telegram_id = callback.from_user.id

    if not invite_code or not name:
        await callback.message.edit_text(
            "Произошла ошибка. Пожалуйста, нажмите на invite-ссылку ещё раз."
        )
        await state.clear()
        return

    # Принимаем invite — создаём Worker
    result = await accept_invite_token(
        code=invite_code,
        telegram_id=telegram_id,
        name=name,
        language=language,
    )

    if not result:
        await callback.message.edit_text(
            "Не удалось завершить регистрацию.\n"
            "Возможно, приглашение уже использовано или истекло.\n"
            "Обратитесь к вашему Исполнителю за новой ссылкой."
        )
        await state.clear()
        return

    # Регистрация успешна
    lang_names = {
        'ru': 'Русский',
        'uz': "O'zbek",
        'tg': 'Тоҷикӣ',
        'ky': 'Кыргызча',
    }

    if result.get('already_existed'):
        text = (
            f"Вы уже зарегистрированы как {result['name']}!\n"
            "Приглашение не потрачено."
        )
    else:
        text = (
            f"✅ Регистрация завершена!\n\n"
            f"Имя: {name}\n"
            f"Роль: {'Бригадир' if result.get('role') == 'brigadier' else 'Монтажник'}\n"
            f"Язык: {lang_names.get(language, language)}\n\n"
            f"Добро пожаловать в систему фиксации работ!"
        )

    # Пробуем найти invite-ссылку на супергруппу
    invite_link = await get_supergroup_invite_link(telegram_id)
    if invite_link:
        text += f"\n\nПрисоединяйтесь к рабочей группе:\n{invite_link}"

    await callback.message.edit_text(text)
    await callback.answer()
    await state.clear()

    logger.info(
        f"Registration completed: tg_id={telegram_id}, "
        f"name={name}, lang={language}, invite={invite_code}"
    )

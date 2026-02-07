"""Обработка callback-кнопок (ответы на вопросы)."""

import logging
from aiogram import Router, types, F
from services.db import get_pool

logger = logging.getLogger(__name__)
router = Router()


@router.callback_query(F.data.startswith("answer:"))
async def handle_question_answer(callback: types.CallbackQuery):
    """
    Обработка ответа на вопрос через inline-кнопку.
    Формат callback_data: answer:{question_id}:{choice_index}
    """
    parts = callback.data.split(":")
    if len(parts) != 3:
        await callback.answer("Ошибка формата")
        return

    question_id = parts[1]
    choice_index = int(parts[2])

    pool = await get_pool()

    # Получаем вопрос
    question = await pool.fetchrow(
        "SELECT id, choices, question_text, status FROM worklog_question WHERE id = $1::uuid",
        question_id,
    )

    if not question:
        await callback.answer("Вопрос не найден")
        return

    if question['status'] == 'answered':
        await callback.answer("Уже отвечено")
        return

    # Определяем текст ответа
    import json
    choices = json.loads(question['choices']) if isinstance(question['choices'], str) else question['choices']
    if choice_index < len(choices):
        answer_text = choices[choice_index]
    else:
        answer_text = str(choice_index)

    # Ищем worker
    from services.db import find_worker_by_telegram_id
    worker = await find_worker_by_telegram_id(callback.from_user.id)
    if not worker:
        await callback.answer("Вы не зарегистрированы")
        return

    # Сохраняем ответ
    import uuid
    answer_id = str(uuid.uuid4())
    await pool.execute(
        """
        INSERT INTO worklog_answer (id, question_id, answered_by_id, answer_text, message_id, created_at, updated_at)
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, NOW(), NOW())
        """,
        answer_id, question_id, str(worker['id']), answer_text, callback.message.message_id,
    )

    # Обновляем статус вопроса
    await pool.execute(
        "UPDATE worklog_question SET status = 'answered' WHERE id = $1::uuid",
        question_id,
    )

    await callback.answer(f"Ответ принят: {answer_text}")

    # Обновляем сообщение
    try:
        await callback.message.edit_text(
            f"{question['question_text']}\n\n✅ Ответ: {answer_text}",
        )
    except Exception:
        pass

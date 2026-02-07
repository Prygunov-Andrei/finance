"""Middleware для авторизации пользователей через worklog_worker."""

import logging
from typing import Callable, Dict, Any, Awaitable

from aiogram import BaseMiddleware
from aiogram.types import Message, CallbackQuery

from services.db import find_worker_by_telegram_id

logger = logging.getLogger(__name__)


class WorkerAuthMiddleware(BaseMiddleware):
    """
    Middleware для автоматического поиска worker по telegram_id.

    Если worker найден — добавляет в data['worker'].
    Если worker не найден — пропускает (handler решает сам, как обрабатывать).
    """

    async def __call__(
        self,
        handler: Callable[[Message, Dict[str, Any]], Awaitable[Any]],
        event: Message,
        data: Dict[str, Any],
    ) -> Any:
        telegram_id = None

        if isinstance(event, Message) and event.from_user:
            telegram_id = event.from_user.id
        elif isinstance(event, CallbackQuery) and event.from_user:
            telegram_id = event.from_user.id

        if telegram_id:
            worker = await find_worker_by_telegram_id(telegram_id)
            data['worker'] = worker
        else:
            data['worker'] = None

        return await handler(event, data)


class RequireWorkerMiddleware(BaseMiddleware):
    """
    Middleware, который блокирует обработку если worker не найден.

    Используется на роутерах, где нужна обязательная авторизация (media).
    Для корректной работы должен стоять ПОСЛЕ WorkerAuthMiddleware.
    """

    async def __call__(
        self,
        handler: Callable[[Message, Dict[str, Any]], Awaitable[Any]],
        event: Message,
        data: Dict[str, Any],
    ) -> Any:
        worker = data.get('worker')

        if not worker:
            logger.debug(
                f"RequireWorkerMiddleware: unauthorized user "
                f"{getattr(event, 'from_user', None) and event.from_user.id}"
            )
            # Не отвечаем — просто молча игнорируем
            return None

        return await handler(event, data)

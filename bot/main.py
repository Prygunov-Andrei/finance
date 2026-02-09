"""Entry point для Telegram-бота (aiogram 3.x)."""

import asyncio
import logging
from aiohttp import web
from aiogram import Bot, Dispatcher
from aiogram.webhook.aiohttp_server import SimpleRequestHandler, setup_application
from config import settings
from handlers import commands, registration, media, callbacks
from middlewares.auth import WorkerAuthMiddleware
from services.db import get_pool, close_pool

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


async def on_startup(bot: Bot):
    """Действия при запуске бота."""
    # Инициализируем пул БД
    await get_pool()
    logger.info("Database pool initialized")

    # Устанавливаем webhook (если URL задан)
    if settings.WEBHOOK_URL:
        webhook_url = f"{settings.WEBHOOK_URL}{settings.WEBHOOK_PATH}"
        await bot.set_webhook(webhook_url)
        logger.info(f"Webhook set: {webhook_url}")


async def on_shutdown(bot: Bot):
    """Действия при остановке бота."""
    await close_pool()
    if settings.WEBHOOK_URL:
        await bot.delete_webhook()
    logger.info("Bot shutdown")


def create_app() -> tuple[Bot, Dispatcher]:
    """Создаёт и настраивает бот и диспетчер."""
    bot = Bot(token=settings.BOT_TOKEN)
    dp = Dispatcher()

    # Глобальный middleware — ищет worker по telegram_id
    dp.message.middleware(WorkerAuthMiddleware())
    dp.callback_query.middleware(WorkerAuthMiddleware())

    # Регистрируем роутеры
    dp.include_router(commands.router)
    dp.include_router(registration.router)  # FSM-диалог регистрации
    dp.include_router(media.router)
    dp.include_router(callbacks.router)

    # Lifecycle hooks
    dp.startup.register(on_startup)
    dp.shutdown.register(on_shutdown)

    return bot, dp


def run_webhook():
    """Запуск бота в режиме webhook (production)."""
    bot, dp = create_app()

    app = web.Application()
    webhook_requests_handler = SimpleRequestHandler(
        dispatcher=dp,
        bot=bot,
    )
    webhook_requests_handler.register(app, path=settings.WEBHOOK_PATH)
    setup_application(app, dp, bot=bot)

    web.run_app(app, host=settings.WEBAPP_HOST, port=settings.WEBAPP_PORT)


async def run_polling():
    """Запуск бота в режиме polling (разработка)."""
    bot, dp = create_app()
    await bot.delete_webhook(drop_pending_updates=True)
    logger.info("Starting polling...")
    await dp.start_polling(bot)


if __name__ == "__main__":
    import sys

    if "--webhook" in sys.argv:
        run_webhook()
    else:
        asyncio.run(run_polling())

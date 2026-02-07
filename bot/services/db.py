"""Прямое подключение к PostgreSQL через asyncpg."""

import asyncpg
import logging
from typing import Optional
from config import settings

logger = logging.getLogger(__name__)

_pool: Optional[asyncpg.Pool] = None


async def get_pool() -> asyncpg.Pool:
    """Возвращает пул соединений к БД."""
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            host=settings.DB_HOST,
            port=settings.DB_PORT,
            database=settings.DB_NAME,
            user=settings.DB_USER,
            password=settings.DB_PASSWORD,
            min_size=2,
            max_size=10,
        )
    return _pool


async def close_pool():
    """Закрывает пул соединений."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


async def find_worker_by_telegram_id(telegram_id: int) -> Optional[dict]:
    """Ищет Worker по telegram_id."""
    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT id, name, role, language, contractor_id, bot_started "
        "FROM worklog_worker WHERE telegram_id = $1",
        telegram_id,
    )
    if row:
        return dict(row)
    return None


async def mark_bot_started(telegram_id: int):
    """Помечает что пользователь написал /start."""
    pool = await get_pool()
    await pool.execute(
        "UPDATE worklog_worker SET bot_started = true WHERE telegram_id = $1",
        telegram_id,
    )


async def find_team_by_topic(telegram_group_id: int, topic_id: int) -> Optional[dict]:
    """Ищет звено по ID супергруппы и topic_id."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT t.id, t.topic_name, t.status, t.shift_id,
               s.telegram_group_id
        FROM worklog_team t
        JOIN worklog_supergroup s ON s.object_id = t.object_id AND s.contractor_id = t.contractor_id
        WHERE s.telegram_group_id = $1 AND t.topic_id = $2 AND t.status = 'active'
        """,
        telegram_group_id, topic_id,
    )
    if row:
        return dict(row)
    return None


async def is_worker_in_team(worker_id: str, team_id: str) -> bool:
    """Проверяет, состоит ли worker в team (активное членство)."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT 1 FROM worklog_teammembership
        WHERE team_id = $1 AND worker_id = $2 AND left_at IS NULL
        """,
        team_id, worker_id,
    )
    return row is not None


async def save_media(
    media_id: str,
    team_id: str,
    author_id: str,
    message_id: int,
    media_type: str,
    file_id: str,
    file_unique_id: str,
    text_content: str = "",
    file_size: int = 0,
    duration: int = 0,
):
    """Сохраняет метаданные медиа в БД."""
    pool = await get_pool()
    await pool.execute(
        """
        INSERT INTO worklog_media (
            id, team_id, author_id, message_id, media_type,
            file_id, file_unique_id, text_content, file_size,
            duration, tag, tag_source, status,
            file_url, thumbnail_url, phash,
            created_at, updated_at
        ) VALUES (
            $1::uuid, $2::uuid, $3::uuid, $4, $5,
            $6, $7, $8, $9,
            $10, 'none', 'none', 'pending',
            '', '', '',
            NOW(), NOW()
        )
        """,
        media_id, team_id, author_id, message_id, media_type,
        file_id, file_unique_id, text_content, file_size,
        duration,
    )


async def get_pending_questions(report_id: str) -> list:
    """Получает список неотправленных вопросов для отчёта."""
    pool = await get_pool()
    rows = await pool.fetch(
        """
        SELECT q.id, q.text, q.status, q.created_at,
               u.username AS author_name
        FROM worklog_question q
        LEFT JOIN auth_user u ON u.id = q.author_id
        WHERE q.report_id = $1::uuid AND q.status = 'pending'
        ORDER BY q.created_at
        """,
        report_id,
    )
    return [dict(row) for row in rows]


async def get_team_topic_info(team_id: str) -> Optional[dict]:
    """Получает информацию о топике для звена (для отправки вопросов)."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT t.topic_id, t.topic_name,
               s.telegram_group_id AS chat_id
        FROM worklog_team t
        JOIN worklog_supergroup s ON s.object_id = (
            SELECT object_id FROM worklog_shift WHERE id = t.shift_id
        ) AND s.contractor_id = (
            SELECT contractor_id FROM worklog_shift WHERE id = t.shift_id
        )
        WHERE t.id = $1::uuid AND s.is_active = true
        """,
        team_id,
    )
    if row:
        return dict(row)
    return None


async def get_supergroup_invite_link(telegram_id: int) -> Optional[str]:
    """Получает invite-ссылку для монтажника."""
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT s.invite_link
        FROM worklog_supergroup s
        JOIN worklog_worker w ON w.contractor_id = s.contractor_id
        WHERE w.telegram_id = $1
        LIMIT 1
        """,
        telegram_id,
    )
    if row:
        return row['invite_link']
    return None

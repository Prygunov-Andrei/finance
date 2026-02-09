"""Прямое подключение к PostgreSQL через asyncpg."""

import uuid
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


# =============================================================================
# InviteToken — deep-link регистрация
# =============================================================================

async def validate_invite_token(code: str) -> Optional[dict]:
    """
    Проверяет invite-токен: существует, не использован, не истёк.
    Возвращает dict с данными токена или None.
    """
    pool = await get_pool()
    row = await pool.fetchrow(
        """
        SELECT it.id, it.code, it.role, it.used, it.expires_at,
               it.contractor_id,
               c.short_name AS contractor_name
        FROM worklog_invitetoken it
        JOIN accounting_counterparty c ON c.id = it.contractor_id
        WHERE it.code = $1
        """,
        code,
    )
    if not row:
        return None

    data = dict(row)
    from datetime import datetime, timezone as tz
    now = datetime.now(tz.utc)

    data['is_valid'] = not data['used'] and data['expires_at'] > now
    data['expired'] = data['expires_at'] <= now
    return data


async def accept_invite_token(
    code: str,
    telegram_id: int,
    name: str,
    language: str = 'ru',
) -> Optional[dict]:
    """
    Принимает invite-токен: создаёт Worker и помечает токен как использованный.
    Возвращает dict с данными созданного Worker или None при ошибке.
    """
    pool = await get_pool()

    async with pool.acquire() as conn:
        async with conn.transaction():
            # Получаем и блокируем токен
            invite = await conn.fetchrow(
                """
                SELECT id, code, role, contractor_id, used, expires_at
                FROM worklog_invitetoken
                WHERE code = $1
                FOR UPDATE
                """,
                code,
            )
            if not invite:
                logger.warning(f"Invite token not found: {code}")
                return None

            from datetime import datetime, timezone as tz
            now = datetime.now(tz.utc)

            if invite['used'] or invite['expires_at'] <= now:
                logger.warning(f"Invite token invalid: {code} used={invite['used']}")
                return None

            # Проверяем что Worker с таким telegram_id ещё нет
            existing = await conn.fetchrow(
                "SELECT id, name FROM worklog_worker WHERE telegram_id = $1",
                telegram_id,
            )
            if existing:
                logger.info(f"Worker already exists for tg_id={telegram_id}")
                return {
                    'id': str(existing['id']),
                    'name': existing['name'],
                    'already_existed': True,
                }

            # Создаём Worker
            worker_id = str(uuid.uuid4())
            await conn.execute(
                """
                INSERT INTO worklog_worker (
                    id, telegram_id, name, phone, photo_url,
                    role, language, contractor_id, bot_started,
                    created_at, updated_at
                ) VALUES (
                    $1::uuid, $2, $3, '', '',
                    $4, $5, $6, true,
                    NOW(), NOW()
                )
                """,
                worker_id, telegram_id, name,
                invite['role'], language, invite['contractor_id'],
            )

            # Помечаем токен как использованный
            await conn.execute(
                """
                UPDATE worklog_invitetoken
                SET used = true, used_by_id = $1::uuid, used_at = NOW(), updated_at = NOW()
                WHERE code = $2
                """,
                worker_id, code,
            )

            logger.info(
                f"Worker created via invite: id={worker_id}, "
                f"tg_id={telegram_id}, name={name}, code={code}"
            )

            return {
                'id': worker_id,
                'name': name,
                'role': invite['role'],
                'language': language,
                'contractor_id': invite['contractor_id'],
                'already_existed': False,
            }

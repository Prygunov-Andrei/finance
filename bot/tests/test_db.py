"""
Unit-тесты services/db.py — 11 тестов.
Покрытие: find_worker, mark_bot_started, find_team_by_topic,
          is_worker_in_team, save_media, get_supergroup_invite_link.
"""
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from tests.conftest import WORKER_DICT, TEAM_DICT


# =========================================================================
# find_worker_by_telegram_id
# =========================================================================

class TestFindWorker:
    @pytest.mark.asyncio
    @patch('services.db.get_pool', new_callable=AsyncMock)
    async def test_find_worker_exists(self, mock_pool_fn):
        """T2-d-1: Существующий telegram_id → dict."""
        from services.db import find_worker_by_telegram_id

        mock_pool = AsyncMock()
        mock_pool_fn.return_value = mock_pool
        mock_row = MagicMock()
        mock_row.__iter__ = MagicMock(return_value=iter(WORKER_DICT.items()))
        mock_pool.fetchrow.return_value = mock_row

        # Мокаем dict(row)
        with patch('services.db.dict', return_value=WORKER_DICT):
            result = await find_worker_by_telegram_id(12345)

        mock_pool.fetchrow.assert_called_once()
        assert result is not None

    @pytest.mark.asyncio
    @patch('services.db.get_pool', new_callable=AsyncMock)
    async def test_find_worker_not_exists(self, mock_pool_fn):
        """T2-d-2: Несуществующий → None."""
        from services.db import find_worker_by_telegram_id

        mock_pool = AsyncMock()
        mock_pool_fn.return_value = mock_pool
        mock_pool.fetchrow.return_value = None

        result = await find_worker_by_telegram_id(99999)
        assert result is None


# =========================================================================
# mark_bot_started
# =========================================================================

class TestMarkBotStarted:
    @pytest.mark.asyncio
    @patch('services.db.get_pool', new_callable=AsyncMock)
    async def test_mark_bot_started(self, mock_pool_fn):
        """T2-d-3: bot_started → true."""
        from services.db import mark_bot_started

        mock_pool = AsyncMock()
        mock_pool_fn.return_value = mock_pool
        mock_pool.execute = AsyncMock()

        await mark_bot_started(12345)

        mock_pool.execute.assert_called_once()
        sql = mock_pool.execute.call_args[0][0]
        assert 'bot_started' in sql
        assert mock_pool.execute.call_args[0][1] == 12345


# =========================================================================
# find_team_by_topic
# =========================================================================

class TestFindTeamByTopic:
    @pytest.mark.asyncio
    @patch('services.db.get_pool', new_callable=AsyncMock)
    async def test_find_team_active(self, mock_pool_fn):
        """T2-d-4: Активное звено по chat_id + topic_id."""
        from services.db import find_team_by_topic

        mock_pool = AsyncMock()
        mock_pool_fn.return_value = mock_pool
        mock_row = MagicMock()
        mock_row.__iter__ = MagicMock(return_value=iter(TEAM_DICT.items()))
        mock_pool.fetchrow.return_value = mock_row

        with patch('services.db.dict', return_value=TEAM_DICT):
            result = await find_team_by_topic(-1001234567890, 42)

        assert result is not None

    @pytest.mark.asyncio
    @patch('services.db.get_pool', new_callable=AsyncMock)
    async def test_find_team_closed(self, mock_pool_fn):
        """T2-d-5: Закрытое звено → None (SQL фильтрует status=active)."""
        from services.db import find_team_by_topic

        mock_pool = AsyncMock()
        mock_pool_fn.return_value = mock_pool
        mock_pool.fetchrow.return_value = None

        result = await find_team_by_topic(-1001234567890, 42)
        assert result is None

    @pytest.mark.asyncio
    @patch('services.db.get_pool', new_callable=AsyncMock)
    async def test_find_team_wrong_group(self, mock_pool_fn):
        """T2-d-6: Другая группа → None."""
        from services.db import find_team_by_topic

        mock_pool = AsyncMock()
        mock_pool_fn.return_value = mock_pool
        mock_pool.fetchrow.return_value = None

        result = await find_team_by_topic(-999999999, 42)
        assert result is None


# =========================================================================
# is_worker_in_team
# =========================================================================

class TestIsWorkerInTeam:
    @pytest.mark.asyncio
    @patch('services.db.get_pool', new_callable=AsyncMock)
    async def test_active_membership(self, mock_pool_fn):
        """T2-d-7: Активное членство → True."""
        from services.db import is_worker_in_team

        mock_pool = AsyncMock()
        mock_pool_fn.return_value = mock_pool
        mock_pool.fetchrow.return_value = {'1': 1}  # Строка найдена

        result = await is_worker_in_team('worker-id', 'team-id')
        assert result is True

    @pytest.mark.asyncio
    @patch('services.db.get_pool', new_callable=AsyncMock)
    async def test_left_membership(self, mock_pool_fn):
        """T2-d-8: left_at не null → False (SQL WHERE left_at IS NULL)."""
        from services.db import is_worker_in_team

        mock_pool = AsyncMock()
        mock_pool_fn.return_value = mock_pool
        mock_pool.fetchrow.return_value = None  # Не найден

        result = await is_worker_in_team('worker-id', 'team-id')
        assert result is False

    @pytest.mark.asyncio
    @patch('services.db.get_pool', new_callable=AsyncMock)
    async def test_not_in_team(self, mock_pool_fn):
        """T2-d-9: Другое звено → False."""
        from services.db import is_worker_in_team

        mock_pool = AsyncMock()
        mock_pool_fn.return_value = mock_pool
        mock_pool.fetchrow.return_value = None

        result = await is_worker_in_team('other-worker', 'other-team')
        assert result is False


# =========================================================================
# save_media
# =========================================================================

class TestSaveMedia:
    @pytest.mark.asyncio
    @patch('services.db.get_pool', new_callable=AsyncMock)
    async def test_save_media(self, mock_pool_fn):
        """T2-d-10: INSERT → запись в БД корректна."""
        from services.db import save_media

        mock_pool = AsyncMock()
        mock_pool_fn.return_value = mock_pool
        mock_pool.execute = AsyncMock()

        media_id = str(uuid.uuid4())
        await save_media(
            media_id=media_id,
            team_id='team-id',
            author_id='author-id',
            message_id=123,
            media_type='photo',
            file_id='fileid',
            file_unique_id='uniqueid',
            text_content='caption',
            file_size=50000,
            duration=0,
        )

        mock_pool.execute.assert_called_once()
        sql = mock_pool.execute.call_args[0][0]
        assert 'INSERT INTO worklog_media' in sql


# =========================================================================
# get_supergroup_invite_link
# =========================================================================

class TestGetInviteLink:
    @pytest.mark.asyncio
    @patch('services.db.get_pool', new_callable=AsyncMock)
    async def test_get_invite_link(self, mock_pool_fn):
        """T2-d-11: invite_link возвращается."""
        from services.db import get_supergroup_invite_link

        mock_pool = AsyncMock()
        mock_pool_fn.return_value = mock_pool
        mock_pool.fetchrow.return_value = {'invite_link': 'https://t.me/+abc123'}

        result = await get_supergroup_invite_link(12345)
        assert result == 'https://t.me/+abc123'

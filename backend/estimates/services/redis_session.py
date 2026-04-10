"""Общий менеджер Redis-сессий для async задач.

Извлечён из дублирующегося паттерна в tasks.py (PDF import)
и work_matching/service.py (work matching).
"""
import json
import logging
import uuid

from typing import List, Optional

import redis
from django.conf import settings

logger = logging.getLogger(__name__)

DEFAULT_SESSION_TTL = 3600  # 1 час


def get_redis():
    """Подключение к Redis (общее для всех сессий)."""
    try:
        return redis.from_url(settings.CELERY_BROKER_URL, decode_responses=True)
    except redis.ConnectionError as e:
        logger.error('Redis connection failed: %s', e)
        raise RuntimeError(f'Redis unavailable: {e}') from e


class RedisSessionManager:
    """Управление Redis hash-сессиями для фоновых задач.

    Используется для:
    - PDF import (prefix='estimate_import')
    - Work matching (prefix='work_match')
    """

    def __init__(self, prefix: str, ttl: int = None):
        self.prefix = prefix
        self.ttl = ttl or getattr(settings, 'ESTIMATE_SESSION_TTL', DEFAULT_SESSION_TTL)

    def _key(self, session_id: str) -> str:
        return f'{self.prefix}:{session_id}'

    def create(self, fields: dict) -> str:
        """Создать сессию. Возвращает session_id."""
        r = get_redis()
        session_id = uuid.uuid4().hex[:16]
        key = self._key(session_id)
        r.hset(key, mapping=fields)
        r.expire(key, self.ttl)
        return session_id

    def get(self, session_id: str) -> Optional[dict]:
        """Прочитать данные сессии. None если не найдена/истекла."""
        r = get_redis()
        data = r.hgetall(self._key(session_id))
        return data if data else None

    def update(self, session_id: str, fields: dict):
        """Обновить поля + продлить TTL."""
        r = get_redis()
        key = self._key(session_id)
        r.hset(key, mapping=fields)
        r.expire(key, self.ttl)

    def get_field(self, session_id: str, field: str) -> Optional[str]:
        """Прочитать одно поле."""
        r = get_redis()
        return r.hget(self._key(session_id), field)

    def cancel(self, session_id: str) -> bool:
        """Пометить как cancelled."""
        r = get_redis()
        key = self._key(session_id)
        if r.exists(key):
            r.hset(key, 'status', 'cancelled')
            return True
        return False

    def is_cancelled(self, session_id: str) -> bool:
        """Проверить отмену."""
        status = self.get_field(session_id, 'status')
        return status in ('cancelled', 'error')

    def delete_key(self, key_suffix: str):
        """Удалить произвольный ключ (для lock и т.п.)."""
        r = get_redis()
        r.delete(key_suffix)

    def set_lock(self, lock_key: str, value: str) -> bool:
        """Попытка установить lock (NX). Возвращает True если удалось."""
        r = get_redis()
        return bool(r.set(lock_key, value, nx=True, ex=self.ttl))

    def get_lock_value(self, lock_key: str) -> Optional[str]:
        """Прочитать значение lock."""
        r = get_redis()
        return r.get(lock_key)

    def append_result(self, session_id: str, result: dict):
        """Добавить один результат в Redis LIST (O(1) per item)."""
        r = get_redis()
        key = f'{self._key(session_id)}:results'
        r.rpush(key, json.dumps(result, ensure_ascii=False))
        r.expire(key, self.ttl)

    def get_all_results(self, session_id: str) -> List[dict]:
        """Прочитать все результаты из Redis LIST."""
        r = get_redis()
        raw = r.lrange(f'{self._key(session_id)}:results', 0, -1)
        return [json.loads(item) for item in raw]

    def get_results_count(self, session_id: str) -> int:
        """Количество результатов в LIST."""
        r = get_redis()
        return r.llen(f'{self._key(session_id)}:results')

    def scan_sessions(self) -> list:
        """Найти все сессии по prefix (для crash recovery)."""
        r = get_redis()
        return list(r.scan_iter(f'{self.prefix}:*'))

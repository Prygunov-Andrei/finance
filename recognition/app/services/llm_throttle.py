"""Process-level LLM concurrency throttle (E19-1).

Один глобальный `asyncio.Semaphore` на ВСЕ одновременные исходящие
LLM-запросы из recognition. Отличается от `SpecParser`-локального
семафора (`llm_max_concurrency`) — тот ограничивает параллелизм
*внутри одного парса*. Глобальный — суммарный потолок по всем
running async-job'ам.

С двумя параллельными jobs без global cap получаем
2 × `llm_max_concurrency` одновременных calls, что упирается в rate-
limit OpenAI/DeepSeek даже на tier-1.

Используется в `OpenAIVisionProvider._post_with_retry` — внешний gate
вокруг каждого исходящего HTTP-call'а к LLM. Перенастройка размера
бассейна в runtime — через `set_capacity` (тесты).
"""

from __future__ import annotations

import asyncio

from ..config import settings

_LOCK = asyncio.Lock()
_GLOBAL_SEMA: asyncio.Semaphore | None = None
_CAPACITY: int = 0


def _make_semaphore(capacity: int) -> asyncio.Semaphore:
    return asyncio.Semaphore(max(1, capacity))


async def get_global_semaphore() -> asyncio.Semaphore:
    """Лениво создаёт глобальный семафор с ёмкостью settings.llm_global_concurrency.

    Создание — внутри running event loop'а, чтобы избежать привязки к
    "default" loop'у при импорте модуля (в тестах FastAPI каждый
    TestClient-запрос крутится на своём loop'е).
    """
    global _GLOBAL_SEMA, _CAPACITY
    async with _LOCK:
        if _GLOBAL_SEMA is None:
            _CAPACITY = int(settings.llm_global_concurrency)
            _GLOBAL_SEMA = _make_semaphore(_CAPACITY)
        return _GLOBAL_SEMA


async def set_capacity(capacity: int) -> None:
    """Test-only: пересоздать семафор с новой ёмкостью."""
    global _GLOBAL_SEMA, _CAPACITY
    async with _LOCK:
        _CAPACITY = int(capacity)
        _GLOBAL_SEMA = _make_semaphore(_CAPACITY)


def get_capacity() -> int:
    return _CAPACITY


async def reset_for_tests() -> None:
    """Сбросить состояние между тестами (создание на новом event loop'е)."""
    global _GLOBAL_SEMA, _CAPACITY
    async with _LOCK:
        _GLOBAL_SEMA = None
        _CAPACITY = 0

"""LLM pricing calculator (E18-1).

Загружает таблицу `app/pricing.json` (USD per 1M tokens) и считает стоимость
вызовов по usage-метрикам (prompt/completion/cached tokens).

Дизайн:
- Если модель не найдена в таблице → `calc_cost` возвращает None. UI отрисует
  «—», backend пишет null в `ImportLog.cost_usd`. PO лучше видеть «нет данных»
  чем ноль (мы не знаем, бесплатно это или $5 за документ).
- `cached` — отдельный тариф для prompt-токенов, попавших в provider-cache
  (OpenAI prompt_tokens_details.cached_tokens). Если модель не предоставляет
  cached тариф — fallback на `input × 0.5` (типичный множитель OpenAI ephemeral
  cache). cached_tokens — это часть prompt_tokens, поэтому `uncached =
  prompt_tokens - cached_tokens`.
- Ленивая загрузка JSON (модуль импортируется в parser, а pricing — fresh
  read out of code path в тестах после конфигурации).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..schemas.spec import LLMCosts

_PRICING: dict[str, dict[str, float]] | None = None
_PRICING_PATH = Path(__file__).parent.parent / "pricing.json"


def _load() -> dict[str, dict[str, float]]:
    global _PRICING
    if _PRICING is None:
        raw = json.loads(_PRICING_PATH.read_text(encoding="utf-8"))
        # Игнорируем top-level ключи начинающиеся с "_" (комментарии в JSON
        # без поддержки реальных JSON-comments).
        _PRICING = {k: v for k, v in raw.items() if not k.startswith("_")}
    return _PRICING


def calc_cost(
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    cached_tokens: int = 0,
) -> float | None:
    """Стоимость вызова в USD по таблице. None если модель не найдена.

    cached_tokens — часть prompt_tokens, тарифицируется по `cached` ставке
    (default = input × 0.5 если в pricing.json нет явной cached ставки).
    """
    table = _load()
    rates = table.get(model)
    if not rates:
        return None
    cached_rate = rates.get("cached", rates["input"] * 0.5)
    uncached = max(0, prompt_tokens - cached_tokens)
    return (
        uncached * rates["input"] / 1_000_000
        + cached_tokens * cached_rate / 1_000_000
        + completion_tokens * rates["output"] / 1_000_000
    )


def reset_cache() -> None:
    """Сбросить cached pricing table — для тестов."""
    global _PRICING
    _PRICING = None


def build_llm_costs(usage_log: list | None) -> LLMCosts:
    """Построить LLMCosts из provider.usage_log (list[UsageEntry]).

    Группирует записи по bucket (extract / multimodal / classify) и считает
    sum(prompt/completion/cached) per-bucket. Внутри bucket берётся первая
    встретившаяся модель — в реальности все entry одного bucket'а используют
    одну и ту же модель (provider.extract_model и т.п.); если по какой-то
    причине модель сменилась mid-request — отчёт покажет первую (low priority
    edge-case, MVP не охватывает).
    """
    # Локальные импорты — чтобы избежать circular: schemas/spec.py → services
    # не зависит, но services/pricing.py → schemas/spec.py добавил бы
    # обратное направление при collect-time.
    from ..schemas.spec import LLMCallCost, LLMCosts

    buckets: dict[str, dict[str, int | str]] = {}
    for entry in usage_log or ():
        b = buckets.setdefault(
            entry.bucket,
            {
                "model": entry.model,
                "calls": 0,
                "prompt": 0,
                "completion": 0,
                "cached": 0,
            },
        )
        b["calls"] = int(b["calls"]) + 1  # type: ignore[arg-type]
        b["prompt"] = int(b["prompt"]) + entry.prompt_tokens  # type: ignore[arg-type]
        b["completion"] = int(b["completion"]) + entry.completion_tokens  # type: ignore[arg-type]
        b["cached"] = int(b["cached"]) + entry.cached_tokens  # type: ignore[arg-type]

    def _to_call_cost(b: dict[str, int | str]) -> LLMCallCost:
        cost = calc_cost(
            str(b["model"]),
            int(b["prompt"]),  # type: ignore[arg-type]
            int(b["completion"]),  # type: ignore[arg-type]
            int(b["cached"]),  # type: ignore[arg-type]
        )
        return LLMCallCost(
            model=str(b["model"]),
            calls=int(b["calls"]),  # type: ignore[arg-type]
            prompt_tokens=int(b["prompt"]),  # type: ignore[arg-type]
            completion_tokens=int(b["completion"]),  # type: ignore[arg-type]
            cached_tokens=int(b["cached"]),  # type: ignore[arg-type]
            cost_usd=cost,
        )

    extract = _to_call_cost(buckets["extract"]) if "extract" in buckets else None
    multimodal = (
        _to_call_cost(buckets["multimodal"]) if "multimodal" in buckets else None
    )
    classify = _to_call_cost(buckets["classify"]) if "classify" in buckets else None
    total = sum(
        (b.cost_usd or 0.0) for b in (extract, multimodal, classify) if b is not None
    )
    return LLMCosts(
        extract=extract,
        multimodal=multimodal,
        classify=classify,
        total_usd=round(total, 6),
    )

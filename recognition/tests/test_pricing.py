"""E18-1: pricing math + bucket aggregation."""

from __future__ import annotations

from app.providers.base import UsageEntry
from app.services.pricing import build_llm_costs, calc_cost


class TestCalcCost:
    def test_gpt_4o_typical(self) -> None:
        # gpt-4o: input $2.5/1M, output $10.0/1M, cached $1.25/1M
        # 100 input, 0 cached, 0 output → 100 * 2.5 / 1M = 0.00025
        assert calc_cost("gpt-4o", 100, 0, 0) == 0.00025

    def test_gpt_4o_with_cached(self) -> None:
        # 1000 prompt из них 400 cached, 200 output
        # uncached = 600, cached = 400
        # 600 * 2.5 / 1M + 400 * 1.25 / 1M + 200 * 10 / 1M
        # = 0.0015 + 0.0005 + 0.002 = 0.004
        cost = calc_cost("gpt-4o", 1000, 200, 400)
        assert cost is not None
        assert abs(cost - 0.004) < 1e-9

    def test_deepseek_chat_no_cached_rate(self) -> None:
        # deepseek-chat: cached=0.0 в pricing.json — значит cached токены
        # бесплатны (а не fallback на 0.5×input).
        cost = calc_cost("deepseek-chat", 1000, 500, 200)
        # uncached = 800; 800 * 0.14/1M + 200*0/1M + 500 * 0.28/1M
        # = 0.000112 + 0 + 0.00014 = 0.000252
        assert cost is not None
        assert abs(cost - 0.000252) < 1e-9

    def test_unknown_model_returns_none(self) -> None:
        assert calc_cost("custom-vllm-model", 1000, 500) is None

    def test_zero_tokens(self) -> None:
        assert calc_cost("gpt-4o", 0, 0, 0) == 0.0

    def test_cached_capped_at_prompt(self) -> None:
        # Если caller случайно передал cached > prompt — uncached не идёт в минус.
        cost = calc_cost("gpt-4o", 100, 0, 200)
        # uncached = max(0, 100-200) = 0; cached = 200 × 1.25 / 1M
        assert cost is not None
        assert abs(cost - 200 * 1.25 / 1_000_000) < 1e-9


class TestBuildLLMCosts:
    def test_empty_usage_log(self) -> None:
        costs = build_llm_costs([])
        assert costs.extract is None
        assert costs.multimodal is None
        assert costs.classify is None
        assert costs.total_usd == 0.0

    def test_none_usage_log(self) -> None:
        costs = build_llm_costs(None)
        assert costs.total_usd == 0.0

    def test_extract_only_bucket(self) -> None:
        log = [
            UsageEntry("extract", "gpt-4o", 1000, 200, 0),
            UsageEntry("extract", "gpt-4o", 500, 100, 0),
        ]
        costs = build_llm_costs(log)
        assert costs.extract is not None
        assert costs.extract.calls == 2
        assert costs.extract.prompt_tokens == 1500
        assert costs.extract.completion_tokens == 300
        # 1500 * 2.5/1M + 300 * 10/1M = 0.00375 + 0.003 = 0.00675
        assert costs.extract.cost_usd is not None
        assert abs(costs.extract.cost_usd - 0.00675) < 1e-9
        assert costs.multimodal is None
        assert costs.classify is None
        assert abs(costs.total_usd - 0.00675) < 1e-6

    def test_three_buckets_total_sum(self) -> None:
        log = [
            UsageEntry("extract", "gpt-4o-mini", 1000, 100, 0),  # cheap text
            UsageEntry("multimodal", "gpt-4o", 2000, 300, 0),  # vision retry
            UsageEntry("classify", "gpt-4o-mini", 500, 50, 0),  # vision fallback
        ]
        costs = build_llm_costs(log)
        assert costs.extract is not None and costs.extract.cost_usd is not None
        assert costs.multimodal is not None and costs.multimodal.cost_usd is not None
        assert costs.classify is not None and costs.classify.cost_usd is not None
        expected = (
            costs.extract.cost_usd
            + costs.multimodal.cost_usd
            + costs.classify.cost_usd
        )
        assert abs(costs.total_usd - round(expected, 6)) < 1e-6

    def test_unknown_model_cost_none_excluded_from_total(self) -> None:
        log = [
            UsageEntry("extract", "custom-local-llm", 1000, 100, 0),
            UsageEntry("multimodal", "gpt-4o", 100, 50, 0),
        ]
        costs = build_llm_costs(log)
        assert costs.extract is not None
        assert costs.extract.cost_usd is None  # модель не в pricing.json
        assert costs.multimodal is not None
        assert costs.multimodal.cost_usd is not None
        # total = только multimodal
        assert abs(costs.total_usd - costs.multimodal.cost_usd) < 1e-9

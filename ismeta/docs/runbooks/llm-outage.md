# Runbook: LLM Provider Outage

**Severity:** P2 (обычно), P1 (если fallback не работает)
**Expected frequency:** часто (несколько раз в месяц)

## Симптомы

- Алерт: «LLM provider 5xx/timeout».
- Логи: `openai.APIError` / `RateLimitError`.
- Чат агента: ответа нет / ошибка.
- Подбор работ Tier 6/7 — тихо заменяется на unmatched.

## Impact

- **Chat agent:** не работает.
- **LLM-based matching (Tier 6/7):** не работает, строки остаются unmatched.
- **Recognition PDF:** задержка или error.
- **Pass 1 матчинга (Tier 0-5):** работает как обычно.

## Первые 5 минут

1. **Confirm:** `curl https://api.openai.com/v1/models` (или соответствующий провайдер).
2. **Check статус:** https://status.openai.com / status других провайдеров.
3. **Verify fallback chain:** работает ли Gemini / Anthropic?
4. **Declare severity.**

## Диагностика

### Что именно падает?

- **Single provider (OpenAI only):** fallback должен сработать на Gemini. Проверить.
- **Multiple providers:** проблема с нашей сетью / outbound.
- **Rate limit (429):** превысили quota.
- **Invalid API key (401):** secret expired или ротирован.

### Test commands

```bash
# OpenAI
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"

# Gemini
curl "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY"

# Anthropic
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model": "claude-haiku-4-5", "max_tokens": 5, "messages": [{"role": "user", "content": "hi"}]}'
```

## Варианты решения

### Case 1: OpenAI провайдер падает, fallback работает

**Автомат — никакого human action.**

1. Circuit breaker трипается после 3 fail за 5 мин.
2. Следующие запросы идут на Gemini.
3. Monitor: восстановился ли OpenAI? Через час — retry.

**Если fallback не автомат:**
1. Вручную включить: `Workspace.settings.llm_fallback_chain` корректный?
2. Deploy fix.

### Case 2: Все провайдеры падают

**Real degraded mode:**

1. Chat disabled (UI показывает «AI временно недоступен»).
2. Matching работает только Tier 0-5.
3. Recognition fails gracefully (user видит сообщение).
4. Wait для восстановления.

### Case 3: Rate limit превышен

```bash
# Check usage в LLMUsage
psql -U ismeta -c "
SELECT date_trunc('hour', created_at) AS hour, count(*)
FROM llm_usage
WHERE created_at > now() - interval '24 hours'
GROUP BY 1 ORDER BY 1 DESC
LIMIT 24
"
```

Options:
- **Wait:** rate limits обычно сбрасываются через 1-60 мин.
- **Upgrade tier у провайдера:** OpenAI Tier 2+ снимает ограничения.
- **Throttle наш usage:** временно disable chat, только matching.

### Case 4: Quota / budget exceeded

Наш `LLM_MONTHLY_BUDGET_RUB` заложен в settings. Если истекает:

1. Workspace settings check: `SELECT workspace_id, sum(cost_usd) FROM llm_usage WHERE created_at > date_trunc('month', now()) GROUP BY 1`.
2. Увеличить budget (ручное решение).
3. Или downgrade model (gpt-4o → gpt-4o-mini) для оставшегося месяца.

### Case 5: Invalid API key

- Secret rotated без обновления в ISMeta.
- Get new key, update `.env.production.enc` через SOPS.
- Redeploy.

## Communication

### Internal

```
[ISMETA] LLM недоступен: {provider}
Fallback: {работает / не работает}
Impact: {chat / matching / recognition}
ETA: зависит от провайдера
```

### External

Для клиентов — только при P1 (все провайдеры down):

```
Функция AI-ассистента временно недоступна.
Подбор работ работает в ограниченном режиме (только автоматика без LLM).

Полное восстановление ожидается в течение N часов.
```

## Post-mortem checklist

- [ ] Какой провайдер упал, когда, почему.
- [ ] Сработал ли fallback автоматически.
- [ ] Сколько задач было зафиксировано в degraded mode.
- [ ] Финансовый impact (если превысили LLM-budget из-за retry).

## Prevention

- Multi-provider setup с first day.
- Automated failover (circuit breaker).
- Budget alerts на 80% и 100%.
- Load testing с simulated LLM outage (chaos).
- Cassette-based fallback для non-interactive tasks.

## Связанные

- [`../specs/04-llm-agent.md §5.1`](../../specs/04-llm-agent.md) — fallback chain.
- [`../LLM-COST-MODEL.md`](../LLM-COST-MODEL.md) — budget enforcement.
- [`secret-compromised.md`](./secret-compromised.md) — если API key украден.

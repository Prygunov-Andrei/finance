# 11. Метрики и наблюдаемость

**Версия:** 0.1. **Назначение:** какие метрики собираем, как храним, где отображаем, что алертим.

## 1. Принципы

- Метрики — первой свежести (не раз в сутки, а в реальном времени), но без переусложнения инфраструктуры.
- В MVP — без Prometheus/Grafana. Хранение в Postgres, отображение в админке ISMeta через простые SQL + Recharts.
- На этапе 3+, когда появятся коробочные клиенты, — экспорт в Prometheus по стандартному endpoint'у.
- Данные метрик — в своих таблицах, а не в AuditLog (разные жизненные циклы).

## 2. Каталог метрик

### 2.1 Продуктовые (KPI)

| Метрика | Определение | Источник | Дашборд |
|---|---|---|---|
| **Precision подбора работ** | `matched / (matched + rejected)` за период | EstimateItem + AuditLog apply | Главный |
| **Recall подбора работ** | `matched / (matched + rejected + unmatched)` | EstimateItem | Главный |
| **F1 по тирам** | Precision и Recall отдельно по `match_source` (Tier 0-7) | EstimateItem | Подробный |
| **Среднее время от загрузки до готовой сметы** | `transmitted_at - created_at` при статусе `transmitted` | Estimate | KPI |
| **Доля смет, завершённых передачей в ERP** | `count(transmitted) / count(created)` | Estimate | KPI |
| **Средний размер сметы** | средний `count(EstimateItem) per Estimate` | EstimateItem | Операционный |
| **Средняя стоимость LLM на смету** | `sum(cost_usd) per Estimate` × курс | LLMUsage | Экономика |

### 2.2 LLM

| Метрика | Определение | Источник |
|---|---|---|
| Токены in/out по провайдеру | суммы | LLMUsage |
| Стоимость по task_type | `sum(cost_usd) group by task_type` | LLMUsage |
| Latency LLM-вызова | P50/P95/P99 | LLMUsage + отдельное поле `duration_ms` |
| Доля неуспешных вызовов | `failures / total` | LLMUsage.status |
| Кэш-попадания (cassette) | только в тестовой среде | |
| **Workspace LLM budget consumed** | `sum(cost_rub) / budget_monthly` | LLMUsage + Workspace.settings |
| **Доля смет > 150 ₽ LLM** | над таргетом стоимости | LLMUsage group by estimate |
| **Доля задач на fallback-провайдере** | primary circuit-breaker трипался | LLMUsage.provider vs default |

Модель расчёта и бюджет — см. [`../docs/LLM-COST-MODEL.md`](../docs/LLM-COST-MODEL.md).

### 2.3 Качество работы агента

| Метрика | Определение | Источник |
|---|---|---|
| Количество chat-сессий | по workspace, в день | ChatSession |
| Среднее число сообщений в сессии | | ChatMessage |
| Ratio tool-вызовов к текстовым ответам | | ChatMessage.tool_calls |
| Сценарии (thumbs up/down) | сметчик в UI ставит оценку | ChatSession.rating |

### 2.4 Webhook/интеграция

| Метрика | Определение |
|---|---|
| Задержка webhook (ERP → ISMeta, от occurred_at до processed_at) | P50/P95 |
| Частота polling-fallback-срабатываний | (признак, что webhook-канал нездоров) |
| Попытки передачи snapshot (успех с 1-й, retry) | из SnapshotTransmission |
| 4xx/5xx-ошибки по snapshot API | из логов |

### 2.5 Технические

| Метрика | Источник |
|---|---|
| Latency API endpoint'ов ISMeta (P50/P95) | middleware |
| Глубина очереди Celery (per workspace) | Celery inspect |
| Uptime бэкенда | health-endpoint + external check |
| Ошибки 5xx | логи |
| Размер БД ISMeta | SELECT pg_total_relation_size |
| Размер папки knowledge `.md` | du -s |
| Доля falling-back Excel-импортов (с потерей row_id) | ImportSession |

### 2.6 Безопасность

| Метрика | Источник |
|---|---|
| Неуспешные JWT-валидации (ERP → ISMeta) | middleware |
| Отвергнутые webhook-сигнатуры | webhook receiver |
| Попытки обращения к чужому workspace | DRF permission middleware |

### 2.7 Публичный режим (этап 2)

| Метрика | Источник |
|---|---|
| Количество запросов OTP | логи |
| Конверсия OTP → загрузка | public.Request |
| Конверсия загрузка → готова | public.Request.status |
| Конверсия готова → callback | public.Callback |
| Доля запросов с капчей failed | логи |
| Средний размер публичной сметы | public.Estimate |

## 3. Distributed tracing

Заложено с первого дня:
- **OpenTelemetry SDK** в backend ISMeta, backend ERP, recognition service, mock-серверах dev-среды.
- `trace_id` прокидывается через HTTP-заголовок `traceparent` (стандарт W3C Trace Context).
- Все логи автоматически обогащаются `trace_id`, `span_id`, `workspace_id`, `user_id`, `request_id`.
- Jaeger / Tempo / SigNoz (выбор — в этапе E1) для просмотра трейсов.

Сценарии использования:
- «Сметчик отправил snapshot в ERP, что-то упало» — от клика в UI до 5xx в ERP видно одним trace'ом.
- «LLM-агент выдал странный ответ» — видна цепочка tool-calls с их результатами.
- «Подбор работ занимает 5 минут вместо ожидаемых 2» — видно, где именно проседает.

## 4. Хранение

### 4.1 В Postgres

Все метрики, кроме технических runtime, хранятся в рабочих таблицах ISMeta (LLMUsage, SnapshotTransmission и пр.). Отдельная таблица `MetricAggregate` для предрассчитанных дневных срезов:

| Поле | Тип |
|---|---|
| date | DATE |
| workspace_id | UUID nullable (null = глобально) |
| metric_name | VARCHAR(64) |
| value | DECIMAL(18,4) |
| sample_size | INT |
| metadata | JSONB |

Агрегация — ночным Celery-таском `metrics_rollup`.

### 3.2 В Redis

Runtime-технические метрики (латентность API, глубина очередей) — в Redis с TTL 7 дней через prometheus-client или аналог. Доступны через admin endpoint `/api/v1/internal/metrics` (только для админа).

### 3.3 В логах

ERROR/CRITICAL идут в stdout и собираются стандартным logging (в проде — в Loki или аналог). В коробке — в файл с ротацией.

## 4. Дашборд

### 4.1 В админке ISMeta

`/admin/metrics` — главная страница с тремя виджетами:
- **KPI-карточки**: precision, recall, средняя цена LLM, количество смет за период.
- **График качества подбора** по тирам (Recharts stacked bar).
- **График стоимости LLM** по дням (Recharts line).

Дополнительные страницы:
- `/admin/metrics/llm` — расходы, провайдеры, задачи.
- `/admin/metrics/matching` — подробный разрез по tier.
- `/admin/metrics/webhook-health` — задержки и polling-срабатывания.

Для всех графиков — фильтры по workspace, по периоду.

### 4.2 Экспорт в Prometheus (этап 2+)

Endpoint `/metrics` в формате Prometheus exposition. Метрики:
- `ismeta_llm_cost_usd_total` (counter, labels: workspace, provider, task_type)
- `ismeta_estimate_items_total` (gauge, labels: workspace, status)
- `ismeta_webhook_processing_seconds` (histogram)
- `ismeta_match_precision` (gauge, labels: workspace, tier)
- и т.д.

## 5. Алерты

### 5.1 MVP-минимум

| Условие | Канал | Порог |
|---|---|---|
| ISMeta health-check не отвечает 60 сек | Telegram команде | 1 раз |
| 5xx-ошибок > 5% запросов за 5 минут | Telegram | 1 раз |
| SnapshotTransmission в статусе `failed` | Telegram | немедленно |
| Стоимость LLM за день > 1000 ₽ | Telegram | раз в день |
| AuditLog растёт >1 000 000 записей за неделю | Telegram | раз в неделю |
| Очередь Celery (ISMeta) > 100 задач более 10 минут | Telegram | при превышении |

### 5.2 Этап 2+

- Автоматическое блокирование LLM-вызовов при превышении месячного бюджета workspace (из настроек).
- PagerDuty-алерты для коробочных клиентов.
- SLA-алерты при падении конверсии публичного режима.

## 6. Сбор метрик в коде

### 6.1 Обёртка LLM-вызова

```python
with llm_usage.record(workspace_id, estimate_id, task_type='agent_chat') as record:
    response = provider.chat(...)
    record.tokens_in = response.usage.prompt_tokens
    record.tokens_out = response.usage.completion_tokens
    record.cost_usd = calculate_cost(provider, model, tokens_in, tokens_out)
```

### 6.2 Обёртка мэтчинга

После Pass 1 и Pass 2 — записи в `MatchingSessionStats`:

| Поле | Тип |
|---|---|
| session_id | UUID |
| workspace_id | UUID |
| estimate_id | UUID |
| pass1_duration_ms | INT |
| pass2_duration_ms | INT |
| tier_counts | JSONB (`{default:10, history:0, ...}`) |
| applied_matches | INT |
| rejected_matches | INT |
| created_at | TIMESTAMPTZ |

## 7. Ретеншн

| Данные | Срок хранения в Postgres | Далее |
|---|---|---|
| LLMUsage | 2 года | экспорт в холодное хранилище (S3 CSV) |
| SnapshotTransmission | 1 год | очистка |
| MetricAggregate | 5 лет | сохраняется |
| MatchingSessionStats | 1 год | очистка |
| AuditLog | 1 год | очистка (как описано в CONCEPT) |
| ChatMessage | 1 год после закрытия ChatSession | очистка, saved summary |
| PublicPortalRequest | 30 дней | очистка |

## 8. Производительность дашборда

В MVP:
- Чтение `MetricAggregate` занимает микросекунды (мало строк).
- Чтение «живых» метрик (sum LLMUsage за сегодня) — с индексом по created_at, миллисекунды.
- Для heavy-пользователей на этапе 3 — включаем materialized views.

## 9. Тесты

- Unit: все recorder-обёртки имеют тесты с фикстурами.
- Integration: проверяем, что после запуска подбора появилась корректная запись в MatchingSessionStats.
- E2E: дашборд доступен, показывает ненулевые значения после smoke-теста.

## 10. Доступ к метрикам

- Админ workspace видит свои метрики.
- Супер-админ ISMeta (роль `instance_admin`) видит все workspace.
- Сметчик — только связанные с его сметами (фильтр по user_id в некоторых разрезах).
- Метрики в публичном режиме никому не показываются в UI (только логи и админ-дашборд).

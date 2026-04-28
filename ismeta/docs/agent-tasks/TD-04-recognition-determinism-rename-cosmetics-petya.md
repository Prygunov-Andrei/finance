# ТЗ: TD-04 — Recognition determinism + env var rename + P2 cosmetics (IS-Петя)

**Команда:** IS-Петя.
**Ветка:** `recognition/td-04-determinism-rename-cosmetics`.
**Worktree:** `ERP_Avgust_is_petya_td_04` (создан Tech Lead'ом от `origin/main` @ `e1a6f02`).
**Приоритет:** 🟡 TD batch (после Spec-4 финиша E20-2).
**Срок:** ~1 день.

---

## Контекст

E20-2 финиш: Spec-4 99.92% по count (1251/1250), 86/87 страниц exact-match. Остался 1 phantom на стр 10 — LLM nondeterminism (run-to-run «Дроссель клапан 400х300» split на 2 row'а).

Этот TD-batch закрывает:
1. **Determinism** — найти и устранить причину run-to-run вариативности.
2. **Env var rename** — `OPENAI_API_KEY` → `LLM_API_KEY` (унаследованное имя из времён только OpenAI; сейчас работает с DeepSeek).
3. **P2 cosmetics** — Class J/G/I/N/O из AUDIT-TRACKER.md (count=0, мелкие quality issues).

3 задачи, **отдельные коммиты** в одной ветке.

---

## Задача 1 — Investigation + fix LLM nondeterminism

### Симптом

На стр 10 Spec-4 run-to-run даёт ±1 item. Запускаешь recognition на одном и том же PDF два раза — получаешь 1250 vs 1251 items. Разница — split «Дроссель клапан 400х300» на 2 phantom row.

На стр 87 Петя в отчёте Task 3 заметил тот же класс — полная переразбивка items run-to-run.

### Что НЕ является причиной

`temperature=0` уже стоит default в `recognition/app/providers/openai_vision.py:128` (chat completion) и `:207` (vision). Вызовы LLM передают `"temperature": temperature` в payload.

### Кандидаты на root cause (расследовать в порядке)

1. **DeepSeek thinking mode** — мы используем `deepseek-v4-pro` с `LLM_THINKING_MODE=enabled` и `LLM_THINKING_EFFORT=high`. CoT-reasoning внутри модели сам по себе может быть стохастичным. **Гипотеза самая вероятная** — thinking_effort=high особенно «творческий».
2. **Отсутствие `seed` parameter** — OpenAI API поддерживает `seed: int` для deterministic completions. DeepSeek API скорее всего тоже (compatible). Если не передаём — каждый run новый seed.
3. **`top_p` дефолт** — мы передаём `temperature=0` но НЕ `top_p`. Default top_p может быть 1.0 или 0.95 — sampling всё ещё происходит из top tokens.
4. **Multiple LLM calls без барьера** — в `spec_parser.py` Phase 3 запускается параллельно через `asyncio.Semaphore(LLM_MAX_CONCURRENCY=3)`. Order of completion может влиять (но это для разных страниц, не должно давать different output для одной страницы).
5. **Random shuffling в bbox extraction** — не должно быть, но проверить (особенно после E20-1 cluster-merge с set/dict ordering).

### План расследования

1. Запустить **3 раза** одну и ту же страницу 10 spec-4 PDF через LLM directly (без bbox pipeline) — посмотреть, дают ли ответы byte-identical.
2. Если **не identical** → проблема в LLM API. Кандидаты:
   - Добавить `"seed": 42` в payload `_post_with_retry` (chat completion). Перезапустить — стало deterministic?
   - Добавить `"top_p": 0.0` к temperature=0. Стало deterministic?
   - Отключить `LLM_THINKING_MODE` для одного теста — стало deterministic? (Это потеря качества — фиксить нельзя, но даст диагностику.)
3. Если **identical** → проблема в bbox extraction или post-process. Запустить через `extract_structured_rows` на странице 10 три раза, сравнить outputs.

### Ожидаемый fix

Скорее всего: добавить `"seed": <hashing of pdf content + page_number>` в payload (deterministic per-page). Этого достаточно для repeatability.

Если DeepSeek **не уважает seed** в thinking mode — документировать как known limitation в `docs/recognition/known-issues.md` с примером и mitigation (multi-run averaging or PDF-pre-hash caching).

### Tests

- `test_run_to_run_repeatability_page_10_spec4` — synthetic test с фиксированным seed и проверкой что 2 последовательных вызова дают **identical items** (по name/qty/unit/model).
- Альтернативно (если LLM-моки сложны): integration test с `LLM_API_KEY=test-deterministic-mock`.

### Регресс-query

```sql
-- Запустить Spec-4 дважды (job1, job2), проверить что items pixel-perfect совпадают
WITH a AS (SELECT items FROM recognition_jobs_recognitionjob WHERE id='<JOB1>'),
     b AS (SELECT items FROM recognition_jobs_recognitionjob WHERE id='<JOB2>')
SELECT
  jsonb_array_length(a.items) AS count_a,
  jsonb_array_length(b.items) AS count_b,
  (a.items = b.items) AS items_identical
FROM a, b;
```

После fix: `count_a = count_b = 1250` (или 1251), `items_identical = true`.

---

## Задача 2 — Env var rename `OPENAI_API_KEY` → `LLM_API_KEY`

### Контекст

Унаследованное имя `OPENAI_API_KEY` confuses агентов и PO («какого OpenAI? мы же на DeepSeek!»). Нужно переименовать на нейтральное `LLM_API_KEY` без потери совместимости.

### Что нужно сделать

В `recognition/app/config.py`:

```python
class Settings(BaseSettings):
    # NEW: основной env var
    llm_api_key: str = ""
    # OLD: alias для backward compat (читать обе, использовать llm_api_key)
    openai_api_key: str = ""  # deprecated, removed in N+2

    @model_validator(mode="after")
    def _resolve_api_key(self) -> "Settings":
        if not self.llm_api_key and self.openai_api_key:
            self.llm_api_key = self.openai_api_key
        return self
```

В `recognition/app/providers/openai_vision.py`:
- Поменять `settings.openai_api_key` → `settings.llm_api_key`.
- В docstring провайдера указать что переменная теперь общая для OpenAI/DeepSeek/Claude.

В `ismeta/.env.example`:
- Добавить `LLM_API_KEY=` секцию с комментарием «# OpenAI/DeepSeek/Claude API key (compatible)».
- Оставить `OPENAI_API_KEY=` как `# DEPRECATED: use LLM_API_KEY (alias for backward compat)`.

В `docker-compose.yml` (ismeta):
- В `recognition` service: добавить `- LLM_API_KEY=${LLM_API_KEY:-${OPENAI_API_KEY}}` (чтобы читать новое имя, fallback на старое).

В `recognition/tests/conftest.py`:
- `os.environ.setdefault("LLM_API_KEY", "test-key")` дополнительно к существующему `OPENAI_API_KEY`.

### Tests

- `test_settings_reads_llm_api_key_directly` — set LLM_API_KEY, OPENAI_API_KEY пуст. settings.llm_api_key должен быть set.
- `test_settings_falls_back_to_openai_api_key` — set OPENAI_API_KEY, LLM_API_KEY пуст. settings.llm_api_key должен взять старое значение.
- `test_settings_prefers_new_var_over_old` — оба set. llm_api_key выигрывает.

### Документация

В CHANGELOG.md или `docs/recognition/migration-llm-api-key.md`:
- Описать deprecation timeline: alias работает в текущей и следующей minor versions, удалится в N+2.
- Migration guide: «обновите .env с OPENAI_API_KEY=... на LLM_API_KEY=..., оставьте оба для совместимости».

---

## Задача 3 — P2 cosmetics (Class J/G/I/N/O)

Все классы из `ismeta/docs/spec4-audit/AUDIT-TRACKER.md`. Count=0, но quality улучшит.

### Class J — PUNCTUATION_DRIFT

```
КЛОП-2(90)-НО-700х500, МВ/S(220)-К  → должно быть КЛОП-2(90)-НО-700х500-МВ/S(220)-К
```

Запятая `, ` в model между размером и `МВ/S(...)` — заменить на `-`.

В `recognition/app/services/spec_postprocess.py`:

```python
_KLOP_DRIFT_RE = re.compile(r"(КЛОП-\d+\([^)]+\)-(?:НО|НЗ)-[^\s,]+),\s*(МВ/S)")

def _fix_klop_punctuation_drift(model: str) -> str:
    return _KLOP_DRIFT_RE.sub(r"\1-\2", model)
```

Применять в `apply_postprocess` перед dedup'ом.

### Class G — TRAILING_HYPHEN

Word-break не закрыт continuation: `«каширо-»` в name остаётся вместо `«кашированный»`.

Уже частично закрыто `_DASH_SPACE_MERGE_RE` в `_merge_name_parts` (закрыто в E20-1 retrofit). Если в финальном name остался trailing hyphen — попробовать удалить (это обрыв слова без продолжения).

```python
def _trim_trailing_hyphen(name: str) -> str:
    # «слово-» в конце → «слово» (обрыв без продолжения)
    return re.sub(r"(\S)-\s*$", r"\1", name)
```

### Class I — MODEL_INJECTED_INTO_NAME

LLM дописывает `(модель: …)` в name дублируя model_name (стр 3 Spec-4 item #31).

```python
def _strip_injected_model_suffix(name: str, model_name: str) -> str:
    # «...установка ... (модель: RL/159485/П3В3 v7)» → «...установка ...»
    if not model_name:
        return name
    pattern = re.compile(rf"\s*\(модель:\s*{re.escape(model_name.strip())}\)\s*$", re.IGNORECASE)
    return pattern.sub("", name).strip()
```

### Class N — DIGIT_DUPLICATION

`6400/6400` → `6400/64000` в name (стр 23). Цифра дублируется в конце второй части.

```python
_DIGIT_DUP_RE = re.compile(r"(\d+)/(\d{4,})(\d)")

def _fix_digit_duplication(name: str) -> str:
    """6400/64000 → 6400/6400 если первое число == второе без последней цифры"""
    def repl(m):
        first, middle, last = m.group(1), m.group(2), m.group(3)
        if first == middle[:len(first)] and middle[len(first):] + last == last + last[:-1]:
            return f"{first}/{middle[:-1]}{last}"  # отрезать дубль
        return m.group(0)
    return _DIGIT_DUP_RE.sub(repl, name)
```

(Логика подкорректируй под реальный pattern — проверь на стр 23 Spec-4.)

### Class O — MODEL_TRAILING_DASH_NO_DIGITS

`КЛОП-2(90)-НО-1700х` (без числа после `х`). Стр 28 item #476.

В `pdf_text.py`:
```python
def _detect_model_truncated_no_digits(model: str) -> bool:
    return bool(re.search(r"-(?:Ø|х|x)$|(?:Ø|х|x)\s*$", model))
```

Если detected — попробовать поискать число в pre-LLM bbox row на следующей строке (next y < 20pt) И склеить.

Если не находим — оставить как есть, но **mark item with `model_truncated=true` flag** для PO внимания. UI ismeta-frontend может показать иконку «модель неполная — проверьте».

### Tests

Минимум 1 unit test на каждый класс. Можно сгруппировать в `class TestP2Cosmetics` в `tests/test_spec_postprocess.py`.

Регресс-query (на job 30912542 или новом):
```sql
SELECT
  count(*) FILTER (WHERE i->>'model_name' ~ 'КЛОП-\d+\([^)]+\)-(?:НО|НЗ)-[^,]+,\s*МВ/S') AS class_j,
  count(*) FILTER (WHERE i->>'name' ~ '\S-\s*$') AS class_g,
  count(*) FILTER (WHERE i->>'name' ~ '\(модель:[^)]+\)\s*$') AS class_i,
  count(*) FILTER (WHERE i->>'name' ~ '\d+/\d{5,}') AS class_n,
  count(*) FILTER (WHERE i->>'model_name' ~ '-(?:Ø|х|x)$|(?:Ø|х|x)\s*$') AS class_o
FROM recognition_jobs_recognitionjob, jsonb_array_elements(items) i
WHERE id='<NEW_JOB_ID>';
```

Цель: все 5 счётчиков **0** или ≤2.

---

## DoD

- [ ] Задача 1: investigation report + fix (или documented limitation в docs/).
- [ ] Задача 1: repeatability test зелёный (run × 2 = identical items).
- [ ] Задача 2: env var rename, alias для backward compat работает, миграция документирована.
- [ ] Задача 3: 5 P2 fixes реализованы, по unit-test на каждый.
- [ ] Все goldens (text-layer + LLM где есть) — зелёные.
- [ ] Live-прогон Spec-4: count = 1250 ± 1, все P2 regression-queries ≤ 2.
- [ ] PR в main с описанием 3 коммитов и таблицей до/после по P2 классам.

---

## Threshold для merge

- **Determinism fix** (Задача 1): желателен но не блокер. Если DeepSeek thinking не поддерживает seed — задокументируй ограничение, мерж проходит без strict assertion.
- **Rename** (Задача 2): обязательно работающий backward compat (старые .env читаются).
- **P2 cosmetics** (Задача 3): желательно все 5, но если какой-то класс окажется сложным — документируй и оставь для следующего sprint'а.

---

## Подсказки

### Worktree уже создан Tech Lead'ом

```
/Users/andrei_prygunov/obsidian/avgust/ERP_Avgust_is_petya_td_04
```

Ветка `recognition/td-04-determinism-rename-cosmetics` от `origin/main` @ `e1a6f02`.

### Перед PR

```bash
cd /Users/andrei_prygunov/obsidian/avgust/ERP_Avgust_is_petya_td_04
git fetch origin
git rebase origin/main
git log main..HEAD  # должны быть только твои коммиты
```

### Рекомендуемый порядок коммитов

1. `feat(recognition): TD-04 — determinism (seed/top_p/thinking-mode investigation)`
2. `feat(recognition): TD-04 — rename OPENAI_API_KEY → LLM_API_KEY (alias для backward compat)`
3. `feat(recognition): TD-04 — P2 cosmetics (Class J/G/I/N/O)`

После каждого коммита — прогон unit + text-layer goldens.

### После мержа

Tech Lead удалит worktree.

---

🚀 Удачи!

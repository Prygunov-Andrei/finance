# Recognition — known issues и ограничения

Документ фиксирует non-blocker-ограничения recognition-сервиса с workaround'ами.
Закрытые issues переезжают в ADR / changelog.

---

## TD-04: DeepSeek thinking-mode игнорирует seed

**Симптом.** На Spec-4 run-to-run даёт ±1 phantom item на стр 10/87.
«Дроссель клапан 400х300» в одной попытке остаётся одной row, в другой
splittится на 2 phantom-row.

**Root cause (расследование TD-04).** В payload уже идут `temperature=0`,
`top_p=0`, `seed=42` (см. `_apply_determinism_params`). Для OpenAI gpt-5.x
этого достаточно. DeepSeek V4 thinking-mode (`thinking.type=enabled` +
`reasoning_effort=high`) генерит CoT-stream до content; внутри reasoning
семплинг идёт со своими параметрами, которые seed не контролирует
полностью. Результат — different reasoning paths → different content на
1–2% запросов.

**Mitigation.**

- На production-моделях (gpt-5.x OpenAI) проблемы нет — детерминизм
  fix покрыт `seed`+`top_p`.
- На DeepSeek thinking-mode — known limitation. Live-runs детерминированы
  на ~99% страниц; для 1–2% страниц возможен ±1 item run-to-run.
- Если строгий детерминизм критичен (regression-suite, CI golden) — отключить
  thinking-mode через `LLM_THINKING_MODE=disabled` и `LLM_THINKING_EFFORT=""`.
  Цена: −2–4% recall на сложных страницах ОВиК.

**Не блокирует.** Spec-4 финиш E20-2 показал 1251/1250 (99.92%) count и
86/87 страниц exact-match. Phantom item на стр 10 — единственный
«пограничный» случай, который может flapпать ±1.

**Источники.**

- Расследование: `ismeta/docs/agent-tasks/TD-04-recognition-determinism-rename-cosmetics-petya.md`.
- DeepSeek docs: https://api-docs.deepseek.com/guides/thinking_mode (раздел
  «Determinism»).

---

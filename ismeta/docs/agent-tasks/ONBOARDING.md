# Онбординг для AI-программистов проекта ISMeta

Это единый контекст для IS-Пети (backend) и IS-Феди (frontend). Читается **первым делом** при старте новой сессии — до открытия ТЗ.

---

## 1. Кто ты и с кем работаешь

Ты — **AI-программист** в команде проекта **ISMeta**. Работаешь автономно в изолированной Claude-сессии со своим git worktree.

**Команда:**
- **PO (Product Owner):** Андрей — руководитель ERP «Август Климат». Принимает продуктовые решения, ведёт тестирование (QA-цикл 10 заходов). Не программист, но понимает технологии. Русский язык.
- **Claude (Tech Lead):** работает в другой Claude-сессии, формирует ТЗ, ревьюит твои PR-отчёты, мержит в `main`. С тобой напрямую **не общается** — всё через PO.
- **IS-Петя:** AI-backend-программист (Python / Django / DRF / FastAPI / pytest).
- **IS-Федя:** AI-frontend-программист (TypeScript / Next.js 16 / React / vitest).

На `main` параллельно работает **вторая команда** — AC Rating (AC-Петя + AC-Федя). Их территория описана в корневом `CLAUDE.md`. В неё не заходи.

## 2. Что за проект

ISMeta — ERP-подсистема для составления смет по проектам ОВиК (отопление-вентиляция-кондиционирование) и слаботочным системам. Ключевая фича — **автоматическое распознавание PDF-спецификаций** и Счетов/КП от поставщиков → автоматическое формирование сметы.

**Архитектура сервисов (docker-compose в `ismeta/`):**
- `ismeta-frontend` — Next.js (port 3001) — UI смет.
- `ismeta-backend` — Django + DRF (port 8001) — бизнес-логика, CRUD смет.
- `recognition` — standalone FastAPI (port 8003) — парсинг PDF через гибрид bbox text-layer extraction + LLM normalization + Vision fallback.
- `ismeta-postgres` (5433), `ismeta-redis` (6380).

**PDF-парсинг (Recognition):** `pdf_text.py::extract_structured_rows` вытаскивает bbox-rows → LLM (gpt-5.2) нормализует в `items` (name/model/qty/comments) → post-process (merge continuation, sticky cap, bbox-restore) → response со `pages_summary` для detection потерь.

## 3. Текущий момент (2026-04-24)

Идёт **QA-цикл 10 заходов PO**:
- PO прогоняет 10 PDF-спецификаций через UI и пишет детальный отчёт по каждой.
- После каждого захода — findings → root causes → фиксы.
- **Заход 1/10 закрыт** (153/153 items на spec-ov2, main @ `f1fa6a3`).
- **Заход 2/10 — в процессе у PO.** Пока он тестирует — мы закрываем follow-up задачи из DEV-BACKLOG.

**Мастер-трекер цикла:** `ismeta/docs/QA-CYCLE-10-ROUNDS.md` (прочитай если нужен контекст про фиксы за последние дни).
**DEV-BACKLOG:** `ismeta/docs/DEV-BACKLOG.md` (список tech debt, нумерованы #1..#29).
**ADR:** `ismeta/docs/adr/` (архитектурные решения).

## 4. Процесс работы

1. **Своя сессия Claude + свой git worktree.** Тебе выдают путь вроде `/Users/andrei_prygunov/obsidian/avgust/ERP_Avgust_is_petya_<task>` — в нём ветка от свежего `origin/main`.
2. **Читаешь ONBOARDING + ТЗ → делаешь → коммитишь в свою ветку → пишешь отчёт по формату из ТЗ.**
3. PO переносит отчёт Claude-лиду. Claude ревьюит, просит доработать или мержит.
4. **Ты не пушишь в main напрямую.** Только в свою ветку (`git push origin <branch>`).
5. **На отчёт ревью может прийти «переделай X»** — делаешь, коммитишь поверх, второй раунд отчёта.

## 5. Конвенции кода

- **Строгий review:** ВСЕ замечания блокирующие, нет «для MVP ок» (см. `CLAUDE.md` → memory feedback_strict_review).
- **Тесты обязательны** для любого нового кода. Coverage ≥ 80% на новом.
- **Type check + lint** — клин обязательно:
  - Backend (ismeta/backend): `mypy apps/<app>/`, `ruff check apps/<app>/`.
  - Recognition: `mypy app/`, `ruff check app/ tests/`.
  - Frontend: `npx tsc --noEmit`, `npm run lint`.
- **Commit-сообщение:** императив, scope в скобках, Co-authored-by футер:

  ```
  fix(ismeta/backend): короткий summary

  Детали что сделал и почему.

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  ```

- **Не используй `--no-verify` / `--no-gpg-sign`** чтобы обойти pre-commit hooks. Если hook падает — разбираться.

## 6. Правила бизнес-логики (важно!)

- **Смета = точная копия PDF** — не дедуплицируй, одинаковые позиции из разных разделов оставляй отдельными (это product rule PO).
- **Все новые поля items хранятся в `tech_specs: jsonb`** (model_name, brand, manufacturer, comments, system_prefix, source_page). Не расширяй модель EstimateItem новыми column'ами без согласования.
- **Работа с OpenAI / Recognition:** не добавляй HTTP-обёртки между контейнерами сверх существующих. Если нужен новый канал — пинг PO.

## 7. Shared файлы (пинг PO перед правкой)

Обе команды на main → некоторые файлы трогают обе. Перед правкой — **предупреди в отчёте**:
- `backend/finans_assistant/settings.py`
- `backend/finans_assistant/urls.py`
- корневой `docker-compose.yml` (не `ismeta/docker-compose.yml` — это наш)
- `.env.example`
- `frontend/app/globals.css`, `frontend/app/layout.tsx` — **никто не трогает**.
- корневой `CLAUDE.md`.

## 8. Git worktree lifecycle

- Worktree тебе уже создан, не делай `git worktree add` сам.
- Работай **в нём** (cd — и ты там). CWD не меняется в течение сессии — если перезапускают сессию на другой worktree, нужен ручной `exit`+`cd`+`claude`.
- `git log --oneline -5` покажет baseline от которого ты работаешь (обычно `origin/main` последний hash).

## 9. Recognition: особенность деплоя

`recognition/` **не имеет** mount volume в контейнер — код встроен в образ при build. Это значит **после правки `recognition/*.py`** нужно:

```bash
docker compose -f ismeta/docker-compose.yml build recognition
docker compose -f ismeta/docker-compose.yml up -d --force-recreate recognition
```

(для ismeta-backend и ismeta-frontend hot-reload работает сам через bind-mount, правки подхватываются без rebuild).

## 10. OPENAI_API_KEY — gotcha

Ключ в `ismeta/.env` (gitignored). docker-compose читает `env_file: .env`. **ВАЖНО:** если в shell экспортирован `OPENAI_API_KEY` — он **перекрывает** `.env`. Для запуска recognition через compose используй:

```bash
env -u OPENAI_API_KEY docker compose -f ismeta/docker-compose.yml up -d --force-recreate recognition
```

Иначе контейнер может взять старый ключ (отозван после пополнения баланса 2026-04-23).

## 10b. LLM Profiles (E18-2) — генерация ключа Fernet

После E18-2 в БД лежит модель `LLMProfile` с зашифрованным `api_key`. Для шифрования
требуется `LLM_PROFILE_ENCRYPTION_KEY` в `ismeta/.env` (gitignored).

Генерация (один раз на инсталляцию):

```bash
docker exec ismeta-backend python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Полученное значение положить в `ismeta/.env` под ключом `LLM_PROFILE_ENCRYPTION_KEY=...`,
затем `docker compose restart ismeta-backend recognition-worker`.

**ВАЖНО:** смена ключа делает ВСЕ существующие зашифрованные `api_key_encrypted` в
таблице `llm_profile` нечитаемыми (CRUD `LLMProfile` возвращает 500). Для rotate
сначала создать новые профили на новом ключе, удалить старые.

API-эндпоинты (контракт frontend, `/api/v1`):
- `GET/POST /llm-profiles/`
- `PATCH/DELETE /llm-profiles/{id}/`
- `POST /llm-profiles/{id}/set-default/`
- `GET /llm-profiles/default/`
- `POST /llm-profiles/test-connection/` — проверяет `GET base_url/v1/models` с переданным ключом

Использование в `import-pdf`: FormData принимает `llm_profile_id` (опционально). Без
него recognition использует defaults из своего `.env`.

## 11. Полезные команды

```bash
# Тесты backend
cd ismeta/backend && python -m pytest apps/estimate/tests/ -x

# Тесты recognition
docker exec ismeta-recognition pytest tests/ -x --ignore=tests/test_parse_spec.py --ignore=tests/test_parse_invoice.py --ignore=tests/test_parse_quote.py --ignore=tests/test_probe.py
# (endpoint-тесты падают pre-existing на 401, не в scope любой задачи)

# Тесты frontend
cd ismeta/frontend && npm test

# Живой curl recognition
curl -s -X POST http://localhost:8003/v1/parse/spec \
  -H "X-API-Key: dev-recognition-key" \
  -F "file=@ismeta/tests/fixtures/golden/spec-ov2-152items.pdf" -o /tmp/r.json

# Проверить активную модель в recognition
docker exec ismeta-recognition python -c "from app.config import settings; print(settings.llm_extract_model)"
```

## 12. Ключевые файлы для ориентации

| Файл | Зачем |
|---|---|
| `CLAUDE.md` (корень) | Общие правила проекта + multi-agent territories |
| `ismeta/docs/QA-CYCLE-10-ROUNDS.md` | История цикла — какие баги уже закрыты |
| `ismeta/docs/DEV-BACKLOG.md` | Tech debt с нумерацией (#1..#29) |
| `ismeta/docs/adr/` | Архитектурные решения |
| `ismeta/docs/agent-tasks/README.md` | Список ТЗ, выполненных и в работе |
| `ismeta/docs/agent-tasks/<твоё_ТЗ>.md` | Твоя конкретная задача |

## 13. Если застрял

- **Не придумывай workaround для падающих тестов** (`--no-verify`, skip, xfail без обоснования).
- **Не меняй shared файлы молча** — в отчёте явно пометь «трогал Х, потому что…».
- **Не расширяй scope** задачи сверх ТЗ. Если видишь что нужно больше — напиши в отчёт «предлагаю follow-up на Y», а делаешь только то что в ТЗ.
- **Если нашёл баг сверх ТЗ** — не фикси по-тихому. В отчёт: «обнаружил в процессе, fix не включён». Тех-лид решит.

## 14. Что делать НЕ надо

- Создавать новые файлы-гайды/README/докменты без просьбы.
- Добавлять эмодзи в код.
- Пушить прямо в `main`.
- Коммитить секреты (`.env`, ключи, токены).
- Скипать hooks через `--no-verify`.
- Запускать мерж миграций / `db migrate` на проде.

---

После прочтения этого файла — открывай своё ТЗ (`ismeta/docs/agent-tasks/<task>.md`), делай работу, пиши отчёт по формату из ТЗ.

Удачи.

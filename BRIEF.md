# BRIEF — AC-Петя — Ф8A backend

## Где ты находишься

- **Рабочая директория:** `/Users/andrei_prygunov/obsidian/avgust/ERP_Avgust_ac_petya_f8a/`
- **Ветка:** `ac-rating/f8a-backend` (создана от `main` @ `c62ae4f`)
- **Worktree:** изолированный checkout, не пересекается с другими агентами и основной директорией Андрея.

## Кто ты

**AC-Петя** — backend-разработчик команды AC Rating. Работает на Django + DRF + Postgres. Текущая задача — backend для Ф8A (см. `TASK.md`).

## Правила worktree

1. **НЕ переключайся** в другой git checkout — сиди в этом worktree до конца задачи.
2. **НЕ пушь напрямую в `main`.** Все коммиты — только в свою ветку `ac-rating/f8a-backend`.
3. **Перед push:** `git fetch origin && git rebase origin/main` (main движется быстро — в параллели работает команда ISMeta).
4. **При правке shared-файлов** — пинг в чат к Claude (техлид) ДО коммита. Shared:
   - `backend/finans_assistant/settings.py`
   - `backend/finans_assistant/urls.py`
   - `docker-compose.yml`, `.env.example`
5. **НЕ трогай** территорию ISMeta+Recognition: `recognition/`, `ismeta/`, `backend/ismeta_integration/`, `backend/payments/services/{invoice_service,recognition_client}.py`, `backend/llm_services/services/{specification_parser,document_parser}.py`.
6. **Conventional Commits:** `feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`. Маленькие осмысленные коммиты.
7. **Тесты пишешь сам** (не агент QA). Без них задача не считается done.
8. **Code style:** см. CLAUDE.md в корне репо.

## Как сдавать работу

После завершения задачи — отчёт в чат Андрею (он передаст Claude), включающий:

1. **Имя ветки + коммиты** (`git log --oneline main..HEAD`).
2. **Что сделано** — bullet-list по пунктам TASK.md.
3. **Что НЕ сделано и почему** — если есть. Не молчи о пропусках.
4. **Результаты прогонов** — `pytest backend/ac_*/`, `pytest backend/ -k "rating"`, `python manage.py check`.
5. **Известные риски** — что может сломаться у других агентов / на проде.
6. **Ключевые файлы** для ревью — пути, чтобы Claude быстро прошёл diff.

После отчёта — НЕ мерж сам. Claude проведёт ревью, если ОК → смержит сам с `--no-ff` от имени Андрея.

## Что почитать ДО старта

1. `TASK.md` (рядом с этим файлом) — детальное ТЗ.
2. `CLAUDE.md` в корне репо — правила проекта (multi-agent collaboration, code patterns).
3. `ac-rating/tz/F8-admin-ui-rewrite.md` — общий план Ф8 (зачем переписываем, что в Ф8A vs Ф8B/C/D).
4. `ac-rating/tz/04b-admin-xlsx.md` — что мы переносим из Django-admin (что было раньше).
5. `backend/ac_catalog/models.py` — основная модель `ACModel` со всеми полями.
6. `backend/ac_catalog/serializers.py` — публичные сериализаторы (extends их с writable полями).
7. `backend/ac_catalog/public_urls.py` + `views/` — образец публичных endpoints.
8. `backend/hvac_bridge/permissions.py` — permission `IsHvacAdminProxyAllowed` который используем.

## Контакты

Технические вопросы — в чат к Claude через Андрея. **Не угадывай** при сомнении: ТЗ может оказаться устаревшим / противоречивым (так бывало). Лучше переспроси.

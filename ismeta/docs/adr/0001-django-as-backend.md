# ADR-0001. Backend на Django 5 (не FastAPI)

- **Статус:** Accepted
- **Дата:** 2026-04-15

## Контекст

Выбираем стек backend для ISMeta с нуля. Альтернативы:
- **Django 5 + DRF** — тот же стек, что в текущем ERP.
- **FastAPI + SQLAlchemy 2** — современный ASGI-фреймворк.
- **Django для моделей + DRF-или-FastAPI адаптер** — гибрид.

В текущем ERP — Django. Модуль `backend/estimates/` весит 16 000 LOC и работает.

## Решение

Django 5 + DRF + Celery + PostgreSQL + Redis.

## Обоснование

- **Переиспользование кода:** мы переносим логику matching, markup, excel_exporter из ERP. На Django они уже работают, перенос в FastAPI = переписывание с нуля.
- **Команда знает.** ERP-разработчики уже пишут на Django; контекст-свитч не нужен.
- **DRF даёт из коробки:** pagination, filters, permissions, serializers, auto-OpenAPI через drf-spectacular.
- **Django-admin** — бесплатный бэкофис для служебных задач и отладки.

## Последствия

- **Плюс:** быстрый старт, меньше рисков, переиспользование тестов из ERP.
- **Минус:** Django менее производителен на async-нагрузке, чем FastAPI. Не критично, пока нагрузка небольшая.
- **Отложенный переход:** если упрёмся в производительность — можем переписать hot-path на FastAPI; модели Django остаются.

## Связанные документы

- [`specs/04-llm-agent.md`](../../specs/04-llm-agent.md) — где ASGI и SSE действительно нужны; обрабатываются через Django + Channels или отдельный ASGI-фреймворк при необходимости.
- [`specs/06-migration-plan.md`](../../specs/06-migration-plan.md) — что именно переносим из ERP.

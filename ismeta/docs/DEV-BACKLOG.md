# DEV Backlog — задачи для улучшения dev-ergonomics

Не бизнес-фичи — боль разработчиков/агентов при локальной работе.

## Средний приоритет

### 1. seed_dev_data: обогатить tech_specs
- Сейчас `seed_dev_data` создаёт items с `tech_specs={}` у всех 5 позиций.
- Из-за этого ручную проверку UI-02 (brand/model/подстроки) нельзя сделать сразу после `make ismeta-seed` — нужно вручную лезть в БД и UPDATE.
- Что доделать: в команде `seed_dev_data` добавить для 3–5 items в тестовую смету разные комбинации:
  - оба поля: `{"brand": "MOB", "model_name": "MOB2600/45-3a", "flow": "2600 м³/ч"}`
  - только model: `{"model_name": "500x400"}`
  - только brand: `{"brand": "ExtraLink"}`
  - пустой (для контроля негативного кейса): `{}`
- Один item — с дополнительными произвольными полями (flow/power/class/cooling) — чтобы tooltip tech_specs тоже было чем тестировать.
- Реализация: `backend/apps/estimates/management/commands/seed_dev_data.py` — в цикле создания items прописать `tech_specs=...`.

## Записано
- 2026-04-20: seed_dev_data tech_specs (UI-03 review, Федя)

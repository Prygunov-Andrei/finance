# API сервиса фиксации работ

**Базовый URL**: `/api/v1/`  
**Аутентификация**: JWT Bearer (кроме `auth/telegram/`)  
**Формат**: JSON  
**Обновлено**: Февраль 2026

---

## Аутентификация

### POST `/worklog/auth/telegram/`

Аутентификация через Telegram Mini App initData. Не требует JWT.

**Request:**
```json
{
  "init_data": "query_id=AAE...&user=%7B%22id%22%3A12345...&hash=abc123..."
}
```

**Response 200:**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "worker": {
    "id": "uuid",
    "telegram_id": 123456789,
    "name": "Иван Иванов",
    "phone": "+79001234567",
    "photo_url": "",
    "role": "worker",
    "language": "ru",
    "contractor": 1,
    "contractor_name": "ООО Строй",
    "bot_started": true,
    "created_at": "2026-02-01T10:00:00Z",
    "updated_at": "2026-02-01T10:00:00Z"
  }
}
```

**Ошибки:**
- `400` — невалидная подпись initData
- `404` — Worker не найден (не зарегистрирован в системе)

---

## Workers (Монтажники)

### GET `/worklog/workers/`

Список монтажников. Фильтры: `role`, `language`, `contractor`, `bot_started`. Поиск: `name`, `phone`.

### POST `/worklog/workers/`

Создание монтажника.

```json
{
  "telegram_id": 123456789,
  "name": "Иван Иванов",
  "phone": "+79001234567",
  "role": "worker",
  "language": "ru",
  "contractor": 1
}
```

### GET/PUT/PATCH/DELETE `/worklog/workers/{id}/`

CRUD операции над монтажником.

---

## Supergroups (Супергруппы)

### GET `/worklog/supergroups/`

Фильтры: `object`, `contractor`.

### POST `/worklog/supergroups/`

```json
{
  "object": 1,
  "contractor": 1,
  "telegram_group_id": -1001234567890,
  "invite_link": "https://t.me/+abc123"
}
```

---

## Shifts (Смены)

### GET `/worklog/shifts/`

Фильтры: `object`, `contractor`, `status`, `date`, `shift_type`. Поиск: `object__name`.

**Response включает** аннотации: `registrations_count`, `teams_count`.

### POST `/worklog/shifts/`

```json
{
  "object": 1,
  "contractor": 1,
  "date": "2026-02-07",
  "shift_type": "day",
  "start_time": "09:00",
  "end_time": "18:00"
}
```

### GET `/worklog/shifts/{id}/registrations/`

Список регистраций на смену.

### POST `/worklog/shifts/{id}/register/`

Регистрация монтажника на смену (из Mini App). Требует JWT.

```json
{
  "qr_token": "abc123",
  "latitude": 55.7558,
  "longitude": 37.6173
}
```

**Response 201:**
```json
{
  "id": "uuid",
  "shift": "uuid",
  "worker": "uuid",
  "worker_name": "Иван Иванов",
  "registered_at": "2026-02-07T09:05:00Z",
  "geo_valid": true
}
```

**Ошибки:**
- `400` — смена не активна
- `404` — Worker не найден
- `409` — уже зарегистрирован

---

## Teams (Звенья)

### GET `/worklog/teams/`

Фильтры: `object`, `shift`, `status`, `is_solo`, `contractor`. Включает `memberships` (вложенные) и `media_count`.

### POST `/worklog/teams/`

Создание звена.

```json
{
  "shift_id": "uuid",
  "member_ids": ["uuid1", "uuid2", "uuid3"],
  "brigadier_id": "uuid"
}
```

**Response 201:** Полный TeamSerializer с memberships.

---

## Media (Медиа)

### GET `/worklog/media/`

Фильтры: `team`, `report`, `author`, `media_type`, `tag`, `status`. Поиск: `text_content`.

### GET/PUT/PATCH `/worklog/media/{id}/`

---

## Reports (Отчёты)

### GET `/worklog/reports/`

Фильтры: `team`, `shift`, `report_type`, `trigger`, `status`.

**Список** использует `ReportListSerializer` (без вложенных медиа).  
**Детальный** `GET /reports/{id}/` включает `media_items`.

### POST `/worklog/reports/`

---

## Questions (Вопросы)

### GET `/worklog/questions/`

Фильтры: `team`, `report`, `asked_by`, `question_type`, `status`. Включает вложенные `answers`.

### POST `/worklog/questions/{id}/answer/`

Ответить на вопрос.

```json
{
  "answered_by": "uuid",
  "answer_text": "Да, всё верно"
}
```

---

## Work Journal (Журнал работ объекта)

### GET `/objects/{object_id}/work-journal/`

Сводка по журналу работ для объекта. Используется ERP-фронтендом.

**Response:**
```json
{
  "total_shifts": 15,
  "active_shifts": 1,
  "total_teams": 8,
  "total_media": 234,
  "total_reports": 12,
  "total_workers": 20,
  "recent_shifts": [
    {
      "id": "uuid",
      "object": 1,
      "object_name": "ЖК Рассвет",
      "date": "2026-02-07",
      "shift_type": "day",
      "status": "active",
      "registrations_count": 12,
      "teams_count": 3
    }
  ]
}
```

---

## Пагинация

Все list-эндпоинты используют `PageNumberPagination` (по умолчанию 20 записей):

```json
{
  "count": 100,
  "next": "http://localhost:8000/api/v1/worklog/shifts/?page=2",
  "previous": null,
  "results": [...]
}
```

---

## Коды ошибок

| Код | Описание |
|-----|----------|
| 200 | Успех |
| 201 | Создано |
| 400 | Ошибка валидации |
| 401 | Не авторизован |
| 404 | Не найдено |
| 409 | Конфликт (дублирование) |

# Модели данных сервиса фиксации работ

**Файл**: `backend/worklog/models.py`  
**Обновлено**: Февраль 2026

Все модели наследуются от `TimestampedModel` (поля `created_at`, `updated_at`).  
Все первичные ключи — UUID v4.

---

## Схема связей

```
Counterparty (accounting)           Object (objects)
      │                                  │
      ├──── Worker ◄────────┐            ├──── Supergroup ──── Counterparty
      │       │              │           │
      ├──── Shift ───────── Object       ├──── Shift
      │       │                          │
      │       ├── ShiftRegistration ── Worker
      │       │
      │       └── Team ──── Object, Shift, Counterparty
      │             │
      │             ├── TeamMembership ── Worker
      │             │
      │             ├── Media ── Worker (author)
      │             │     │
      │             │     └── Report ── Team, Shift
      │             │           │
      │             │           ├── Question ── Team
      │             │           │      │
      │             │           │      └── Answer ── Worker, Media
      │             │           │
      │             │           └── Media.report (FK)
      │             │
      │             └── Question ── Team
```

---

## 1. Worker (Монтажник)

Зарегистрированный работник в системе фиксации работ.

| Поле | Тип | Ограничения | Описание |
|------|-----|-------------|----------|
| `id` | UUID | PK, auto | Уникальный ID |
| `telegram_id` | BigInteger | unique | Telegram user ID |
| `name` | CharField(255) | required | ФИО |
| `phone` | CharField(32) | blank | Телефон |
| `photo_url` | URLField | blank | URL фото профиля |
| `role` | CharField(16) | choices | `worker` / `brigadier` |
| `language` | CharField(4) | choices, default=`ru` | `ru` / `uz` / `tg` / `ky` |
| `contractor` | FK → Counterparty | CASCADE | Исполнитель (контрагент) |
| `bot_started` | Boolean | default=False | Написал /start боту |

**Choices:**
- **Role**: `worker` (Монтажник), `brigadier` (Бригадир)
- **Language**: `ru`, `uz`, `tg`, `ky`

---

## 2. Supergroup (Супергруппа)

Telegram-супергруппа с включённым Forum Mode. Одна супергруппа — один Исполнитель на одном Объекте.

| Поле | Тип | Ограничения | Описание |
|------|-----|-------------|----------|
| `id` | UUID | PK | |
| `object` | FK → Object | CASCADE | Объект |
| `contractor` | FK → Counterparty | CASCADE | Исполнитель |
| `telegram_group_id` | BigInteger | unique | ID группы в Telegram |
| `invite_link` | URLField | blank | Ссылка-приглашение |
| `created_by` | FK → User | SET_NULL, nullable | Кто создал |

**Ограничение**: `unique_together = ('object', 'contractor')`

---

## 3. Shift (Смена)

Рабочая смена на объекте.

| Поле | Тип | Ограничения | Описание |
|------|-----|-------------|----------|
| `id` | UUID | PK | |
| `object` | FK → Object | CASCADE | Объект |
| `contractor` | FK → Counterparty | CASCADE | Исполнитель |
| `date` | DateField | required | Дата смены |
| `shift_type` | CharField(16) | choices, default=`day` | Тип |
| `start_time` | TimeField | required | Время начала |
| `end_time` | TimeField | required | Время окончания |
| `qr_code` | TextField | blank | Данные QR-кода |
| `qr_token` | CharField(128) | unique, blank | Токен для QR-регистрации |
| `status` | CharField(16) | choices, default=`scheduled` | Статус |
| `extended_until` | DateTimeField | nullable | Продление |

**Choices:**
- **ShiftType**: `day`, `evening`, `night`
- **Status**: `scheduled`, `active`, `closed`

---

## 4. ShiftRegistration (Регистрация на смену)

Фиксирует регистрацию монтажника на смену с GPS-данными.

| Поле | Тип | Ограничения | Описание |
|------|-----|-------------|----------|
| `id` | UUID | PK | |
| `shift` | FK → Shift | CASCADE | Смена |
| `worker` | FK → Worker | CASCADE | Монтажник |
| `registered_at` | DateTimeField | auto_now_add | Время регистрации |
| `registered_by` | FK → Worker | SET_NULL, nullable | Кто зарегистрировал |
| `latitude` | Decimal(10,7) | nullable | GPS широта |
| `longitude` | Decimal(10,7) | nullable | GPS долгота |
| `geo_valid` | Boolean | default=False | В геозоне объекта |

**Ограничение**: `unique_together = ('shift', 'worker')` — нельзя зарегистрироваться дважды.

---

## 5. Team (Звено)

Группа монтажников, работающих вместе. Привязана к топику в Telegram-супергруппе.

| Поле | Тип | Ограничения | Описание |
|------|-----|-------------|----------|
| `id` | UUID | PK | |
| `object` | FK → Object | CASCADE | Объект |
| `contractor` | FK → Counterparty | CASCADE | Исполнитель |
| `shift` | FK → Shift | CASCADE | Смена |
| `topic_id` | Integer | nullable | message_thread_id в Telegram |
| `topic_name` | CharField(255) | blank | Название топика |
| `members` | M2M → Worker | through TeamMembership | Участники |
| `brigadier` | FK → Worker | SET_NULL, nullable | Бригадир |
| `status` | CharField(16) | choices, default=`active` | `active` / `closed` |
| `created_by` | FK → Worker | SET_NULL, nullable | Кто создал |
| `is_solo` | Boolean | default=False | Один человек |
| `previous_team` | FK → self | SET_NULL, nullable | Предыдущее звено |

---

## 6. TeamMembership (Участие в звене)

Через-модель для M2M Worker ↔ Team. Хранит историю присоединений/выходов.

| Поле | Тип | Ограничения | Описание |
|------|-----|-------------|----------|
| `id` | UUID | PK | |
| `team` | FK → Team | CASCADE | Звено |
| `worker` | FK → Worker | CASCADE | Монтажник |
| `joined_at` | DateTimeField | auto_now_add | Когда присоединился |
| `left_at` | DateTimeField | nullable | Когда вышел |
| `triggered_report` | FK → Report | SET_NULL, nullable | Отчёт при изменении состава |

---

## 7. Media (Медиа)

Фото, видео, аудио, голосовые, текстовые сообщения от монтажников.

| Поле | Тип | Ограничения | Описание |
|------|-----|-------------|----------|
| `id` | UUID | PK | |
| `team` | FK → Team | CASCADE, nullable | Звено |
| `report` | FK → Report | SET_NULL, nullable | Отчёт (после коммита) |
| `author` | FK → Worker | CASCADE | Автор |
| `message_id` | Integer | nullable | ID сообщения в Telegram |
| `media_type` | CharField(16) | choices | Тип медиа |
| `tag` | CharField(16) | choices, default=`none` | Тег |
| `tag_source` | CharField(16) | choices, default=`none` | Источник тега |
| `file_id` | CharField(512) | blank | Telegram file_id |
| `file_unique_id` | CharField(256) | blank | Telegram file_unique_id |
| `file_url` | URLField | blank | URL в S3 |
| `file_size` | Integer | nullable | Размер в байтах |
| `duration` | Integer | nullable | Длительность (для видео/аудио) |
| `thumbnail_url` | URLField | blank | URL превью |
| `text_content` | TextField | blank | Текст / подпись |
| `exif_date` | DateTimeField | nullable | Дата из EXIF |
| `phash` | CharField(64) | blank | Perceptual hash |
| `status` | CharField(16) | choices, default=`pending` | Статус обработки |

**Choices:**
- **MediaType**: `photo`, `video`, `audio`, `voice`, `document`, `text`
- **Tag**: `none`, `problem`, `supply`, `final_report`
- **TagSource**: `none`, `reaction`, `hashtag`, `manual`
- **Status**: `pending` → `downloaded` → `committed` / `deleted`

---

## 8. Report (Отчёт)

Фиксация (коммит) медиа звена за период.

| Поле | Тип | Ограничения | Описание |
|------|-----|-------------|----------|
| `id` | UUID | PK | |
| `team` | FK → Team | CASCADE | Звено |
| `shift` | FK → Shift | CASCADE | Смена |
| `parent_report` | FK → self | SET_NULL, nullable | Родительский отчёт (для supplement) |
| `report_number` | Integer | default=1 | Номер за смену |
| `report_type` | CharField(16) | choices | Тип |
| `trigger` | CharField(16) | choices | Что вызвало создание |
| `created_by` | FK → Worker | SET_NULL, nullable | Автор |
| `media_count` | Integer | default=0 | Количество медиа |
| `members_snapshot` | JSONField | default=[] | Состав звена на момент |
| `divider_message_id` | Integer | nullable | ID разделителя в Telegram |
| `first_message_id` | Integer | nullable | Первый message_id |
| `last_message_id` | Integer | nullable | Последний message_id |
| `status` | CharField(20) | choices, default=`submitted` | Статус |

**Choices:**
- **ReportType**: `intermediate`, `final`, `supplement`
- **Trigger**: `manual`, `member_change`, `shift_end`, `auto`
- **Status**: `submitted`, `questions_pending`, `completed`

---

## 9. Question (Вопрос)

Уточняющий вопрос к звену/монтажнику.

| Поле | Тип | Ограничения | Описание |
|------|-----|-------------|----------|
| `id` | UUID | PK | |
| `report` | FK → Report | CASCADE, nullable | Отчёт |
| `team` | FK → Team | CASCADE | Звено |
| `asked_by` | CharField(16) | choices | Источник вопроса |
| `asked_by_user` | FK → User | SET_NULL, nullable | Django User автор |
| `target_user` | FK → Worker | SET_NULL, nullable | Адресат |
| `question_text` | TextField | required | Текст |
| `question_type` | CharField(16) | choices, default=`text` | Тип |
| `choices` | JSONField | default=[] | Варианты ответа |
| `message_id` | Integer | nullable | ID сообщения в Telegram |
| `status` | CharField(16) | choices, default=`pending` | Статус |

**Choices:**
- **AskedBy**: `backend_auto`, `office`, `contractor`
- **QuestionType**: `text`, `choice`, `media`, `confirm`
- **Status**: `pending`, `answered`, `expired`

---

## 10. Answer (Ответ)

Ответ на уточняющий вопрос.

| Поле | Тип | Ограничения | Описание |
|------|-----|-------------|----------|
| `id` | UUID | PK | |
| `question` | FK → Question | CASCADE | Вопрос |
| `answered_by` | FK → Worker | CASCADE | Кто ответил |
| `answer_text` | TextField | blank | Текст |
| `answer_media` | FK → Media | SET_NULL, nullable | Медиа-ответ |
| `message_id` | Integer | nullable | ID сообщения в Telegram |

---

## Расширение существующей модели Object

В модель `objects.Object` добавлены поля для геозоны:

| Поле | Тип | Описание |
|------|-----|----------|
| `latitude` | Decimal(10,7) | Широта центра геозоны |
| `longitude` | Decimal(10,7) | Долгота центра геозоны |
| `geo_radius` | Integer, default=500 | Радиус геозоны в метрах |

**Миграция**: `objects/migrations/0004_add_geo_fields.py`

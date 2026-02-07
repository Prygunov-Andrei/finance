# План реализации сервиса фиксации работ

**Обновлено**: 7 февраля 2026  
**Статус**: В разработке

---

## Обзор прогресса

| Этап | Название | Статус | Прогресс |
|------|---------|--------|----------|
| 0 | Инфраструктура | ✅ Запущена | 90% |
| 1 | Backend — модели и API | ✅ Работает | 95% |
| 2 | Telegram Bot | ✅ Код готов | 85% |
| 3 | Telegram Mini App | ✅ Код готов | 90% |
| 4 | ERP Frontend | ✅ Завершён + 35 тестов | 100% |
| 5 | Unit-тесты Backend | ✅ 90 тестов OK + CI | 100% |
| 6 | Unit-тесты Bot + Mini App + ERP | ✅ 109 тестов OK | 100% |
| 7 | Интеграционное и E2E тестирование | ⬜ Не начато | 0% |
| 8 | Доработка и полировка | ✅ Код реализован | 90% |
| 9 | Staging и приёмка | ⬜ Не начато | 0% |
| 10 | Production | ⬜ Не начато | 0% |

---

## Этап 0: Инфраструктура

### Выполнено ✅

- [x] `docker-compose.yml` — Redis 7 + MinIO + createbuckets
- [x] `backend/finans_assistant/celery.py` — конфигурация Celery
- [x] `backend/finans_assistant/__init__.py` — автоимпорт celery_app
- [x] `settings.py` — секции CELERY, WORKLOG_S3, TELEGRAM_BOT_TOKEN
- [x] `requirements.txt` — celery, redis, boto3, imagehash

### Осталось сделать

- [x] **T0.1**: Запустить `docker-compose up -d`, убедиться что Redis и MinIO стартуют ✅ (7 фев 2026)
- [x] **T0.2**: `pip install -r requirements.txt` — установить зависимости ✅ (7 фев 2026)
- [ ] **T0.3**: Проверить подключение Celery: `celery -A finans_assistant inspect ping`
- [ ] **T0.4**: Проверить MinIO Console: http://localhost:9001, bucket `worklog-media` создан
- [ ] **T0.5**: Создать `.env` файл для бота с реальным BOT_TOKEN
- [x] **T0.6**: Создать `.env` файл для mini-app с VITE_API_BASE_URL ✅ (7 фев 2026)

### Тестирование Этапа 0

| ID | Тест | Тип | Что проверяем | Критерий прохождения |
|----|------|-----|---------------|---------------------|
| T0-test-1 | Redis connectivity | Smoke | Подключение к Redis | `redis-cli ping` → `PONG` |
| T0-test-2 | MinIO health | Smoke | MinIO жив | `curl localhost:9000/minio/health/live` → 200 |
| T0-test-3 | MinIO bucket | Smoke | Bucket создан | `mc ls myminio/worklog-media` без ошибок |
| T0-test-4 | Celery ping | Smoke | Celery Worker отвечает | `celery inspect ping` → `pong` |
| T0-test-5 | MinIO upload/download | Функциональный | Загрузка и скачивание файла | Файл скачивается идентичным |
| T0-test-6 | Docker restart | Устойчивость | Данные сохраняются после рестарта | `docker-compose restart` → данные на месте |

### Документация после Этапа 0

- [ ] Обновить `DEPLOYMENT.md` — реальные порты, пароли (если менялись)
- [ ] Добавить в `DEPLOYMENT.md` секцию "Проверка работоспособности инфраструктуры"
- [ ] Зафиксировать версии образов Docker (redis, minio) в документации

---

## Этап 1: Backend — модели и API

### Выполнено ✅

- [x] Модель Object расширена: `latitude`, `longitude`, `geo_radius`
- [x] Миграция `objects/0004_add_geo_fields.py`
- [x] Django app `worklog` создан
- [x] Все 10 моделей реализованы
- [x] Миграция `worklog/0001_initial.py`
- [x] Django Admin — все модели зарегистрированы
- [x] Serializers — полный набор включая TelegramAuthSerializer
- [x] ViewSets — Worker, Supergroup, Shift, Team, Media, Report, Question
- [x] `telegram_auth` — аутентификация через initData
- [x] `work_journal_summary` — сводка для ERP
- [x] Shift.register — регистрация с проверкой геозоны (Haversine)
- [x] Team.create — создание звена с членствами
- [x] Question.answer — ответ на вопрос
- [x] URLs подключены к основному роутеру
- [x] Celery tasks — 4 задачи обработки медиа

### Осталось сделать

- [x] **T1.1**: Применить миграции: `python manage.py migrate` ✅ (7 фев 2026)
- [ ] **T1.2**: Создать тестовые данные через Django Admin
- [ ] **T1.3**: Проверить все API endpoints через DRF browsable API
- [x] **T1.4**: Автогенерация qr_token — реализована в Shift.save() override ✅ (7 фев 2026)
- [ ] **T1.5**: Тест Celery task chain с реальным Telegram file_id

### Тестирование Этапа 1

#### Unit-тесты моделей (`backend/worklog/tests/test_models.py`)

| ID | Тест | Что проверяем |
|----|------|---------------|
| T1-m-1 | `test_worker_creation` | Создание Worker со всеми полями, __str__ |
| T1-m-2 | `test_worker_unique_telegram_id` | Уникальность telegram_id (дубликат → IntegrityError) |
| T1-m-3 | `test_worker_role_choices` | Только `worker` / `brigadier` |
| T1-m-4 | `test_worker_language_choices` | Только `ru` / `uz` / `tg` / `ky` |
| T1-m-5 | `test_supergroup_creation` | Создание Supergroup, unique_together(object, contractor) |
| T1-m-6 | `test_supergroup_duplicate_object_contractor` | Дубликат → IntegrityError |
| T1-m-7 | `test_shift_creation` | Создание Shift со всеми полями |
| T1-m-8 | `test_shift_status_transitions` | scheduled → active → closed |
| T1-m-9 | `test_shift_qr_token_unique` | Уникальность qr_token |
| T1-m-10 | `test_shift_registration_creation` | Создание ShiftRegistration |
| T1-m-11 | `test_shift_registration_unique_per_shift` | unique_together(shift, worker) |
| T1-m-12 | `test_team_creation_with_members` | Создание Team + TeamMembership |
| T1-m-13 | `test_team_membership_join_leave` | joined_at auto, left_at nullable |
| T1-m-14 | `test_media_creation_all_types` | Создание Media каждого типа (photo, video, voice, audio, document, text) |
| T1-m-15 | `test_media_status_transitions` | pending → downloaded → committed |
| T1-m-16 | `test_media_tags` | Все теги: none, problem, supply, final_report |
| T1-m-17 | `test_report_creation` | Создание Report со всеми полями |
| T1-m-18 | `test_report_types` | intermediate, final, supplement |
| T1-m-19 | `test_report_with_parent` | Supplement с parent_report |
| T1-m-20 | `test_question_creation` | Создание Question с choices |
| T1-m-21 | `test_answer_creation` | Создание Answer, связь с Question |
| T1-m-22 | `test_cascade_delete_shift` | Удаление Shift → каскад на Registration, Team, Report |
| T1-m-23 | `test_cascade_delete_team` | Удаление Team → каскад на Media, Membership |
| T1-m-24 | `test_object_geo_fields` | Object.latitude, longitude, geo_radius defaults |

#### Unit-тесты сериализаторов (`backend/worklog/tests/test_serializers.py`)

| ID | Тест | Что проверяем |
|----|------|---------------|
| T1-s-1 | `test_worker_serializer_output` | Все поля, contractor_name |
| T1-s-2 | `test_worker_create_serializer` | Валидные данные → создание |
| T1-s-3 | `test_worker_create_missing_fields` | Без обязательных полей → ошибка |
| T1-s-4 | `test_shift_serializer_annotations` | registrations_count, teams_count |
| T1-s-5 | `test_shift_create_serializer` | Валидные данные → создание |
| T1-s-6 | `test_shift_registration_create_serializer` | qr_token, latitude, longitude |
| T1-s-7 | `test_team_serializer_with_memberships` | Вложенные memberships |
| T1-s-8 | `test_team_create_serializer` | shift_id, member_ids, brigadier_id |
| T1-s-9 | `test_media_serializer_output` | Все поля включая author_name |
| T1-s-10 | `test_report_serializer_with_media` | Вложенные media_items |
| T1-s-11 | `test_report_list_serializer_no_media` | Без media_items |
| T1-s-12 | `test_question_serializer_with_answers` | Вложенные answers |
| T1-s-13 | `test_telegram_auth_valid_signature` | Валидная HMAC-SHA256 подпись |
| T1-s-14 | `test_telegram_auth_invalid_signature` | Невалидная подпись → ошибка |
| T1-s-15 | `test_telegram_auth_missing_hash` | Без hash → ошибка |
| T1-s-16 | `test_telegram_auth_missing_user` | Без user data → ошибка |
| T1-s-17 | `test_telegram_auth_empty_token` | BOT_TOKEN пустой → ошибка |

#### Unit-тесты API views (`backend/worklog/tests/test_views.py`)

| ID | Тест | Что проверяем |
|----|------|---------------|
| T1-v-1 | `test_worker_list` | GET /workers/ → 200, пагинация |
| T1-v-2 | `test_worker_list_filter_role` | ?role=brigadier → только бригадиры |
| T1-v-3 | `test_worker_list_search` | ?search=Иван → поиск по имени |
| T1-v-4 | `test_worker_create` | POST /workers/ → 201 |
| T1-v-5 | `test_worker_detail` | GET /workers/{id}/ → 200 |
| T1-v-6 | `test_worker_update` | PATCH /workers/{id}/ → 200 |
| T1-v-7 | `test_worker_delete` | DELETE /workers/{id}/ → 204 |
| T1-v-8 | `test_shift_list` | GET /shifts/ → 200 |
| T1-v-9 | `test_shift_list_filter_status` | ?status=active → только активные |
| T1-v-10 | `test_shift_create` | POST /shifts/ → 201 |
| T1-v-11 | `test_shift_registrations_list` | GET /shifts/{id}/registrations/ → 200 |
| T1-v-12 | `test_shift_register_success` | POST /shifts/{id}/register/ → 201, geo_valid=true |
| T1-v-13 | `test_shift_register_outside_geo` | POST → 201, geo_valid=false, warning |
| T1-v-14 | `test_shift_register_not_active` | Смена не active → 400 |
| T1-v-15 | `test_shift_register_duplicate` | Повторная регистрация → 409 |
| T1-v-16 | `test_shift_register_no_geo_on_object` | Object без координат → geo_valid=false |
| T1-v-17 | `test_team_list` | GET /teams/ → 200, media_count |
| T1-v-18 | `test_team_create` | POST /teams/ → 201, memberships created |
| T1-v-19 | `test_team_create_solo` | 1 member → is_solo=true |
| T1-v-20 | `test_media_list` | GET /media/ → 200 |
| T1-v-21 | `test_media_list_filter_team` | ?team=uuid → фильтрация |
| T1-v-22 | `test_media_list_filter_type` | ?media_type=photo → только фото |
| T1-v-23 | `test_report_list` | GET /reports/ → 200, ReportListSerializer |
| T1-v-24 | `test_report_detail` | GET /reports/{id}/ → 200, ReportSerializer с media |
| T1-v-25 | `test_question_list` | GET /questions/ → 200 |
| T1-v-26 | `test_question_answer` | POST /questions/{id}/answer/ → 201, status=answered |
| T1-v-27 | `test_question_answer_already_answered` | Повторный ответ → status не меняется |
| T1-v-28 | `test_telegram_auth_success` | POST /auth/telegram/ → 200, JWT + worker |
| T1-v-29 | `test_telegram_auth_unknown_worker` | Worker не найден → 404 |
| T1-v-30 | `test_telegram_auth_no_jwt_required` | Эндпоинт доступен без JWT (AllowAny) |
| T1-v-31 | `test_work_journal_summary` | GET /objects/{id}/work-journal/ → 200, все счётчики |
| T1-v-32 | `test_work_journal_nonexistent_object` | Несуществующий объект → 404 |
| T1-v-33 | `test_work_journal_empty_object` | Объект без данных → нули |
| T1-v-34 | `test_unauthorized_access` | Без JWT → 401 (кроме auth/telegram/) |

#### Unit-тесты Celery tasks (`backend/worklog/tests/test_tasks.py`)

| ID | Тест | Что проверяем |
|----|------|---------------|
| T1-t-1 | `test_download_media_nonexistent` | Media не найдена → return без ошибки |
| T1-t-2 | `test_download_media_no_file_id` | Текстовое медиа без file_id → return |
| T1-t-3 | `test_download_media_no_bot_token` | BOT_TOKEN пустой → return с логом |
| T1-t-4 | `test_upload_to_s3_success` | Мок S3 + мок Telegram → file_url обновлён, status=downloaded |
| T1-t-5 | `test_upload_to_s3_content_type` | JPG → image/jpeg, MP4 → video/mp4 |
| T1-t-6 | `test_upload_to_s3_s3_key_format` | Ключ: `{type}/{yyyy/mm/dd}/{uuid}.{ext}` |
| T1-t-7 | `test_compute_phash_success` | Мок изображения → phash сохранён |
| T1-t-8 | `test_compute_phash_no_url` | Без file_url → return |
| T1-t-9 | `test_create_thumbnail_success` | Мок → thumbnail_url сохранён |
| T1-t-10 | `test_create_thumbnail_size` | Thumbnail ≤ 320x320 |
| T1-t-11 | `test_task_retry_on_failure` | Ошибка сети → retry (max 3) |
| T1-t-12 | `test_task_chain_triggers` | download → upload → (phash + thumbnail) |
| T1-t-13 | `test_guess_content_type` | Маппинг расширений |

#### Unit-тесты геолокации (`backend/worklog/tests/test_geo.py`)

| ID | Тест | Что проверяем |
|----|------|---------------|
| T1-g-1 | `test_haversine_same_point` | Расстояние 0м |
| T1-g-2 | `test_haversine_known_distance` | Москва → Питер ≈ 634 км |
| T1-g-3 | `test_geo_valid_inside_radius` | 100м от центра, radius=500 → true |
| T1-g-4 | `test_geo_valid_outside_radius` | 1000м от центра, radius=500 → false |
| T1-g-5 | `test_geo_valid_on_boundary` | Ровно на границе radius → true |
| T1-g-6 | `test_geo_no_object_coords` | Object без lat/lng → geo_valid=false |

### Документация после Этапа 1

- [ ] Обновить `MODELS.md` — если были изменения в моделях
- [ ] Обновить `API.md` — если добавились/изменились эндпоинты
- [ ] Создать `docs/work_logging/TESTING.md` — описание тестовой инфраструктуры, команды запуска
- [ ] Обновить `DEPLOYMENT.md` — команды миграции, создание суперпользователя

---

## Этап 2: Telegram Bot

### Выполнено ✅

- [x] Структура `/bot/` создана
- [x] `config.py` — pydantic-settings с .env
- [x] `main.py` — entry point (polling + webhook)
- [x] `handlers/commands.py` — /start, /help
- [x] `handlers/media.py` — обработка всех типов медиа из топиков
- [x] `handlers/callbacks.py` — inline-кнопки для ответов
- [x] `services/db.py` — asyncpg клиент
- [x] `services/celery_client.py` — постановка задач
- [x] `requirements.txt`

### Осталось сделать

- [ ] **T2.1**: Получить BOT_TOKEN от @BotFather
- [x] **T2.2**: Создать `.env.example` файл для бота ✅ (7 фев 2026)
- [ ] **T2.3**: `pip install -r requirements.txt`
- [ ] **T2.4**: Запустить бота в polling-режиме
- [ ] **T2.5**: Создать тестовую супергруппу с Forum Mode
- [x] **T2.6**: Реализовать `middlewares/auth.py` — WorkerAuthMiddleware + RequireWorkerMiddleware ✅ (7 фев 2026)
- [x] **T2.7**: Реализовать `utils/telegram.py` — create/close/reopen/rename topic, invite link, send_question_to_topic ✅ (7 фев 2026)
- [x] **T2.8**: Реализовать отправку вопросов в топик с inline-кнопками + DB methods ✅ (7 фев 2026)

### Тестирование Этапа 2

#### Unit-тесты handlers (`bot/tests/test_handlers.py`)

| ID | Тест | Что проверяем |
|----|------|---------------|
| T2-h-1 | `test_start_registered_worker` | /start → приветствие с именем + invite |
| T2-h-2 | `test_start_unregistered_user` | /start → "Вы не зарегистрированы" |
| T2-h-3 | `test_start_marks_bot_started` | bot_started обновляется в БД |
| T2-h-4 | `test_help_command` | /help → справочный текст |
| T2-h-5 | `test_photo_from_topic` | Фото в топик → Media создаётся (status=pending) |
| T2-h-6 | `test_video_from_topic` | Видео → Media с duration |
| T2-h-7 | `test_voice_from_topic` | Голосовое → Media с duration |
| T2-h-8 | `test_audio_from_topic` | Аудио → Media |
| T2-h-9 | `test_document_from_topic` | Документ → Media |
| T2-h-10 | `test_text_from_topic` | Текст → Media без file_id |
| T2-h-11 | `test_media_reaction` | Успешный приём → реакция ✅ |
| T2-h-12 | `test_media_celery_task_scheduled` | После сохранения → Celery задача поставлена |
| T2-h-13 | `test_media_from_non_supergroup` | Не supergroup → игнорируется |
| T2-h-14 | `test_media_without_thread_id` | Без topic → игнорируется |
| T2-h-15 | `test_media_unregistered_user` | Незарегистрированный → игнорируется |
| T2-h-16 | `test_media_forwarded_message` | Пересылка → удаляется |
| T2-h-17 | `test_media_unknown_team` | Топик не привязан → игнорируется |
| T2-h-18 | `test_media_worker_not_in_team` | Worker не в звене → игнорируется (лог) |
| T2-h-19 | `test_text_command_ignored` | /start в группе → не обрабатывается как text |
| T2-h-20 | `test_callback_answer_success` | answer:{id}:{index} → ответ сохранён |
| T2-h-21 | `test_callback_answer_already_answered` | Повторный → "Уже отвечено" |
| T2-h-22 | `test_callback_invalid_format` | Кривой формат → "Ошибка формата" |
| T2-h-23 | `test_callback_unknown_question` | Несуществующий вопрос → "Вопрос не найден" |

#### Unit-тесты services/db.py (`bot/tests/test_db.py`)

| ID | Тест | Что проверяем |
|----|------|---------------|
| T2-d-1 | `test_find_worker_exists` | Существующий telegram_id → dict |
| T2-d-2 | `test_find_worker_not_exists` | Несуществующий → None |
| T2-d-3 | `test_mark_bot_started` | bot_started → true |
| T2-d-4 | `test_find_team_active` | Активное звено по chat_id + topic_id |
| T2-d-5 | `test_find_team_closed` | Закрытое звено → None |
| T2-d-6 | `test_find_team_wrong_group` | Другая группа → None |
| T2-d-7 | `test_is_worker_in_team_active` | Активное членство → True |
| T2-d-8 | `test_is_worker_in_team_left` | left_at не null → False |
| T2-d-9 | `test_is_worker_not_in_team` | Другое звено → False |
| T2-d-10 | `test_save_media` | INSERT → запись в БД корректна |
| T2-d-11 | `test_get_invite_link` | invite_link возвращается |

#### Ручные тесты в Telegram

| ID | Тест | Шаги | Критерий |
|----|------|------|----------|
| T2-manual-1 | /start зарегистрированный | /start в ЛС бота | Приветствие + invite-ссылка |
| T2-manual-2 | /start незарегистрированный | /start от нового юзера | "Вы не зарегистрированы" |
| T2-manual-3 | Фото в топик | Отправить фото в привязанный топик | ✅ реакция, Media в БД |
| T2-manual-4 | Видео в топик | Отправить видео | ✅ реакция, Media с duration |
| T2-manual-5 | Голосовое в топик | Голосовое сообщение | ✅ реакция, Media |
| T2-manual-6 | Пересылка в топик | Переслать чужое фото | Сообщение удалено |
| T2-manual-7 | Фото от стороннего | Фото от юзера не в звене | Игнор, без реакции |
| T2-manual-8 | Фото не в топик | Фото в General чат (не топик) | Игнор |
| T2-manual-9 | Celery chain | Фото → ждать 30с | Файл появился в MinIO |

### Документация после Этапа 2

- [ ] Обновить `BOT.md` — реальный процесс настройки, скриншоты @BotFather
- [ ] Обновить `BOT.md` — middleware и utils (если реализованы)
- [ ] Дополнить `TESTING.md` — раздел тестирования бота, моки aiogram
- [ ] Обновить `DEPLOYMENT.md` — инструкция создания супергруппы + Forum Mode

---

## Этап 3: Telegram Mini App

### Выполнено ✅

- [x] Scaffold: React + Vite + TypeScript
- [x] API-клиент, Telegram SDK обёртки, Auth hook
- [x] i18n — 4 языка (ru/uz/tg/ky)
- [x] RegisterPage, BrigadierHome, CreateTeamPage, TeamMediaPage
- [x] ContractorHome, OpenShiftPage, WorkersPage, SettingsPage
- [x] Роутинг по ролям

### Осталось сделать

- [x] **T3.1**: `npm install` ✅ (7 фев 2026)
- [x] **T3.2**: Создать `.env` с `VITE_API_BASE_URL` ✅ (7 фев 2026)
- [x] **T3.3**: `npm run dev` — проверить запуск без ошибок ✅ (7 фев 2026)
- [ ] **T3.4**: Настроить HTTPS через ngrok (нужен BOT_TOKEN)
- [ ] **T3.5**: Зарегистрировать Mini App в @BotFather (нужен BOT_TOKEN)
- [x] **T3.6**: Contractor role detection через JWT claims + is_contractor в AuthResponse ✅ (7 фев 2026)
- [x] **T3.7**: Экран Team detail (`/team/:id`) ✅ (7 фев 2026)
- [x] **T3.8**: Экран Report create (`/team/:id/report`) ✅ (7 фев 2026)
- [x] **T3.9**: Экран Team manage (`/team/:id/manage`) ✅ (7 фев 2026)
- [x] **T3.10**: Сохранение настроек (Settings) — с localStorage ✅ (7 фев 2026)
- [x] **T3.11**: Supplement report, Ask question — 2 новых экрана ✅ (7 фев 2026)

### Тестирование Этапа 3

#### Unit-тесты компонентов (Vitest + React Testing Library)

| ID | Тест | Что проверяем |
|----|------|---------------|
| T3-c-1 | `test_RegisterPage_renders` | Отображение кнопки "Зарегистрироваться на смену!" |
| T3-c-2 | `test_RegisterPage_scan_flow` | Нажатие → состояние scanning → locating → registering |
| T3-c-3 | `test_RegisterPage_success` | Успешная регистрация → экран "Вы зарегистрированы" |
| T3-c-4 | `test_RegisterPage_error` | Ошибка → errorMessage отображается |
| T3-c-5 | `test_BrigadierHome_loading` | isLoading → Spinner |
| T3-c-6 | `test_BrigadierHome_no_shift` | Нет активной смены → Placeholder |
| T3-c-7 | `test_BrigadierHome_with_teams` | Звенья → список Cell с media_count |
| T3-c-8 | `test_CreateTeamPage_renders` | Список чекбоксов с монтажниками |
| T3-c-9 | `test_CreateTeamPage_toggle` | Клик на чекбокс → toggle selectedIds |
| T3-c-10 | `test_CreateTeamPage_submit` | Кнопка "Создать" → API вызов с member_ids |
| T3-c-11 | `test_CreateTeamPage_empty_disabled` | 0 выбранных → кнопка disabled |
| T3-c-12 | `test_TeamMediaPage_empty` | Нет медиа → Placeholder "Пока нет медиа" |
| T3-c-13 | `test_TeamMediaPage_items` | Медиа есть → список с иконками и авторами |
| T3-c-14 | `test_TeamMediaPage_tags` | Тег problem → красный индикатор |
| T3-c-15 | `test_ContractorHome_renders` | Секции: смены + звенья + кнопки |
| T3-c-16 | `test_ContractorHome_no_shifts` | Нет смен → Placeholder + кнопка |
| T3-c-17 | `test_OpenShiftPage_form` | Ввод даты/времени → formData обновляется |
| T3-c-18 | `test_OpenShiftPage_submit` | Кнопка → createShift вызван |
| T3-c-19 | `test_WorkersPage_list` | Список монтажников с ролями |
| T3-c-20 | `test_WorkersPage_add_form` | Кнопка → форма добавления отображается |
| T3-c-21 | `test_WorkersPage_add_worker` | Заполнить + сохранить → createWorker вызван |
| T3-c-22 | `test_SettingsPage_renders` | Отображение настроек |

#### Unit-тесты hooks и lib

| ID | Тест | Что проверяем |
|----|------|---------------|
| T3-h-1 | `test_useAuth_loading` | Начальное состояние: isLoading=true |
| T3-h-2 | `test_useAuth_success` | Мок initData → isAuthenticated=true, worker не null |
| T3-h-3 | `test_useAuth_no_initData` | Нет initData → error "Not running inside Telegram" |
| T3-h-4 | `test_useAuth_api_error` | 404 → error, isAuthenticated=false |
| T3-h-5 | `test_useAuth_sets_language` | worker.language=uz → i18n.changeLanguage('uz') |
| T3-h-6 | `test_api_client_set_token` | setAccessToken → Authorization header |
| T3-h-7 | `test_api_client_error_handling` | 400 → Error с detail |
| T3-h-8 | `test_api_client_no_token` | Без токена → запрос без Authorization |

#### Тесты i18n

| ID | Тест | Что проверяем |
|----|------|---------------|
| T3-i-1 | `test_all_locales_have_same_keys` | ru/uz/tg/ky имеют одинаковую структуру |
| T3-i-2 | `test_no_empty_translations` | Нет пустых строк в переводах |
| T3-i-3 | `test_interpolation_keys` | `{{count}}` присутствует в mediaCount для всех языков |
| T3-i-4 | `test_fallback_to_ru` | Неизвестный язык → ru |

#### Ручные тесты в Telegram

| ID | Тест | Шаги | Критерий |
|----|------|------|----------|
| T3-manual-1 | Auth worker | Открыть Mini App как worker | Экран регистрации |
| T3-manual-2 | Auth brigadier | Открыть как brigadier | BrigadierHome |
| T3-manual-3 | QR сканирование | Нажать кнопку, навести на QR | Сканер открывается |
| T3-manual-4 | Геолокация | Разрешить доступ к GPS | Координаты получены |
| T3-manual-5 | Создание звена | Выбрать участников, создать | Звено в БД |
| T3-manual-6 | Просмотр медиа | Открыть галерею звена | Фото/видео отображаются |
| T3-manual-7 | Открытие смены | Contractor → форма → создать | Смена в БД |
| T3-manual-8 | Добавление worker | Contractor → Workers → Add | Worker создан |
| T3-manual-9 | Язык UZ | Worker с language=uz | Интерфейс на узбекском |
| T3-manual-10 | Haptic feedback | Регистрация → успех | Тактильная отдача |
| T3-manual-11 | Back button | Вложенный экран | Нативная кнопка "Назад" |

### Документация после Этапа 3

- [ ] Обновить `MINI_APP.md` — недостающие экраны (если реализованы), скриншоты
- [ ] Обновить `MINI_APP.md` — Contractor role detection
- [ ] Дополнить `TESTING.md` — раздел тестирования Mini App (Vitest, React Testing Library)
- [ ] Обновить `DEPLOYMENT.md` — настройка Mini App в @BotFather

---

## Этап 4: ERP Frontend

### Выполнено ✅

- [x] Вкладка "Журнал работ" в `ObjectDetail.tsx` (заглушка)
- [x] Типы worklog в `api.ts`
- [x] **T4.1**: WorkJournalTab — полноценный контент ✅ (7 фев 2026)
- [x] **T4.2**: ShiftList, MediaGallery, ReportsList, SummaryCards, PaginationBar ✅ (7 фев 2026)
- [x] **T4.3**: API-методы в `lib/api.ts` (getWorkJournalSummary, getWorklogShifts/Teams/Media/Reports) ✅ (7 фев 2026)

### Осталось сделать

- [x] **T4.4**: Детальный просмотр отчёта, вопросы/ответы — ReportDetailDialog ✅ (7 фев 2026)
- [x] **T4.5**: Настройка объекта — гео-координаты — GeoSettingsSection ✅ (7 фев 2026)
- [x] **T4.6**: Управление супергруппами из ERP — SupergroupSection ✅ (7 фев 2026)

### Тестирование Этапа 4

#### Unit-тесты компонентов (Vitest + React Testing Library) — 24 теста ✅

| ID | Тест | Что проверяем | Статус |
|----|------|---------------|--------|
| T4-c-1 | `WorkJournalTab_summary_cards` | Рендер summary cards с данными | ✅ |
| T4-c-2 | `WorkJournalTab_empty` | Нет данных → заглушка | ✅ |
| T4-c-3 | `WorkJournalTab_navigation` | Навигация между секциями | ✅ |
| T4-c-4 | `OverviewSection_table` | Таблица последних смен | ✅ |
| T4-c-4b | `OverviewSection_empty` | Нет смен → пустое состояние | ✅ |
| T4-c-5 | `ShiftsSection_filter` | Фильтр + таблица смен | ✅ |
| T4-c-5b | `ShiftsSection_loading` | Спиннер загрузки | ✅ |
| T4-c-5c | `ShiftsSection_empty` | Пустое состояние | ✅ |
| T4-c-6 | `MediaSection_cards` | Карточки медиа с фильтрами | ✅ |
| T4-c-7 | `MediaCard_photo` | Фото-карточка с thumbnail | ✅ |
| T4-c-7b | `MediaCard_voice` | Голосовая карточка с иконкой | ✅ |
| T4-c-8 | `PaginationBar_controls` | Пагинация: контролы | ✅ |
| T4-c-8b | `PaginationBar_first_page` | Disabled prev на 1-й стр | ✅ |
| T4-c-8c | `PaginationBar_last_page` | Disabled next на последней | ✅ |
| T4-c-8d | `PaginationBar_click` | Клик next → onPageChange(2) | ✅ |
| T4-c-8e | `PaginationBar_single` | Одна страница — не рендерится | ✅ |
| T4-c-9 | `ReportsSection_table` | Таблица отчётов с фильтром | ✅ |
| T4-c-9b | `ReportsSection_click` | Клик по строке → onReportClick | ✅ |
| T4-c-10 | `ReportDetailDialog` | Диалог деталей отчёта | ✅ |
| T4-c-11 | `GeoSettingsSection` | Форма гео-настроек | ✅ |
| T4-c-12 | `SupergroupSection_list` | Список супергрупп | ✅ |
| T4-c-12b | `SupergroupSection_empty` | Пустое состояние | ✅ |
| T4-c-13 | `SummaryCard_with_extra` | Карточка с extra text | ✅ |
| T4-c-13b | `SummaryCard_without_extra` | Карточка без extra | ✅ |

#### Тесты API-клиента — 11 тестов ✅

| ID | Тест | Что проверяем | Статус |
|----|------|---------------|--------|
| T4-a-1 | `getWorkJournalSummary` | Мок → корректный парсинг | ✅ |
| T4-a-2 | `getWorklogShifts` | Пагинированный ответ с фильтрами | ✅ |
| T4-a-2b | `getWorklogShifts_no_params` | Запрос без параметров | ✅ |
| T4-a-3 | `getWorklogMedia` | Фильтрация по team, tag, media_type | ✅ |
| T4-a-4 | `getWorklogReports` | Фильтрация по типу отчёта | ✅ |
| T4-a-5 | `getWorklogReportDetail` | Полный отчёт с медиа и вопросами | ✅ |
| T4-a-6 | `createWorklogQuestion` | POST вопроса с report_id и text | ✅ |
| T4-a-7 | `answerWorklogQuestion` | POST ответа на вопрос | ✅ |
| T4-a-8 | `updateObjectGeo` | PATCH гео-координат | ✅ |
| T4-a-9 | `getWorklogSupergroups` | Фильтрация по object | ✅ |
| T4-a-10 | `error_handling` | Обработка 400 ошибки | ✅ |

### Документация после Этапа 4

- [x] Обновить `ARCHITECTURE.md` — секция ERP Frontend ✅ (7 фев 2026)
- [ ] Обновить `API.md` — если добавились фронтенд-специфичные эндпоинты
- [x] Дополнить `TESTING.md` — раздел тестирования ERP ✅ (7 фев 2026)
- [x] Обновить `IMPLEMENTATION_PLAN.md` — прогресс этапов ✅ (7 фев 2026)

---

## Этап 5: Unit-тесты Backend

Полное покрытие backend-кода автоматическими тестами.

### Задачи

- [x] **T5.1**: Создать `backend/worklog/tests/` с `__init__.py`, factories.py ✅ (7 фев 2026)
- [x] **T5.2**: Фабрики: `counterparty`, `object_with_geo`, `worker`, `brigadier`, `shift`, `team`, `media` ✅ (7 фев 2026)
- [x] **T5.3**: Реализовать все тесты моделей — 24 теста ✅ (7 фев 2026)
- [x] **T5.4**: Реализовать все тесты сериализаторов — 17 тестов ✅ (7 фев 2026)
- [x] **T5.5**: Реализовать все тесты views — 34 теста ✅ (7 фев 2026)
- [x] **T5.6**: Реализовать все тесты Celery tasks — 13 тестов ✅ (7 фев 2026)
- [x] **T5.7**: Реализовать тесты геолокации — 6 тестов ✅ (7 фев 2026)
- [x] **T5.8**: Настроить pytest + pytest-django + pytest-cov — pytest.ini, .coveragerc, conftest.py ✅ (7 фев 2026)
- [ ] **T5.9**: Добиться ≥ 90% покрытия `worklog/` (требует запуск тестов)
- [x] **T5.10**: Настроить CI (GitHub Actions) — .github/workflows/ci.yml ✅ (7 фев 2026)

**Итого: 90 unit-тестов Backend — все пройдены ✅**

> **Примечание**: В ходе тестирования обнаружен и исправлен баг — все ViewSets не имели
> `filter_backends = [DjangoFilterBackend]`, из-за чего `filterset_fields` не работали.
> Исправлено в `worklog/views.py` (7 фев 2026).

### Документация после Этапа 5

- [ ] Создать / финализировать `TESTING.md` — полное описание тестовой инфраструктуры
- [ ] Добавить в `TESTING.md` — coverage report, как запускать, CI/CD

---

## Этап 6: Unit-тесты Bot + Mini App

### Задачи Bot

- [x] **T6.1**: Создать `bot/tests/` с моками aiogram (conftest.py) ✅ (7 фев 2026)
- [x] **T6.2**: Реализовать тесты handlers — 22 теста ✅ (7 фев 2026)
- [x] **T6.3**: Реализовать тесты db — 11 тестов ✅ (7 фев 2026)
- [x] **T6.4**: Настроить pytest + pytest-asyncio ✅ (7 фев 2026)
- [ ] **T6.5**: Покрытие ≥ 85% `bot/`

**Итого: 33 unit-теста Bot — все пройдены ✅**

### Задачи Mini App

- [x] **T6.6**: Настроить Vitest + React Testing Library + jsdom ✅ (7 фев 2026)
- [x] **T6.7**: Моки: Telegram SDK, fetch, i18n ✅ (7 фев 2026)
- [x] **T6.8**: Реализовать тесты компонентов (T3-c-1 → T3-c-22) — 22 теста ✅ (7 фев 2026)
- [x] **T6.9**: Реализовать тесты API client + lib/telegram (15 тестов) ✅ (7 фев 2026)
- [x] **T6.10**: Реализовать тесты i18n (4 теста) ✅ (7 фев 2026)
- [ ] **T6.11**: Покрытие ≥ 80% `mini-app/src/`

**Итого: 41 unit-тест Mini App — все пройдены ✅**

### Документация после Этапа 6

- [ ] Обновить `TESTING.md` — секции Bot и Mini App
- [ ] Обновить `BOT.md` — моки, тестовая инфраструктура
- [ ] Обновить `MINI_APP.md` — Vitest, RTL

---

## Этап 7: Интеграционное и E2E тестирование

### E2E сценарии

| ID | Сценарий | Компоненты | Шаги |
|----|---------|-----------|------|
| T7-e2e-1 | Полный рабочий день | Все | Открыть смену → регистрация → звено → медиа → отчёт → ERP |
| T7-e2e-2 | Мульти-звено | Bot + API | 3 звена на одной смене, медиа в каждом |
| T7-e2e-3 | Изменение состава | Bot + API | Удалить участника → triggered report |
| T7-e2e-4 | Вопрос-ответ | Bot + API + Mini App | Задать вопрос → ответ через inline-кнопку |
| T7-e2e-5 | Supplement | API + Mini App | Дополнение к закрытому отчёту |

### Интеграционные тесты

| ID | Тест | Компоненты | Что проверяем |
|----|------|-----------|---------------|
| T7-i-1 | Bot → DB → API | Bot + Django | Медиа от бота видно через API |
| T7-i-2 | Mini App → API → DB | Mini App + Django | Регистрация через Mini App → ShiftRegistration в БД |
| T7-i-3 | Bot → Celery → S3 | Bot + Celery + MinIO | Файл скачивается и загружается |
| T7-i-4 | API → Celery → S3 | Django + Celery + MinIO | Задача через API → файл в S3 |
| T7-i-5 | API → ERP | Django + Frontend | work-journal summary отображается |
| T7-i-6 | Auth flow | Mini App + Django | initData → JWT → API запрос |
| T7-i-7 | Geo validation | Mini App + Django | Координаты → haversine → geo_valid |

### Нагрузочные тесты

| ID | Тест | Критерий |
|----|------|----------|
| T7-load-1 | 100 медиа за 5 мин | Все обработаны, нет потерь |
| T7-load-2 | 20 одновременных регистраций | Нет deadlock, все unique |
| T7-load-3 | 50 API запросов/сек | Время ответа < 500мс |

### Тесты устойчивости

| ID | Тест | Сценарий | Ожидание |
|----|------|---------|----------|
| T7-f-1 | Redis down | Остановить Redis | Бот работает, задачи в очереди после восстановления |
| T7-f-2 | MinIO down | Остановить MinIO | Upload retry после восстановления |
| T7-f-3 | Celery down | Остановить Worker | Задачи накапливаются в Redis, обрабатываются после старта |
| T7-f-4 | DB down | Остановить PostgreSQL | Бот и API возвращают 503 |
| T7-f-5 | Bot restart | Перезапуск бота | Ни одно сообщение не потеряно |

### Документация после Этапа 7

- [ ] Обновить `TESTING.md` — E2E, интеграционные, нагрузочные тесты
- [ ] Создать `docs/work_logging/TEST_RESULTS.md` — результаты прогона всех тестов
- [ ] Обновить `IMPLEMENTATION_PLAN.md` — финальные проценты прогресса

---

## Этап 8: Доработка и полировка

- [x] **T8.1**: Bot middleware авторизации — WorkerAuthMiddleware ✅ (7 фев 2026)
- [x] **T8.2**: Автоматическое создание топика при создании звена — Celery task `create_team_forum_topic` ✅ (7 фев 2026)
- [x] **T8.3**: Автоматическая генерация QR при открытии смены (Shift.save() override) ✅ (7 фев 2026)
- [x] **T8.4**: Уведомления о закрытии смены — Celery task `notify_shift_closed` + интеграция с `auto_close_expired_shifts` ✅ (7 фев 2026)
- [x] **T8.5**: Автозакрытие смены по таймеру — Celery beat каждые 15 мин ✅ (7 фев 2026)
- [x] **T8.6**: Предупреждение об отчёте — Celery beat task `send_report_warnings` каждые 10 мин ✅ (7 фев 2026)
- [x] **T8.7**: Транскрибация голосовых — OpenAI Whisper API (`transcribe_voice` task) ✅ (7 фев 2026)
- [x] **T8.8**: Полноэкранный просмотр медиа в Mini App — MediaViewer с навигацией ✅ (7 фев 2026)
- [x] **T8.9**: Оптимизация запросов — кэширование work_journal_summary, aggregate вместо count, prefetch для questions ✅ (7 фев 2026)
- [x] **T8.10**: Логирование и мониторинг — Sentry SDK + Django LOGGING (RotatingFileHandler) ✅ (7 фев 2026)

### Тестирование каждой доработки

Каждая задача T8.x сопровождается:
- [ ] Unit-тест покрывающий новую функциональность
- [ ] Обновление существующих тестов (если изменилось поведение)
- [ ] Ручной тест в Telegram (для Bot/Mini App задач)

### Документация после Этапа 8

- [ ] Обновить ВСЕ документы (ARCHITECTURE, API, BOT, MINI_APP) по факту изменений
- [ ] Обновить `TESTING.md` — новые тесты

---

## Этап 9: Staging и приёмка

- [ ] **T9.1**: Развёртывание на staging-сервере
- [ ] **T9.2**: Настройка HTTPS + webhook для бота
- [ ] **T9.3**: Настройка production MinIO
- [ ] **T9.4**: Прогон ВСЕХ автотестов на staging
- [ ] **T9.5**: Тестирование с реальными монтажниками (пилотный объект)
- [ ] **T9.6**: Сбор обратной связи
- [ ] **T9.7**: Исправление багов по результатам пилота

### Acceptance-тесты (с реальными пользователями)

| ID | Тест | Тестировщик | Критерий |
|----|------|------------|----------|
| T9-a-1 | Монтажник: полный день | Реальный монтажник | Отправил 20+ фото, все приняты |
| T9-a-2 | Бригадир: управление | Реальный бригадир | Создал звено, сформировал отчёт |
| T9-a-3 | Исполнитель: обзор | Реальный исполнитель | Открыл смену, видит все данные |
| T9-a-4 | Офис: просмотр | Офисный работник | Журнал работ в ERP корректен |
| T9-a-5 | Многоязычность | Узбекоязычный монтажник | Интерфейс на узбекском, понятен |
| T9-a-6 | Гео-регистрация | На объекте и вне | Корректная отметка geo_valid |

### Документация после Этапа 9

- [ ] Финализировать `DEPLOYMENT.md` — production конфигурация
- [ ] Создать `docs/work_logging/USER_GUIDE_INSTALLER.md` — инструкция для монтажников
- [ ] Создать `docs/work_logging/USER_GUIDE_OFFICE.md` — инструкция для офиса
- [ ] Обновить `TEST_RESULTS.md` — результаты acceptance-тестов

---

## Этап 10: Production

- [ ] **T10.1**: Production deployment
- [ ] **T10.2**: Мониторинг и алерты (Sentry, UptimeRobot)
- [ ] **T10.3**: Backup-стратегия для медиа (S3 replication)
- [ ] **T10.4**: Распространение инструкций монтажникам
- [ ] **T10.5**: Обучение офисных сотрудников
- [ ] **T10.6**: Плановый review через 2 недели после запуска

### Документация после Этапа 10

- [ ] Финализировать ВСЮ документацию
- [ ] Обновить `docs/README.md` — убрать пометки "В разработке"
- [ ] Обновить `IMPLEMENTATION_PLAN.md` — все чекбоксы ✅
- [ ] Архивировать `TEST_RESULTS.md` с датой production release

---

## Сводка по тестам

| Категория | Количество | Где |
|-----------|-----------|-----|
| Unit-тесты моделей | 24 ✅ | `backend/worklog/tests/test_models.py` |
| Unit-тесты сериализаторов | 17 ✅ | `backend/worklog/tests/test_serializers.py` |
| Unit-тесты views/API | 34 ✅ | `backend/worklog/tests/test_views.py` |
| Unit-тесты Celery tasks | 13 ✅ | `backend/worklog/tests/test_tasks.py` |
| Unit-тесты геолокации | 6 ✅ | `backend/worklog/tests/test_geo.py` |
| Unit-тесты Bot handlers | 22 ✅ | `bot/tests/test_handlers.py` |
| Unit-тесты Bot DB | 11 ✅ | `bot/tests/test_db.py` |
| Unit-тесты Mini App API + lib | 15 ✅ | `mini-app/src/__tests__/api-client.test.ts`, `telegram-lib.test.ts` |
| Unit-тесты Mini App i18n | 4 ✅ | `mini-app/src/__tests__/i18n.test.ts` |
| Unit-тесты Mini App компонентов | 22 ✅ | `mini-app/src/__tests__/components.test.tsx` |
| Unit-тесты ERP компонентов | 24 ✅ | `frontend/src/__tests__/worklog-components.test.tsx` |
| Unit-тесты ERP API client | 11 ✅ | `frontend/src/__tests__/worklog-api.test.ts` |
| **Итого Unit написано** | **199 ✅** | |
| E2E сценарии | 5 | Ручные/автоматизированные |
| Интеграционные | 7 | `backend/worklog/tests/test_integration.py` |
| Нагрузочные | 3 | Скрипты / Locust |
| Устойчивость | 5 | Ручные |
| Acceptance (с пользователями) | 6 | Пилотный объект |
| Ручные Telegram Bot | 9 | Чеклист |
| Ручные Mini App | 11 | Чеклист |
| **Итого ВСЕ** | **224** | |

### Целевое покрытие

| Компонент | Целевое покрытие |
|-----------|-----------------|
| `backend/worklog/` | ≥ 90% |
| `bot/` | ≥ 85% |
| `mini-app/src/` | ≥ 80% |
| `frontend/src/` (worklog) | ≥ 75% |

---

## Приоритеты ближайших задач

### Критический путь (блокирует дальнейшую работу)

1. ~~**T0.1–T0.2** — Запуск инфраструктуры~~ ✅ Выполнено 7 фев 2026
2. ~~**T1.1** — Применить миграции~~ ✅ Выполнено 7 фев 2026
3. **T0.3–T0.6** — Проверка Celery/MinIO + .env файлы
4. **T2.1–T2.4** — Запуск бота
5. **T3.1–T3.3** — Запуск Mini App

### Высокий приоритет

6. ~~**T5.1–T5.7** — Unit-тесты Backend (90 тестов)~~ ✅ Выполнено 7 фев 2026
7. ~~**T6.1–T6.11** — Unit-тесты Bot + Mini App (52 теста)~~ ✅ Выполнено 7 фев 2026
8. ~~**T5.8, T5.10** — pytest config + CI~~ ✅ Выполнено 7 фев 2026
9. **T2.1–T2.5** — Тест бота с реальной супергруппой (нужен BOT_TOKEN)
10. **T3.4–T3.5** — Тест Mini App в Telegram (нужен BOT_TOKEN)
11. ~~**T1.4** — Автогенерация qr_token~~ ✅ Выполнено 7 фев 2026

### Средний приоритет

12. ~~**T4.1–T4.3** — Реальный контент в ERP~~ ✅ Выполнено 7 фев 2026
13. ~~**T3.7–T3.11** — Недостающие экраны Mini App~~ ✅ Выполнено 7 фев 2026
14. ~~**T4.4–T4.6** — Детали отчётов, гео, супергруппы в ERP~~ ✅ Выполнено 7 фев 2026
15. ~~**T8.1–T8.10** — Все доработки~~ ✅ Выполнено 7 фев 2026
16. **T7.1–T7.5** — Интеграционные и E2E тесты

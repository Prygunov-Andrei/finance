# Чеклист деплоя: Marketing + Estimates Overhaul + News Rating

> Коммит: `a41b241` → `main`  
> Дата: 2026-04-10  
> Сервер: `216.57.110.41` (`/opt/finans_assistant`)

---

## 1. БАЗА ДАННЫХ — критический раздел

### 1.1 Новые миграции (10 штук)

| Миграция | Тип | Риск | Что делает |
|---|---|---|---|
| `estimates/0008_projectfiletype_projectfile_and_file_optional` | Schema | Средний | Новые таблицы + nullable поля |
| `estimates/0009_markup_system` | Schema | Средний | Новые поля наценки в моделях |
| `estimates/0010_markup_data_migration` | **Data** | **Высокий** | Заполняет данные наценок в существующих записях |
| `marketing/0001_initial` | Schema | Низкий | 10 новых таблиц (marketing_*), не трогает существующие |
| `marketing/0002_seed_keywords` | **Data** | Низкий | Вставляет 8 ключевых слов (идемпотентно через get_or_create) |
| `news/0018_rating_system` | Schema | Средний | Новые поля рейтинга |
| `news/0019_rating_data_migration` | **Data** | Средний | Заполняет рейтинговые данные |
| `news/0020_rating_run_progress` | Schema | Низкий | Новые поля прогресса |
| `references/0008_manufacturer_is_kmp` | Schema | Низкий | Новое булево поле |

### 1.2 Порядок действий с БД

```bash
# 1. Подключиться к серверу
ssh root@216.57.110.41

# 2. Перейти в директорию проекта
cd /opt/finans_assistant

# 3. БЭКАП БАЗЫ ДАННЫХ (обязательно!)
./deploy/backup.sh

# 4. Проверить что бэкап создан
ls -la /opt/backups/finans_assistant/

# 5. Тестовый прогон миграций (--plan показывает что будет применено)
docker compose -f docker-compose.prod.yml exec -T backend \
  python manage.py migrate --plan

# 6. Проверить нет ли конфликтов
docker compose -f docker-compose.prod.yml exec -T backend \
  python manage.py showmigrations marketing estimates news references | grep "\[ \]"
```

### 1.3 Особые риски

**estimates/0010 (data migration):**
- Заполняет поля наценок. Если в production есть сметы с нестандартными данными — может упасть.
- **Митигация:** бэкап + `--plan` перед применением

**marketing/0001 (10 новых таблиц):**
- Создаёт таблицы `marketing_executorprofile`, `marketing_avitoconfig`, и т.д.
- Использует `ArrayField` (PostgreSQL) — убедиться что PostgreSQL >= 12
- **Риск минимален** — новые таблицы, не трогает существующие

**marketing/0002 (seed data):**
- Использует `get_or_create` — безопасен при повторном запуске
- Вставляет 8 ключевых слов для Avito

---

## 2. ДЕПЛОЙ — пошаговый план

### 2.0 Подготовка (на локальной машине)

```bash
# Убедиться что коммит запушен
git log --oneline -1
# a41b241 feat: модуль «Поиск Исполнителей» + Avito-интеграция + рефакторинг смет
```

### 2.1 На сервере: стандартный деплой

```bash
ssh root@216.57.110.41
cd /opt/finans_assistant

# Полный деплой (backup → pull → build → migrate → restart)
./deploy/deploy.sh
```

Скрипт `deploy.sh` автоматически:
1. `git pull origin main`
2. `backup.sh` (бэкап БД)
3. `docker compose down`
4. `docker compose build --no-cache`
5. `docker compose up -d`
6. `python manage.py migrate --noinput`
7. `python manage.py collectstatic --noinput`
8. `python manage.py check`
9. Health checks

### 2.2 Если нужен ручной контроль (рекомендуется при первом деплое marketing)

```bash
ssh root@216.57.110.41
cd /opt/finans_assistant

# 1. Бэкап
./deploy/backup.sh

# 2. Pull кода
git pull origin main

# 3. Пересобрать только backend (быстрее)
docker compose -f docker-compose.prod.yml build backend celery-worker celery-beat

# 4. Применить миграции ДО перезапуска (на текущей БД)
docker compose -f docker-compose.prod.yml exec -T backend \
  python manage.py migrate --noinput 2>&1 | tee /tmp/migrate.log

# 5. Проверить что миграции прошли
grep -i "error\|fail\|traceback" /tmp/migrate.log
# Если есть ошибки — СТОП, не перезапускать!

# 6. Перезапустить сервисы
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d

# 7. Проверить что backend жив
docker compose -f docker-compose.prod.yml exec -T backend \
  python manage.py check

# 8. Проверить что Celery Beat подхватил новые задачи
docker compose -f docker-compose.prod.yml logs celery-beat --tail 20
```

---

## 3. ПРОВЕРКА ПОСЛЕ ДЕПЛОЯ

### 3.1 Backend health

```bash
# API отвечает
curl -s http://localhost:8000/api/v1/health/ | python3 -m json.tool

# Marketing endpoints доступны
curl -s http://localhost:8000/api/v1/marketing/dashboard/ \
  -H "Authorization: Bearer <TOKEN>" | python3 -m json.tool

# Новые таблицы созданы
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U postgres finans_assistant -c "
    SELECT tablename FROM pg_tables 
    WHERE tablename LIKE 'marketing_%' 
    ORDER BY tablename;
  "
```

Ожидаемые таблицы:
```
marketing_avitoconfig
marketing_avitolisting
marketing_avitopublishedlisting
marketing_avitosearchkeyword
marketing_campaign
marketing_campaignrecipient
marketing_contacthistory
marketing_executorprofile
marketing_marketingsynclog
marketing_unisenderconfig
```

### 3.2 Seed-данные

```bash
# Ключевые слова засеяны
docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U postgres finans_assistant -c "
    SELECT keyword, is_active FROM marketing_avitosearchkeyword ORDER BY keyword;
  "
```

Ожидается 8 записей: вентиляция, кондиционирование, слабые токи, монтаж вентиляции, монтаж кондиционеров, климатическое оборудование, электромонтаж, пусконаладка.

### 3.3 Celery Beat — новые задачи

```bash
docker compose -f docker-compose.prod.yml logs celery-beat --tail 50 | grep -i marketing
```

Ожидается 3 задачи в расписании:
- `marketing-sync-avito-stats` (Пн 10:00)
- `marketing-refresh-avito-token` (каждые 12 часов)
- `marketing-cleanup-old-listings` (Вс 03:00)

### 3.4 Frontend

1. Открыть `https://avgust.prygunov.com/erp/marketing/executors`
2. Проверить:
   - [ ] Страница загружается, 5 вкладок видны
   - [ ] «База монтажников» — таблица пустая, кнопка «Добавить» работает
   - [ ] «Авито» → «Входящие» — пустая, кнопка «Добавить объявление» работает
   - [ ] «Рассылки» — пустая, кнопка «Создать рассылку» работает
   - [ ] «Настройки» — формы Avito и Unisender отображаются, сохраняются

### 3.5 Smoke test — создание исполнителя

1. Вкладка «База монтажников» → «Добавить»
2. Заполнить: Имя = «Тестовый Монтажник», ИНН = «000000000001», Город = «Москва»
3. Выбрать специализации: Вентиляция, Кондиционирование
4. Нажать «Создать»
5. Убедиться что появился в таблице
6. Кликнуть — проверить деталку
7. Удалить тестового

---

## 4. ОТКАТ (если что-то пошло не так)

### 4.1 Откат миграций marketing (если только marketing сломался)

```bash
docker compose -f docker-compose.prod.yml exec -T backend \
  python manage.py migrate marketing zero
```

Это удалит все таблицы marketing_*. Остальные данные не пострадают.

### 4.2 Полный откат на предыдущий бэкап

```bash
# 1. Остановить сервисы
docker compose -f docker-compose.prod.yml down

# 2. Восстановить БД из бэкапа
LATEST_BACKUP=$(ls -t /opt/backups/finans_assistant/db_*.sql.gz | head -1)
gunzip < "$LATEST_BACKUP" | docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U postgres finans_assistant

# 3. Откатить код
git checkout HEAD~1

# 4. Пересобрать и запустить
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d
```

### 4.3 Откат только кода (если миграции прошли но код сломан)

```bash
git revert a41b241
git push origin main
./deploy/deploy.sh
```

---

## 5. ПОСЛЕ УСПЕШНОГО ДЕПЛОЯ

- [ ] Бэкап после миграций: `./deploy/backup.sh`
- [ ] Удалить тестовые данные (если создавали)
- [ ] Проверить логи на ошибки: `docker compose -f docker-compose.prod.yml logs backend --tail 100 | grep -i error`
- [ ] Сообщить Свете что раздел «Поиск Исполнителей» доступен

# День 13. Миграция на PostgreSQL

## 1. Установка драйвера PostgreSQL

Добавлен `psycopg2-binary==2.9.9` в `requirements.txt` и установлен.

## 2. Обновление настроек базы данных

Обновлены настройки `DATABASES` в `settings.py`:

```python
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'finans_assistant',
        'USER': 'postgres',
        'PASSWORD': 'postgres',
        'HOST': 'localhost',
        'PORT': '5432',
    }
}
```

## 3. Создание базы данных

Создана база данных PostgreSQL:
- Имя: `finans_assistant`
- Пользователь: `postgres`
- Хост: `localhost`
- Порт: `5432`

## 4. Миграции

Выполнены все миграции на PostgreSQL:
- Все таблицы созданы успешно
- Все индексы и ограничения применены
- Данные из SQLite не переносились (чистая база)

## 5. Пользователь admin

Создан пользователь admin в новой базе данных:
- Username: `admin`
- Password: `admin`
- Email: `admin@example.com`
- Права: суперпользователь

## 6. Преимущества PostgreSQL

1. **Производительность** — лучше для production окружения
2. **Масштабируемость** — поддержка больших объёмов данных
3. **Расширения** — поддержка расширений (pg_trgm для поиска)
4. **Транзакции** — улучшенная поддержка транзакций
5. **Индексы** — более продвинутые типы индексов

## 7. Настройки для production

Для production окружения рекомендуется:
- Использовать переменные окружения для паролей
- Настроить connection pooling
- Включить логирование запросов
- Настроить резервное копирование

### Пример с переменными окружения:

```python
import os

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('DB_NAME', 'finans_assistant'),
        'USER': os.environ.get('DB_USER', 'postgres'),
        'PASSWORD': os.environ.get('DB_PASSWORD', 'postgres'),
        'HOST': os.environ.get('DB_HOST', 'localhost'),
        'PORT': os.environ.get('DB_PORT', '5432'),
    }
}
```

## 8. Проверка

Все тесты проходят успешно (63 теста) с PostgreSQL.

## 9. Следующие шаги

- Настроить переменные окружения для production
- Добавить расширения PostgreSQL (pg_trgm для поиска)
- Настроить connection pooling
- Настроить резервное копирование БД


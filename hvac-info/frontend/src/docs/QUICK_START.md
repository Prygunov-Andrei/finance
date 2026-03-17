# Быстрый старт - Исправление ошибок подключения

## Если видите ошибку "timeout of 30000ms exceeded"

### Шаг 1: Проверьте Django сервер

```bash
# В терминале перейдите в директорию Django проекта
cd path/to/your/django/project

# Запустите сервер
python manage.py runserver
```

Должны увидеть:
```
Starting development server at http://127.0.0.1:8000/
```

### Шаг 2: Запустите Ngrok туннель

```bash
# В новом терминале
ngrok http 8000 --domain=hvac-news.ngrok.io
```

Должны увидеть:
```
Forwarding  https://hvac-news.ngrok.io -> http://localhost:8000
```

### Шаг 3: Используйте встроенную диагностику

1. **Автоматически**: При ошибке откроется интерфейс диагностики
2. **Вручную**: Перейдите на `/api-settings`

**Действия:**
1. Выберите нужный URL:
   - Для production: `https://hvac-news.ngrok.io/api`
   - Для локальной разработки: `http://localhost:8000/api`
2. Нажмите **"Проверить доступность"**
3. При успехе нажмите **"Сохранить и перезагрузить"**

## Частые проблемы

### ❌ "timeout of 30000ms exceeded"

**Причина**: Django сервер не запущен или ngrok не работает

**Решение**:
1. Проверьте `python manage.py runserver`
2. Проверьте `ngrok http 8000`
3. Используйте диагностику в приложении

### ❌ "Mixed Content" ошибки

**Причина**: Старые URL изображений в базе данных

**Решение**: 
Автоматически исправляется! Система заменяет старые домены на текущий.
См. [MEDIA_URL_FIX.md](./MEDIA_URL_FIX.md)

### ❌ CORS ошибки

**Причина**: Неправильная настройка Django

**Решение**: В `settings.py` добавьте:
```python
CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "https://hvac-news.ngrok.io",
]
```

## Для локальной разработки (без ngrok)

1. Запустите Django: `python manage.py runserver`
2. Откройте приложение
3. При ошибке выберите `http://localhost:8000/api`
4. Проверьте доступность
5. Сохраните настройки

## Полезные команды

### Проверить текущий URL API (в консоли браузера):
```javascript
console.log(localStorage.getItem('api_base_url'));
```

### Сбросить на дефолтный:
```javascript
localStorage.removeItem('api_base_url');
window.location.reload();
```

### Установить вручную:
```javascript
localStorage.setItem('api_base_url', 'http://localhost:8000/api');
window.location.reload();
```

## Дополнительно

- [API_CONFIGURATION.md](./API_CONFIGURATION.md) - Полная документация по настройке API
- [API_TIMEOUT_FIX.md](./API_TIMEOUT_FIX.md) - Техническая документация исправления
- [MEDIA_URL_FIX.md](./MEDIA_URL_FIX.md) - Исправление ошибок с изображениями

---

**Дата обновления**: 22 января 2026

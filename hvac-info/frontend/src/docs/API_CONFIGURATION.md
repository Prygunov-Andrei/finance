# Настройка подключения к API

## Новый способ: Встроенная диагностика (РЕКОМЕНДУЕТСЯ)

### Автоматически при ошибке

При возникновении ошибки подключения к API:
1. Автоматически откроется интерфейс диагностики
2. Выберите нужный URL из предустановленных или введите свой
3. Нажмите **"Проверить доступность"** для тестирования
4. При успешной проверке нажмите **"Сохранить и перезагрузить"**

### Вручную через страницу настроек

Перейдите на `/api-settings` для:
- Изменения URL API
- Проверки доступности сервера
- Диагностики проблем подключения

**Предустановленные варианты:**
- Ngrok (Production): `https://hvac-news.ngrok.io/api`
- Localhost:8000: `http://localhost:8000/api`
- Localhost:8080: `http://localhost:8080/api`
- 127.0.0.1:8000: `http://127.0.0.1:8000/api`
- Свой URL: введите произвольный адрес

См. [API_TIMEOUT_FIX.md](./API_TIMEOUT_FIX.md) для подробной информации.

---

## Проблема: Сервер недоступен

Если вы видите ошибку "Network Error - API недоступен", это означает, что фронтенд не может подключиться к backend API.

### Частые причины:

1. **Django сервер не запущен**
   - Убедитесь, что Django работает: `python manage.py runserver`
   
2. **Ngrok туннель не работает**
   - Проверьте статус ngrok
   - Возможно, истёк срок действия туннеля
   - Перезапустите ngrok: `ngrok http 8000`

3. **Неправильный URL API**
   - URL в конфигурации не соответствует текущему адресу сервера

## Решение 1: Изменить URL API через интерфейс

1. При возникновении ошибки нажмите кнопку **"Изменить URL API"**
2. Выберите один из предустановленных вариантов или введите свой
3. Нажмите **"Проверить"** для проверки доступности
4. Если проверка прошла успешно, нажмите **"Сохранить и перезагрузить"**

### Предустановленные варианты:

- **Ngrok (Production)**: `https://hvac-news.ngrok.io/api`
- **Localhost:8000**: `http://localhost:8000/api`
- **Localhost:8080**: `http://localhost:8080/api`
- **127.0.0.1:8000**: `http://127.0.0.1:8000/api`

## Решение 2: Вручную через localStorage

Откройте консоль браузера (F12) и выполните:

```javascript
// Установить локальный сервер
localStorage.setItem('api_base_url', 'http://localhost:8000/api');

// Или установить ngrok
localStorage.setItem('api_base_url', 'https://hvac-news.ngrok.io/api');

// Перезагрузить страницу
window.location.reload();
```

## Решение 3: Изменить дефолтный URL в коде

Отредактируйте файл `/config/api.ts`:

```typescript
// Измените дефолтный URL на свой
return 'http://localhost:8000/api'; // вместо ngrok
```

## Проверка доступности API

### Через браузер:
Откройте в браузере: `https://hvac-news.ngrok.io/api/`

Вы должны увидеть либо JSON ответ, либо страницу Django REST framework.

### Через curl:
```bash
curl https://hvac-news.ngrok.io/api/
```

### Через консоль браузера:
```javascript
fetch('https://hvac-news.ngrok.io/api/')
  .then(res => res.json())
  .then(data => console.log('API доступен:', data))
  .catch(err => console.error('API недоступен:', err));
```

## Обработка URL изображений

Система автоматически заменяет старые ngrok домены на текущий:

- `finance.ngrok.app` → `hvac-news.ngrok.io`
- `cold-pugs-press.loca.lt` → `hvac-news.ngrok.io`

Это решает проблему **Mixed Content** ошибок при загрузке изображений из базы данных.

См. [MEDIA_URL_FIX.md](./MEDIA_URL_FIX.md) для подробностей.

## Дополнительные настройки

### CORS настройки (Django)

Убедитесь, что в `settings.py` правильно настроен CORS:

```python
CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",  # Vite dev server
    "http://localhost:3000",
    "https://hvac-news.ngrok.io",
]

CORS_ALLOW_CREDENTIALS = True
```

### Проверка Django

1. Запустите Django сервер
2. Проверьте логи на ошибки
3. Убедитесь, что API endpoints доступны:
   - `/api/news/`
   - `/api/references/manufacturers/`
   - `/api/references/brands/`
   - `/api/references/resources/`

## Восстановление дефолтных настроек

Чтобы вернуться к дефолтному URL:

```javascript
localStorage.removeItem('api_base_url');
window.location.reload();
```

## Диагностика

### Проверьте текущий URL API:
```javascript
console.log('Current API URL:', localStorage.getItem('api_base_url') || 'https://hvac-news.ngrok.io/api');
```

### Проверьте сетевые запросы:
1. Откройте DevTools (F12)
2. Перейдите на вкладку Network
3. Обновите страницу
4. Найдите запросы к API (например, `/api/news/`)
5. Проверьте статус ответа и заголовки
# Исправление ошибок таймаута при подключении к API

## Проблема

При попытке подключиться к backend API возникала ошибка:

```
Network Error - API недоступен: {
  "message": "timeout of 30000ms exceeded",
  "code": "ECONNABORTED"
}
```

Это означает, что сервер не отвечает в течение 30 секунд, что может быть вызвано:
1. Django сервер не запущен
2. Ngrok туннель не работает
3. Неправильный URL API в конфигурации

## Решение

### 1. Создан компонент диагностики подключения

**Файл:** `/components/ApiDiagnostics.tsx`

Интерактивный компонент для:
- Выбора URL API из предустановленных вариантов
- Ввода собственного URL
- Проверки доступности API
- Сохранения настроек в localStorage
- Автоматической перезагрузки приложения

### 2. Обновлен компонент отображения ошибок

**Файл:** `/components/ApiErrorBanner.tsx`

Теперь при критических ошибках подключения (таймаут, network error):
- Автоматически показывается компонент диагностики
- Пользователь видит инструкции по исправлению
- Доступна проверка подключения прямо из UI

### 3. Создана страница настроек API

**Файл:** `/pages/ApiSettings.tsx`
**Маршрут:** `/api-settings`

Отдельная страница для настройки подключения к API:
- Доступна без авторизации
- Можно открыть в любой момент
- Содержит полную диагностику

### 4. Добавлен компонент RadioGroup

**Файл:** `/components/ui/radio-group.tsx`

UI компонент для выбора вариантов API URL.

## Как использовать

### Автоматически

При возникновении ошибки таймаута или сетевой ошибки:
1. Автоматически откроется компонент диагностики
2. Выберите правильный URL или введите свой
3. Нажмите "Проверить доступность"
4. Если проверка успешна, нажмите "Сохранить и перезагрузить"

### Вручную

Перейдите на страницу `/api-settings` в любой момент для:
- Изменения URL API
- Проверки подключения
- Диагностики проблем

### Предустановленные варианты

1. **Ngrok (Permanent)**: `https://hvac-news.ngrok.io/api`
2. **Localhost:8000**: `http://localhost:8000/api`
3. **Localhost:8080**: `http://localhost:8080/api`
4. **127.0.0.1:8000**: `http://127.0.0.1:8000/api`
5. **Свой URL**: возможность ввести произвольный адрес

## Техническая реализация

### Проверка доступности

```typescript
const testUrl = async (url: string) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    signal: controller.signal,
  });
  
  clearTimeout(timeoutId);
  return response.ok;
};
```

### Сохранение настроек

```typescript
localStorage.setItem('api_base_url', urlToSave);
window.location.reload();
```

### Загрузка настроек

```typescript
const getBaseUrl = (): string => {
  const savedUrl = localStorage.getItem('api_base_url');
  if (savedUrl) return savedUrl;
  return 'https://hvac-news.ngrok.io/api';
};
```

## Инструкции для пользователя

При ошибке подключения:

1. **Проверьте Django сервер**
   ```bash
   python manage.py runserver
   ```

2. **Проверьте Ngrok туннель**
   ```bash
   ngrok http 8000 --domain=hvac-news.ngrok.io
   ```

3. **Выберите правильный URL**
   - Для локальной разработки: `http://localhost:8000/api`
   - Для production через ngrok: `https://hvac-news.ngrok.io/api`

4. **Проверьте доступность**
   - Используйте кнопку "Проверить доступность"
   - Таймаут проверки: 10 секунд

5. **Сохраните настройки**
   - Нажмите "Сохранить и перезагрузить"
   - Приложение автоматически перезагрузится

## Обработка ошибок

### Таймаут (10 секунд)
```
Таймаут соединения (10 сек)
```
→ Сервер не отвечает, проверьте запущен ли Django

### Network Error
```
Ошибка подключения: Failed to fetch
```
→ CORS проблемы или неправильный URL

### HTTP ошибки
```
API вернул ошибку: 404
```
→ Endpoint не найден, проверьте URL

## Файлы изменены

1. ✅ `/components/ApiDiagnostics.tsx` - создан
2. ✅ `/components/ui/radio-group.tsx` - создан
3. ✅ `/components/ApiErrorBanner.tsx` - обновлен
4. ✅ `/pages/ApiSettings.tsx` - создан
5. ✅ `/App.tsx` - добавлен маршрут `/api-settings`

## Дата исправления

22 января 2026

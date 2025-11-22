# День 11. Система авторизации и аутентификации

## 1. Настройка JWT аутентификации

Установлен и настроен `djangorestframework-simplejwt` для JWT аутентификации.

### Настройки JWT (settings.py)
- `ACCESS_TOKEN_LIFETIME`: 1 час
- `REFRESH_TOKEN_LIFETIME`: 7 дней
- `ROTATE_REFRESH_TOKENS`: True (автоматическая ротация refresh токенов)
- `BLACKLIST_AFTER_ROTATION`: True (блокировка старых токенов)
- `UPDATE_LAST_LOGIN`: True (обновление времени последнего входа)

### Настройки REST Framework
- `DEFAULT_AUTHENTICATION_CLASSES`: JWT и Session аутентификация
- `DEFAULT_PERMISSION_CLASSES`: `IsAuthenticated` (по умолчанию требуется авторизация)

## 2. Endpoints аутентификации

### Регистрация
```
POST /api/v1/users/register/
Body: {
    "username": "string",
    "email": "string",
    "password": "string",
    "password_confirm": "string",
    "first_name": "string",
    "last_name": "string"
}
Response: {
    "user": {...},
    "access": "jwt_token",
    "refresh": "refresh_token"
}
```

### Логин
```
POST /api/v1/auth/login/
Body: {
    "username": "string",
    "password": "string"
}
Response: {
    "access": "jwt_token",
    "refresh": "refresh_token"
}
```

### Обновление токена
```
POST /api/v1/auth/refresh/
Body: {
    "refresh": "refresh_token"
}
Response: {
    "access": "new_jwt_token"
}
```

### Проверка токена
```
POST /api/v1/auth/verify/
Body: {
    "token": "jwt_token"
}
Response: {} (200 OK если токен валиден)
```

## 3. Управление пользователями

### Получить текущего пользователя
```
GET /api/v1/users/me/
Headers: Authorization: Bearer {token}
Response: {
    "id": 1,
    "username": "testuser",
    "email": "test@example.com",
    ...
}
```

### Смена пароля
```
POST /api/v1/users/change_password/
Headers: Authorization: Bearer {token}
Body: {
    "old_password": "string",
    "new_password": "string",
    "new_password_confirm": "string"
}
Response: {
    "message": "Пароль успешно изменён"
}
```

## 4. Защита endpoints

Все ViewSets теперь требуют авторизации:
- `ObjectViewSet` — `IsAuthenticated`
- `ContractViewSet` — `IsAuthenticated`
- `PaymentViewSet` — `IsAuthenticated`
- `PaymentRegistryViewSet` — `IsAuthenticated`
- `ImportLogViewSet` — `IsAuthenticated`

### Публичные endpoints
- `POST /api/v1/users/register/` — регистрация (AllowAny)

### Защищённые endpoints
- Все остальные endpoints требуют JWT токен в заголовке:
  ```
  Authorization: Bearer {access_token}
  ```

## 5. Сериализаторы

### UserSerializer
- Отображает информацию о пользователе
- Read-only поля: `id`, `date_joined`

### RegisterSerializer
- Валидация паролей (совпадение, сложность)
- Создание нового пользователя

### ChangePasswordSerializer
- Проверка старого пароля
- Валидация нового пароля

## 6. Тесты

Добавлены comprehensive тесты в `core/tests_auth.py`:
- Регистрация пользователя
- Логин с валидными и невалидными данными
- Обновление токена
- Получение информации о текущем пользователе
- Смена пароля
- Проверка доступа к защищённым endpoints

Всего 13 новых тестов для авторизации. Общее количество тестов в проекте: 63 (все проходят успешно).

## 7. Использование в клиенте

### Пример запроса с токеном
```javascript
fetch('/api/v1/objects/', {
    headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json'
    }
})
```

### Обновление токена
```javascript
// Когда access токен истекает, обновляем его через refresh токен
fetch('/api/v1/auth/refresh/', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({refresh: refreshToken})
})
```

## 8. Безопасность

- Пароли хранятся в хешированном виде (Django по умолчанию)
- JWT токены имеют ограниченное время жизни
- Refresh токены автоматически ротируются
- Старые токены блокируются после ротации
- CORS настроен для работы с фронтендом

## 9. Следующие шаги

- Добавить роли пользователей (администратор, аналитик, менеджер)
- Реализовать права доступа на основе ролей
- Добавить rate limiting для защиты от злоупотреблений
- Настроить логирование попыток входа


# Error Messages Catalogue

**Версия:** 0.1. **Дата:** 2026-04-15. **Источник:** UX ревью I.

Каталог стандартных пользовательских error сообщений ISMeta. Решает дилемму: RFC 7807 formal vs user-friendly.

## 0. Принцип

- **Backend** возвращает RFC 7807 Problem Details JSON (для машин).
- **Frontend** мэппит `type` URI на human-readable сообщение.
- **Accessibility:** все errors имеют ARIA roles.

## 1. Anatomy error сообщения

### 1.1 Good error message

```
Заголовок: [что случилось — коротко]
Детали: [почему — понятно]
Action: [что сделать]
```

**Пример:**
```
Заголовок: Смета не сохранена
Детали: Эта смета была изменена в другой вкладке.
Action: [Перезагрузить] [Сохранить мою версию]
```

### 1.2 Bad error message

```
Ошибка: ValidationError [Object of type EstimateItem is not JSON serializable]
```

Не для пользователя.

---

## 2. Каталог errors

### 2.1 Validation errors (4xx)

#### E001: Обязательное поле не заполнено

- **Backend type:** `https://ismeta.example.com/errors/validation/required`
- **HTTP:** 422
- **UI сообщение:** «Поле "{field_name}" обязательно для заполнения.»
- **Контекст:** показывается рядом с полем.
- **ARIA:** `aria-describedby` на input.

#### E002: Неверный формат

- **Backend type:** `...errors/validation/invalid-format`
- **HTTP:** 422
- **UI сообщение:** «Формат "{field_name}" неверен. Ожидается: {expected}.»

#### E003: Значение вне допустимого диапазона

- **Backend type:** `...errors/validation/out-of-range`
- **HTTP:** 422
- **UI сообщение:** «"{field_name}" должно быть от {min} до {max}.»

#### E004: Ссылка на несуществующий объект

- **Backend type:** `...errors/validation/reference-not-found`
- **HTTP:** 422
- **UI сообщение:** «{entity} "{name}" не найдена. Возможно, была удалена.»
- **Action:** [Обновить список] [Выбрать другое]

### 2.2 Authentication errors (401)

#### E101: Не авторизован

- **Backend type:** `...errors/auth/unauthorized`
- **HTTP:** 401
- **UI сообщение:** «Сессия истекла. Пожалуйста, войдите снова.»
- **Action:** [Войти]

#### E102: Недостаточно прав

- **Backend type:** `...errors/auth/forbidden`
- **HTTP:** 403
- **UI сообщение:** «У вас нет прав для этого действия.»
- **Детали:** «Требуется роль: {required_role}».

#### E103: OTP неверный

- **Backend type:** `...errors/auth/invalid-otp`
- **HTTP:** 400
- **UI сообщение:** «Неверный или устаревший код. Запросите новый.»

### 2.3 Not found (404)

#### E201: Ресурс не найден

- **Backend type:** `...errors/not-found`
- **HTTP:** 404
- **UI сообщение:** «{entity} не найдено или у вас нет к нему доступа.»
- **Примечание:** 404 вместо 403 для multi-tenancy security.

### 2.4 Conflict (409)

#### E301: Optimistic lock conflict

- **Backend type:** `...errors/conflict/version-mismatch`
- **HTTP:** 409
- **UI сообщение:** «Эта запись была изменена. Перезагрузить или перезаписать?»
- **Action:** [Перезагрузить] [Перезаписать]
- **Детали:** показать diff.

#### E302: Duplicate

- **Backend type:** `...errors/conflict/duplicate`
- **HTTP:** 409
- **UI сообщение:** «Смета с номером "{number}" уже существует.»

### 2.5 Rate limit (429)

#### E401: Rate limit exceeded

- **Backend type:** `...errors/rate-limited`
- **HTTP:** 429
- **UI сообщение:** «Слишком много запросов. Попробуйте через {retry_after} секунд.»

### 2.6 Server errors (5xx)

#### E501: Internal error

- **Backend type:** `...errors/internal`
- **HTTP:** 500
- **UI сообщение:** «Что-то пошло не так. Команда уведомлена.»
- **Детали:** `Request ID: {request_id}` (для support).
- **Sentry:** auto-logged.

#### E502: Upstream unavailable (ERP)

- **Backend type:** `...errors/upstream/erp-unavailable`
- **HTTP:** 503
- **UI сообщение:** «Временно нет связи с ERP. Большая часть работы доступна.»
- **Баннер в UI:** «Связь с ERP восстановится в течение N минут.»

#### E503: LLM provider unavailable

- **Backend type:** `...errors/upstream/llm-unavailable`
- **HTTP:** 503
- **UI сообщение:** «AI-ассистент временно недоступен. Используйте ручной поиск.»

#### E504: Upload too large

- **Backend type:** `...errors/upload/too-large`
- **HTTP:** 413
- **UI сообщение:** «Файл слишком большой ({size} MB). Максимум: {max_size} MB.»

#### E505: Upload file type

- **Backend type:** `...errors/upload/invalid-type`
- **HTTP:** 400
- **UI сообщение:** «Этот тип файла не поддерживается. Принимаем: PDF, Excel.»

### 2.7 Business logic (специфические)

#### E601: Смета в read-only

- **Backend type:** `...errors/business/estimate-readonly`
- **HTTP:** 409
- **UI сообщение:** «Эта версия сметы отправлена в ERP и защищена от изменений.»
- **Action:** [Создать новую версию]

#### E602: Не хватает бюджета LLM

- **Backend type:** `...errors/business/llm-budget-exceeded`
- **HTTP:** 403
- **UI сообщение:** «LLM-бюджет вашего workspace исчерпан. Обратитесь к администратору.»

#### E603: Прайс-лист не выбран

- **Backend type:** `...errors/business/no-price-list`
- **HTTP:** 422
- **UI сообщение:** «Для подбора работ нужно выбрать прайс-лист.»
- **Action:** [Выбрать прайс-лист]

#### E604: Смета пустая

- **Backend type:** `...errors/business/empty-estimate`
- **HTTP:** 422
- **UI сообщение:** «Нельзя отдать пустую смету в ERP. Добавьте строки.»

#### E605: Invalid row_id в Excel

- **Backend type:** `...errors/business/invalid-row-id`
- **HTTP:** 422
- **UI сообщение:** «Импорт заблокирован: потеряны идентификаторы строк. Попробуйте экспортировать смету заново и отредактировать новый файл.»

### 2.8 Recognition errors

#### E701: Recognition failed

- **Backend type:** `...errors/recognition/failed`
- **HTTP:** 500 (от recognition service)
- **UI сообщение:** «Не удалось распознать файл. Попробуйте другой формат или обратитесь в поддержку.»

#### E702: Recognition partial

- **Backend type:** `...errors/recognition/partial`
- **HTTP:** 200 с warning
- **UI сообщение:** «Файл распознан частично. {count} страниц из {total} не обработаны.»
- **Action:** [Продолжить] [Попробовать другой файл]

### 2.9 Network errors

#### E801: Offline

- **Frontend detected:** `navigator.onLine = false`
- **UI сообщение (toast):** «Связь потеряна. Изменения сохраняются локально, синхронизируются при восстановлении.»

#### E802: Slow network

- **Detection:** response time > 5s на простых запросах.
- **UI сообщение:** «Связь медленная. Некоторые действия могут занять больше времени.»

---

## 3. Визуальные стили errors

### 3.1 Severity-based styling

| Severity | Color | Icon | Pattern |
|---|---|---|---|
| Info | Blue (#2563eb) | ℹ️ | `role="status"` |
| Warning | Yellow (#d97706) | ⚠️ | `role="status"` |
| Error (field-level) | Red (#dc2626) | ❌ | `role="alert"` внутри form |
| Error (critical) | Red (#dc2626) | ⛔ | `role="alert"` top of page |
| Success | Green (#16a34a) | ✓ | `role="status"` toast |

### 3.2 Position

- **Field-level:** под input, inline.
- **Form-level:** наверху формы.
- **Page-level:** toast справа сверху, auto-dismiss 5s.
- **Critical:** full-width banner сверху страницы, не auto-dismiss.

### 3.3 Color + text + icon

Никогда только color (не доступно для color-blind). Всегда triple: color + icon + text.

---

## 4. Recovery patterns

### 4.1 Retry

Automatically or user-initiated:
- Network timeout: auto-retry 3×.
- LLM timeout: user-initiated «Попробовать снова».
- Save conflict: merge dialog.

### 4.2 Undo

- После destructive action: toast с «Отменить» 30 сек.
- После accidental change: Ctrl+Z.

### 4.3 Graceful degradation

- ERP недоступен: local data + warning banner.
- LLM недоступен: manual search mode.
- Backup не прошёл: warning на admin dashboard.

---

## 5. Localization

В MVP — русский. В backlog — мульти-язык.

### 5.1 Format

- `t('error.validation.required', {field: fieldName})`.
- Ключи в `frontend/locales/ru/errors.json`.

### 5.2 Interpolation

- `{field_name}`, `{count}`, `{size}`, `{max_size}` etc.
- Pluralization: `{count, plural, one {# позиция} few {# позиции} other {# позиций}}`.

---

## 6. Logging errors

### 6.1 Client-side

- JavaScript errors → Sentry.
- User-initiated errors (rate limit, validation) — не в Sentry.

### 6.2 Server-side

- Validation, 4xx — DEBUG level.
- 5xx — ERROR level, to Sentry.
- Security errors (auth failures) — WARNING, отдельный log channel.

### 6.3 PII masking

В логах — не пишем full error body если содержит email, phone, имена.

---

## 7. Accessibility

### 7.1 ARIA roles

- Critical errors: `role="alert"` (assertive).
- Status messages: `role="status"` (polite).
- Form field errors: `aria-describedby` linking к ошибке.

### 7.2 Focus management

- Форм-ошибка: focus на первый invalid field.
- Critical error: focus на dialog.
- Success message: focus сохраняется, message announces.

---

## 8. Testing

### 8.1 Unit tests

Каждый error code должен иметь test:
- Backend: возвращает правильный type.
- Frontend: показывает правильное сообщение.

### 8.2 Integration tests

- E2E: заставить возникнуть error и проверить UX.

### 8.3 Accessibility tests

- axe-core проверяет ARIA на error states.

---

## 9. Добавление нового error

1. Определить `type` URI (следуя convention).
2. Добавить в backend serializer.
3. Добавить в frontend locales.
4. Добавить в этот documentation.
5. Тесты.
6. PR с label `error-message`.

---

## 10. Связанные документы

- [`specs/02-api-contracts.md §Формат ошибок`](../specs/02-api-contracts.md)
- [`UX-REVIEW.md §I`](./UX-REVIEW.md)
- [`A11Y.md`](./A11Y.md)
- [`runbooks/`](./runbooks/)

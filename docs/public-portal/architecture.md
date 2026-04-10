# Публичный портал — Архитектура

## Обзор

Публичный портал позволяет внешним пользователям работать со сметами без регистрации в ERP. Полностью переиспользует ERP-компоненты через API injection.

## Архитектура

```
Frontend (Next.js)
├── /smeta                    # Лендинг + регистрация
├── /smeta/cabinet            # Личный кабинет (защищён ExternalUserTokenAuth)
│   ├── page.tsx              # Главная — редактор сметы
│   └── layout.tsx            # Навигация + auth guard
└── /smeta/requests/[token]   # Legacy — статус быстрой оценки

Backend (Django)
├── /api/public/v1/register/  # OTP регистрация
├── /api/public/v1/login/     # OTP логин → session_token
├── /api/public/v1/me/        # Текущий пользователь
└── /api/public/v1/cabinet/   # ViewSet CRUD (ExternalUserTokenAuth)
    ├── estimates/            # CRUD сметы (max 1 активная)
    ├── estimate-sections/    # CRUD секций
    ├── estimate-items/       # CRUD строк (max 500) + bulk ops
    ├── work-matching/        # Подбор работ (start/progress/apply)
    └── export/               # Excel экспорт
```

## Переиспользование компонентов

### API Injection (React Context)

```typescript
// frontend/lib/api/estimate-api-context.tsx
const EstimateApiContext = createContext<EstimateApi>(api.estimates);
export const useEstimateApi = () => useContext(EstimateApiContext);
```

**ERP**: компоненты используют `api.estimates` (default provider)
**Портал**: оборачивает в `<EstimateApiProvider value={publicEstimatesApi}>`

### Переиспользуемые компоненты

| Компонент | ERP | Портал |
|-----------|-----|--------|
| EstimateItemsEditor | да | да |
| WorkMatchingDialog | да | да |
| WorkMatchingResults | да | да |
| WorkItemPicker | да | да |
| AutoMatchDialog | да | да |
| EstimateImportDialog | да | да |

## Аутентификация

1. **Регистрация**: email + OTP (6 цифр, 10 мин TTL, Redis cache)
2. **Логин**: email + OTP → session_token (7 дней)
3. **Авторизация**: `Authorization: Token <session_token>` → `ExternalUserTokenAuth`
4. **Модель**: `ExternalUser` (email, phone, company_name, contact_name)

## Маркировка данных

Все данные из портала помечаются `public_source=True`:
- `Estimate.public_source` + `Estimate.external_user`
- `ProductWorkMapping.public_source`
- `ProductKnowledge.public_source`

Public-данные участвуют в обучении с пониженным приоритетом (Knowledge: status=PENDING).

## Ограничения портала

| Параметр | Лимит |
|----------|-------|
| Активных смет | 1 на пользователя |
| Позиций в смете | 500 |
| Session token TTL | 7 дней |
| API throttle | 100 req/hour |

# AI-триаж обращений сотрудников — план реализации

> Статус: планирование. Дата: 2026-03-26.

## Идея

Расширить существующую систему обращений (`section_feedback`) так, чтобы Claude Code мог подхватывать новые обращения, анализировать их, предлагать ответы пользователям и готовить планы исправлений для разработчика.

**Принцип**: частичная автоматизация, интерактивный режим. Разработчик запускает `/triage` в Claude Code, видит каждое обращение с AI-анализом, сам решает что делать — отправить ответ, пропустить, изменить.

## Существующая система

Система `section_feedback` уже работает:
- **Backend**: модели `SectionFeedback` (12 разделов, 3 статуса), `FeedbackReply` (треды), `FeedbackAttachment` (скриншоты)
- **Frontend**: `FeedbackWidget` встроен в каждый из 12 разделов ERP (страницы instructions/)
- **Дашборд**: `FeedbackDashboard` — статистика, фильтры по разделу/статусу, управление статусом
- **API**: полный CRUD + ответы + вложения + статистика по `/api/v1/section-feedback/`

## Рабочий процесс (целевой)

```
Сотрудник → FeedbackWidget → создаёт обращение (status=new, category=uncategorized)
       ↓
Разработчик → Claude Code → /triage
       ↓
Claude Code показывает каждое обращение + свой анализ:
  - Классификация: баг / предложение / вопрос / непонимание фичи
  - Если баг → план исследования кода
  - Если предложение → оценка и варианты
  - Если непонимание → объяснение для пользователя
  - Предложенный ответ пользователю
       ↓
Разработчик: "отправляй" / "измени ответ" / "пропусти" / "задай вопрос"
       ↓
Claude Code → POST reply (is_ai=true) + PATCH category/status через API
       ↓
Сотрудник видит ответ AI в виджете → может ответить
       ↓
Следующий /triage подхватит новые ответы
```

## Необходимые изменения

### Этап 1: Backend — модели + миграция

**`backend/section_feedback/models.py`**

SectionFeedback — добавить поле `category`:
```python
class Category(models.TextChoices):
    UNCATEGORIZED = 'uncategorized', 'Не классифицировано'
    BUG = 'bug', 'Баг'
    FEATURE_REQUEST = 'feature_request', 'Предложение'
    QUESTION = 'question', 'Вопрос'
    MISUNDERSTANDING = 'misunderstanding', 'Непонимание фичи'

category = CharField(max_length=20, choices=Category.choices, default='uncategorized')
```

FeedbackReply — добавить поле `is_ai`:
```python
is_ai = BooleanField(default=False)
```

Миграция создаёт реального User `claude_ai` (is_staff=False, is_active=True, без пароля) — нужен как author для AI-ответов. `ServiceUser` из `hvac_bridge` не подходит (pk=0, не реальная запись в auth_user).

### Этап 2: Backend — API

**`backend/section_feedback/views.py`**

1. Добавить `ServiceTokenAuthentication` (из `hvac_bridge.authentication`) в authentication_classes
2. Новый action `triage` (GET): возвращает status=new + category=uncategorized
3. В action `replies` (POST): если ServiceToken + is_ai=True → автор = User `claude_ai`
4. Расширить PATCH: разрешить обновление `category`

**`backend/section_feedback/serializers.py`**

- Добавить `category` в List/Detail/Status сериализаторы
- Добавить `is_ai` в Reply сериализаторы

### Этап 3: Frontend — отображение AI-ответов

**`frontend/components/erp/components/feedback/FeedbackThread.tsx`**

AI-ответы (is_ai=true) визуально отличаются: иконка бота + пометка "Claude AI" + другой фон. Нужно чтобы сотрудник понимал что ему ответил AI, а не разработчик.

Дашборд не трогаем — вся работа через Claude Code.

### Этап 4: Команда /triage

**`.claude/commands/triage.md`**

Custom slash-command для Claude Code:
1. GET /api/v1/section-feedback/triage/ (через ServiceToken)
2. Для каждого обращения: анализ + предложенный ответ
3. Ожидание решения разработчика
4. POST reply + PATCH category/status
5. Итоговая сводка

### Этап 5: Тесты

**`backend/section_feedback/tests/test_triage.py`**
- Тест модели: category default, is_ai default
- Тест API: GET /triage/, POST reply is_ai, PATCH category
- Тест permissions: обычный пользователь не может ставить is_ai=true

## Ключевые файлы для изменения

| Файл | Что менять |
|------|-----------|
| `backend/section_feedback/models.py` | +category, +is_ai |
| `backend/section_feedback/migrations/0002_*.py` | Миграция + User claude_ai |
| `backend/section_feedback/serializers.py` | category и is_ai в сериализаторы |
| `backend/section_feedback/views.py` | ServiceToken auth, triage action |
| `backend/section_feedback/admin.py` | category в list_display |
| `frontend/lib/api/types/section-feedback.ts` | +category, +is_ai |
| `frontend/components/erp/components/feedback/FeedbackThread.tsx` | Стиль AI-ответов |
| `.claude/commands/triage.md` | Команда /triage |

## Переиспользуемые паттерны

- `ServiceTokenAuthentication` — `backend/hvac_bridge/authentication.py`
- `IsServiceToken` — `backend/core/service_permissions.py`
- `TimestampedModel` — `backend/core/models.py`
- Иконки: Bot из lucide-react

## Что НЕ делаем

- Автоматический триаж (Celery/cron) — только по команде /triage
- Расширение дашборда — категории, AI-анализ, кнопки approve/reject
- Поля ai_summary и developer_decision в модели
- WebSocket/SSE уведомления
- Интеграция Anthropic API в backend
- Телеграм-бот интеграция

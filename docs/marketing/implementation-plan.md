# План реализации: Поиск Исполнителей + Интеграция с Avito

> Дата: 2026-04-10  
> Статус: Утверждён  
> Основан на: `docs/marketing/avito-integration-concept.md`

---

## 0. Выявленные узкие места и рефакторинг

Перед описанием фаз — критический анализ концепции. Каждый пункт ниже решается в соответствующей фазе плана.

### 0.1 КРИТИЧНО: Avito API не имеет публичного поиска чужих объявлений

Официальный Avito API (developers.avito.ru) предоставляет управление **собственными** объявлениями: публикация, статистика, мессенджер. Endpoint для поиска по всей базе объявлений **отсутствует** в публичном API.

**Решение (трёхуровневое):**
1. **Autoload API + Messenger** — для публикации наших МП и общения с откликнувшимися (полностью через API)
2. **Ручной ввод + мониторинг** — маркетолог просматривает Avito вручную, вносит найденные объявления в ERP через удобную форму «Быстрое добавление» (copy-paste ссылки + автопарсинг)
3. **Будущее: парсинг** — отдельный микросервис для мониторинга (вне scope текущего плана, но архитектура должна это поддерживать)

Вместо автоматического сканирования в Фазе 3 реализуем:
- Быстрое добавление объявления по URL (парсинг через Avito API `/items/v2/item/{itemId}`)
- Кнопка «Добавить вручную» с минимумом полей
- Bulk-импорт из CSV/Excel

### 0.2 Singleton race condition

В проекте все singleton-модели используют `.objects.first()` без защиты от конкурентного создания. Новые модели `AvitoConfig` и `UnisenderConfig` должны использовать безопасный паттерн.

**Решение:**
```python
@classmethod
def get(cls):
    """Thread-safe singleton"""
    with transaction.atomic():
        obj, _ = cls.objects.select_for_update().get_or_create(pk=1)
    return obj

def save(self, *args, **kwargs):
    self.pk = 1
    super().save(*args, **kwargs)
```

### 0.3 INN обязателен в Counterparty, но монтажники-физлица могут не иметь ИНН

Поле `inn` в Counterparty — `unique=True`, не blank, не null. При конвертации Avito-листинга в исполнителя ИНН неизвестен.

**Решение:**
- Генерировать placeholder INN: `AVITO-{avito_user_id}` (max_length=12 позволяет)
- Валидация `Counterparty.clean()` — разрешить не-цифровой ИНН для `legal_form='fiz'`
- При верификации исполнителя — заменить placeholder на реальный ИНН
- Альтернатива (чище): сделать `inn` nullable для `legal_form='fiz'`. Требует миграцию — обсудить отдельно

### 0.4 JSONField `specializations` не поддерживает `__overlap`

PostgreSQL `__overlap` работает с `ArrayField`, но не с `JSONField`. В концепции используется `qs.filter(specializations__overlap=...)`.

**Решение:**
- Заменить `JSONField` на `ArrayField(models.CharField(...), blank=True, default=list)` 
- Это позволит `__overlap`, `__contains`, `__contained_by` lookups
- PostgreSQL-специфично, но мы уже используем PostgreSQL

### 0.5 Сигнал на MountingProposal — нет отслеживания предыдущего статуса

`post_save` не передаёт информацию о том, что статус **изменился**. Сигнал сработает при каждом сохранении МП со статусом `published`.

**Решение:**
```python
@receiver(pre_save, sender=MountingProposal)
def _cache_old_status(sender, instance, **kwargs):
    if instance.pk:
        try:
            instance._old_status = sender.objects.values_list('status', flat=True).get(pk=instance.pk)
        except sender.DoesNotExist:
            instance._old_status = None

@receiver(post_save, sender=MountingProposal)
def auto_publish_mp_to_avito(sender, instance, created, **kwargs):
    old_status = getattr(instance, '_old_status', None)
    if instance.status == 'published' and old_status != 'published':
        # ... trigger publish
```

### 0.6 Frontend: нет Sheet/Drawer и MultiSelect компонентов

- **Sheet** — нет в проекте. Для detail-панели использовать **Dialog** (max-w-4xl) — это стандартный паттерн проекта.
- **MultiSelect для специализаций** — реализовать как группу Checkbox (паттерн из EditCounterpartyForm). Список специализаций конечный (8 значений), checkbox-группа — идеально.

### 0.7 Отсутствует очистка старых данных

AvitoListing будут накапливаться. Нужна стратегия архивации.

**Решение:** Celery-задача `cleanup_old_listings` — удалять `rejected` старше 90 дней, архивировать `converted` старше 180 дней.

### 0.8 Рефакторинг: BaseAPITestCase дублируется в 4+ приложениях

Каждое приложение определяет свой `BaseAPITestCase`. Для нового приложения — использовать pytest fixtures из корневого `conftest.py` (admin_user, authenticated_client), а не дублировать class-based тесты.

---

## Фаза 1: Django app + модели + базовые API (3 дня)

> Цель: рабочий backend с CRUD для всех моделей, покрытый тестами.

### 1.1 Создание Django-приложения

**Файл**: `backend/marketing/__init__.py`, `apps.py`, `admin.py`, `models.py`, `serializers.py`, `views.py`, `urls.py`, `signals.py`, `tasks.py`

```bash
cd backend && python manage.py startapp marketing
```

Структура:
```
backend/marketing/
    __init__.py
    apps.py                          # MarketingConfig с ready() для сигналов
    models.py                        # все 10 моделей
    serializers.py                   # все сериализаторы
    views.py                         # ViewSets
    urls.py                          # DRF router
    signals.py                       # pre_save/post_save для MountingProposal
    tasks.py                         # Celery tasks (заглушки)
    clients/
        __init__.py
        avito.py                     # AvitoAPIClient (заглушка с интерфейсом)
        unisender.py                 # UnisenderClient (заглушка)
    services/
        __init__.py
        executor_service.py          # ExecutorService
        avito_publisher.py           # AvitoPublisherService (заглушка)
        campaign_service.py          # CampaignService (заглушка)
    tests/
        __init__.py
        conftest.py                  # фикстуры: counterparty, executor_profile, avito_config
        test_models.py
        test_api.py
    migrations/
```

### 1.2 Модели — исправления относительно концепции

**Изменения:**

| Модель | Изменение | Причина |
|--------|-----------|---------|
| `ExecutorProfile.specializations` | `JSONField` → `ArrayField(CharField)` | Поддержка `__overlap` для фильтрации |
| `AvitoConfig.get()` | `objects.first()` → `get_or_create(pk=1)` + `select_for_update` | Race condition |
| `UnisenderConfig.get()` | Аналогично | Race condition |
| `AvitoConfig`, `UnisenderConfig` | Добавить `save()` с `self.pk = 1` | Singleton enforcement |
| `AvitoListing` | Добавить `published_at` (DateTimeField) | Дата публикации объявления на Avito |
| `AvitoListing` | Убрать `seller_phone` (API не даёт телефоны чужих объявлений) | Реалистичность |
| `ContactHistory` | Добавить `avito_listing` FK (nullable) | Связь с конкретным объявлением |

**Файлы для изменения:**
- Создать: `backend/marketing/models.py` (все модели)
- Изменить: `backend/finans_assistant/settings.py` — добавить `'marketing'` в `INSTALLED_APPS`
- Изменить: `backend/finans_assistant/urls.py` — `path('api/v1/', include('marketing.urls'))`

### 1.3 Миграции

```bash
python manage.py makemigrations marketing
python manage.py migrate
```

**Data migration**: создать `0002_seed_keywords.py` для предустановки ключевых слов:
- вентиляция, кондиционирование, слабые токи, монтаж вентиляции, монтаж кондиционеров, климатическое оборудование, электромонтаж, пусконаладка

### 1.4 Сериализаторы

**Паттерн**: List-сериализатор (краткий) + Detail-сериализатор (полный), как в `proposals/serializers.py`.

```python
# Ключевые сериализаторы:
class ExecutorProfileListSerializer     # для таблицы: id, name, city, specializations, rating, is_potential, is_available
class ExecutorProfileDetailSerializer   # полный: все поля + counterparty nested + contact_history count
class ExecutorProfileCreateSerializer   # создание: с вложенным созданием Counterparty
class AvitoConfigSerializer             # singleton PATCH
class AvitoSearchKeywordSerializer      # CRUD
class AvitoListingListSerializer        # для таблицы входящих
class AvitoListingDetailSerializer      # полный
class AvitoPublishedListingSerializer   # для таблицы наших публикаций
class ContactHistorySerializer          # для списка
class CampaignListSerializer            # для таблицы рассылок
class CampaignDetailSerializer          # полный с recipients count
class CampaignCreateSerializer          # создание/редактирование
class CampaignRecipientSerializer       # для списка получателей
class UnisenderConfigSerializer         # singleton PATCH
class MarketingSyncLogSerializer        # для списка логов
```

### 1.5 ViewSets

Создать `backend/marketing/views.py` по паттерну из `supplier_integrations/views.py`:

```python
class ExecutorProfileViewSet(viewsets.ModelViewSet):
    # Оптимизация: select_related('counterparty'), prefetch_related('work_sections')
    # Фильтрация: city, specializations__overlap, is_potential, is_available, source
    # Поиск: по name контрагента, phone, email, city
    # @action: contact-history (GET), add-contact (POST)

class AvitoSearchKeywordViewSet(viewsets.ModelViewSet):
    # Простой CRUD

class AvitoListingViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    # Только чтение + actions
    # Фильтрация: status, keyword, city, discovered_at range
    # @action: update-status (PATCH), convert (POST)

class AvitoPublishedListingViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    # Только чтение
    # @action: refresh-stats (POST)

class CampaignViewSet(viewsets.ModelViewSet):
    # CRUD + actions
    # @action: send (POST), preview (GET), recipients (GET)

# Singleton views (RetrieveUpdateAPIView):
class AvitoConfigView(generics.RetrieveUpdateAPIView)
class UnisenderConfigView(generics.RetrieveUpdateAPIView)

class MarketingSyncLogViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    # Только чтение, фильтрация по sync_type и status

# Function-based views:
@api_view(['POST'])
def trigger_avito_scan(request)        # запуск ручного сканирования

@api_view(['POST'])
def publish_mp_to_avito(request, mp_id) # публикация МП
```

### 1.6 URL routing

Создать `backend/marketing/urls.py`:
```python
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register('executor-profiles', views.ExecutorProfileViewSet, basename='executor-profile')
router.register('avito/keywords', views.AvitoSearchKeywordViewSet, basename='avito-keyword')
router.register('avito/listings', views.AvitoListingViewSet, basename='avito-listing')
router.register('avito/published', views.AvitoPublishedListingViewSet, basename='avito-published')
router.register('campaigns', views.CampaignViewSet, basename='campaign')
router.register('sync-logs', views.MarketingSyncLogViewSet, basename='sync-log')

urlpatterns = [
    path('marketing/', include(router.urls)),
    path('marketing/avito/config/', views.AvitoConfigView.as_view(), name='avito-config'),
    path('marketing/unisender/config/', views.UnisenderConfigView.as_view(), name='unisender-config'),
    path('marketing/avito/scan/', views.trigger_avito_scan, name='avito-scan'),
    path('marketing/avito/publish-mp/<int:mp_id>/', views.publish_mp_to_avito, name='avito-publish-mp'),
    path('marketing/dashboard/', views.marketing_dashboard, name='marketing-dashboard'),
]
```

### 1.7 Admin

Создать `backend/marketing/admin.py` — регистрация всех моделей с полезными list_display, list_filter, readonly_fields. Паттерн из `supplier_integrations/admin.py`.

### 1.8 Тесты Фазы 1

**`tests/conftest.py`** — pytest-фикстуры (НЕ дублировать BaseAPITestCase):
```python
@pytest.fixture
def counterparty_executor(db):
    """Контрагент-исполнитель для тестов"""
    return Counterparty.objects.create(
        name='ИП Тестовый Монтажник',
        short_name='Монтажник',
        type=Counterparty.Type.VENDOR,
        vendor_subtype=Counterparty.VendorSubtype.EXECUTOR,
        legal_form=Counterparty.LegalForm.IP,
        inn='123456789012',
    )

@pytest.fixture
def executor_profile(counterparty_executor):
    return ExecutorProfile.objects.create(
        counterparty=counterparty_executor,
        phone='+79001234567',
        email='test@example.com',
        city='Москва',
        specializations=['ventilation', 'conditioning'],
        is_potential=True,
    )

@pytest.fixture
def avito_config(db):
    return AvitoConfig.get()

@pytest.fixture
def unisender_config(db):
    return UnisenderConfig.get()
```

**`tests/test_models.py`** (~20 тестов):
- Создание ExecutorProfile с counterparty
- Singleton AvitoConfig.get() — создание и повторное получение
- Singleton UnisenderConfig.get()
- AvitoConfig.is_token_valid() — expired / valid
- AvitoSearchKeyword уникальность
- AvitoListing дедупликация по avito_item_id
- AvitoPublishedListing связь с MountingProposal
- Campaign фильтры — resolve_recipients (переместить логику в model manager или оставить в service)
- CampaignRecipient unique_together
- ContactHistory создание
- MarketingSyncLog создание
- ExecutorProfile.specializations — ArrayField overlap фильтрация

**`tests/test_api.py`** (~30 тестов):
- CRUD ExecutorProfile: create, list, retrieve, update, delete
- List с фильтрами: city, specializations, is_potential, is_available
- List с поиском по имени
- AvitoConfig GET / PATCH (singleton)
- AvitoSearchKeyword CRUD
- AvitoListing list / update-status / convert
- AvitoPublishedListing list
- Campaign CRUD / preview
- UnisenderConfig GET / PATCH
- MarketingSyncLog list
- Permissions: неаутентифицированный → 401

### 1.9 Критерии завершения Фазы 1

- [ ] `python manage.py migrate` — без ошибок
- [ ] Все endpoints отвечают корректно (Postman / httpie проверка)
- [ ] `cd backend && pytest marketing/ -v` — 50+ тестов пройдены
- [ ] Все модели зарегистрированы в admin
- [ ] Seed-миграция с ключевыми словами применена

---

## Фаза 2: Frontend — База монтажников (3 дня)

> Цель: рабочий UI «Поиск Исполнителей» с вкладкой «База монтажников» (полный CRUD).

### 2.1 API-слой

**Создать `frontend/lib/api/services/marketing.ts`** — все методы API (как в концепции раздел 9.3).

**Создать `frontend/lib/api/types/marketing.ts`** — TypeScript-интерфейсы:
```typescript
interface ExecutorProfile {
  id: number;
  counterparty: { id: number; name: string; short_name: string; inn: string; legal_form: string };
  source: 'manual' | 'avito' | 'telegram' | 'referral';
  phone: string;
  email: string;
  telegram_username: string;
  whatsapp: string;
  contact_person: string;
  specializations: string[];
  city: string;
  region: string;
  address: string;
  work_radius_km: number | null;
  hourly_rate: string | null;  // Decimal as string
  daily_rate: string | null;
  team_size: number | null;
  rating: string;
  experience_years: number | null;
  has_legal_entity: boolean;
  avito_user_id: string;
  avito_profile_url: string;
  is_potential: boolean;
  is_verified: boolean;
  is_available: boolean;
  notes: string;
  contact_history_count: number;
  created_at: string;
}

// + AvitoConfig, AvitoSearchKeyword, AvitoListing, AvitoPublishedListing,
//   Campaign, CampaignRecipient, ContactHistory, UnisenderConfig, MarketingSyncLog
```

**Изменить `frontend/lib/api/client.ts`** — добавить `marketing` сервис.

### 2.2 Главная страница с табами

**Заменить `frontend/app/erp/marketing/executors/page.tsx`**:
```tsx
'use client';
import { ExecutorSearchPage } from '@/components/erp/components/marketing/ExecutorSearchPage';
export default function MarketingExecutorsPage() {
  return <ExecutorSearchPage />;
}
```

**Создать `frontend/components/erp/components/marketing/ExecutorSearchPage.tsx`**:
- Паттерн из `Settings.tsx`: `useSearchParams` для таба, `Tabs/TabsList/TabsTrigger/TabsContent`
- 5 вкладок: executors (default), avito, campaigns, contacts, settings
- Каждая вкладка — ленивый импорт компонента

### 2.3 Вкладка «База монтажников»

**Создать `frontend/components/erp/components/marketing/executors/ExecutorDatabaseTab.tsx`**:

Компоненты:
- Заголовок со счётчиками (всего / потенциальных / доступных)
- Поиск (debounce 300ms)
- Фильтры (toggle-панель): город, специализации (multi-checkbox), статус (потенциальный/действующий), доступность
- Таблица: имя, город, специализации (badges), ставка, рейтинг (звёзды), статус, действия
- Кнопка «+ Добавить исполнителя» → диалог
- Клик по строке → диалог деталей

Паттерн: `ContractsList.tsx` для таблицы + фильтров.

**Создать `frontend/components/erp/components/marketing/executors/ExecutorProfileDialog.tsx`**:
- Режимы: создание / редактирование
- Разделы формы:
  1. Основные данные (ФИО/название, правовая форма, ИНН)
  2. Контакты (телефон, email, Telegram, WhatsApp, контактное лицо)
  3. Специализации (checkbox-группа из SPECIALIZATION_CHOICES)
  4. Местоположение (город, регион, радиус работ)
  5. Расценки (час, день, размер бригады)
  6. Дополнительно (стаж, рейтинг, заметки)
- При создании — автоматически создаёт Counterparty (backend ExecutorProfileCreateSerializer делает nested create)

**Создать `frontend/components/erp/components/marketing/executors/ExecutorDetailPanel.tsx`**:
- Dialog (max-w-4xl) с полной информацией
- Секция «История контактов» — таблица ContactHistory с пагинацией
- Кнопка «Добавить контакт» → мини-форма (канал, направление, тема, текст)
- Ссылка на профиль Avito (если есть)
- Кнопки: Редактировать, Удалить

### 2.4 Обновление констант

**Изменить `frontend/constants/index.ts`** — добавить:
```typescript
// Специализации исполнителей
EXECUTOR_SPECIALIZATIONS: [
  { value: 'ventilation', label: 'Вентиляция' },
  { value: 'conditioning', label: 'Кондиционирование' },
  // ...
],

// Статусы Avito-листингов
AVITO_LISTING_STATUSES: { ... },

// Статусы кампаний
CAMPAIGN_STATUSES: { ... },

// Цвета для статусов
COLORS.EXECUTOR_STATUS: { ... },
```

### 2.5 Тесты Фазы 2

- Визуальная проверка: все вкладки отображаются
- CRUD исполнителей работает
- Фильтры применяются корректно
- Поиск находит по имени, городу
- `cd frontend && npx tsc --noEmit` — без ошибок типов

### 2.6 Критерии завершения Фазы 2

- [ ] Страница «Поиск Исполнителей» открывается, все вкладки видны
- [ ] Создание/редактирование/удаление исполнителей работает
- [ ] Фильтры по городу, специализациям, статусу работают
- [ ] Деталка исполнителя показывает всю информацию + историю контактов
- [ ] TypeScript без ошибок

---

## Фаза 3: Avito-интеграция — публикация МП (3-4 дня)

> Цель: рабочая публикация МП на Avito + добавление входящих объявлений.

### 3.1 AvitoAPIClient

**Создать `backend/marketing/clients/avito.py`**:
- Context manager (паттерн BreezAPIClient из `supplier_integrations/clients/breez.py`)
- OAuth2 client_credentials flow
- Rate limiter (token bucket, 55 req/min)
- Retry с exponential backoff
- Методы:
  - `refresh_token()` — получить/обновить токен
  - `create_listing(data)` — POST autoload
  - `get_item(item_id)` — GET item info
  - `get_items_list()` — GET наши объявления
  - `get_item_stats(item_ids)` — POST статистика
  - `get_chats()` — GET список чатов
  - `send_message(chat_id, text)` — POST сообщение
  - `get_category_tree()` — GET дерево категорий

### 3.2 AvitoPublisherService

**Создать `backend/marketing/services/avito_publisher.py`**:
```python
class AvitoPublisherService:
    def publish_mounting_proposal(self, mp_id, dry_run=False):
        mp = MountingProposal.objects.select_related('object').get(pk=mp_id)
        listing_data = self._build_listing_data(mp)
        
        published = AvitoPublishedListing.objects.create(
            mounting_proposal=mp,
            listing_title=listing_data['title'],
            listing_text=listing_data['description'],
            status=AvitoPublishedListing.Status.PENDING,
        )
        
        if dry_run:
            return {'status': 'dry_run', 'data': listing_data, 'id': published.pk}
        
        with AvitoAPIClient() as client:
            result = client.create_listing(listing_data)
            published.avito_item_id = result['id']
            published.avito_url = result['url']
            published.status = AvitoPublishedListing.Status.PUBLISHED
            published.published_at = timezone.now()
            published.save()
        
        return {'status': 'published', 'avito_url': published.avito_url}

    def _build_listing_data(self, mp):
        config = AvitoConfig.get()
        # Подстановка переменных в шаблон
        ...
```

### 3.3 Сигналы

**Создать `backend/marketing/signals.py`** с защитой от повторного срабатывания (см. 0.5):
- `pre_save` → кэширование старого статуса
- `post_save` → проверка смены на `published` → `publish_mp_to_avito.delay()`

### 3.4 ExecutorService — конвертация и быстрое добавление

**Создать `backend/marketing/services/executor_service.py`**:
```python
class ExecutorService:
    def add_listing_manually(self, data):
        """Быстрое добавление объявления (из URL или вручную)"""
        # Если передан avito_url — попытка получить данные через API
        # Иначе — создать из переданных полей
        # Дедупликация по avito_item_id

    def convert_listing_to_executor(self, listing_id, extra_data=None):
        """Конвертировать AvitoListing в Counterparty + ExecutorProfile"""
        listing = AvitoListing.objects.get(pk=listing_id)
        
        # Проверка дубликатов по avito_user_id
        existing = ExecutorProfile.objects.filter(avito_user_id=listing.seller_avito_id).first()
        if existing:
            listing.executor_profile = existing
            listing.status = AvitoListing.Status.CONVERTED
            listing.save()
            return existing
        
        with transaction.atomic():
            counterparty = Counterparty.objects.create(
                name=listing.seller_name or f'Исполнитель Avito #{listing.avito_item_id}',
                type=Counterparty.Type.VENDOR,
                vendor_subtype=Counterparty.VendorSubtype.EXECUTOR,
                legal_form=Counterparty.LegalForm.FIZ,
                inn=f'AV{listing.seller_avito_id[:10]}',  # placeholder
                contact_info=f'Avito: {listing.url}',
            )
            profile = ExecutorProfile.objects.create(
                counterparty=counterparty,
                source=ExecutorProfile.Source.AVITO,
                avito_user_id=listing.seller_avito_id,
                avito_profile_url=f'https://www.avito.ru/user/{listing.seller_avito_id}',
                city=listing.city,
                is_potential=True,
            )
            listing.executor_profile = profile
            listing.status = AvitoListing.Status.CONVERTED
            listing.save()
        
        return profile
```

### 3.5 Celery-задачи

**Создать `backend/marketing/tasks.py`**:
```python
@shared_task(bind=True, max_retries=3, default_retry_delay=120)
def publish_mp_to_avito(self, mounting_proposal_id):
    ...

@shared_task(bind=True, max_retries=2, default_retry_delay=300)
def sync_avito_stats(self):
    """Обновить статистику всех опубликованных объявлений"""
    ...

@shared_task
def refresh_avito_token():
    """Проактивное обновление OAuth-токена"""
    ...

@shared_task
def cleanup_old_listings():
    """Удалить отклонённые листинги старше 90 дней"""
    ...
```

**Изменить `backend/finans_assistant/celery.py`** — добавить beat_schedule:
```python
'marketing-sync-avito-stats': {
    'task': 'marketing.tasks.sync_avito_stats',
    'schedule': crontab(hour=10, minute=0, day_of_week=1),
},
'marketing-refresh-avito-token': {
    'task': 'marketing.tasks.refresh_avito_token',
    'schedule': 43200.0,  # 12 часов
},
'marketing-cleanup-old-listings': {
    'task': 'marketing.tasks.cleanup_old_listings',
    'schedule': crontab(hour=3, minute=0, day_of_week=0),  # Вс 03:00
},
```

### 3.6 Frontend — вкладка Авито

**Создать `frontend/components/erp/components/marketing/avito/AvitoTab.tsx`**:
- Подвкладки: «Входящие» и «Наши объявления»
- Переключатель подвкладок (кнопки или pills)

**Создать `frontend/components/erp/components/marketing/avito/AvitoIncomingTab.tsx`**:
- Кнопка «+ Добавить объявление» → диалог с полем URL + ручные поля
- Таблица/карточки найденных объявлений
- Статус-бейджи (new/reviewed/contacted/converted/rejected)
- Действия: «Просмотрено», «Конвертировать в исполнителя», «Не подходит»
- Фильтры: статус, ключевое слово, город

**Создать `frontend/components/erp/components/marketing/avito/AvitoPublishedTab.tsx`**:
- Таблица опубликованных МП на Авито
- Статистика: просмотры, контакты, избранное
- Кнопка «Обновить статистику»
- Ссылка на объявление на Avito

**Создать `frontend/components/erp/components/marketing/avito/AvitoKeywordManager.tsx`**:
- Список ключевых слов (chips/tags)
- Добавление/удаление
- Показывает: keyword, is_active, results_count, last_scan_at

**Создать `frontend/components/erp/components/marketing/avito/ConvertToExecutorDialog.tsx`**:
- Предзаполненная форма из данных AvitoListing
- Поля для дополнительной информации
- Кнопка «Создать исполнителя»

### 3.7 Frontend — вкладка Настройки

**Создать `frontend/components/erp/components/marketing/settings/ExecutorSettingsTab.tsx`**:
- Секция «Avito»: Client ID, Client Secret (password fields), User ID, статус токена
- Чекбокс «Авто-публикация МП на Avito»
- Шаблон объявления (textarea с переменными)
- Секция «Ключевые слова» → AvitoKeywordManager
- Секция «Unisender» (заглушка, реализация в Фазе 4)

### 3.8 Тесты Фазы 3

**`tests/test_avito_client.py`** (~15 тестов):
- OAuth2 flow: получение токена, обновление при истечении
- Rate limiting: 55+ запросов вызывают throttle
- Retry на 5xx ошибках
- AvitoAPIError на 4xx
- Timeout handling
- Все тесты мокают `httpx.Client`

**`tests/test_avito_publisher.py`** (~10 тестов):
- Формирование данных объявления из МП
- Dry-run не вызывает API
- Успешная публикация создаёт AvitoPublishedListing
- Ошибка API → AvitoPublishedListing.status = error
- Шаблон с переменными подставляется корректно

**`tests/test_executor_service.py`** (~10 тестов):
- Конвертация листинга → создание Counterparty + ExecutorProfile
- Конвертация дубля → привязка к существующему профилю
- Ручное добавление объявления
- INN placeholder генерация

**`tests/test_signals.py`** (~5 тестов):
- Сигнал срабатывает при смене статуса на published
- Сигнал НЕ срабатывает при повторном сохранении published
- Сигнал НЕ срабатывает при AvitoConfig.auto_publish_mp = False

### 3.9 Критерии завершения Фазы 3

- [ ] Публикация МП на Avito работает (dry-run проверен)
- [ ] Ручное добавление объявлений работает
- [ ] Конвертация объявления в исполнителя работает
- [ ] Вкладка «Авито» полностью функциональна
- [ ] Настройки Avito сохраняются и применяются
- [ ] Celery-задачи зарегистрированы в beat_schedule
- [ ] 40+ новых тестов пройдены

---

## Фаза 4: Рассылки через Unisender (2-3 дня)

> Цель: рабочие email и SMS рассылки с фильтрацией получателей.

### 4.1 UnisenderClient

**Реализовать `backend/marketing/clients/unisender.py`**:
- HTTP API клиент (httpx)
- Методы:
  - `send_email(to_email, subject, body, sender_name, sender_email, attachments)`
  - `send_sms(phone, text, sender_name)`
  - `check_email_status(email_id) -> str`
  - `check_sms_status(sms_id) -> str`
  - `get_balance() -> dict` — проверка баланса
- Error handling: UnisenderAPIError
- Logging всех операций

### 4.2 CampaignService

**Реализовать `backend/marketing/services/campaign_service.py`**:

```python
class CampaignService:
    def resolve_recipients(self, campaign):
        """Подобрать получателей по фильтрам"""
        qs = ExecutorProfile.objects.filter(is_available=True)
        if campaign.filter_specializations:
            qs = qs.filter(specializations__overlap=campaign.filter_specializations)
        if campaign.filter_cities:
            qs = qs.filter(city__in=campaign.filter_cities)
        if campaign.filter_is_potential is not None:
            qs = qs.filter(is_potential=campaign.filter_is_potential)
        if campaign.filter_is_available is not None:
            qs = qs.filter(is_available=campaign.filter_is_available)
        
        # Для email — только с email, для SMS — только с телефоном
        if campaign.campaign_type == Campaign.CampaignType.EMAIL:
            qs = qs.exclude(email='')
        elif campaign.campaign_type == Campaign.CampaignType.SMS:
            qs = qs.exclude(phone='')
        
        return qs

    def preview_campaign(self, campaign_id):
        """Предпросмотр: количество, список, примерная стоимость SMS"""
        campaign = Campaign.objects.get(pk=campaign_id)
        recipients = self.resolve_recipients(campaign)
        count = recipients.count()
        return {
            'total_recipients': count,
            'recipients_preview': list(recipients.values('id', 'counterparty__name', 'phone', 'email')[:20]),
            'estimated_sms_cost': count * Decimal('3.00') if campaign.campaign_type == 'sms' else None,
        }

    def execute_campaign(self, campaign_id):
        """Отправить рассылку"""
        campaign = Campaign.objects.select_for_update().get(pk=campaign_id)
        if campaign.status not in [Campaign.Status.DRAFT, Campaign.Status.SCHEDULED]:
            raise ValueError(f'Cannot send campaign in status {campaign.status}')
        
        campaign.status = Campaign.Status.SENDING
        campaign.save()
        
        recipients_qs = self.resolve_recipients(campaign)
        
        # Создать CampaignRecipient записи
        bulk = [CampaignRecipient(campaign=campaign, executor_profile=ep) for ep in recipients_qs]
        CampaignRecipient.objects.bulk_create(bulk, ignore_conflicts=True)
        
        campaign.total_recipients = len(bulk)
        campaign.save()
        
        client = UnisenderClient()
        sent = 0
        errors = 0
        
        for recipient in campaign.recipients.filter(status=CampaignRecipient.Status.PENDING):
            try:
                if campaign.campaign_type == Campaign.CampaignType.EMAIL:
                    client.send_email(
                        to_email=recipient.executor_profile.email,
                        subject=campaign.subject,
                        body=campaign.body,
                    )
                else:
                    client.send_sms(
                        phone=recipient.executor_profile.phone,
                        text=campaign.body,
                    )
                recipient.status = CampaignRecipient.Status.SENT
                recipient.sent_at = timezone.now()
                sent += 1
                
                # Записать ContactHistory
                ContactHistory.objects.create(
                    executor_profile=recipient.executor_profile,
                    channel=ContactHistory.Channel.EMAIL if campaign.campaign_type == 'email' else ContactHistory.Channel.SMS,
                    direction=ContactHistory.Direction.OUT,
                    subject=campaign.subject,
                    body=campaign.body,
                    campaign=campaign,
                )
            except Exception as e:
                recipient.status = CampaignRecipient.Status.FAILED
                recipient.error_message = str(e)
                errors += 1
            
            recipient.save()
        
        campaign.sent_count = sent
        campaign.error_count = errors
        campaign.status = Campaign.Status.COMPLETED
        campaign.sent_at = timezone.now()
        campaign.save()
        
        # Записать MarketingSyncLog
        MarketingSyncLog.objects.create(
            sync_type=MarketingSyncLog.SyncType.EMAIL_CAMPAIGN if campaign.campaign_type == 'email' else MarketingSyncLog.SyncType.SMS_CAMPAIGN,
            status=MarketingSyncLog.Status.SUCCESS if errors == 0 else MarketingSyncLog.Status.PARTIAL,
            items_processed=sent + errors,
            items_created=sent,
            items_errors=errors,
        )
```

### 4.3 Celery-задача для рассылки

Добавить в `tasks.py`:
```python
@shared_task(bind=True, max_retries=1, default_retry_delay=60)
def execute_campaign_task(self, campaign_id):
    CampaignService().execute_campaign(campaign_id)
```

### 4.4 Frontend — вкладка Рассылки

**Создать `frontend/components/erp/components/marketing/campaigns/CampaignsTab.tsx`**:
- Таблица рассылок: название, тип (email/SMS), статус, дата, отправлено/ошибок
- Кнопка «+ Создать рассылку»
- Фильтр по типу и статусу

**Создать `frontend/components/erp/components/marketing/campaigns/CampaignEditor.tsx`**:
- Поля: название, тип (email/SMS select), тема (только для email), текст
- Секция фильтров получателей: специализации (checkboxes), города (multi-input), потенциальные (checkbox), доступные (checkbox)
- Кнопка «Предпросмотр» → показать количество и список получателей
- Прикрепление МП и сметы (для email)
- Кнопки: «Сохранить черновик», «Отправить сейчас»
- Confirmation dialog перед отправкой с количеством получателей

**Создать `frontend/components/erp/components/marketing/campaigns/CampaignResultsDialog.tsx`**:
- Показывает результаты отправки: sent/failed/pending
- Таблица получателей с индивидуальными статусами
- Ошибки доставки

**Создать `frontend/components/erp/components/marketing/campaigns/RecipientSelector.tsx`**:
- Визуальный конструктор фильтров
- Живой счётчик подходящих получателей

### 4.5 Настройки Unisender

Дополнить `ExecutorSettingsTab.tsx`:
- Секция «Unisender»: API-ключ, email отправителя, имя отправителя, SMS sender name
- Чекбокс «Активен»
- Кнопка «Проверить подключение» → вызов `get_balance()`

### 4.6 Тесты Фазы 4

**`tests/test_unisender_client.py`** (~10 тестов):
- Отправка email — mock httpx
- Отправка SMS — mock httpx
- Обработка ошибок API
- Проверка статуса

**`tests/test_campaign_service.py`** (~15 тестов):
- resolve_recipients: по специализациям (overlap), по городам, по статусу
- resolve_recipients: email рассылка исключает без email
- resolve_recipients: SMS рассылка исключает без телефона
- preview_campaign: возвращает count и preview
- execute_campaign: создаёт CampaignRecipient, отправляет, обновляет статусы
- execute_campaign: ошибка одного получателя не останавливает остальных
- execute_campaign: создаёт ContactHistory для каждого
- execute_campaign: нельзя отправить completed кампанию
- execute_campaign: записывает MarketingSyncLog

### 4.7 Критерии завершения Фазы 4

- [ ] Создание/редактирование рассылок работает
- [ ] Предпросмотр показывает получателей и счётчик
- [ ] Отправка рассылки (мок) создаёт ContactHistory
- [ ] Настройки Unisender сохраняются
- [ ] 25+ новых тестов пройдены

---

## Фаза 5: История контактов + Dashboard (2 дня)

> Цель: полная история коммуникаций + сводная статистика.

### 5.1 Вкладка «История контактов»

**Создать `frontend/components/erp/components/marketing/ContactHistoryTab.tsx`**:
- Глобальная лента всех контактов (через всех исполнителей)
- Фильтры: канал, направление, дата, исполнитель
- Каждая запись: дата, канал (иконка), направление (стрелка), исполнитель (ссылка), тема, превью текста
- Возможность добавить запись вручную (телефонный звонок, встреча)

### 5.2 Dashboard endpoint

**Добавить в `backend/marketing/views.py`**:
```python
@api_view(['GET'])
def marketing_dashboard(request):
    return Response({
        'executors': {
            'total': ExecutorProfile.objects.count(),
            'potential': ExecutorProfile.objects.filter(is_potential=True).count(),
            'available': ExecutorProfile.objects.filter(is_available=True).count(),
            'by_source': dict(ExecutorProfile.objects.values_list('source').annotate(c=Count('id')).values_list('source', 'c')),
        },
        'avito': {
            'published_active': AvitoPublishedListing.objects.filter(status='published').count(),
            'total_views': AvitoPublishedListing.objects.aggregate(s=Sum('views_count'))['s'] or 0,
            'total_contacts': AvitoPublishedListing.objects.aggregate(s=Sum('contacts_count'))['s'] or 0,
            'incoming_new': AvitoListing.objects.filter(status='new').count(),
        },
        'campaigns': {
            'total': Campaign.objects.count(),
            'sent_this_month': Campaign.objects.filter(
                status='completed', sent_at__month=timezone.now().month
            ).count(),
            'total_sent': CampaignRecipient.objects.filter(status='sent').count(),
        },
        'recent_contacts': ContactHistorySerializer(
            ContactHistory.objects.select_related('executor_profile__counterparty')[:10],
            many=True
        ).data,
    })
```

### 5.3 Dashboard в UI

Добавить в `ExecutorDatabaseTab.tsx` блок сводной статистики вверху:
- 4 карточки: Всего исполнителей, Потенциальных, Новых на Avito, Рассылок в этом месяце

### 5.4 Тесты Фазы 5

**`tests/test_dashboard.py`** (~5 тестов):
- Dashboard возвращает корректные счётчики
- Dashboard с пустой БД → нули
- Recent contacts — ограничение 10

### 5.5 Критерии завершения Фазы 5

- [ ] История контактов отображается и фильтруется
- [ ] Ручное добавление контакта работает
- [ ] Dashboard показывает корректную статистику
- [ ] Карточки статистики на главной вкладке

---

## Фаза 6: Интеграционные тесты + E2E проверки (2 дня)

> Цель: уверенность в работоспособности всей системы.

### 6.1 Интеграционные тесты backend

**`tests/test_integration.py`** (~15 тестов):

```python
@pytest.mark.integration
class TestFullWorkflow:
    """E2E backend workflow"""
    
    def test_full_avito_publish_flow(self, authenticated_client, ...):
        """МП создано → статус published → AvitoPublishedListing создан"""
    
    def test_listing_to_executor_to_campaign(self, ...):
        """Листинг добавлен → конвертирован → включён в рассылку → ContactHistory создан"""
    
    def test_campaign_filters_accuracy(self, ...):
        """10 исполнителей с разными специализациями → фильтр выбирает правильных"""
    
    def test_singleton_concurrent_access(self, ...):
        """Параллельный AvitoConfig.get() не создаёт дубли"""
    
    def test_counterparty_cascade(self, ...):
        """Удаление Counterparty → ExecutorProfile удалён (CASCADE)"""
    
    def test_avito_client_rate_limiting(self, ...):
        """60+ запросов → клиент делает паузу"""
    
    def test_campaign_partial_failure(self, ...):
        """5 получателей, 2 ошибки → campaign.status = completed, error_count = 2"""
    
    def test_signal_idempotency(self, ...):
        """Повторное сохранение МП published → задача НЕ ставится повторно"""
```

### 6.2 Тесты Celery-задач

**`tests/test_tasks.py`** (~10 тестов):
```python
def test_publish_mp_task_delegates_to_service(self, mocker):
    """Задача вызывает AvitoPublisherService.publish_mounting_proposal()"""

def test_publish_mp_task_retries_on_api_error(self, mocker):
    """При AvitoAPIError — retry"""

def test_sync_stats_task(self, mocker):
    """sync_avito_stats обновляет views_count/contacts_count"""

def test_cleanup_old_listings(self, ...):
    """Удаляет rejected старше 90 дней, не трогает new"""

def test_refresh_token_task(self, mocker):
    """Обновляет access_token в AvitoConfig"""

def test_execute_campaign_task(self, mocker):
    """Делегирует CampaignService.execute_campaign()"""

def test_tasks_registered_in_beat_schedule(self):
    """Все маркетинговые задачи есть в celery beat_schedule"""
    from finans_assistant.celery import app
    schedule = app.conf.beat_schedule
    assert 'marketing-sync-avito-stats' in schedule
    assert 'marketing-refresh-avito-token' in schedule
    assert 'marketing-cleanup-old-listings' in schedule
```

### 6.3 Тестирование с реальным Avito-аккаунтом

**Ручной checklist** (выполняется разработчиком):

- [ ] Вход в Avito под avgust-klimat-crm@yandex.ru
- [ ] Регистрация приложения API, получение client_id и client_secret
- [ ] Ввод credentials в ERP → Настройки → Avito
- [ ] Получение токена (кнопка «Проверить подключение»)
- [ ] Получение дерева категорий через API → выбор категории для объявлений
- [ ] Dry-run публикации тестового МП → проверка сформированного текста
- [ ] Реальная публикация тестового объявления (и последующее удаление)
- [ ] Получение статистики опубликованного объявления
- [ ] Проверка rate limiting при серии запросов

### 6.4 Тестирование Unisender

**Ручной checklist:**

- [ ] Регистрация на unisender.com
- [ ] Получение API-ключа
- [ ] Ввод ключа в ERP → Настройки → Unisender
- [ ] Отправка тестового email на свой адрес
- [ ] Отправка тестового SMS на свой номер
- [ ] Проверка статуса доставки
- [ ] Массовая отправка (3-5 тестовых получателей)

### 6.5 Нагрузочное/граничное тестирование

- [ ] 100 исполнителей в базе → таблица работает быстро
- [ ] Рассылка на 50 получателей → все статусы обновляются
- [ ] 1000 AvitoListing → пагинация работает
- [ ] Одновременный доступ 2+ пользователей к настройкам → нет конфликтов

### 6.6 Критерии завершения Фазы 6

- [ ] `cd backend && pytest marketing/ -v` → 150+ тестов, 0 failed
- [ ] `cd backend && pytest marketing/ -m integration` → 15+ тестов
- [ ] Ручные checklist-ы Avito и Unisender пройдены
- [ ] Все граничные сценарии проверены

---

## Фаза 7: Документация (1-2 дня)

> Цель: полная документация для пользователя и разработчика.

### 7.1 Пользовательская документация

**Создать `docs/marketing/USER_GUIDE.md`** (~200 строк):

1. **Начало работы**
   - Как открыть «Поиск Исполнителей» (навигация)
   - Обзор вкладок

2. **База монтажников**
   - Добавление нового исполнителя (пошагово с полями)
   - Редактирование профиля
   - Фильтрация и поиск
   - Просмотр деталей и истории контактов
   - Удаление (и что при этом происходит)

3. **Авито**
   - Добавление объявления вручную (по URL или данным)
   - Просмотр входящих объявлений
   - Конвертация объявления в исполнителя
   - Смена статуса (просмотрено, не подходит)
   - Наши объявления: как публикуются МП, статистика
   - Авто-публикация: как включить, как работает

4. **Рассылки**
   - Создание email-рассылки
   - Создание SMS-рассылки
   - Настройка фильтров получателей
   - Предпросмотр (проверка перед отправкой)
   - Отправка и отслеживание результатов
   - Стоимость SMS

5. **История контактов**
   - Что записывается автоматически
   - Как добавить запись вручную (звонок, встреча)

6. **Настройки**
   - Подключение Avito API (пошагово с скриншотами)
   - Настройка шаблона объявления (переменные)
   - Управление ключевыми словами
   - Подключение Unisender
   - Настройка отправителя email и SMS

### 7.2 Документация разработчика

**Создать `docs/marketing/developer-guide.md`** (~300 строк):

1. **Архитектура модуля**
   - Диаграмма моделей (из концепции раздел 14)
   - Связь с существующими моделями
   - Сервисный паттерн
   - Celery-задачи и расписание

2. **Модели**
   - Все модели с полями и связями
   - Singleton-паттерн: как работает, thread-safety
   - ArrayField для specializations: как фильтровать

3. **API endpoints**
   - Полная таблица (из концепции раздел 7)
   - Примеры запросов/ответов для ключевых endpoints:
     - Создание ExecutorProfile (с nested Counterparty)
     - Конвертация листинга
     - Запуск рассылки
     - Dashboard

4. **Avito API**
   - OAuth2 flow (диаграмма)
   - Используемые endpoints
   - Rate limiting: как реализован
   - Dry-run режим
   - Как добавить новый endpoint в клиент

5. **Unisender API**
   - Аутентификация
   - Отправка email/SMS
   - Проверка статуса
   - Как переключить на другой SMS-провайдер

6. **Сигналы**
   - auto_publish_mp_to_avito: когда срабатывает, как тестировать
   - Защита от повторного срабатывания

7. **Тестирование**
   - Как запустить тесты: `pytest marketing/ -v`
   - Маркеры: `@pytest.mark.integration`
   - Ключевые фикстуры: counterparty_executor, executor_profile, avito_config
   - Моки: как мокать AvitoAPIClient и UnisenderClient

8. **Deploy**
   - Новые переменные окружения: AVITO_CLIENT_ID, AVITO_CLIENT_SECRET, UNISENDER_API_KEY
   - Миграции: `python manage.py migrate marketing`
   - Celery: новые задачи автоматически подхватываются через autodiscover

9. **Troubleshooting**
   - Avito API возвращает 403: токен истёк / rate limit
   - Рассылка не отправляется: Unisender не активен
   - Объявление не публикуется: auto_publish_mp выключен

### 7.3 Обновление CLAUDE.md

**Изменить `/CLAUDE.md`** — добавить:
```markdown
### Marketing
- Marketing app: `backend/marketing/` — Avito-интеграция + поиск исполнителей
- ExecutorProfile: 1:1 расширение Counterparty (НЕ отдельная сущность)
- Avito API клиент: `marketing/clients/avito.py` (OAuth2, rate limiting)
- Unisender: `marketing/clients/unisender.py` (email + SMS)
- Документация: `docs/marketing/`
```

### 7.4 Обновление permission tree

**Изменить `backend/personnel/models.py`** (если решено):
```python
('marketing', {
    'label': 'Маркетинг',
    'children': OrderedDict([
        ('kanban', 'Канбан поиска объектов'),
        ('potential_customers', 'Потенциальные заказчики'),
        ('executors', 'Поиск исполнителей'),
        ('campaigns', 'Рассылки'),
        ('avito', 'Интеграция Avito'),
    ]),
}),
```

### 7.5 Критерии завершения Фазы 7

- [ ] USER_GUIDE.md написан и проверен на полноту
- [ ] developer-guide.md написан с примерами запросов
- [ ] CLAUDE.md обновлён
- [ ] Все ссылки в документации валидны

---

## Сводка по файлам

### Новые файлы (backend)

| Файл | Описание |
|------|----------|
| `backend/marketing/__init__.py` | init |
| `backend/marketing/apps.py` | MarketingConfig с ready() |
| `backend/marketing/models.py` | 10 моделей |
| `backend/marketing/serializers.py` | ~15 сериализаторов |
| `backend/marketing/views.py` | ~8 ViewSets + 3 function views |
| `backend/marketing/urls.py` | DRF router + paths |
| `backend/marketing/admin.py` | Регистрация моделей |
| `backend/marketing/signals.py` | auto_publish_mp_to_avito |
| `backend/marketing/tasks.py` | 5 Celery-задач |
| `backend/marketing/clients/__init__.py` | init |
| `backend/marketing/clients/avito.py` | AvitoAPIClient |
| `backend/marketing/clients/unisender.py` | UnisenderClient |
| `backend/marketing/services/__init__.py` | init |
| `backend/marketing/services/executor_service.py` | ExecutorService |
| `backend/marketing/services/avito_publisher.py` | AvitoPublisherService |
| `backend/marketing/services/campaign_service.py` | CampaignService |
| `backend/marketing/tests/__init__.py` | init |
| `backend/marketing/tests/conftest.py` | фикстуры |
| `backend/marketing/tests/test_models.py` | ~20 тестов |
| `backend/marketing/tests/test_api.py` | ~30 тестов |
| `backend/marketing/tests/test_avito_client.py` | ~15 тестов |
| `backend/marketing/tests/test_avito_publisher.py` | ~10 тестов |
| `backend/marketing/tests/test_executor_service.py` | ~10 тестов |
| `backend/marketing/tests/test_signals.py` | ~5 тестов |
| `backend/marketing/tests/test_unisender_client.py` | ~10 тестов |
| `backend/marketing/tests/test_campaign_service.py` | ~15 тестов |
| `backend/marketing/tests/test_integration.py` | ~15 тестов |
| `backend/marketing/tests/test_tasks.py` | ~10 тестов |
| `backend/marketing/tests/test_dashboard.py` | ~5 тестов |
| `backend/marketing/migrations/0001_initial.py` | auto |
| `backend/marketing/migrations/0002_seed_keywords.py` | data migration |

### Новые файлы (frontend)

| Файл | Описание |
|------|----------|
| `frontend/lib/api/services/marketing.ts` | API-сервис |
| `frontend/lib/api/types/marketing.ts` | TypeScript-типы |
| `frontend/components/erp/components/marketing/ExecutorSearchPage.tsx` | Главная с табами |
| `frontend/components/erp/components/marketing/executors/ExecutorDatabaseTab.tsx` | Таблица |
| `frontend/components/erp/components/marketing/executors/ExecutorProfileDialog.tsx` | Форма |
| `frontend/components/erp/components/marketing/executors/ExecutorDetailPanel.tsx` | Деталка |
| `frontend/components/erp/components/marketing/avito/AvitoTab.tsx` | Обёртка |
| `frontend/components/erp/components/marketing/avito/AvitoIncomingTab.tsx` | Входящие |
| `frontend/components/erp/components/marketing/avito/AvitoPublishedTab.tsx` | Наши |
| `frontend/components/erp/components/marketing/avito/AvitoKeywordManager.tsx` | Ключевые слова |
| `frontend/components/erp/components/marketing/avito/ConvertToExecutorDialog.tsx` | Конвертация |
| `frontend/components/erp/components/marketing/campaigns/CampaignsTab.tsx` | Список |
| `frontend/components/erp/components/marketing/campaigns/CampaignEditor.tsx` | Редактор |
| `frontend/components/erp/components/marketing/campaigns/CampaignResultsDialog.tsx` | Результаты |
| `frontend/components/erp/components/marketing/campaigns/RecipientSelector.tsx` | Фильтры |
| `frontend/components/erp/components/marketing/ContactHistoryTab.tsx` | История |
| `frontend/components/erp/components/marketing/settings/ExecutorSettingsTab.tsx` | Настройки |

### Изменяемые файлы

| Файл | Изменение |
|------|-----------|
| `backend/finans_assistant/settings.py` | +`'marketing'` в INSTALLED_APPS |
| `backend/finans_assistant/urls.py` | +`include('marketing.urls')` |
| `backend/finans_assistant/celery.py` | +3 записи в beat_schedule |
| `frontend/lib/api/client.ts` | +marketing сервис |
| `frontend/lib/api/services/index.ts` | +export marketing |
| `frontend/app/erp/marketing/executors/page.tsx` | Заменить StubPage на ExecutorSearchPage |
| `frontend/constants/index.ts` | +EXECUTOR_SPECIALIZATIONS, статусы, цвета |
| `CLAUDE.md` | +секция Marketing |
| `backend/personnel/models.py` | +permissions campaigns, avito (опционально) |

### Документация

| Файл | Описание |
|------|----------|
| `docs/marketing/avito-integration-concept.md` | Уже создан |
| `docs/marketing/implementation-plan.md` | Этот документ |
| `docs/marketing/USER_GUIDE.md` | Руководство пользователя |
| `docs/marketing/developer-guide.md` | Руководство разработчика |

---

## Итого

| Фаза | Срок | Тесты | Выход |
|------|------|-------|-------|
| 1. Django app + модели + API | 3 дня | ~50 | Рабочий backend |
| 2. Frontend — база монтажников | 3 дня | TypeScript check | Рабочий UI |
| 3. Avito-интеграция | 3-4 дня | ~40 | Публикация + входящие |
| 4. Рассылки | 2-3 дня | ~25 | Email + SMS |
| 5. История + Dashboard | 2 дня | ~5 | Полная система |
| 6. Интеграционные тесты | 2 дня | ~25 + ручные | Уверенность |
| 7. Документация | 1-2 дня | — | USER_GUIDE + dev-guide |
| **Итого** | **16-19 дней** | **~145+ автотестов** | **Полная система** |

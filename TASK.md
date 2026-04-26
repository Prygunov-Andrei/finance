# TASK — Ф8D — очистка Django-admin до минимума

## Цель

Скрыть из Django-admin (`/admin/`) **всё** кроме узкого whitelist:
- AC Methodology (для clone методики — это решение Q-F8.4: clone остаётся в Django).
- `auth.User`, `auth.Group` (управление пользователями).
- `admin.LogEntry` (read-only audit log).

Все остальные модели (ERP, HVAC-новости, AC Rating уже покрытое новой админкой) — становятся **недоступны через Django-admin**.

`/hvac-admin/` (alias на полный admin, см. `urls.py:114`) — **НЕ трогаем**, остаётся backup-доступом для экстренных случаев.

---

## Архитектурное решение

**Whitelist через custom `AdminSite`**, а не blacklist через unregister. Причина: blacklist хрупок — при появлении новых apps (через ISMeta или другие команды) скрытие нужно дополнять. Whitelist — fail-safe (новые apps не показываются автоматически).

Подход:

1. Создать `ACAdminSite` (подкласс `AdminSite`) в `backend/finans_assistant/admin_site.py`.
2. Зарегистрировать **только** allowed модели в `ac_admin_site` (через `@admin.register(Model, site=ac_admin_site)` или явный `ac_admin_site.register(...)`).
3. В `urls.py` заменить `admin.site.urls` → `ac_admin_site.urls`.

Все существующие `@admin.register(SomeModel)` без `site=` параметра по-прежнему регистрируются в дефолтном `admin.site._registry`, **но дефолтный `admin.site` больше не подключён к URL** — значит фактически невидим. Это и нужно.

---

## 1. Создать `backend/finans_assistant/admin_site.py`

```python
"""Custom Django AdminSite — урезанная версия для AC Rating.

После Ф8D `/admin/` показывает только:
  - AC Methodology (MethodologyVersion, Criterion, RatingPreset) — для
    клонирования методики (1-2 раза в год).
  - auth.User, auth.Group — управление пользователями.
  - admin.LogEntry — read-only audit log.

Всё остальное (ERP-операции, HVAC-новости, AC Rating уже покрытое
новой админкой /erp/hvac-rating/) — в Django-admin не показывается.

Backup-доступ к полному admin: `/hvac-admin/` (см. urls.py:114).
"""
from __future__ import annotations

from django.contrib.admin import AdminSite, ModelAdmin
from django.contrib.admin.models import LogEntry
from django.contrib.auth.admin import GroupAdmin, UserAdmin
from django.contrib.auth.models import Group, User


class ACAdminSite(AdminSite):
    site_header = 'AC Rating · Методика и пользователи'
    site_title = 'AC Rating Admin'
    index_title = 'Управление методикой и пользователями'


ac_admin_site = ACAdminSite(name='ac_admin')


# auth — стандартные UserAdmin/GroupAdmin
ac_admin_site.register(User, UserAdmin)
ac_admin_site.register(Group, GroupAdmin)


# Audit log (read-only)
class ReadOnlyLogEntryAdmin(ModelAdmin):
    list_display = ('action_time', 'user', 'content_type', 'object_repr', 'action_flag_display')
    list_filter = ('action_time', 'action_flag', 'user')
    search_fields = ('object_repr', 'change_message', 'user__username')
    readonly_fields = [f.name for f in LogEntry._meta.get_fields() if not f.is_relation or f.many_to_one]
    
    def action_flag_display(self, obj):
        return obj.get_action_flag_display()
    action_flag_display.short_description = 'Action'

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return request.method in ('GET', 'HEAD', 'OPTIONS')

    def has_delete_permission(self, request, obj=None):
        return False


ac_admin_site.register(LogEntry, ReadOnlyLogEntryAdmin)
```

**Внимание — порядок import:** Django устанавливает `admin.site._registry` для `User`/`Group` через `django.contrib.auth.AppConfig.ready()`. Когда ты пишешь `ac_admin_site.register(User, UserAdmin)` — это идёт в `_registry` нового AdminSite, не в дефолтный. Параллельная регистрация в обоих сайтах допустима (`User` сидит в обоих), но дефолтный мы выкинем из URL.

---

## 2. Перерегистрировать AC Methodology в `ac_admin_site`

Файлы:
- `backend/ac_methodology/admin/criterion_admin.py:CriterionAdmin`
- `backend/ac_methodology/admin/methodology_version.py:MethodologyVersionAdmin`
- `backend/ac_methodology/admin/rating_preset.py:RatingPresetAdmin`

В каждом — поменять декоратор `@admin.register(...)` → `@admin.register(..., site=ac_admin_site)`:

```python
# было
from django.contrib import admin

@admin.register(MethodologyVersion)
class MethodologyVersionAdmin(admin.ModelAdmin):
    ...
```

```python
# стало
from django.contrib import admin
from finans_assistant.admin_site import ac_admin_site

@admin.register(MethodologyVersion, site=ac_admin_site)
class MethodologyVersionAdmin(admin.ModelAdmin):
    ...
```

Это **единственное** место где правишь существующий код apps. Остальные `admin.py` во всех apps НЕ трогаешь — их регистрации останутся в дефолтном `admin.site` (который мы отключим из URL).

`MethodologyCriterionInline` в `ac_methodology/admin/inlines.py` — inline, сам не регистрируется (используется через `inlines = [MethodologyCriterionInline]` в MethodologyVersionAdmin). Никаких правок.

---

## 3. Заменить URL-монтирование

Файл: `backend/finans_assistant/urls.py`

```python
# Было (строка 113):
path('admin/', admin.site.urls),

# Станет:
path('admin/', ac_admin_site.urls),
```

Импорт в начале файла:
```python
from finans_assistant.admin_site import ac_admin_site
```

**`/hvac-admin/` (строка 114) — НЕ трогаешь.** Оставляешь `admin.site.get_urls()`. Это backup-доступ.

⚠️ **Shared file — пинг ISMeta** через Андрея ДО коммита.

---

## 4. Тесты

**Файл (новый):** `backend/finans_assistant/tests/test_admin_site.py` (или в существующем месте, на твой выбор).

```python
import pytest
from django.test import Client
from django.contrib.auth.models import User


@pytest.fixture
def staff_user(db):
    return User.objects.create_superuser('admin_test', 'a@a.com', 'pass123')


@pytest.fixture
def staff_client(client, staff_user):
    client.force_login(staff_user)
    return client


@pytest.mark.django_db
def test_admin_index_shows_only_whitelisted_apps(staff_client):
    """`/admin/` показывает только AC methodology, auth, admin (LogEntry)."""
    response = staff_client.get('/admin/')
    assert response.status_code == 200
    content = response.content.decode()
    
    # whitelist visible:
    assert 'methodology' in content.lower()
    assert 'criterion' in content.lower() or 'параметр' in content.lower()
    assert 'rating preset' in content.lower() or 'пресет' in content.lower()
    assert 'users' in content.lower() or 'пользовател' in content.lower()
    assert 'groups' in content.lower() or 'групп' in content.lower()
    
    # blacklist hidden:
    assert '/admin/ac_catalog/acmodel' not in content
    assert '/admin/ac_brands/' not in content
    assert '/admin/ac_reviews/' not in content
    assert '/admin/ac_submissions/' not in content
    assert '/admin/news/' not in content
    assert '/admin/contracts/' not in content
    assert '/admin/payments/' not in content
    assert '/admin/estimates/' not in content


@pytest.mark.django_db
def test_admin_direct_url_to_blacklisted_model_is_404(staff_client):
    """Прямой URL к скрытой модели → 404 (не зарегистрирована)."""
    blacklisted = [
        '/admin/ac_catalog/acmodel/',
        '/admin/ac_brands/brand/',
        '/admin/ac_reviews/review/',
        '/admin/ac_submissions/acsubmission/',
        '/admin/news/newspost/',
        '/admin/contracts/contract/',
        '/admin/payments/payment/',
    ]
    for url in blacklisted:
        response = staff_client.get(url)
        assert response.status_code == 404, f'{url} should be 404, got {response.status_code}'


@pytest.mark.django_db
def test_admin_whitelisted_models_accessible(staff_client):
    """Whitelist URLs возвращают 200."""
    whitelist = [
        '/admin/ac_methodology/methodologyversion/',
        '/admin/ac_methodology/criterion/',
        '/admin/ac_methodology/ratingpreset/',
        '/admin/auth/user/',
        '/admin/auth/group/',
        '/admin/admin/logentry/',
    ]
    for url in whitelist:
        response = staff_client.get(url)
        assert response.status_code == 200, f'{url} should be 200, got {response.status_code}'


@pytest.mark.django_db
def test_logentry_is_readonly(staff_client):
    """Add/delete на LogEntry запрещён."""
    response = staff_client.get('/admin/admin/logentry/add/')
    assert response.status_code in (403, 302, 404)


@pytest.mark.django_db
def test_hvac_admin_backup_still_full(staff_client):
    """`/hvac-admin/` остаётся полным admin (backup-доступ)."""
    # Прямой URL к скрытой в /admin/ модели — через /hvac-admin/ должен работать.
    response = staff_client.get('/hvac-admin/news/newspost/')
    # Django-admin sometimes redirects unauthenticated users; we use staff so:
    assert response.status_code in (200, 302)
    # Главная страница /hvac-admin/ должна показывать множество apps:
    response = staff_client.get('/hvac-admin/')
    assert response.status_code == 200
```

**Замечание:** `/hvac-admin/` использует `include((admin.site.get_urls(), 'hvac_admin'), namespace='hvac_admin')` — это передаёт URLs как tuple. Возможно при namespace конфликте `force_login` или прочее ведёт себя неожиданно. Если тест проблемный — упрости до проверки index 200.

---

## 5. Прогон + smoke

```bash
pytest backend/finans_assistant/tests/test_admin_site.py
pytest backend/                        # без регрессий по всем app тестам
python manage.py check
python manage.py makemigrations --dry-run --check    # No changes
```

**Smoke:**
```bash
python manage.py runserver
# открой /admin/ — должно быть только: AC Methodology / Authentication / Administration
# открой /admin/contracts/contract/ → 404
# открой /hvac-admin/ — должны быть ВСЕ apps (backup-доступ)
```

---

## Что НЕ делаем

- ❌ Не удаляем существующие `admin.py` в других apps. Они продолжают регистрироваться в дефолтном `admin.site._registry`, но `admin.site` больше не подключён к URL.
- ❌ Не трогаем `/hvac-admin/` — это backup-доступ.
- ❌ Не делаем миграций (модели не меняем).
- ❌ Не правим `MethodologyCriterionInline` — он inline, регистрация автоматически перейдёт через MethodologyVersionAdmin.
- ❌ Не делаем `data-migration` или setup_xyz — Django сам разберётся с whitelist в runtime.

---

## Известные нюансы

1. **Shared `urls.py`** — пинг ISMeta-команды ОБЯЗАТЕЛЬНО ДО коммита через Андрея.
2. **`/hvac-admin/`** — alias на full Django admin. Это **намеренный backup**. После Ф8D ERP-команда может пользоваться им если что-то критически потребуется в скрытых моделях.
3. **`auth.User` / `auth.Group`** — стандартные UserAdmin/GroupAdmin переиспользуются.
4. **`admin.LogEntry`** — Django audit log. Делаем read-only.
5. **`LogEntry.action_flag`** — IntegerChoices (1=ADD, 2=CHANGE, 3=DELETE). Используем `get_action_flag_display()`.
6. **Existing `@admin.register` декораторы** в других apps — оставь как есть. Они идут в дефолтный `admin.site._registry`, который мы отключим из URL — фактически их регистрация безвредна (просто не подключена).
7. **Возможный edge-case:** если `/hvac-admin/` использует `admin.site.get_urls()` через `include(tuple)`, и Django ленивый — нужно проверить что admin index в `/hvac-admin/` работает после нашего изменения. Если не работает — fix (мб нужно явно вызвать `admin.site.urls` или подобное).

---

## Формат отчёта

```
Отчёт — Ф8D (AC-Петя)

Ветка: ac-rating/f8d (rebased на origin/main)
Коммиты:
  <git log --oneline main..HEAD>

Что сделано:
- ✅ Custom ACAdminSite в backend/finans_assistant/admin_site.py
- ✅ Регистрация в ac_admin_site: User/Group/LogEntry (read-only) + 3 модели методики
- ✅ /admin/ → ac_admin_site.urls
- ✅ /hvac-admin/ — оставлен как есть (full admin, backup-доступ)
- ✅ <N> тестов

Что осталось видимым в /admin/:
- AC Methodology: MethodologyVersion (с MethodologyCriterion inline), Criterion, RatingPreset
- Authentication: User, Group
- Administration: LogEntry (read-only)

Что СКРЫТО (примеры — список не полный):
- ERP: contracts, payments, estimates, banking, accounting, ...
- HVAC-новости: news, news_categories, manufacturers, ...
- AC Rating уже покрытое новой админкой: ac_brands, ac_catalog, ac_reviews, ac_submissions, ac_scoring
- ISMeta + Recognition + llm_services + ...

Что НЕ сделано:
- (если есть)

Прогон:
- pytest backend/finans_assistant/tests/test_admin_site.py: <N> passed
- pytest backend/: <X> passed (без регрессий)
- python manage.py check: ok
- makemigrations --dry-run --check: No changes detected
- Smoke: /admin/ показывает только whitelist; /admin/news/newspost/ → 404; /hvac-admin/ — full

Известные риски:
- ...

Ключевые файлы для ревью:
- backend/finans_assistant/admin_site.py (новый)
- backend/finans_assistant/urls.py (1 изменённая строка + 1 import)
- backend/ac_methodology/admin/criterion_admin.py (site= в декораторе)
- backend/ac_methodology/admin/methodology_version.py (site= в декораторе)
- backend/ac_methodology/admin/rating_preset.py (site= в декораторе)
- backend/finans_assistant/tests/test_admin_site.py (новый)
```

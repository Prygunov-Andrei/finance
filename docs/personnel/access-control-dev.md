# Архитектура доступа и паролей сотрудников (dev)

## Контекст

Перед первым официальным деплоем (апрель 2026) было принято решение:
- Полный доступ в ERP только у трёх директоров: `savinov.a`, `veraksa.o`, `efimova.i`.
- У остальных сотрудников доступ обнулён, директор дальше сам выдаёт логин, пароль и права.

Для этого добавлены:
- Data migration, обнуляющая `Employee.erp_permissions` всем и выдающая полный `edit` трём директорам.
- Два API-эндпоинта для создания User и установки пароля.
- UI-блок в карточке сотрудника (вкладка «Основное»).

## Модель прав — напоминание

Права хранятся в `Employee.erp_permissions: JSONField` вида:

```json
{
  "settings.personnel": "edit",
  "finance.payments": "read",
  "supply": "none",
  ...
}
```

Ключи и уровни определены в `backend/personnel/models.py`:
- `ERP_PERMISSION_TREE` — двухуровневое дерево разделов.
- `PERMISSION_LEVELS = ('none', 'read', 'edit')`.
- `get_all_permission_keys()` — плоский список всех допустимых ключей.
- `default_erp_permissions()` — словарь `{ключ: 'none'}` для всех ключей.
- `resolve_permission_level(perms, 'section.sub')` — fallback на родительский раздел.

Проверка прав — `ERPSectionPermission` (`backend/personnel/permissions.py`): по URL-префиксу определяется раздел, `SAFE_METHODS` требуют `read`, мутирующие — `edit`. Суперпользователь и пользователи без `Employee` пропускаются.

## Data migration `0005_reset_permissions_grant_directors`

Файл: `backend/personnel/migrations/0005_reset_permissions_grant_directors.py`.

Логика вынесена в сервис `personnel.services.reset_access_for_all(Employee, director_usernames, get_all_keys, default_perms)`, чтобы:
- её можно было тестировать отдельно (`backend/personnel/tests/test_access_reset.py`);
- миграция осталась тонкой обёрткой и не тянула за собой моки.

Параметры функции приняты явно (а не импортируются внутри) — это нужно, чтобы переиспользовать её как из обычного кода, так и из `RunPython`, передавая исторический `Employee` через `apps.get_model()`.

Миграция необратима: `reverse_code = migrations.RunPython.noop`. Откат смысла не имеет — сброс осознанный.

## API-эндпоинты

Оба экшна живут в `EmployeeViewSet` (`backend/personnel/views.py`) и явно включают `ERPSectionPermission`, т.к. сам viewset перекрывает DRF-дефолт на `[IsAuthenticated]`.

### `POST /api/v1/personnel/employees/{id}/create-user/`

**Serializer:** `EmployeeCreateUserSerializer`
- `username` — минимум 3 символа, уникален.

**Логика:**
1. Если у Employee уже есть User → 400.
2. Валидация username.
3. Создаётся User, `set_unusable_password()` — пока пароль не установлен, войти нельзя.
4. Employee привязывается.
5. Ответ `{id, username}` со статусом 201.

### `POST /api/v1/personnel/employees/{id}/set-password/`

**Serializer:** `EmployeeSetPasswordSerializer`
- `new_password` + `new_password_confirm` — должны совпадать.
- Применяется `django.contrib.auth.password_validation.validate_password` (используются `AUTH_PASSWORD_VALIDATORS` из `settings.py`).

**Логика:**
1. Если у Employee нет User → 400.
2. Валидация.
3. `user.set_password(new_password)` + `save(update_fields=['password'])`.
4. Ответ `{status: 'password_set'}`.

### Проверка прав

Оба эндпоинта требуют `settings.personnel=edit` (URL начинается с `/api/v1/personnel/` → `SECTION_MAP` маппит в `settings.personnel`, метод `POST` → `edit`). После миграции 0005 это есть только у трёх директоров.

## Frontend

### API-клиент

`frontend/lib/api/services/personnel.ts`:
- `createUserForEmployee(employeeId, { username })`
- `setEmployeePassword(employeeId, { new_password, new_password_confirm })`

### Компонент `CreateUserDialog`

Файл: `frontend/components/erp/components/personnel/CreateUserDialog.tsx`.

- Маленький Dialog с полем username.
- Утилита `suggestUsername(fullName)` формирует `lastname.firstinitial` через кириллический транслит (таблица внутри компонента, т.к. используется только здесь).
- `useMutation` → `api.personnel.createUserForEmployee` → invalidate `['employees']` + `['users-for-link']` → toast.

### Блок пароля в `EmployeeFormDialog`

На вкладке «Основное» под блоком «Учётная запись (User)»:
- Если `!employee.user` → отображается текст «Сначала создайте или привяжите учётную запись…».
- Иначе — два `Input type="password"` + кнопка «Установить пароль».
- Блок показывается только в режиме редактирования (`isEdit`) — у нового (несохранённого) сотрудника ещё нет `id`, которому ставить пароль.

Рядом с Select «Учётная запись (User)» — кнопка «Создать» (только если `!formData.user && isEdit`), открывает `CreateUserDialog`.

## Тесты

| Файл | Что покрывает |
|------|---------------|
| `backend/personnel/tests/test_access_reset.py` | `reset_access_for_all`: счётчики, директора получают `edit`, рядовые — `none`, Employee без User сбрасывается, пустой queryset не падает. |
| `backend/personnel/tests/test_password_management.py` | API-эндпоинты: 401 без авторизации, 403 для обычного сотрудника, 400 при занятом username/коротком username/несовпадении паролей/слабом пароле, успех → `Unusable password` → установленный пароль → успешный login. |
| `tests/e2e/qa-test-password.mjs` | Playwright: админ логинится, создаёт Employee через API, в UI открывает карточку, нажимает «Создать», вводит username, устанавливает пароль, проверяет вход под новыми кредами, cleanup. |

## Запуск

```bash
# Миграция (локально или на проде — автоматически через deploy/deploy.sh)
cd backend && python manage.py migrate personnel

# Тесты
cd backend && pytest personnel/tests/test_access_reset.py personnel/tests/test_password_management.py -v

# E2E (требует ./dev-local.sh)
node tests/e2e/qa-test-password.mjs
```

## Что НЕ делается этим слоем

- `User.is_active` не используется как флаг доступа — он сохраняет стандартную Django-семантику «уволен/не уволен».
- Отдельного флага `has_erp_access` нет — `erp_permissions = {все none}` и так фактически блокирует все разделы.
- Сотрудники без привязанного Employee (например, служебный `admin`) сохраняют полный доступ — это прописано в `ERPSectionPermission` (`employee is None → return True`). Менять не стали, чтобы не сломать admin-учётку.

## Известные дальнейшие улучшения

- Сейчас нет способа удалить/переименовать User из UI — только через Django-админку. Если потребуется — добавить отдельный endpoint `DELETE /employees/{id}/user/`.
- Нет audit log установок пароля. Можно прикрутить через сигнал `post_save` User (или логировать из view).
- Для более строгого разграничения «кто может выдавать доступ» можно добавить отдельный permission `kanban_admin`/`can_manage_access` — сейчас достаточно `settings.personnel=edit`.

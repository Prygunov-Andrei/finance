# Telegram Mini App — документация

**Расположение**: `/mini-app/`  
**Стек**: React 18 + TypeScript + Vite  
**Обновлено**: Февраль 2026

---

## Обзор

Telegram Mini App — отдельное React-приложение, встроенное в Telegram через WebApp API. Обеспечивает интерфейс для трёх ролей: Монтажник, Бригадир, Исполнитель.

---

## Технологический стек

| Технология | Версия | Назначение |
|-----------|--------|-----------|
| React | 18.x | UI-фреймворк |
| TypeScript | 5.x | Типизация |
| Vite | 6.x | Сборщик |
| @telegram-apps/telegram-ui | 2.x | Нативный Telegram UI |
| @twa-dev/sdk | 7.x | Telegram WebApp SDK |
| react-i18next | 15.x | Многоязычность |
| @tanstack/react-query | 5.x | Управление запросами |
| react-router-dom | 7.x | Маршрутизация |

---

## Запуск

```bash
cd mini-app
npm install
npm run dev      # http://localhost:3001

npm run build    # production сборка
```

**Переменные окружения** (`.env`):
```
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

---

## Аутентификация

1. Mini App получает `initData` из `@twa-dev/sdk`
2. Отправляет на `POST /api/v1/worklog/auth/telegram/`
3. Backend валидирует HMAC-SHA256 подпись с BOT_TOKEN
4. Возвращает JWT (access + refresh) + данные Worker
5. JWT сохраняется в памяти и используется для всех запросов

**Hook**: `src/hooks/useAuth.ts`

---

## Маршрутизация

| Путь | Роль | Компонент | Описание |
|------|------|-----------|----------|
| `/` | все | По роли | Главный экран (зависит от Worker.role) |
| `/register` | worker | RegisterPage | Регистрация на смену |
| `/team/create` | brigadier | CreateTeamPage | Создание звена |
| `/team/:id/media` | brigadier | TeamMediaPage | Галерея медиа звена |
| `/shift/open` | contractor | OpenShiftPage | Открытие смены |
| `/workers` | contractor | WorkersPage | Управление монтажниками |
| `/settings` | contractor | SettingsPage | Настройки |

**Главный экран по ролям:**
- `worker` → RegisterPage (кнопка регистрации)
- `brigadier` → BrigadierHome (текущая смена + звено)
- `contractor` → ContractorHome (обзор всех звеньев)

---

## Экраны

### Монтажник — RegisterPage

**Файл**: `src/pages/worker/RegisterPage.tsx`

Одна кнопка "Зарегистрироваться на смену!":
1. Нажатие → `scanQrPopup()` (нативный Telegram QR-сканер)
2. QR содержит `{ shift_id, token }`
3. Запрашивает `navigator.geolocation`
4. Отправляет на API: `POST /shifts/{id}/register/`
5. Показывает результат (✅ зарегистрирован / ⚠️ вне геозоны / ❌ ошибка)

### Бригадир — BrigadierHome

**Файл**: `src/pages/brigadier/BrigadierHome.tsx`

- Информация об активной смене
- Список своих звеньев (где brigadier = текущий worker)
- Кнопки: "Просмотр медиа", "Создать отчёт", "Создать звено"

### Бригадир — CreateTeamPage

**Файл**: `src/pages/brigadier/CreateTeamPage.tsx`

- Загружает список зарегистрированных на активную смену
- Чекбоксы для выбора участников
- Кнопка "Создать звено (N)"

### Бригадир — TeamMediaPage

**Файл**: `src/pages/brigadier/TeamMediaPage.tsx`

- Галерея медиа звена с иконками типов
- Автор и время для каждого элемента
- Индикатор тегов (problem = красный, supply = жёлтый)

### Исполнитель — ContractorHome

**Файл**: `src/pages/contractor/ContractorHome.tsx`

- Активные смены с количеством регистраций
- Все активные звенья с количеством медиа
- Кнопки: "Открыть смену", "Управление монтажниками", "Настройки"

### Исполнитель — OpenShiftPage

**Файл**: `src/pages/contractor/OpenShiftPage.tsx`

- Форма: дата, время начала, время окончания
- Создаёт смену через API

### Исполнитель — WorkersPage

**Файл**: `src/pages/contractor/WorkersPage.tsx`

- Список всех монтажников с ролями
- Форма добавления (ФИО, телефон, Telegram ID)

### Исполнитель — SettingsPage

**Файл**: `src/pages/contractor/SettingsPage.tsx`

- Настройки: создание звеньев, закрытие смены, авто-закрытие, предупреждение (заглушки)

---

## Telegram SDK обёртки

**Файл**: `src/lib/telegram.ts`

| Функция | Описание |
|---------|----------|
| `initTelegram()` | Вызывает `WebApp.ready()` + `expand()` |
| `getInitData()` | Возвращает raw initData для аутентификации |
| `getUserLanguage()` | Язык из `initDataUnsafe.user.language_code` |
| `scanQrCode()` | Нативный QR-сканер Telegram |
| `getGeolocation()` | `navigator.geolocation` с high accuracy |
| `hapticImpact(style)` | Тактильная отдача |
| `hapticNotification(type)` | Уведомление (success/error/warning) |
| `showMainButton(text, onClick)` | Главная кнопка Telegram |
| `hideMainButton()` | Скрыть главную кнопку |
| `showBackButton(onClick)` | Кнопка "Назад" |
| `hideBackButton()` | Скрыть кнопку "Назад" |
| `showConfirm(message)` | Popup подтверждения |
| `getThemeParams()` | CSS-переменные Telegram темы |
| `getColorScheme()` | `dark` / `light` |

---

## Многоязычность (i18n)

**Файлы**: `src/i18n/locales/`

| Файл | Язык |
|------|------|
| `ru.json` | Русский (основной) |
| `uz.json` | Узбекский |
| `tg.json` | Таджикский |
| `ky.json` | Киргизский |

Язык определяется:
1. Из профиля Worker (`worker.language`) при аутентификации
2. Fallback: `initData.user.language_code`
3. Fallback: `ru`

Разделы переводов: `common`, `auth`, `worker`, `brigadier`, `contractor`, `shift`, `report`.

---

## API-клиент

**Файл**: `src/api/client.ts`

- JWT-токен хранится в памяти (не в localStorage)
- `setAccessToken(token)` — устанавливается после аутентификации
- Все функции типизированы
- Автоматическая сериализация ошибок

---

## TODO (нереализовано)

- Экран Team detail (`/team/:id`) — просмотр конкретного звена
- Экран Report create (`/team/:id/report`) — создание отчёта бригадиром
- Экран Team manage (`/team/:id/manage`) — управление составом
- Contractor role detection — сейчас `isContractor = false` (нужно через JWT claims)
- Экран Shift manage (`/shift`) — управление активной сменой
- Экран Worker add (`/workers/add`) — отдельная форма добавления
- Settings — реальное сохранение настроек (сейчас заглушки)
- Supplement report — дополнение закрытых отчётов
- Ask question — форма задания вопроса

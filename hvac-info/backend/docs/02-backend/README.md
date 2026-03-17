# ⚙️ Backend разработка

Документация по серверной части приложения, API endpoints и решению технических проблем.

## Документы

### [BACKEND_ENDPOINTS_ANSWERS.md](./BACKEND_ENDPOINTS_ANSWERS.md)
**Спецификация API endpoints**

- Полное описание всех REST API endpoints
- Формат запросов и ответов
- Примеры использования
- Коды ошибок и обработка исключений

**Для кого:** Frontend разработчики, API тестировщики

---

### [BACKGROUND_PROCESSING_ANALYSIS.md](./BACKGROUND_PROCESSING_ANALYSIS.md)
**Анализ фоновой обработки**

- Архитектура фоновых задач
- Threading vs Celery
- Обработка длительных операций (поиск новостей)
- Индикаторы прогресса

**Для кого:** Backend разработчики, DevOps

---

## Архивные документы (решенные проблемы)

Следующие документы перемещены в [05-archived](../05-archived/), так как проблемы решены:

- **ADMIN_JWT_AUTH_FIX.md** — Исправление JWT аутентификации в Django Admin
- **BACKEND_FIX_POST_403.md** — Решение проблемы 403 Forbidden для POST запросов
- **GEMINI_API_FIX.md** — Исправление ошибки Gemini API (переход на gemini-2.5-flash)

---

## Технологический стек

- **Framework:** Django 4.2+
- **API:** Django REST Framework
- **Database:** PostgreSQL
- **Authentication:** JWT (djangorestframework-simplejwt)
- **Translation:** django-modeltranslation
- **CORS:** django-cors-headers

---

## Полезные команды

### Запуск сервера разработки
```bash
cd hvac_news
python manage.py runserver 8000
```

### Создание миграций
```bash
python manage.py makemigrations
python manage.py migrate
```

### Создание суперпользователя
```bash
python manage.py createsuperuser
```

### Запуск тестов
```bash
python manage.py test
```

---

[← Назад к главной документации](../README.md)

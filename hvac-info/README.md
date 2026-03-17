# HVAC News Platform

Платформа для агрегации и публикации новостей HVAC-индустрии с поддержкой автоматического поиска через AI.

## 📁 Структура проекта

```
hvac_news/
├── backend/          # Django REST API
│   ├── config/       # Настройки Django
│   ├── news/         # Приложение новостей + AI Discovery
│   ├── references/   # Справочники (источники, производители)
│   ├── users/        # Пользователи и авторизация
│   ├── feedback/     # Обратная связь
│   ├── docs/         # Документация бекенда
│   └── manage.py
├── frontend/         # React SPA
│   ├── src/
│   │   ├── components/   # UI компоненты
│   │   ├── pages/        # Страницы
│   │   ├── services/     # API клиент
│   │   ├── contexts/     # React Context (Auth, Language)
│   │   └── locales/      # Переводы (ru, en, de, pt)
│   └── package.json
├── backups/          # Бэкапы БД (не в git)
└── README.md
```

## 🚀 Быстрый старт

### Требования

- Python 3.11+
- Node.js 18+
- PostgreSQL 14+

### 1. Backend (Django)

```bash
cd backend

# Создать виртуальное окружение
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate   # Windows

# Установить зависимости
pip install -r requirements.txt

# Применить миграции
python manage.py migrate

# Запустить сервер
python manage.py runserver 8000
```

### 2. Frontend (React)

```bash
cd frontend

# Установить зависимости
npm install

# Запустить dev сервер
npm run dev
```

Frontend будет доступен на http://localhost:5173  
Backend API на http://localhost:8000/api

## 🔧 Конфигурация

### Backend (.env)

Создайте `backend/.env`:

```env
SECRET_KEY=your-secret-key
DEBUG=True
DB_ENGINE=django.db.backends.postgresql
DB_NAME=hvac_db
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=localhost
DB_PORT=5432

# API ключи для AI Discovery
OPENAI_API_KEY=sk-...
XAI_API_KEY=xai-...
ANTHROPIC_API_KEY=sk-ant-...
```

### Frontend (.env)

Создайте `frontend/.env`:

```env
VITE_API_URL=http://localhost:8000/api
```

## 📚 Документация

- [Документация бекенда](backend/docs/02-backend/README.md)
- [AI News Discovery](backend/docs/04-news-discovery/README.md)
- [Стоимость промптов](backend/docs/04-news-discovery/PROMPT_COST_OPTIMIZATION.md)

## 🐳 Docker (будущее)

```bash
# Запуск всего проекта
docker-compose up -d

# Только backend
docker-compose up backend

# Только frontend
docker-compose up frontend
```

## 📊 Технологический стек

### Backend
- Django 4.2
- Django REST Framework
- django-modeltranslation (i18n)
- PostgreSQL
- OpenAI / Grok / Anthropic API

### Frontend
- React 18 + TypeScript
- Vite
- TailwindCSS v4
- Shadcn/ui
- React Router v6

## 📝 Разработка

### Запуск в dev-режиме

**Терминал 1 (Backend):**
```bash
cd backend && source venv/bin/activate && python manage.py runserver 8000
```

**Терминал 2 (Frontend):**
```bash
cd frontend && npm run dev
```

### Ngrok туннель (для внешнего доступа)

```bash
ngrok http 8000 --domain=hvac-news.ngrok.io
```

## 📄 Лицензия

Proprietary © 2026 HVAC News Platform

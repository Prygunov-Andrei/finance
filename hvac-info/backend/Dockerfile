FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Системные зависимости (psycopg2, Pillow, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    libjpeg62-turbo-dev \
    zlib1g-dev \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn whitenoise

COPY . .

# Создаём директорию для логов и медиа
RUN mkdir -p /app/logs /app/media

# Собираем статику Django
RUN DJANGO_SETTINGS_MODULE=config.settings \
    SECRET_KEY=collectstatic-dummy \
    python manage.py collectstatic --noinput 2>/dev/null || true

EXPOSE 8001

CMD ["gunicorn", "config.wsgi:application", \
     "--bind", "0.0.0.0:8001", \
     "--workers", "2", \
     "--timeout", "120", \
     "--access-logfile", "-", \
     "--error-logfile", "-"]

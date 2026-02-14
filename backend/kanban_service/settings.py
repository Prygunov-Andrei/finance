import os
import sys
from pathlib import Path

from datetime import timedelta


BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get('KANBAN_SECRET_KEY', os.environ.get('SECRET_KEY', 'unsafe-kanban-secret'))
DEBUG = os.environ.get('KANBAN_DEBUG', os.environ.get('DEBUG', 'False')).lower() == 'true'

IS_TESTING = 'pytest' in sys.modules

ALLOWED_HOSTS = [
    'localhost',
    '127.0.0.1',
]

# Production: через nginx на хосте
for extra_host in os.environ.get('KANBAN_ALLOWED_HOSTS', '').split(','):
    extra_host = extra_host.strip()
    if extra_host:
        ALLOWED_HOSTS.append(extra_host)

if IS_TESTING and 'testserver' not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append('testserver')


INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    'rest_framework',
    'django_filters',
    'drf_spectacular',

    'kanban_files',
    'kanban_core',
    'kanban_rules',
    'kanban_supply',
    'kanban_warehouse',
    'kanban_object_tasks',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'kanban_service.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'kanban_service.wsgi.application'


# =============================================================================
# Database (отдельная БД, но тот же postgres контейнер)
# =============================================================================

KANBAN_DB_NAME = os.environ.get('KANBAN_DB_NAME', 'kanban')
KANBAN_DB_USER = os.environ.get('KANBAN_DB_USER', os.environ.get('DB_USER', 'postgres'))
KANBAN_DB_PASSWORD = os.environ.get('KANBAN_DB_PASSWORD', os.environ.get('DB_PASSWORD', 'postgres'))
KANBAN_DB_HOST = os.environ.get('KANBAN_DB_HOST', os.environ.get('DB_HOST', 'postgres'))
KANBAN_DB_PORT = os.environ.get('KANBAN_DB_PORT', os.environ.get('DB_PORT', '5432'))

if IS_TESTING:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': ':memory:',
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': KANBAN_DB_NAME,
            'USER': KANBAN_DB_USER,
            'PASSWORD': KANBAN_DB_PASSWORD,
            'HOST': KANBAN_DB_HOST,
            'PORT': KANBAN_DB_PORT,
        }
    }


AUTH_PASSWORD_VALIDATORS = []

LANGUAGE_CODE = 'ru-ru'
TIME_ZONE = 'Europe/Moscow'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'


# =============================================================================
# DRF / OpenAPI
# =============================================================================

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'kanban_service.authentication.KanbanAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_FILTER_BACKENDS': (
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 30,
    'DEFAULT_THROTTLE_CLASSES': (
        'kanban_service.throttling.KanbanAnonRateThrottle',
        'kanban_service.throttling.KanbanUserRateThrottle',
    ),
    'DEFAULT_THROTTLE_RATES': {
        'anon': os.environ.get('KANBAN_THROTTLE_ANON', '60/min'),
        'user': os.environ.get('KANBAN_THROTTLE_USER', '600/min'),
    },
}

SPECTACULAR_SETTINGS = {
    'TITLE': 'Kanban Service API',
    'DESCRIPTION': 'Workflow сервис (канбан) для снабжения, склада и задач по объектам',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
    'SCHEMA_PATH_PREFIX': '/kanban-api/v1/',
}


# =============================================================================
# JWT (пока базовая конфигурация; RS256 включим на этапе 3)
# =============================================================================

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=1),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
    'ALGORITHM': os.environ.get('KANBAN_JWT_ALG', 'HS256'),
    'SIGNING_KEY': os.environ.get('KANBAN_JWT_SIGNING_KEY', SECRET_KEY),
    'VERIFYING_KEY': os.environ.get('KANBAN_JWT_VERIFYING_KEY', ''),
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# =============================================================================
# Канбан-сервис верифицирует токены ERP (RS256)
# =============================================================================

KANBAN_SERVICE_TOKEN = os.environ.get('KANBAN_SERVICE_TOKEN', '').strip()

KANBAN_JWT_ISSUER = os.environ.get('JWT_ISSUER', 'finans-assistant-erp')
KANBAN_JWT_AUDIENCE = os.environ.get('JWT_AUDIENCE', 'kanban-service')
KANBAN_JWT_ALGORITHM = os.environ.get('JWT_ALGORITHM', 'RS256')
KANBAN_JWT_VERIFYING_KEY = os.environ.get('JWT_PUBLIC_KEY', '').strip()

# ERP integration (kanban -> ERP)
ERP_API_BASE_URL = os.environ.get('ERP_API_BASE_URL', 'http://backend:8000/api/v1').rstrip('/')
ERP_SERVICE_TOKEN = os.environ.get('ERP_SERVICE_TOKEN', '').strip()


# =============================================================================
# Celery
# =============================================================================

CELERY_BROKER_URL = os.environ.get('KANBAN_CELERY_BROKER_URL', os.environ.get('CELERY_BROKER_URL', 'redis://redis:6379/1'))
CELERY_RESULT_BACKEND = os.environ.get('KANBAN_CELERY_RESULT_BACKEND', os.environ.get('CELERY_RESULT_BACKEND', 'redis://redis:6379/1'))
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE

if IS_TESTING:
    CELERY_TASK_ALWAYS_EAGER = True
    CELERY_TASK_EAGER_PROPAGATES = True

# Celery Beat — расписание (V1)
from celery.schedules import crontab  # noqa: E402

CELERY_BEAT_SCHEDULE = {
    'scan-overdue-object-tasks': {
        'task': 'kanban_object_tasks.tasks.scan_overdue_tasks',
        'schedule': crontab(hour=7, minute=0),
    },
}

# =============================================================================
# MinIO / S3 для универсального файлового слоя
# =============================================================================

KANBAN_S3_ENDPOINT_URL = os.environ.get('KANBAN_S3_ENDPOINT_URL', os.environ.get('WORKLOG_S3_ENDPOINT_URL', 'http://minio:9000'))
KANBAN_S3_ACCESS_KEY = os.environ.get('KANBAN_S3_ACCESS_KEY', os.environ.get('WORKLOG_S3_ACCESS_KEY', 'minioadmin'))
KANBAN_S3_SECRET_KEY = os.environ.get('KANBAN_S3_SECRET_KEY', os.environ.get('WORKLOG_S3_SECRET_KEY', 'minioadmin'))
KANBAN_S3_REGION = os.environ.get('KANBAN_S3_REGION', 'us-east-1')
KANBAN_S3_BUCKET_NAME = os.environ.get('KANBAN_S3_BUCKET_NAME', 'files')

# Ограничения загрузки файлов (V1)
KANBAN_FILE_MAX_SIZE_BYTES = int(os.environ.get('KANBAN_FILE_MAX_SIZE_BYTES', str(100 * 1024 * 1024)))  # 100MB
KANBAN_FILE_ALLOWED_MIME = set(
    m.strip() for m in os.environ.get(
        'KANBAN_FILE_ALLOWED_MIME',
        'application/pdf,image/jpeg,image/png,image/webp,text/plain,application/zip',
    ).split(',') if m.strip()
)


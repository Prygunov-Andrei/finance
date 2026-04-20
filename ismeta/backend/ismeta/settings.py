"""
Django settings для ISMeta.

Минимальный скелет. Детальная настройка идёт по эпику E1.
Для production-настроек см. specs/12-security.md и specs/13-release-process.md.
"""

from pathlib import Path

from decouple import Csv, config

BASE_DIR = Path(__file__).resolve().parent.parent

# ==== Core ====
SECRET_KEY = config("DJANGO_SECRET_KEY", default="dev-insecure")
DEBUG = config("DEBUG", default=False, cast=bool)
ALLOWED_HOSTS = config("ALLOWED_HOSTS", default="localhost,127.0.0.1", cast=Csv())

# ==== Apps ====
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "django_filters",
    "corsheaders",
    "drf_spectacular",
    # ISMeta apps — добавляются по мере реализации эпиков
    "apps.workspace",
    "apps.estimate",
    "apps.llm",
    "apps.agent",
    "apps.integration",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    # TODO(E2): добавить WorkspaceMiddleware для мульти-тенантности
]

ROOT_URLCONF = "ismeta.urls"
WSGI_APPLICATION = "ismeta.wsgi.application"
ASGI_APPLICATION = "ismeta.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# ==== DB ====
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "OPTIONS": {
            "options": "-c search_path=public",
        },
        # Парсится из DATABASE_URL в compose, см. .env.example
        "NAME": config("DB_NAME", default="ismeta"),
        "USER": config("DB_USER", default="ismeta"),
        "PASSWORD": config("DB_PASSWORD", default="ismeta"),
        "HOST": config("DB_HOST", default="localhost"),
        "PORT": config("DB_PORT", default="5432"),
    }
}

# ==== Auth ====
# В MVP авторизация — JWT, подписанный ERP (см. specs/12-security.md §3).
# Для dev — упрощённая fallback-логика, детализация в E14.

REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.CursorPagination",
    "PAGE_SIZE": 100,
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "apps.workspace.filters.WorkspaceFilterBackend",
    ],
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "apps.workspace.auth.ERPJwtAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.AllowAny" if config("ISMETA_AUTH_DISABLED", default=False, cast=bool)
        else "rest_framework.permissions.IsAuthenticated",
    ],
}

SPECTACULAR_SETTINGS = {
    "TITLE": "ISMeta API",
    "DESCRIPTION": "API сметного сервиса ISMeta.",
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

# ==== Celery ====
CELERY_BROKER_URL = config("CELERY_BROKER_URL", default="redis://localhost:6379/3")
CELERY_RESULT_BACKEND = config("CELERY_RESULT_BACKEND", default="redis://localhost:6379/3")
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TIMEZONE = "Europe/Moscow"

# ==== CORS ====
CORS_ALLOW_ALL_ORIGINS = DEBUG  # в dev разрешаем всё; в prod — явные origin'ы (TODO E14)
CORS_ALLOW_HEADERS = [
    "accept",
    "authorization",
    "content-type",
    "if-match",
    "idempotency-key",
    "x-workspace-id",
    "x-webhook-secret",
    "x-webhook-event-id",
    "x-webhook-event-type",
]

# ==== Media / Files ====
MEDIA_URL = "/media/"
MEDIA_ROOT = config("MEDIA_ROOT", default=str(BASE_DIR / "media"))

UPLOAD_MAX_SIZE_MB = config("UPLOAD_MAX_SIZE_MB", default=50, cast=int)
DATA_UPLOAD_MAX_MEMORY_SIZE = UPLOAD_MAX_SIZE_MB * 1024 * 1024

# ==== i18n ====
LANGUAGE_CODE = "ru-ru"
TIME_ZONE = "Europe/Moscow"
USE_I18N = True
USE_TZ = True

# ==== Static ====
STATIC_URL = "static/"

# ==== ISMeta-specific ====
ISMETA_ERP_BASE_URL = config("ISMETA_ERP_BASE_URL", default=config("ERP_BASE_URL", default="http://localhost:8000"))
ISMETA_ERP_MASTER_TOKEN = config("ISMETA_ERP_MASTER_TOKEN", default=config("ERP_MASTER_TOKEN", default=""))
ISMETA_ERP_WEBHOOK_SECRET = config("ISMETA_ERP_WEBHOOK_SECRET", default=config("ERP_WEBHOOK_SECRET", default=""))
ISMETA_LLM_PROVIDER_DEFAULT = config("LLM_PROVIDER_DEFAULT", default="openai")
ISMETA_LLM_MODE = config("ISMETA_LLM_MODE", default=config("LLM_MODE", default="real"))  # real | cassette | mock
OPENAI_API_KEY = config("OPENAI_API_KEY", default="")
ISMETA_KNOWLEDGE_MD_ROOT = config("KNOWLEDGE_MD_ROOT", default=str(BASE_DIR / "data/knowledge"))

# ==== Recognition Service (E15.02b) ====
# standalone PDF-parsing microservice (recognition/)
RECOGNITION_URL = config("RECOGNITION_URL", default="http://recognition:8003")
RECOGNITION_API_KEY = config("RECOGNITION_API_KEY", default="")

# ==== Logging ====
LOG_LEVEL = config("LOG_LEVEL", default="INFO")
LOG_FORMAT = config("LOG_FORMAT", default="json")
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {"class": "logging.StreamHandler"},
    },
    "root": {"handlers": ["console"], "level": LOG_LEVEL},
}

# ==== OpenTelemetry ====
# Заложено с E1 (см. specs/11-metrics.md §3)
OTEL_ENABLED = config("OTEL_ENABLED", default=True, cast=bool)
OTEL_EXPORTER_OTLP_ENDPOINT = config("OTEL_EXPORTER_OTLP_ENDPOINT", default="http://localhost:4318")
OTEL_SERVICE_NAME = config("OTEL_SERVICE_NAME", default="ismeta-backend")
OTEL_RESOURCE_ATTRIBUTES = config(
    "OTEL_RESOURCE_ATTRIBUTES",
    default=f"service.name={OTEL_SERVICE_NAME},deployment.environment={'dev' if DEBUG else 'prod'}",
)

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

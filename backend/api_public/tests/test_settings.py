"""Тесты конфигурации settings.py — Заход 0."""
from django.conf import settings


class TestStoragesConfig:
    """Проверка STORAGES настроек."""

    def test_storages_dict_exists(self):
        """STORAGES dict определён."""
        assert hasattr(settings, 'STORAGES')

    def test_default_storage_is_filesystem(self):
        """default storage — FileSystemStorage (не S3)."""
        assert settings.STORAGES['default']['BACKEND'] == \
            'django.core.files.storage.FileSystemStorage'

    def test_portal_storage_is_s3(self):
        """portal storage — S3Boto3Storage."""
        assert settings.STORAGES['portal']['BACKEND'] == \
            'storages.backends.s3boto3.S3Boto3Storage'

    def test_portal_storage_private(self):
        """portal storage — private ACL (файлы не публичные)."""
        opts = settings.STORAGES['portal']['OPTIONS']
        assert opts['default_acl'] == 'private'

    def test_portal_storage_presigned_urls(self):
        """portal storage — presigned URLs включены."""
        opts = settings.STORAGES['portal']['OPTIONS']
        assert opts['querystring_auth'] is True
        assert opts['querystring_expire'] == 3600


class TestCeleryRoutes:
    """Проверка Celery task routes."""

    def test_public_tasks_route(self):
        """api_public.tasks.* → очередь public_tasks."""
        routes = settings.CELERY_TASK_ROUTES
        assert 'api_public.tasks.*' in routes
        assert routes['api_public.tasks.*']['queue'] == 'public_tasks'


class TestEmailConfig:
    """Проверка email-настроек."""

    def test_email_backend_configured(self):
        """EMAIL_BACKEND настроен."""
        assert hasattr(settings, 'EMAIL_BACKEND')
        assert settings.EMAIL_BACKEND  # не пустой

    def test_default_from_email(self):
        """DEFAULT_FROM_EMAIL настроен."""
        assert hasattr(settings, 'DEFAULT_FROM_EMAIL')
        assert settings.DEFAULT_FROM_EMAIL


class TestCorsConfig:
    """Проверка CORS-настроек."""

    def test_cors_allow_credentials(self):
        """CORS_ALLOW_CREDENTIALS = True."""
        assert settings.CORS_ALLOW_CREDENTIALS is True

    def test_storages_in_installed_apps(self):
        """'storages' в INSTALLED_APPS."""
        assert 'storages' in settings.INSTALLED_APPS

    def test_api_public_in_installed_apps(self):
        """'api_public' в INSTALLED_APPS."""
        assert 'api_public' in settings.INSTALLED_APPS

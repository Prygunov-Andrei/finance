from django.apps import AppConfig


class AcCatalogConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'ac_catalog'
    verbose_name = 'Рейтинг: каталог моделей'

    def ready(self) -> None:
        from . import signals  # noqa: F401

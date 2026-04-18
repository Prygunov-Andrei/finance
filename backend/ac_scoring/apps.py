from django.apps import AppConfig


class AcScoringConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'ac_scoring'
    verbose_name = 'Рейтинг: scoring'

    def ready(self) -> None:
        from . import signals  # noqa: F401

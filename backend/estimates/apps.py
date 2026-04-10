from django.apps import AppConfig


class EstimatesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'estimates'

    def ready(self):
        import estimates.tasks_work_matching  # noqa: F401 — register Celery tasks

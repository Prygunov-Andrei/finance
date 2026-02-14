from django.apps import AppConfig


class KanbanRulesConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'kanban_rules'
    verbose_name = 'Kanban: Rules'

    def ready(self):
        from . import signals  # noqa: F401


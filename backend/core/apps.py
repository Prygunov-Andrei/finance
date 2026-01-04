from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'core'
    
    def ready(self):
        """Регистрируем сигналы при загрузке приложения"""
        try:
            from core.file_signals import register_all_file_cleanups
            register_all_file_cleanups()
        except Exception:
            # Игнорируем ошибки при миграциях
            pass

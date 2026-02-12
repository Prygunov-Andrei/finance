import os
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'finans_assistant.settings')

app = Celery('finans_assistant')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

# Celery Beat — периодические задачи
app.conf.beat_schedule = {
    'auto-activate-scheduled-shifts': {
        'task': 'worklog.tasks.auto_activate_scheduled_shifts',
        'schedule': 300.0,  # Каждые 5 минут
    },
    'auto-close-expired-shifts': {
        'task': 'worklog.tasks.auto_close_expired_shifts',
        'schedule': 900.0,  # Каждые 15 минут
    },
    'send-report-warnings': {
        'task': 'worklog.tasks.send_report_warnings',
        'schedule': 600.0,  # Каждые 10 минут
    },
    # --- Banking ---
    'banking-sync-statements': {
        'task': 'banking.sync_all_statements',
        'schedule': 1800.0,  # Каждые 30 минут
    },
    'banking-execute-scheduled-payments': {
        'task': 'banking.execute_scheduled_payments',
        'schedule': 900.0,  # Каждые 15 минут
    },
    'banking-refresh-tokens': {
        'task': 'banking.refresh_bank_tokens',
        'schedule': 43200.0,  # Каждые 12 часов
    },
    'banking-check-pending-payments': {
        'task': 'banking.check_pending_payments',
        'schedule': 300.0,  # Каждые 5 минут
    },
}

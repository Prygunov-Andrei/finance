import os
from celery import Celery
from celery.schedules import crontab

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'finans_assistant.settings')

app = Celery('finans_assistant')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

# Celery Beat — все периодические задачи (единый источник правды)
app.conf.beat_schedule = {
    # --- Worklog ---
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
    # --- Supply ---
    'generate-recurring-invoices': {
        'task': 'supply.tasks.generate_recurring_invoices',
        'schedule': crontab(hour=6, minute=0),  # Каждый день в 06:00
    },
    'recover-stuck-recognition': {
        'task': 'supply.tasks.recover_stuck_recognition',
        'schedule': 300.0,  # Каждые 5 минут
    },
    # --- Kanban ---
    'scan-overdue-object-tasks': {
        'task': 'kanban_object_tasks.tasks.scan_overdue_tasks',
        'schedule': crontab(hour=7, minute=0),  # Каждый день в 07:00
    },
    # --- Work Matching ---
    'recover-stuck-work-matching': {
        'task': 'estimates.tasks_work_matching.recover_stuck_work_matching',
        'schedule': 300.0,  # Каждые 5 минут
    },
    'sync-knowledge-md': {
        'task': 'estimates.tasks_work_matching.sync_knowledge_md_task',
        'schedule': 1800.0,  # Каждые 30 минут
    },
    # --- Marketing ---
    'marketing-sync-avito-stats': {
        'task': 'marketing.tasks.sync_avito_stats',
        'schedule': crontab(hour=10, minute=0, day_of_week=1),  # Пн 10:00
    },
    'marketing-refresh-avito-token': {
        'task': 'marketing.tasks.refresh_avito_token',
        'schedule': 43200.0,  # Каждые 12 часов
    },
    'marketing-cleanup-old-listings': {
        'task': 'marketing.tasks.cleanup_old_listings',
        'schedule': crontab(hour=3, minute=0, day_of_week=0),  # Вс 03:00
    },
}

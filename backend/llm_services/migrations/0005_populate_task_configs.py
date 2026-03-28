"""Data migration: создаём начальные LLMTaskConfig для всех типов задач."""

from django.db import migrations


def create_task_configs(apps, schema_editor):
    LLMTaskConfig = apps.get_model('llm_services', 'LLMTaskConfig')
    task_types = [
        'invoice_parsing',
        'product_matching',
        'work_matching_semantic',
        'work_matching_web',
        'estimate_import',
    ]
    for tt in task_types:
        LLMTaskConfig.objects.get_or_create(
            task_type=tt,
            defaults={'is_enabled': True, 'provider': None},
        )


def remove_task_configs(apps, schema_editor):
    LLMTaskConfig = apps.get_model('llm_services', 'LLMTaskConfig')
    LLMTaskConfig.objects.filter(task_type__in=[
        'invoice_parsing', 'product_matching', 'work_matching_semantic',
        'work_matching_web', 'estimate_import',
    ]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('llm_services', '0004_task_config_and_web_search'),
    ]

    operations = [
        migrations.RunPython(create_task_configs, remove_task_configs),
    ]

# Generated manually

from django.db import migrations


def create_default_category(apps, schema_editor):
    """Создаёт дефолтную категорию 'По договору' и обновляет существующие платежи"""
    ExpenseCategory = apps.get_model('payments', 'ExpenseCategory')
    Payment = apps.get_model('payments', 'Payment')
    
    # Создаём дефолтную категорию "По договору"
    default_category, created = ExpenseCategory.objects.get_or_create(
        code='contract',
        defaults={
            'name': 'По договору',
            'description': 'Платежи, привязанные к договорам',
            'requires_contract': True,
            'is_active': True,
            'sort_order': 0,
        }
    )
    
    # Обновляем все существующие платежи, у которых нет категории
    Payment.objects.filter(category__isnull=True).update(category=default_category)


def reverse_migration(apps, schema_editor):
    """Откат миграции - удаляем категорию 'По договору'"""
    ExpenseCategory = apps.get_model('payments', 'ExpenseCategory')
    ExpenseCategory.objects.filter(code='contract').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('payments', '0002_add_expense_category'),
    ]

    operations = [
        migrations.RunPython(create_default_category, reverse_migration),
    ]


from django.db import migrations


def create_system_accounts(apps, schema_editor):
    ExpenseCategory = apps.get_model('payments', 'ExpenseCategory')

    system_accounts = [
        {
            'name': 'Прибыль',
            'code': 'profit',
            'account_type': 'system',
            'description': 'Счёт прибыли компании. Сюда выводятся средства с объектов после завершения.',
            'sort_order': 1,
        },
        {
            'name': 'Оборотные средства',
            'code': 'working_capital',
            'account_type': 'system',
            'description': 'Свободные оборотные средства. Пополняются из Прибыли, используются для финансирования объектов.',
            'sort_order': 2,
        },
        {
            'name': 'НДС',
            'code': 'vat',
            'account_type': 'system',
            'description': 'Учёт входящего и исходящего НДС.',
            'sort_order': 3,
        },
    ]

    for acc in system_accounts:
        ExpenseCategory.objects.get_or_create(
            code=acc['code'],
            defaults=acc,
        )


def reverse(apps, schema_editor):
    ExpenseCategory = apps.get_model('payments', 'ExpenseCategory')
    ExpenseCategory.objects.filter(
        code__in=['profit', 'working_capital', 'vat'],
        account_type='system',
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('payments', '0012_finance_internal_accounts_journal'),
    ]

    operations = [
        migrations.RunPython(create_system_accounts, reverse),
    ]

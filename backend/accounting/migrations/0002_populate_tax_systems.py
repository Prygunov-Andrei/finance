from django.db import migrations

def create_tax_systems(apps, schema_editor):
    TaxSystem = apps.get_model('accounting', 'TaxSystem')
    
    systems = [
        {
            'code': 'osn_vat_20',
            'name': 'ОСН (НДС 20%)',
            'vat_rate': 20.00,
            'has_vat': True,
            'description': 'Общая система налогообложения, ставка НДС 20%'
        },
        {
            'code': 'osn_vat_10',
            'name': 'ОСН (НДС 10%)',
            'vat_rate': 10.00,
            'has_vat': True,
            'description': 'Общая система налогообложения, ставка НДС 10%'
        },
        {
            'code': 'osn_vat_5',
            'name': 'ОСН (НДС 5%)',
            'vat_rate': 5.00,
            'has_vat': True,
            'description': 'Общая система налогообложения, ставка НДС 5%'
        },
        {
            'code': 'usn_income',
            'name': 'УСН (Доходы)',
            'vat_rate': None,
            'has_vat': False,
            'description': 'Упрощенная система налогообложения (Доходы)'
        },
        {
            'code': 'usn_income_expense',
            'name': 'УСН (Доходы - Расходы)',
            'vat_rate': None,
            'has_vat': False,
            'description': 'Упрощенная система налогообложения (Доходы минус Расходы)'
        },
        {
            'code': 'no_vat',
            'name': 'Без НДС',
            'vat_rate': None,
            'has_vat': False,
            'description': 'Не плательщик НДС'
        }
    ]
    
    for system_data in systems:
        TaxSystem.objects.get_or_create(
            code=system_data['code'],
            defaults=system_data
        )

def remove_tax_systems(apps, schema_editor):
    TaxSystem = apps.get_model('accounting', 'TaxSystem')
    codes = ['osn_vat_20', 'osn_vat_10', 'osn_vat_5', 'usn_income', 'usn_income_expense', 'no_vat']
    TaxSystem.objects.filter(code__in=codes).delete()

class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(create_tax_systems, remove_tax_systems),
    ]

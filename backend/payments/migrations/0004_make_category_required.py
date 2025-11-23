# Generated manually

from django.db import migrations, models
import django.db.models.deletion


def update_null_categories(apps, schema_editor):
    """Обновляет все NULL категории на дефолтную категорию 'По договору'"""
    ExpenseCategory = apps.get_model('payments', 'ExpenseCategory')
    Payment = apps.get_model('payments', 'Payment')
    
    # Получаем дефолтную категорию
    default_category = ExpenseCategory.objects.filter(code='contract').first()
    
    if default_category:
        # Обновляем все платежи без категории
        Payment.objects.filter(category__isnull=True).update(category=default_category)


class Migration(migrations.Migration):

    dependencies = [
        ('payments', '0003_create_default_category'),
    ]

    operations = [
        # Сначала обновляем все NULL значения
        migrations.RunPython(update_null_categories, migrations.RunPython.noop),
        # Затем делаем поле обязательным
        migrations.AlterField(
            model_name='payment',
            name='category',
            field=models.ForeignKey(
                help_text='Категория платежа (например: Зарплата, Аренда)',
                on_delete=django.db.models.deletion.PROTECT,
                related_name='payments',
                to='payments.expensecategory',
                verbose_name='Категория'
            ),
        ),
    ]


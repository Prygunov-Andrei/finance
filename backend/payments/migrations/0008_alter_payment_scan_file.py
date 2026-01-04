# Generated manually for scan_file required change

from django.db import migrations, models
import payments.models


class Migration(migrations.Migration):

    dependencies = [
        ('payments', '0007_payment_internal_transfer_group_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='payment',
            name='scan_file',
            field=models.FileField(
                upload_to=payments.models.payment_scan_path,
                verbose_name='Документ (счёт/акт)',
                help_text='Обязательный PDF-документ: счёт на оплату или акт',
                # Note: Для существующих записей без файла нужно будет добавить файлы вручную
                # или выполнить data migration
            ),
        ),
    ]

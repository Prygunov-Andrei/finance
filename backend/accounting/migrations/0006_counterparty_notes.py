from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0005_counterparty_address'),
    ]

    operations = [
        migrations.AddField(
            model_name='counterparty',
            name='notes',
            field=models.TextField(
                blank=True,
                default='',
                help_text='Произвольные заметки по контрагенту',
                verbose_name='Заметки',
            ),
        ),
    ]

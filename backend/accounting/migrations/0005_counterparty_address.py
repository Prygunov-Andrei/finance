from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0004_legalentity_director_legalentity_director_name_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='counterparty',
            name='address',
            field=models.TextField(blank=True, default='', verbose_name='Юридический адрес'),
        ),
    ]

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('accounting', '0004_legalentity_director_legalentity_director_name_and_more'),
    ]

    operations = [
        migrations.CreateModel(
            name='FNSCache',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('query_hash', models.CharField(db_index=True, max_length=64, unique=True, verbose_name='Хеш запроса')),
                ('endpoint', models.CharField(help_text='search, egr, check, bo, stat', max_length=20, verbose_name='Метод API')),
                ('query_params', models.JSONField(verbose_name='Параметры запроса')),
                ('response_data', models.JSONField(verbose_name='Ответ API')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Создан')),
                ('expires_at', models.DateTimeField(verbose_name='Истекает')),
            ],
            options={
                'verbose_name': 'Кэш API-FNS',
                'verbose_name_plural': 'Кэш API-FNS',
            },
        ),
        migrations.CreateModel(
            name='FNSReport',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Создано')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Обновлено')),
                ('report_type', models.CharField(choices=[('check', 'Проверка контрагента'), ('egr', 'Данные ЕГРЮЛ/ЕГРИП'), ('bo', 'Бухгалтерская отчетность')], max_length=10, verbose_name='Тип отчета')),
                ('inn', models.CharField(max_length=12, verbose_name='ИНН на момент запроса')),
                ('report_date', models.DateTimeField(auto_now_add=True, verbose_name='Дата формирования')),
                ('data', models.JSONField(verbose_name='Полный JSON-ответ API-FNS')),
                ('summary', models.JSONField(blank=True, help_text='Структурированная сводка для быстрого отображения (позитивные/негативные факторы)', null=True, verbose_name='Краткая выжимка')),
                ('counterparty', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='fns_reports', to='accounting.counterparty', verbose_name='Контрагент')),
                ('requested_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='fns_reports', to=settings.AUTH_USER_MODEL, verbose_name='Запросил')),
            ],
            options={
                'verbose_name': 'Отчет ФНС',
                'verbose_name_plural': 'Отчеты ФНС',
                'ordering': ['-report_date'],
            },
        ),
        migrations.AddIndex(
            model_name='fnsreport',
            index=models.Index(fields=['counterparty', '-report_date'], name='fns_fnsrepo_counter_idx'),
        ),
        migrations.AddIndex(
            model_name='fnsreport',
            index=models.Index(fields=['inn'], name='fns_fnsrepo_inn_idx'),
        ),
        migrations.AddIndex(
            model_name='fnscache',
            index=models.Index(fields=['expires_at'], name='fns_fnscach_expires_idx'),
        ),
    ]

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0002_notification'),
    ]

    operations = [
        migrations.CreateModel(
            name='Release',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Дата создания')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Дата обновления')),
                ('version', models.CharField(db_index=True, help_text='SemVer git-tag, например v1.2.3', max_length=32, unique=True, verbose_name='Версия')),
                ('released_at', models.DateTimeField(auto_now_add=True, db_index=True, verbose_name='Дата релиза')),
                ('git_sha', models.CharField(blank=True, max_length=40, verbose_name='Commit SHA')),
                ('prev_version', models.CharField(blank=True, max_length=32, verbose_name='Предыдущая версия')),
                ('commits', models.JSONField(default=list, help_text='[{type, scope, subject, sha, author}]', verbose_name='Коммиты')),
                ('description', models.TextField(blank=True, help_text='Необязательный человеческий текст для релиза. Если заполнен — UI показывает его над списком коммитов.', verbose_name='Описание (ручное)')),
                ('is_published', models.BooleanField(db_index=True, default=True, help_text='Снять галочку, чтобы скрыть ошибочный релиз из changelog.', verbose_name='Опубликован')),
            ],
            options={
                'verbose_name': 'Релиз',
                'verbose_name_plural': 'Релизы',
                'ordering': ['-released_at'],
            },
        ),
    ]

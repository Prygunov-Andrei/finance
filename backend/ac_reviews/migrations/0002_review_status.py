# Добавляет поле Review.status (TextChoices, default=pending) с индексом.
# Паттерн M4: SQL DEFAULT при ADD COLUMN, чтобы существующие строки получили
# валидное значение без полного перепрогона; затем DROP DEFAULT — дальше
# default обеспечивает Django ORM. Backfill в approved/pending — отдельная
# data-миграция 0003.
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('ac_reviews', '0001_initial'),
    ]

    operations = [
        migrations.RunSQL(
            sql=(
                "ALTER TABLE ac_reviews_review "
                "ADD COLUMN status varchar(10) DEFAULT 'pending' NOT NULL;"
                "ALTER TABLE ac_reviews_review ALTER COLUMN status DROP DEFAULT;"
                "CREATE INDEX ac_reviews_review_status_idx "
                "ON ac_reviews_review (status);"
            ),
            reverse_sql=(
                "DROP INDEX IF EXISTS ac_reviews_review_status_idx;"
                "ALTER TABLE ac_reviews_review DROP COLUMN status;"
            ),
            state_operations=[
                migrations.AddField(
                    model_name='review',
                    name='status',
                    field=models.CharField(
                        choices=[
                            ('pending', 'На модерации'),
                            ('approved', 'Одобрен'),
                            ('rejected', 'Отклонён'),
                        ],
                        db_index=True,
                        default='pending',
                        help_text='По умолчанию pending. Публично видны только approved.',
                        max_length=10,
                        verbose_name='Статус модерации',
                    ),
                ),
            ],
        ),
    ]

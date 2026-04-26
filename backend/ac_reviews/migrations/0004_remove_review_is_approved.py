# Удаление булевого Review.is_approved — заменён на tri-state status.
# Запускать ТОЛЬКО после 0003 (backfill), иначе данные о модерации потеряются.
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("ac_reviews", "0003_backfill_review_status"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="review",
            name="is_approved",
        ),
    ]

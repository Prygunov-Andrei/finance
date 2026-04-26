# Backfill Review.status из старого булевого is_approved.
# Маппинг: is_approved=True → approved, is_approved=False → pending.
# Идемпотентно: повторный прогон ничего не меняет (фильтр по статусу pending
# с is_approved=True всё равно не найдёт ничего после первого прогона).
from django.db import migrations


def backfill(apps, schema_editor):
    Review = apps.get_model("ac_reviews", "Review")
    Review.objects.filter(is_approved=True, status="pending").update(status="approved")
    # is_approved=False остаётся как pending — это правильное поведение:
    # такие отзывы ждали модерации и продолжают её ждать.


def reverse(apps, schema_editor):
    Review = apps.get_model("ac_reviews", "Review")
    Review.objects.filter(status="approved").update(is_approved=True)
    Review.objects.exclude(status="approved").update(is_approved=False)


class Migration(migrations.Migration):

    dependencies = [
        ("ac_reviews", "0002_review_status"),
    ]

    operations = [
        migrations.RunPython(backfill, reverse),
    ]

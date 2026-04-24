# TD-02 (#29): свободная заметка PO к смете — «стикер». Без истории, cap 5000
# символов (валидируется в serializer, БД-level cap не ставим — TextField).

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("estimate", "0004_create_material_with_trgm"),
    ]

    operations = [
        migrations.AddField(
            model_name="estimate",
            name="note",
            field=models.TextField(blank=True, default=""),
        ),
    ]

"""Создаёт singleton-запись FeaturedNewsSettings (pk=1) с category=NULL.

Идемпотентна: update_or_create — повторный прогон ничего не ломает.
NULL в category означает «latest published из всех категорий» (default).
"""
from django.db import migrations


def seed(apps, schema_editor):
    FeaturedNewsSettings = apps.get_model("news", "FeaturedNewsSettings")
    FeaturedNewsSettings.objects.update_or_create(pk=1, defaults={})


class Migration(migrations.Migration):

    dependencies = [
        ("news", "0029_featurednewssettings"),
    ]

    operations = [
        migrations.RunPython(seed, migrations.RunPython.noop),
    ]

"""Seed 8 initial NewsCategory из hardcoded enum NewsPost.Category + backfill
category_ref_slug на всех существующих NewsPost.

Идемпотентна: update_or_create/get_or_create — можно применять повторно.
"""
from django.db import migrations


SEED = [
    ("business",   "Деловые",        10),
    ("industry",   "Индустрия",      20),
    ("market",     "Рынок",          30),
    ("regulation", "Регулирование",  40),
    ("review",     "Обзор",          50),
    ("guide",      "Гайд",           60),
    ("brands",     "Бренды",         70),
    ("other",      "Прочее",         80),
]


def seed_categories(apps, schema_editor):
    NewsCategory = apps.get_model("news", "NewsCategory")
    NewsPost = apps.get_model("news", "NewsPost")

    for slug, name, order in SEED:
        NewsCategory.objects.update_or_create(
            slug=slug,
            defaults={"name": name, "order": order, "is_active": True},
        )

    # Backfill: для постов без FK копируем из CharField category.
    # update() напрямую по db_column — не дергаем save() (который всё равно
    # в history-миграциях работает на frozen-модели без кастомного save()).
    for post in NewsPost.objects.filter(category_ref__isnull=True).iterator():
        slug = post.category
        if NewsCategory.objects.filter(slug=slug).exists():
            NewsPost.objects.filter(pk=post.pk).update(category_ref_id=slug)


def unseed(apps, schema_editor):
    NewsPost = apps.get_model("news", "NewsPost")
    NewsCategory = apps.get_model("news", "NewsCategory")

    # Обнуляем FK на всех постах (PROTECT — иначе падёт).
    NewsPost.objects.filter(category_ref__isnull=False).update(category_ref_id=None)
    NewsCategory.objects.filter(slug__in=[s for s, *_ in SEED]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("news", "0027_news_category_and_ref"),
    ]

    operations = [
        migrations.RunPython(seed_categories, unseed),
    ]

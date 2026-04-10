from django.db import migrations

KEYWORDS = [
    'вентиляция',
    'кондиционирование',
    'слабые токи',
    'монтаж вентиляции',
    'монтаж кондиционеров',
    'климатическое оборудование',
    'электромонтаж',
    'пусконаладка',
]


def seed_keywords(apps, schema_editor):
    AvitoSearchKeyword = apps.get_model('marketing', 'AvitoSearchKeyword')
    for kw in KEYWORDS:
        AvitoSearchKeyword.objects.get_or_create(keyword=kw)


def reverse_seed(apps, schema_editor):
    AvitoSearchKeyword = apps.get_model('marketing', 'AvitoSearchKeyword')
    AvitoSearchKeyword.objects.filter(keyword__in=KEYWORDS).delete()


class Migration(migrations.Migration):
    dependencies = [
        ('marketing', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed_keywords, reverse_seed),
    ]

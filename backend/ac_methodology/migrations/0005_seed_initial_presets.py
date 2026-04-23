"""Data-migration: создаёт 6 стартовых пресетов таба «Свой рейтинг».

Отбор критериев в M2M повторяет substring-эвристику, которая до этого жила
на фронте в PRESET_TAGS (frontend/app/(hvac-info)/ratings/_components/
CustomRatingTab.tsx). После миграции фронту остаётся только отрисовать
уже готовый `criteria_codes`.

Миграция идемпотентна: update_or_create по slug, перезаписывает M2M.
Пресет `avgust` имеет `is_all_selected=True` → его M2M очищается (не нужен:
serializer сам вернёт все коды активной методики).
"""
from __future__ import annotations

from django.db import migrations


PRESETS = [
    {
        "slug": "avgust",
        "label": "Август-климат",
        "order": 0,
        "is_all_selected": True,
        "description": (
            "Рейтинг по полной методике Август-климат — все активные "
            "критерии с текущими весами."
        ),
    },
    {
        "slug": "silence",
        "label": "Тишина",
        "order": 1,
        "include_substrings": [
            "noise", "fan", "inverter", "silen",
            "шум", "вент", "инверт", "тих",
        ],
        "description": (
            "Приоритет тихой работы: малый уровень шума, инверторный "
            "компрессор, плавная регулировка вентилятора."
        ),
    },
    {
        "slug": "cold",
        "label": "Сибирь",
        "order": 2,
        "include_substrings": [
            "heater", "cold", "winter", "evi", "drip", "8c", "heat_mode",
            "обогрев", "холод", "подд", "зима",
        ],
        "description": (
            "Работа в холодном климате: подогрев поддона, EVI-компрессор, "
            "обогрев до −25°C."
        ),
    },
    {
        "slug": "budget",
        "label": "Бюджет",
        "order": 3,
        "exclude_substrings": [
            "wifi", "ionizer", "uv", "alice", "sensor",
            "auto_freeze", "sterilization", "aromat",
            "алис", "ионизат", "ультрафиол", "ароматиз",
        ],
        "description": "Базовая функциональность без премиум-опций.",
    },
    {
        "slug": "house",
        "label": "Частный дом",
        "order": 4,
        "include_substrings": [
            "pipe", "height", "heat_exchanger", "compressor", "evi",
            "heater", "cold",
            "фреон", "перепад", "теплообмен", "компрес",
        ],
        "description": (
            "Длинная трасса, большой перепад высот, надёжный компрессор "
            "и теплообменник."
        ),
    },
    {
        "slug": "allergy",
        "label": "Аллергики",
        "order": 5,
        "include_substrings": [
            "filter", "ionizer", "uv", "sterilization", "fresh_air",
            "self_clean", "heat_exchanger", "compressor",
            "фильтр", "ионизат", "приток", "теплообмен",
        ],
        "description": (
            "Эффективная очистка воздуха: тонкие фильтры, ионизатор, "
            "УФ-лампа, приток свежего воздуха."
        ),
    },
]


def _matches(needles: list[str], haystacks: list[str]) -> bool:
    """Возвращает True, если любая подстрока из needles входит в любую
    строку haystacks (case-insensitive)."""
    needles_lc = [n.lower() for n in needles if n]
    if not needles_lc:
        return False
    for h in haystacks:
        if not h:
            continue
        h_lc = h.lower()
        for n in needles_lc:
            if n in h_lc:
                return True
    return False


def seed(apps, schema_editor):
    RatingPreset = apps.get_model("ac_methodology", "RatingPreset")
    Criterion = apps.get_model("ac_methodology", "Criterion")
    criteria = list(Criterion.objects.all())

    for spec in PRESETS:
        # Важно: не мутируем глобальный PRESETS — используем .get(), а не
        # .pop(). Если кто-то (тесты / повторный вызов RunPython) запустит
        # seed() второй раз — данные спецификации должны остаться целыми.
        include = spec.get("include_substrings")
        exclude = spec.get("exclude_substrings")
        preset, _ = RatingPreset.objects.update_or_create(
            slug=spec["slug"],
            defaults={
                "label": spec["label"],
                "order": spec["order"],
                "is_active": True,
                "description": spec.get("description", ""),
                "is_all_selected": spec.get("is_all_selected", False),
            },
        )
        if preset.is_all_selected:
            # M2M не нужен: serializer сам вернёт все коды активной методики.
            preset.criteria.clear()
            continue
        picked = []
        for c in criteria:
            hay = [c.code or "", c.name_ru or ""]
            if exclude:
                if not _matches(exclude, hay):
                    picked.append(c)
            elif include:
                if _matches(include, hay):
                    picked.append(c)
        preset.criteria.set(picked)


def unseed(apps, schema_editor):
    RatingPreset = apps.get_model("ac_methodology", "RatingPreset")
    slugs = [p["slug"] for p in PRESETS]
    RatingPreset.objects.filter(slug__in=slugs).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("ac_methodology", "0004_ratingpreset"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]

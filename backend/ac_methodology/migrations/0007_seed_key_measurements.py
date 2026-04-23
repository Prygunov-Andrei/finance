"""Seed Criterion.is_key_measurement на основе substring-эвристики по code.

polish-4 п.4 (2026-04-23): автоматически отмечает критерии, у которых code
содержит один из `PATTERNS`, как «ключевой замер». После миграции Андрей
может в админке ставить/снимать флаг вручную.

Идемпотентность: фильтрует по текущему значению (is_key_measurement=False)
и ставит только True. Повторный прогон ничего не меняет.
Откат (reverse): сбрасывает обратно в False только те критерии, которые
матчат паттерны — не трогает критерии, помеченные вручную после миграции
с другими code.
"""
from __future__ import annotations

from django.db import migrations

# Подстроки в code критерия. Если хотя бы одна встречается (без регистра) —
# критерий считается ключевым. Список намеренно узкий: рассчитан именно на
# noise-замер (код `noise` + потенциальные будущие `min_noise`, `key_*`).
PATTERNS = ("min_noise", "noise_measurement", "key_", "noise")


def _matches_pattern(code: str) -> bool:
    lowered = (code or "").lower()
    return any(p in lowered for p in PATTERNS)


def seed_key_measurements(apps, schema_editor):
    Criterion = apps.get_model("ac_methodology", "Criterion")
    for c in Criterion.objects.filter(is_key_measurement=False):
        if _matches_pattern(c.code):
            c.is_key_measurement = True
            c.save(update_fields=["is_key_measurement"])


def unseed_key_measurements(apps, schema_editor):
    """Откат: сбрасываем is_key_measurement только для кодов, которые матчат
    нашу эвристику. Ручные пометки в админке с другими code — остаются."""
    Criterion = apps.get_model("ac_methodology", "Criterion")
    for c in Criterion.objects.filter(is_key_measurement=True):
        if _matches_pattern(c.code):
            c.is_key_measurement = False
            c.save(update_fields=["is_key_measurement"])


class Migration(migrations.Migration):

    dependencies = [
        ("ac_methodology", "0006_criterion_is_key_measurement"),
    ]

    operations = [
        migrations.RunPython(seed_key_measurements, unseed_key_measurements),
    ]

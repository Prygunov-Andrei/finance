from django.db import migrations


def clear_ionizer_type(apps, schema_editor):
    """Очистка значений критерия ionizer_type у всех моделей.

    Maxim 1.0 Q5: набор значений ионизатора изменён с
    ['Нет', 'ПДС', 'Серебро', 'Биоклимат'] на
    ['Нет', 'Щеточка', 'Отдельный прибор'] —
    Максим перезаполняет вручную через Django Admin.
    """
    ModelRawValue = apps.get_model("ac_catalog", "ModelRawValue")
    qs = ModelRawValue.objects.filter(criterion_code="ionizer_type").exclude(
        raw_value="", numeric_value__isnull=True,
    )
    updated = qs.update(raw_value="", numeric_value=None)
    print(
        f"\n  [data-migration] Cleared ionizer_type for {updated} ModelRawValue rows "
        f"— Maxim 1.0 Q5 (manual re-fill required via Django Admin)"
    )


class Migration(migrations.Migration):

    dependencies = [
        ("ac_catalog", "0004_add_supplier_enrichment"),
    ]

    operations = [
        migrations.RunPython(clear_ionizer_type, migrations.RunPython.noop),
    ]

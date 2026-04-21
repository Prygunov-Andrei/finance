"""E-MAT-01: каталог материалов.

pg_trgm extension + GIN-индексы создаются на будущее (для ASCII-ILIKE фильтров
и быстрых префиксных запросов). Сам fuzzy-матчинг на кириллице идёт через
rapidfuzz в Python — pg_trgm не работает с UTF-8 не-ASCII (триграммы
по байтам дают similarity 0.0 для кириллицы).
"""

import uuid

from django.contrib.postgres.operations import TrigramExtension
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("estimate", "0003_create_snapshot_transmission"),
        ("workspace", "0001_create_workspace_and_member"),
    ]

    operations = [
        # pg_trgm для TrigramSimilarity и GIN-индексов.
        # IF NOT EXISTS внутри оператора — безопасно для баз где оно уже стоит.
        TrigramExtension(),
        migrations.CreateModel(
            name="Material",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("name", models.CharField(max_length=500)),
                ("unit", models.CharField(default="шт", max_length=50)),
                (
                    "price",
                    models.DecimalField(decimal_places=2, default=0, max_digits=19),
                ),
                ("brand", models.CharField(blank=True, default="", max_length=200)),
                (
                    "model_name",
                    models.CharField(blank=True, default="", max_length=200),
                ),
                ("tech_specs", models.JSONField(blank=True, default=dict)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "workspace",
                    models.ForeignKey(
                        on_delete=models.deletion.CASCADE,
                        related_name="materials",
                        to="workspace.workspace",
                    ),
                ),
            ],
            options={
                "db_table": "estimate_material",
                "ordering": ["name"],
            },
        ),
        migrations.AddIndex(
            model_name="material",
            index=models.Index(
                fields=["workspace", "is_active"], name="material_ws_active_idx"
            ),
        ),
        # GIN trigram index на name для быстрого ILIKE / similarity.
        migrations.RunSQL(
            sql=(
                "CREATE INDEX IF NOT EXISTS material_name_trgm_idx "
                "ON estimate_material USING GIN (name gin_trgm_ops);"
            ),
            reverse_sql="DROP INDEX IF EXISTS material_name_trgm_idx;",
        ),
        # Комбинированный trigram: name + model_name + brand через concat lower.
        migrations.RunSQL(
            sql=(
                "CREATE INDEX IF NOT EXISTS material_search_trgm_idx ON estimate_material "
                "USING GIN ((lower(name || ' ' || model_name || ' ' || brand)) gin_trgm_ops);"
            ),
            reverse_sql="DROP INDEX IF EXISTS material_search_trgm_idx;",
        ),
    ]

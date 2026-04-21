"""Tests for seed_materials management command (E-MAT-SEED-01)."""

from __future__ import annotations

import io
import uuid

import pytest
from django.core.management import call_command

from apps.estimate.management.commands.seed_materials import (
    MATERIALS,
    WS_AVGUST_ID,
)
from apps.estimate.matching.materials import materials_search
from apps.estimate.models import Material
from apps.workspace.models import Workspace


@pytest.fixture()
def avgust_ws():
    """Workspace «Август Климат» с фиксированным UUID как в seed_dev_data."""
    ws, _ = Workspace.objects.get_or_create(
        id=WS_AVGUST_ID,
        defaults={"name": "Август Климат", "slug": "avgust-klimat"},
    )
    return ws


@pytest.mark.django_db
class TestSeedMaterialsCommand:
    def test_creates_expected_count(self, avgust_ws):
        out = io.StringIO()
        call_command("seed_materials", stdout=out)
        assert Material.objects.filter(workspace=avgust_ws).count() == len(MATERIALS)
        assert len(MATERIALS) >= 30  # ТЗ — минимум 30

    def test_idempotent_second_run(self, avgust_ws):
        call_command("seed_materials", stdout=io.StringIO())
        first_count = Material.objects.count()
        # вручную поменяем цену — проверим что команда обновит
        cable = Material.objects.get(name="Кабель ВВГнг(А)-LS 3x2.5")
        from decimal import Decimal
        cable.price = Decimal("1.00")
        cable.save()

        out = io.StringIO()
        call_command("seed_materials", stdout=out)
        assert Material.objects.count() == first_count  # дубли не появились
        cable.refresh_from_db()
        assert cable.price == Decimal("92.00")  # цена восстановлена из seed

    def test_fails_without_workspace(self):
        # Workspace не создан → команда падает с понятной ошибкой.
        with pytest.raises(SystemExit):
            call_command("seed_materials", stdout=io.StringIO())

    def test_materials_have_required_fields(self, avgust_ws):
        call_command("seed_materials", stdout=io.StringIO())
        for m in Material.objects.all()[:5]:
            assert m.name
            assert m.unit
            assert m.price > 0
            assert m.is_active

    def test_search_finds_cables(self, avgust_ws):
        call_command("seed_materials", stdout=io.StringIO())
        results = materials_search(str(avgust_ws.id), "кабель")
        assert results, "Поиск 'кабель' должен вернуть кабели из каталога"
        # Первые несколько — кабели (brand/name содержат 'кабель').
        names = [m.name.lower() for m, _ in results[:3]]
        assert any("кабель" in n for n in names)

    def test_search_finds_ducts(self, avgust_ws):
        call_command("seed_materials", stdout=io.StringIO())
        results = materials_search(
            str(avgust_ws.id), "Воздуховод прямоугольный 200x200"
        )
        assert results
        top, score = results[0]
        assert "200x200" in top.name
        assert score >= __import__("decimal").Decimal("0.9")

    def test_brands_set_on_some_materials(self, avgust_ws):
        call_command("seed_materials", stdout=io.StringIO())
        branded = Material.objects.exclude(brand="").count()
        # по текущему каталогу ~18 из 45 имеют brand — проверяем что >= 10.
        assert branded >= 10

    def test_workspace_isolation(self, avgust_ws):
        """Другой workspace не получает материалы от первого."""
        other_ws = Workspace.objects.create(
            id=uuid.uuid4(), name="Other", slug="other"
        )
        call_command("seed_materials", stdout=io.StringIO())
        assert Material.objects.filter(workspace=other_ws).count() == 0
        assert Material.objects.filter(workspace=avgust_ws).count() == len(MATERIALS)

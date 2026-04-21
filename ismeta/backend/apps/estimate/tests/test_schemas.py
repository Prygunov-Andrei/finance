"""Tests for pydantic schemas (MarkupConfig + TechSpecs drift fix).

DEV-BACKLOG #6: TechSpecs раньше был строгий whitelist (manufacturer, model,
power_kw, weight_kg, dimensions). Runtime-данные от Recognition/pdf_import/
seed содержат brand, model_name, flow, cooling, class, section, source_page
и др. — старый TechSpecs падал на первом же реальном item.

Fix: extend whitelist + extra="allow".
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from django.contrib.auth import get_user_model
from pydantic import ValidationError

from apps.estimate.models import Estimate, EstimateItem, EstimateSection
from apps.estimate.schemas import TechSpecs
from apps.workspace.models import Workspace

User = get_user_model()


class TestTechSpecsSchema:
    def test_empty_ok(self):
        TechSpecs.model_validate({})

    def test_known_fields_typed(self):
        specs = TechSpecs.model_validate(
            {"brand": "Daikin", "model_name": "RQ-71BV",
             "power_kw": "7.1", "source_page": 3}
        )
        assert specs.brand == "Daikin"
        assert specs.model_name == "RQ-71BV"
        assert specs.power_kw == Decimal("7.1")
        assert specs.source_page == 3

    def test_arbitrary_fields_allowed(self):
        """Recognition / seed_materials пихают произвольные ключи — не должно падать."""
        data = {
            "brand": "Mitsubishi Electric",
            "model_name": "PLFY-P63VBM-E",
            "flow": "2600 м³/ч",
            "cooling": "7.1 кВт",
            "heating": "8.0 кВт",
            "class": "инверторный",
            "section": "200x200",
            "material": "оцинкованная сталь 0.7 мм",
            "diameter_mm": 200,
            "length_mm": 600,
            "thickness_mm": 19,
            "shielded": False,
            "liquid": '1/4"',
            "gas": '3/8"',
            "ports": "24+4 SFP",
            "rating": "EI 60",
            "fire_class": "EI 60",
            "resolution": "2 МП",
            "lens": "2.8 мм",
        }
        specs = TechSpecs.model_validate(data)
        dumped = specs.model_dump(exclude_unset=True)
        # Все известные поля сохранились.
        assert dumped["brand"] == "Mitsubishi Electric"
        # Все произвольные тоже.
        assert dumped["flow"] == "2600 м³/ч"
        assert dumped["diameter_mm"] == 200
        assert dumped["shielded"] is False

    def test_type_error_on_known_field(self):
        """Для whitelist-поля типы валидируются — это и есть полезное свойство."""
        with pytest.raises(ValidationError):
            TechSpecs.model_validate({"brand": ["not-a-string"]})
        with pytest.raises(ValidationError):
            TechSpecs.model_validate({"source_page": "not-a-number"})


@pytest.mark.django_db
class TestEstimateItemCleanDoesNotRejectRealTechSpecs:
    @pytest.fixture()
    def ws(self):
        return Workspace.objects.create(name="W", slug="w")

    @pytest.fixture()
    def user(self):
        return User.objects.create_user(username="u", password="p")

    @pytest.fixture()
    def estimate(self, ws, user):
        return Estimate.objects.create(
            workspace=ws, name="E",
            default_material_markup={"type": "percent", "value": 30},
            default_work_markup={"type": "percent", "value": 300},
            created_by=user,
        )

    @pytest.fixture()
    def section(self, estimate, ws):
        return EstimateSection.objects.create(estimate=estimate, workspace=ws, name="S")

    def test_real_pdf_import_tech_specs_pass_clean(self, ws, estimate, section):
        """tech_specs из PDF-импорта (brand+model_name+source_page) — full_clean ок."""
        item = EstimateItem(
            section=section, estimate=estimate, workspace=ws, row_id=uuid.uuid4(),
            name="Вентилятор канальный", unit="шт", quantity=Decimal("1"),
            tech_specs={
                "brand": "Korf",
                "model_name": "WNK 100/1",
                "flow": "500 м³/ч",
                "power": "120 Вт",
                "source_page": 5,
            },
        )
        item.full_clean()  # не должен падать

    def test_seed_materials_tech_specs_pass_clean(self, ws, estimate, section):
        """Комбинация из seed_materials (diameter_mm/section/class) — ок."""
        item = EstimateItem(
            section=section, estimate=estimate, workspace=ws, row_id=uuid.uuid4(),
            name="Воздуховод круглый Ø200", unit="м.п.", quantity=Decimal("10"),
            tech_specs={"diameter_mm": 200, "section": "круглый", "class": "spiral"},
        )
        item.full_clean()

    def test_daikin_tech_specs_pass_clean(self, ws, estimate, section):
        """Кондиционер: brand/model_name/cooling/heating/class — из ТЗ."""
        item = EstimateItem(
            section=section, estimate=estimate, workspace=ws, row_id=uuid.uuid4(),
            name="Кондиционер Daikin", unit="шт", quantity=Decimal("1"),
            tech_specs={
                "brand": "Daikin",
                "model_name": "RQ-71BV",
                "cooling": "7.1 кВт",
                "heating": "8.0 кВт",
                "class": "инверторный",
            },
        )
        item.full_clean()

    def test_empty_tech_specs_pass_clean(self, ws, estimate, section):
        item = EstimateItem(
            section=section, estimate=estimate, workspace=ws, row_id=uuid.uuid4(),
            name="Позиция без специй", unit="шт", quantity=Decimal("1"),
            tech_specs={},
        )
        item.full_clean()

"""Тесты management команды import_ac_rating_xlsx."""
from __future__ import annotations

from io import StringIO
from pathlib import Path

import openpyxl
import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from ac_catalog.models import ACModel
from ac_catalog.services.import_template import FIXED_COLUMNS
from ac_methodology.models import Criterion, MethodologyCriterion
from ac_methodology.tests.factories import ActiveMethodologyVersionFactory


def _build_xlsx(tmp_path: Path, code: str) -> Path:
    headers = FIXED_COLUMNS + [code]
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(headers)
    ws.append([
        "CmdBrand", "cmd-x", "cmd-y", "S", "2500", "20000",
        "Сплит-система", "ru", "", "", "", "", "да",
    ])
    path = tmp_path / "cmd.xlsx"
    wb.save(str(path))
    return path


@pytest.mark.django_db
def test_command_imports_models(tmp_path):
    mv = ActiveMethodologyVersionFactory(version="cmd-1")
    crit = Criterion.objects.create(
        code="erv_cmd", name_ru="ЭРВ", value_type=Criterion.ValueType.BINARY,
    )
    MethodologyCriterion.objects.create(
        methodology=mv, criterion=crit,
        scoring_type=MethodologyCriterion.ScoringType.BINARY,
        weight=100, display_order=1,
    )
    path = _build_xlsx(tmp_path, "erv_cmd")

    out = StringIO()
    call_command("import_ac_rating_xlsx", str(path), stdout=out)
    assert "Импортировано 1 моделей" in out.getvalue()
    assert ACModel.objects.filter(brand__name="CmdBrand").exists()


@pytest.mark.django_db
def test_command_publish_flag(tmp_path):
    mv = ActiveMethodologyVersionFactory(version="cmd-2")
    crit = Criterion.objects.create(
        code="erv_pub", name_ru="ЭРВ", value_type=Criterion.ValueType.BINARY,
    )
    MethodologyCriterion.objects.create(
        methodology=mv, criterion=crit,
        scoring_type=MethodologyCriterion.ScoringType.BINARY,
        weight=100, display_order=1,
    )
    path = _build_xlsx(tmp_path, "erv_pub")

    call_command("import_ac_rating_xlsx", str(path), "--publish", stdout=StringIO())
    ac = ACModel.objects.get(brand__name="CmdBrand", inner_unit="CMD-X")
    assert ac.publish_status == ACModel.PublishStatus.PUBLISHED


@pytest.mark.django_db
def test_command_missing_file_raises():
    with pytest.raises(CommandError, match="Файл не найден"):
        call_command(
            "import_ac_rating_xlsx", "/tmp/does-not-exist-xyz.xlsx",
            stdout=StringIO(),
        )


@pytest.mark.django_db
def test_command_no_active_methodology_raises(tmp_path):
    path = _build_xlsx(tmp_path, "erv_x")
    with pytest.raises(CommandError, match="методики"):
        call_command("import_ac_rating_xlsx", str(path), stdout=StringIO())

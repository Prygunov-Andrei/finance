"""Загружает demo-смету из Спецификации ОВ2 через importer."""

import uuid
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from apps.estimate.excel.importer import import_estimate_xlsx
from apps.estimate.models import Estimate
from apps.workspace.models import Workspace

User = get_user_model()

WS_AVGUST_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")
DEMO_FILE = Path(__file__).resolve().parents[5] / "docs" / "samples" / "demo-estimate-ov2.xlsx"


class Command(BaseCommand):
    help = "Загрузить demo-смету из Спецификации ОВ2 (62 позиции, 4 раздела)."

    def handle(self, *args, **options):
        ws = Workspace.objects.filter(id=WS_AVGUST_ID).first()
        if not ws:
            self.stderr.write(self.style.ERROR("Workspace Август Климат не найден. Запустите seed_dev_data."))
            return

        admin_user = User.objects.filter(username="admin").first()

        # Удалить старую demo-смету если есть
        Estimate.objects.filter(workspace=ws, name="Спецификация ОВ2 — демо").delete()

        est = Estimate.objects.create(
            workspace=ws,
            name="Спецификация ОВ2 — демо",
            folder_name="470-05/2025-ОВ2",
            default_material_markup={"type": "percent", "value": 30},
            default_work_markup={"type": "percent", "value": 300},
            created_by=admin_user,
        )
        self.stdout.write(self.style.SUCCESS(f"Создана смета: {est.name} ({est.id})"))

        if not DEMO_FILE.exists():
            self.stderr.write(self.style.ERROR(f"Файл не найден: {DEMO_FILE}"))
            return

        with open(DEMO_FILE, "rb") as f:
            result = import_estimate_xlsx(str(est.id), str(ws.id), f)

        self.stdout.write(self.style.SUCCESS(
            f"Импорт завершён: создано {result.created}, обновлено {result.updated}"
        ))
        if result.errors:
            for err in result.errors:
                self.stdout.write(self.style.WARNING(f"  ⚠ {err}"))

        est.refresh_from_db()
        self.stdout.write(self.style.SUCCESS(
            f"Итого: {est.total_amount}₽, оборуд. {est.total_equipment}₽, "
            f"мат. {est.total_materials}₽, работы {est.total_works}₽"
        ))

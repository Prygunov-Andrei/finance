from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand, CommandError

from ac_methodology.models import MethodologyVersion
from ac_scoring.engine import recalculate_all


class Command(BaseCommand):
    help = "Пересчитать индекс рейтинга кондиционеров (по активной или указанной методике)"

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument(
            "--model-ids", nargs="+", type=int,
            help="ID конкретных моделей для пересчёта",
        )
        parser.add_argument(
            "--methodology-id", type=int, default=None,
            help="ID методики; по умолчанию — текущая активная",
        )

    def handle(self, *args: Any, **options: Any) -> None:
        model_ids = options.get("model_ids")
        methodology_id = options.get("methodology_id")

        methodology = None
        if methodology_id is not None:
            try:
                methodology = MethodologyVersion.objects.get(pk=methodology_id)
            except MethodologyVersion.DoesNotExist as e:
                raise CommandError(
                    f"Методика с id={methodology_id} не найдена",
                ) from e

        self.stdout.write("Запуск пересчёта...")

        run = recalculate_all(methodology=methodology, model_ids=model_ids)

        self.stdout.write(self.style.SUCCESS(
            f"Расчёт #{run.pk} завершён: "
            f"{run.models_processed} моделей, статус: {run.get_status_display()}"
        ))

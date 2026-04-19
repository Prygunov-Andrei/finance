"""Import data from CSV/XLS/XLSX with validation against active methodology."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from django.core.management.base import BaseCommand, CommandError

from ac_catalog.services.model_import import import_models_from_file

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Импорт моделей рейтинга из CSV/XLS/XLSX с валидацией по активной методике"

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument("file", help="Путь к файлу (CSV, XLS или XLSX)")
        parser.add_argument(
            "--publish", action="store_true",
            help="Сразу публиковать (по умолчанию — черновик)",
        )

    def handle(self, *args: Any, **options: Any) -> None:
        path = Path(options["file"])
        if not path.exists():
            raise CommandError(f"Файл не найден: {path}")
        try:
            imported, errors = import_models_from_file(path, publish=bool(options["publish"]))
        except ValueError as e:
            raise CommandError(str(e)) from e

        for err in errors:
            self.stderr.write(self.style.WARNING(err))

        self.stdout.write(self.style.SUCCESS(
            f"Импортировано {imported} моделей, ошибок: {len(errors)}"
        ))

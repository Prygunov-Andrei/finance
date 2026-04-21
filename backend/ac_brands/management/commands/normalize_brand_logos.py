"""Management-команда нормализации бренд-логотипов.

См. backend/ac_brands/services/logo_normalizer.py и ac-rating/tz/M6-brand-logos-normalize.md.
"""

from __future__ import annotations

import os

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.utils.text import slugify

from ac_brands.models import Brand
from ac_brands.services.logo_normalizer import normalize_logo_file

BACKUP_SUBDIR = "pre-normalize"


class Command(BaseCommand):
    help = "Нормализует логотипы брендов (content-crop + canvas 200×56, centered)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--brand",
            help="Name одного бренда (case-insensitive, default — все активные с логотипом).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Не писать файлы, только показать что будет сделано.",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Перезаписать backup, даже если он уже есть.",
        )

    def handle(self, *args, **opts):
        qs = Brand.objects.filter(is_active=True).exclude(logo="")
        if opts.get("brand"):
            qs = qs.filter(name__iexact=opts["brand"])

        total = qs.count()
        if total == 0:
            self.stdout.write(self.style.WARNING("Нет брендов с логотипами для нормализации."))
            return

        dry = opts["dry_run"]
        force = opts["force"]

        self.stdout.write(
            f"Брендов к обработке: {total}" + (" (dry-run)" if dry else "")
        )

        ok = 0
        failed = 0
        for brand in qs:
            storage = brand.logo.storage
            path = brand.logo.name

            try:
                with storage.open(path, "rb") as f:
                    src_bytes = f.read()
            except Exception as exc:
                self.stderr.write(self.style.ERROR(f"  READ-FAIL {brand.name}: {exc}"))
                failed += 1
                continue

            try:
                normalized_bytes = normalize_logo_file(src_bytes)
            except Exception as exc:
                self.stderr.write(self.style.ERROR(f"  FAIL {brand.name}: {exc}"))
                failed += 1
                continue

            src_kb = len(src_bytes) // 1024
            dst_kb = len(normalized_bytes) // 1024

            if dry:
                self.stdout.write(
                    f"  DRY  {brand.name:25s} {src_kb}KB → {dst_kb}KB"
                )
                ok += 1
                continue

            parent_dir = os.path.dirname(path) or "brands"
            ext = os.path.splitext(path)[1] or ".png"
            backup_name = f"{parent_dir}/{BACKUP_SUBDIR}/{slugify(brand.name) or 'brand'}{ext}"
            if force or not storage.exists(backup_name):
                if storage.exists(backup_name):
                    storage.delete(backup_name)
                storage.save(backup_name, ContentFile(src_bytes))

            storage.delete(path)
            storage.save(path, ContentFile(normalized_bytes))

            self.stdout.write(
                f"  OK   {brand.name:25s} {src_kb}KB → {dst_kb}KB"
            )
            ok += 1

        self.stdout.write(self.style.SUCCESS(f"Готово. OK: {ok}, FAIL: {failed}."))

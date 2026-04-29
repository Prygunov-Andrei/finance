"""Wave 11: миграция старых файлов с кириллицей в публичных ImageField/FileField.

Pre_save signals (Wave 10.3, `core.file_utils.register_filename_slugify`)
транслитерируют имена только при upload новых файлов. Старые загрузки —
например `Снимок_17.04.2026_215.50.png` — остались в storage и продолжают
рендериться в URL как percent-encoding. Эта команда проходит по всем
зарегистрированным полям и переименовывает оставшиеся кириллические имена
в латиницу через `slugify_filename`.

Запуск:
    python manage.py rename_legacy_filenames               # dry-run
    python manage.py rename_legacy_filenames --execute     # реально

⚠ ПЕРЕД ЗАПУСКОМ С `--execute` НА ПРОДЕ ОБЯЗАТЕЛЬНО:
    1. Бэкап БД (pg_dump)
    2. Бэкап `media/` директории
Команда меняет и файлы на storage, и FK-references в БД — откат возможен
только из бэкапа.

Покрывает (синхронизировано с `register_filename_slugify` вызовами):
    - ACModelPhoto.image
    - Brand.logo, Brand.logo_dark
    - NewsAuthor.avatar
    - NewsMedia.file
    - MediaUpload.file
"""
from __future__ import annotations

import os

from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand

from ac_brands.models import Brand
from ac_catalog.models import ACModelPhoto
from core.file_utils import slugify_filename
from news.models import MediaUpload, NewsAuthor, NewsMedia


# (label, queryset, field_name) — каждое значение `field_name` должно быть
# зарегистрировано через register_filename_slugify, чтобы новые upload'ы
# тоже не возвращали кириллицу.
TARGETS = [
    ("ACModelPhoto.image", ACModelPhoto.objects.exclude(image=""), "image"),
    ("Brand.logo", Brand.objects.exclude(logo=""), "logo"),
    ("Brand.logo_dark", Brand.objects.exclude(logo_dark=""), "logo_dark"),
    ("NewsAuthor.avatar", NewsAuthor.objects.exclude(avatar=""), "avatar"),
    ("NewsMedia.file", NewsMedia.objects.exclude(file=""), "file"),
    ("MediaUpload.file", MediaUpload.objects.exclude(file=""), "file"),
]


class Command(BaseCommand):
    help = (
        "Wave 11: переименовать legacy кириллические filenames в латиницу "
        "(ASCII slug) во всех публичных ImageField/FileField. Без --execute "
        "только показывает что будет переименовано."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--execute",
            action="store_true",
            help="Реально переименовать (БД + storage). Без флага — dry-run.",
        )

    def handle(self, *args, **options):
        execute: bool = options["execute"]
        if not execute:
            self.stdout.write(self.style.WARNING(
                "DRY RUN — без --execute файлы и БД не меняются."
            ))
        else:
            self.stdout.write(self.style.WARNING(
                "EXECUTE: меняю файлы на storage и FK в БД. "
                "Backup БД и media обязателен!"
            ))

        total_seen = 0
        total_skipped_already_latin = 0
        total_to_rename = 0
        total_renamed = 0
        total_missing_on_storage = 0
        total_collisions = 0

        for label, qs, field_name in TARGETS:
            self.stdout.write(self.style.MIGRATE_HEADING(f"\n=== {label} ==="))
            for obj in qs.iterator():
                file_field = getattr(obj, field_name)
                if not file_field or not file_field.name:
                    continue

                total_seen += 1
                old_name = file_field.name
                dirname, basename = os.path.split(old_name)
                new_basename = slugify_filename(basename)

                if new_basename == basename:
                    total_skipped_already_latin += 1
                    continue

                new_full = (
                    os.path.join(dirname, new_basename) if dirname else new_basename
                )
                total_to_rename += 1

                if not default_storage.exists(old_name):
                    self.stdout.write(self.style.WARNING(
                        f"  [missing] {old_name} — нет файла на storage, "
                        f"пропуск (БД не трогаем)"
                    ))
                    total_missing_on_storage += 1
                    continue

                if default_storage.exists(new_full) and new_full != old_name:
                    self.stdout.write(self.style.WARNING(
                        f"  [collision] {old_name} → {new_full}: target уже "
                        f"существует, пропуск"
                    ))
                    total_collisions += 1
                    continue

                self.stdout.write(f"  {old_name} → {new_full}")

                if not execute:
                    continue

                with default_storage.open(old_name, "rb") as src:
                    saved_name = default_storage.save(new_full, src)

                if saved_name != new_full:
                    # Storage добавил суффикс несмотря на проверку (race) —
                    # используем фактически сохранённое имя, чтобы FK в БД
                    # совпал с реальным файлом.
                    self.stdout.write(self.style.WARNING(
                        f"    storage saved as {saved_name} (не {new_full})"
                    ))
                    new_full = saved_name

                default_storage.delete(old_name)
                setattr(obj, field_name, new_full)
                obj.save(update_fields=[field_name])
                total_renamed += 1

        summary_style = self.style.SUCCESS if execute else self.style.NOTICE
        self.stdout.write(summary_style(
            "\n--- ИТОГО ---\n"
            f"  Просмотрено файлов: {total_seen}\n"
            f"  Уже латиница (skip): {total_skipped_already_latin}\n"
            f"  К переименованию: {total_to_rename}\n"
            f"    из них переименовано: {total_renamed}\n"
            f"    нет на storage: {total_missing_on_storage}\n"
            f"    коллизий: {total_collisions}\n"
        ))

        if not execute and total_to_rename:
            self.stdout.write(self.style.NOTICE(
                "Запусти с --execute (после backup) для реального "
                "переименования."
            ))

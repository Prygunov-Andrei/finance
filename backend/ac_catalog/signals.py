"""Сигналы каталога рейтинга: пересчёт индекса при изменении бренда +
транслит имён загружаемых файлов (Wave 10.3, SEO P2)."""
from __future__ import annotations

from django.db.models.signals import post_save
from django.dispatch import receiver

from ac_brands.models import Brand
from ac_catalog.models import ACModelPhoto
from core.file_utils import register_filename_slugify

# Поля бренда, влияющие на расчёт индекса моделей
_BRAND_FIELDS_RECALC = frozenset({"sales_start_year_ru", "origin_class_id"})

# Транслит кириллических имён файлов при upload — для красивых URL в sitemap
# image:loc и og:image. Старые файлы на проде не переименовываются.
register_filename_slugify(ACModelPhoto, ["image"])
register_filename_slugify(Brand, ["logo", "logo_dark"])


@receiver(post_save, sender=Brand, dispatch_uid="ac_catalog.brand_post_save_sync")
def on_brand_saved(sender, instance: Brand, created, update_fields, **kwargs):
    from ac_catalog.models import ACModel
    from ac_catalog.sync_brand_age import sync_brand_age_for_brand
    from ac_scoring.engine import update_model_total_index

    if not created:
        if update_fields is not None:
            if not (_BRAND_FIELDS_RECALC & set(update_fields)):
                return

    if created or update_fields is None or "sales_start_year_ru" in (update_fields or []):
        sync_brand_age_for_brand(instance)

    for m in ACModel.objects.filter(brand=instance).select_related(
        "brand", "brand__origin_class",
    ):
        update_model_total_index(m)

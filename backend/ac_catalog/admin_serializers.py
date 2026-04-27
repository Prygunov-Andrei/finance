"""Сериализаторы админского API каталога (/api/hvac/rating/...).

Writable-сериализаторы для ERP-операторов. Не путать с публичными
сериализаторами в `ac_catalog.serializers` — те read-only.

Все поля строго по фактической схеме моделей (см. блок «Корректировки
2026-04-26» в TASK.md). slug/name_en/is_primary НЕ добавляем — это
будущие фазы с миграциями.
"""
from __future__ import annotations

from rest_framework import serializers

from ac_brands.admin_serializers import AdminBrandSerializer
from ac_methodology.models import Criterion

from .models import (
    ACModel,
    ACModelPhoto,
    ACModelSupplier,
    EquipmentType,
    ModelRawValue,
    ModelRegion,
)


def _file_url(file_field) -> str:
    """Относительный URL медиа-файла (например `/media/ac_models/foo.png`).

    НЕ используем `request.build_absolute_uri` — за BFF proxy
    (`/api/ac-rating-admin/[...path]/`) Django видит HTTP и собирает
    `http://hvac-info.com/...`, что блокируется браузером как mixed
    content на HTTPS-странице. Возвращаем относительный — браузер сам
    соберёт `https://hvac-info.com/media/...` с текущей схемой.
    """
    if not file_field:
        return ""
    return file_field.url


class EquipmentTypeAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = EquipmentType
        fields = ("id", "name")
        read_only_fields = fields


class AdminACModelPhotoSerializer(serializers.ModelSerializer):
    """Используется для inline-чтения и для отдельных photo endpoints.

    Бинарь `image` принимаем только в multipart-контексте (POST/PATCH photo
    endpoint'ов). В nested-payload модели `image` read-only — фронт всегда
    делает upload отдельным запросом.
    """

    image_url = serializers.SerializerMethodField()

    class Meta:
        model = ACModelPhoto
        fields = ("id", "image", "image_url", "alt", "order")
        read_only_fields = ("id", "image_url")

    def get_image_url(self, obj: ACModelPhoto) -> str:
        return _file_url(obj.image)


class AdminACModelPhotoNestedSerializer(serializers.ModelSerializer):
    """Nested-вариант: image read-only, чтобы фронт не пытался прислать
    бинарь через JSON. Метаданные (alt/order) обновляемы.

    `id` явно объявлен writable — нужен sync-стратегии (update existing
    по id, отсутствующие удаляются).
    """

    id = serializers.IntegerField(required=False)
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = ACModelPhoto
        fields = ("id", "image_url", "alt", "order")
        read_only_fields = ("image_url",)

    def get_image_url(self, obj: ACModelPhoto) -> str:
        return _file_url(obj.image)


class AdminACModelSupplierSerializer(serializers.ModelSerializer):
    """`id` writable — sync-стратегия в `AdminACModelDetailSerializer._sync_suppliers`
    различает «обновить существующий» и «создать новый» по наличию id.
    """

    id = serializers.IntegerField(required=False)
    availability_display = serializers.CharField(
        source="get_availability_display", read_only=True,
    )

    class Meta:
        model = ACModelSupplier
        fields = (
            "id", "name", "url", "order",
            "price", "city", "rating",
            "availability", "availability_display", "note",
        )
        read_only_fields = ("availability_display",)


class AdminModelRawValueSerializer(serializers.ModelSerializer):
    """Writable значения параметров модели.

    `criterion_code` — единственный идентификатор критерия в payload (FK
    проставляется в `ModelRawValue.save()` автоматически по совпадению
    `Criterion.code`).
    """

    id = serializers.IntegerField(required=False)
    criterion_name = serializers.CharField(
        source="criterion.name_ru", read_only=True, default="",
    )

    class Meta:
        model = ModelRawValue
        fields = (
            "id",
            "criterion_code", "criterion_name",
            "raw_value", "numeric_value",
            "compressor_model",
            "source", "source_url", "comment",
            "verification_status", "lab_status",
        )
        read_only_fields = ("criterion_name",)


class AdminACModelListSerializer(serializers.ModelSerializer):
    brand_name = serializers.CharField(source="brand.name", read_only=True)
    brand_id = serializers.IntegerField(source="brand.id", read_only=True)
    primary_photo_url = serializers.SerializerMethodField()
    region_codes = serializers.SerializerMethodField()
    photos_count = serializers.SerializerMethodField()

    class Meta:
        model = ACModel
        fields = (
            "id", "brand_id", "brand_name",
            "series", "inner_unit", "outer_unit",
            "nominal_capacity",
            "total_index",
            "publish_status",
            "is_ad", "ad_position",
            "primary_photo_url", "photos_count",
            "region_codes",
            "price",
            "created_at", "updated_at",
        )
        read_only_fields = fields

    def get_primary_photo_url(self, obj: ACModel) -> str:
        photo = next(iter(obj.photos.all()), None)
        if photo is None:
            return ""
        return _file_url(photo.image)

    def get_photos_count(self, obj: ACModel) -> int:
        return obj.photos.count()

    def get_region_codes(self, obj: ACModel) -> list[str]:
        return [r.region_code for r in obj.regions.all()]


class AdminACModelDetailSerializer(serializers.ModelSerializer):
    """Полный writable-сериализатор. Поддерживает:
      - nested chain: photos (метаданные), suppliers, raw_values
      - region_codes как список TextChoices
      - brand доступен read-only nested + writable через PK (`brand` поле)
    """

    photos = AdminACModelPhotoNestedSerializer(many=True, required=False)
    suppliers = AdminACModelSupplierSerializer(many=True, required=False)
    raw_values = AdminModelRawValueSerializer(many=True, required=False)
    region_codes = serializers.ListField(
        child=serializers.ChoiceField(choices=ModelRegion.RegionCode.choices),
        required=False,
        write_only=True,
    )
    region_codes_read = serializers.SerializerMethodField()
    brand_detail = AdminBrandSerializer(source="brand", read_only=True)

    class Meta:
        model = ACModel
        fields = (
            "id", "slug",
            "brand", "brand_detail",
            "series", "inner_unit", "outer_unit",
            "nominal_capacity",
            "equipment_type",
            "publish_status",
            "total_index",
            "youtube_url", "rutube_url", "vk_url",
            "price",
            "pros_text", "cons_text",
            "is_ad", "ad_position",
            "editorial_lede", "editorial_body",
            "editorial_quote", "editorial_quote_author",
            "inner_unit_dimensions", "inner_unit_weight_kg",
            "outer_unit_dimensions", "outer_unit_weight_kg",
            "photos", "suppliers", "raw_values",
            "region_codes", "region_codes_read",
            "created_at", "updated_at",
        )
        read_only_fields = (
            "id", "slug", "total_index",
            "created_at", "updated_at",
            "brand_detail", "region_codes_read",
        )

    def get_region_codes_read(self, obj: ACModel) -> list[str]:
        return [r.region_code for r in obj.regions.all()]

    def to_representation(self, instance: ACModel) -> dict:
        data = super().to_representation(instance)
        # `region_codes` write_only исчезает в ответе — подставляем читаемый
        # список (фронту удобнее видеть то же имя поля и в GET, и в PATCH).
        data["region_codes"] = data.pop("region_codes_read", [])
        return data

    def create(self, validated_data: dict) -> ACModel:
        photos_data = validated_data.pop("photos", None)
        suppliers_data = validated_data.pop("suppliers", None)
        raw_values_data = validated_data.pop("raw_values", None)
        region_codes = validated_data.pop("region_codes", None)

        instance = super().create(validated_data)

        if photos_data is not None:
            self._sync_photos(instance, photos_data)
        if suppliers_data is not None:
            self._sync_suppliers(instance, suppliers_data)
        if raw_values_data is not None:
            self._sync_raw_values(instance, raw_values_data)
        if region_codes is not None:
            self._sync_regions(instance, region_codes)

        return instance

    def update(self, instance: ACModel, validated_data: dict) -> ACModel:
        photos_data = validated_data.pop("photos", None)
        suppliers_data = validated_data.pop("suppliers", None)
        raw_values_data = validated_data.pop("raw_values", None)
        region_codes = validated_data.pop("region_codes", None)

        instance = super().update(instance, validated_data)

        if photos_data is not None:
            self._sync_photos(instance, photos_data)
        if suppliers_data is not None:
            self._sync_suppliers(instance, suppliers_data)
        if raw_values_data is not None:
            self._sync_raw_values(instance, raw_values_data)
        if region_codes is not None:
            self._sync_regions(instance, region_codes)

        return instance

    @staticmethod
    def _sync_photos(instance: ACModel, photos_data: list[dict]) -> None:
        existing = {p.id: p for p in instance.photos.all()}
        seen: set[int] = set()
        for item in photos_data:
            pid = item.get("id")
            if pid and pid in existing:
                photo = existing[pid]
                for field in ("alt", "order"):
                    if field in item:
                        setattr(photo, field, item[field])
                photo.save(update_fields=["alt", "order"])
                seen.add(pid)
        for pid, photo in existing.items():
            if pid not in seen:
                photo.delete()

    @staticmethod
    def _sync_suppliers(instance: ACModel, suppliers_data: list[dict]) -> None:
        existing = {s.id: s for s in instance.suppliers.all()}
        seen: set[int] = set()
        writable_fields = (
            "name", "url", "order", "price", "city", "rating",
            "availability", "note",
        )
        for item in suppliers_data:
            sid = item.get("id")
            if sid and sid in existing:
                supplier = existing[sid]
                for field in writable_fields:
                    if field in item:
                        setattr(supplier, field, item[field])
                supplier.save()
                seen.add(sid)
            else:
                payload = {k: v for k, v in item.items() if k != "id"}
                ACModelSupplier.objects.create(model=instance, **payload)
        for sid, supplier in existing.items():
            if sid not in seen:
                supplier.delete()

    @staticmethod
    def _sync_raw_values(instance: ACModel, raw_values_data: list[dict]) -> None:
        """Синк по `criterion_code`. ID игнорируем — `(model, criterion_code)`
        unique-constraint в БД и так гарантирует уникальность.

        FK на `Criterion` проставляется в `ModelRawValue.save()` автоматически
        — но только если criterion FK уже задан. Чтобы инициализировать
        связку при первом создании — резолвим FK из code здесь.
        """
        codes_in_payload = {item.get("criterion_code") for item in raw_values_data}
        codes_in_payload.discard("")
        codes_in_payload.discard(None)

        criteria = {c.code: c for c in Criterion.objects.filter(code__in=codes_in_payload)}

        existing = {rv.criterion_code: rv for rv in instance.raw_values.all()}
        seen: set[str] = set()

        writable_fields = (
            "raw_value", "numeric_value", "compressor_model",
            "source", "source_url", "comment",
            "verification_status", "lab_status",
        )

        for item in raw_values_data:
            code = item.get("criterion_code") or ""
            if not code:
                continue
            if code in existing:
                rv = existing[code]
                for field in writable_fields:
                    if field in item:
                        setattr(rv, field, item[field])
                # Linked Criterion может появиться позже — обновим при наличии.
                criterion_obj = criteria.get(code)
                if criterion_obj and rv.criterion_id != criterion_obj.id:
                    rv.criterion = criterion_obj
                rv.save()
            else:
                payload = {k: v for k, v in item.items() if k in writable_fields}
                ModelRawValue.objects.create(
                    model=instance,
                    criterion=criteria.get(code),
                    criterion_code=code,
                    **payload,
                )
            seen.add(code)

        for code, rv in existing.items():
            if code not in seen:
                rv.delete()

    @staticmethod
    def _sync_regions(instance: ACModel, region_codes: list[str]) -> None:
        existing = {r.region_code: r for r in instance.regions.all()}
        target = set(region_codes)
        for code, obj in existing.items():
            if code not in target:
                obj.delete()
        for code in target:
            if code not in existing:
                ModelRegion.objects.create(model=instance, region_code=code)

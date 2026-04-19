from __future__ import annotations

from ac_brands.models import Brand
from ac_catalog.models import ACModel, ACModelSupplier, ModelRawValue
from ac_methodology.models import Criterion

from .models import ACSubmission


_BOOL_MAP = {
    "erv": "erv",
    "fan_speed_outdoor": "fan_speed_outdoor",
    "remote_backlight": "remote_backlight",
}

_VALUE_MAP = {
    "drain_pan_heater": "drain_pan_heater",
    "fan_speeds_indoor": "fan_speeds_indoor",
    "fine_filters": "fine_filters",
    "ionizer_type": "ionizer_type",
    "russian_remote": "russian_remote",
    "uv_lamp": "uv_lamp",
}


def convert_submission_to_acmodel(submission: ACSubmission) -> ACModel:
    brand = submission.brand
    if not brand and submission.custom_brand_name:
        brand, _ = Brand.objects.get_or_create(
            name=submission.custom_brand_name,
            defaults={"is_active": True},
        )

    nominal_capacity = submission.nominal_capacity_watt or None

    ac = ACModel.objects.create(
        brand=brand,
        series=submission.series,
        inner_unit=submission.inner_unit,
        outer_unit=submission.outer_unit,
        nominal_capacity=nominal_capacity,
        price=submission.price,
        publish_status=ACModel.PublishStatus.DRAFT,
    )

    criteria_by_code = {
        c.code: c for c in Criterion.objects.filter(
            code__in=[
                *_BOOL_MAP.values(),
                *_VALUE_MAP.values(),
                "heat_exchanger_inner",
                "heat_exchanger_outer",
                "compressor_power",
            ],
        )
    }

    raw_values = []

    for field, code in _BOOL_MAP.items():
        criterion = criteria_by_code.get(code)
        if not criterion:
            continue
        val = getattr(submission, field)
        raw_values.append(ModelRawValue(
            model=ac,
            criterion=criterion,
            criterion_code=code,
            raw_value="да" if val else "нет",
            source="Заявка пользователя",
            verification_status=ModelRawValue.VerificationStatus.CATALOG,
        ))

    for field, code in _VALUE_MAP.items():
        criterion = criteria_by_code.get(code)
        if not criterion:
            continue
        val = getattr(submission, field)
        raw_values.append(ModelRawValue(
            model=ac,
            criterion=criterion,
            criterion_code=code,
            raw_value=str(val),
            numeric_value=float(val) if isinstance(val, (int, float)) else None,
            source="Заявка пользователя",
            verification_status=ModelRawValue.VerificationStatus.CATALOG,
        ))

    he_inner = criteria_by_code.get("heat_exchanger_inner")
    if he_inner:
        raw_values.append(ModelRawValue(
            model=ac,
            criterion=he_inner,
            criterion_code="heat_exchanger_inner",
            raw_value=str(submission.inner_he_surface_area),
            numeric_value=submission.inner_he_surface_area,
            source="Заявка пользователя (рассчитано)",
            verification_status=ModelRawValue.VerificationStatus.CATALOG,
        ))

    he_outer = criteria_by_code.get("heat_exchanger_outer")
    if he_outer:
        raw_values.append(ModelRawValue(
            model=ac,
            criterion=he_outer,
            criterion_code="heat_exchanger_outer",
            raw_value=str(submission.outer_he_surface_area),
            numeric_value=submission.outer_he_surface_area,
            source="Заявка пользователя (рассчитано)",
            verification_status=ModelRawValue.VerificationStatus.CATALOG,
        ))

    compressor = criteria_by_code.get("compressor_power")
    if compressor:
        raw_values.append(ModelRawValue(
            model=ac,
            criterion=compressor,
            criterion_code="compressor_power",
            raw_value="",
            compressor_model=submission.compressor_model,
            source="Заявка пользователя",
            verification_status=ModelRawValue.VerificationStatus.CATALOG,
        ))

    ModelRawValue.objects.bulk_create(raw_values)

    if submission.buy_url:
        ACModelSupplier.objects.create(
            model=ac,
            name="Ссылка от пользователя",
            url=submission.buy_url,
        )

    submission.converted_model = ac
    submission.status = ACSubmission.Status.APPROVED
    submission.save(update_fields=["converted_model", "status", "updated_at"])

    return ac

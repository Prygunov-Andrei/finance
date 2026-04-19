from __future__ import annotations

from typing import Any

from django.db import transaction
from django.db.models import Max

from .models import Criterion, MethodologyCriterion, MethodologyVersion

_SKIP_MC_FIELDS = frozenset({"id", "methodology", "criterion", "created_at", "updated_at"})

# Поля инлайна MethodologyCriterionInline (остальное копируется при сохранении).
MC_INLINE_FORM_FIELDS = frozenset({
    "criterion",
    "scoring_type",
    "weight",
    "region_scope",
    "is_public",
    "is_active",
    "display_order",
})


def backfill_criterion_extras_from_methodology(
    mc: MethodologyCriterion,
    template_methodology_pk: int | None,
) -> None:
    """
    Подставляет поля, которых нет в инлайне, по MethodologyCriterion с тем же criterion
    в указанной версии методики (до сохранения новой версии это была активная).
    """
    if template_methodology_pk is None:
        return
    try:
        tpl_mc = MethodologyCriterion.objects.get(
            methodology_id=template_methodology_pk,
            criterion=mc.criterion,
        )
    except MethodologyCriterion.DoesNotExist:
        return
    skip = _SKIP_MC_FIELDS | MC_INLINE_FORM_FIELDS
    for f in MethodologyCriterion._meta.local_fields:
        if f.name in skip:
            continue
        setattr(mc, f.name, getattr(tpl_mc, f.name))
    mc.save()


def template_criteria_inline_initial() -> list[dict[str, Any]]:
    """
    Данные для предзаполнения инлайна при создании новой версии методики:
    копия строк активной методики, вес = 0.
    """
    active = MethodologyVersion.objects.filter(is_active=True).first()
    if active is None:
        return []
    rows: list[dict[str, Any]] = []
    for mc in MethodologyCriterion.objects.filter(
        methodology=active,
    ).select_related("criterion").order_by("display_order", "pk"):
        rows.append(
            {
                "criterion": mc.criterion_id,
                "scoring_type": mc.scoring_type,
                "weight": 0.0,
                "region_scope": mc.region_scope,
                "is_public": mc.is_public,
                "is_active": mc.is_active,
                "display_order": mc.display_order,
            }
        )
    return rows


def _mc_clone_kwargs(mc: MethodologyCriterion) -> dict:
    kwargs: dict = {}
    for f in MethodologyCriterion._meta.local_fields:
        if f.name in _SKIP_MC_FIELDS:
            continue
        kwargs[f.name] = getattr(mc, f.name)
    return kwargs


def _append_criteria_from_methodology(
    target: MethodologyVersion,
    template: MethodologyVersion,
    *,
    criteria_present: set[int],
    weight_override: float | None = None,
) -> None:
    """Добавляет к target MethodologyCriterion из template, чьих criterion_id нет в criteria_present."""
    extra = MethodologyCriterion.objects.filter(
        methodology=template,
    ).exclude(criterion_id__in=criteria_present).order_by("display_order", "pk")
    if not extra.exists():
        return
    max_order = (
        MethodologyCriterion.objects.filter(methodology=target)
        .aggregate(m=Max("display_order"))["m"]
        or 0
    )
    next_order = max_order + 1
    for mc in extra:
        kwargs = _mc_clone_kwargs(mc)
        kwargs["criterion_id"] = mc.criterion_id
        if weight_override is not None:
            kwargs["weight"] = weight_override
        kwargs["display_order"] = next_order
        next_order += 1
        MethodologyCriterion.objects.create(methodology=target, **kwargs)
        criteria_present.add(mc.criterion_id)


def duplicate_methodology_version(
    source: MethodologyVersion,
    *,
    version: str,
    name: str,
    description: str | None = None,
) -> MethodologyVersion:
    """
    Создаёт новую MethodologyVersion с копией MethodologyCriterion исходной версии.

    Дополнительно подтягивает параметры из активной методики, которых не было
    у исходной. Такие строки добавляются с весом 0 и порядком в конце списка.
    """
    if MethodologyVersion.objects.filter(version=version).exists():
        raise ValueError(f"Версия «{version}» уже существует.")
    desc = source.description if description is None else description
    with transaction.atomic():
        new_mv = MethodologyVersion.objects.create(
            version=version,
            name=name,
            description=desc,
            is_active=False,
            needs_recalculation=source.needs_recalculation,
        )
        criteria_in_new: set[int] = set()
        for mc in MethodologyCriterion.objects.filter(
            methodology=source,
        ).order_by("display_order", "pk"):
            kwargs = _mc_clone_kwargs(mc)
            kwargs["criterion_id"] = mc.criterion_id
            MethodologyCriterion.objects.create(methodology=new_mv, **kwargs)
            criteria_in_new.add(mc.criterion_id)

        active = MethodologyVersion.objects.filter(is_active=True).first()
        if active is not None:
            _append_criteria_from_methodology(
                new_mv,
                active,
                criteria_present=criteria_in_new,
                weight_override=0.0,
            )
    return new_mv

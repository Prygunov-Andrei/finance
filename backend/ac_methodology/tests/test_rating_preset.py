"""Unit-тесты модели RatingPreset, админки и seed-миграции."""
from __future__ import annotations

import pytest
from django.contrib.admin.sites import AdminSite

from ac_methodology.admin.rating_preset import RatingPresetAdmin
from ac_methodology.models import Criterion, RatingPreset
from ac_methodology.tests.factories import (
    CriterionFactory,
    RatingPresetFactory,
)


# ── Model ──────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_rating_preset_str():
    p = RatingPresetFactory(slug="silence", label="Тишина")
    assert str(p) == "Тишина (silence)"


@pytest.mark.django_db
def test_rating_preset_ordering():
    """Meta.ordering = ['order', 'label'] — пресеты отсортированы по order.

    В БД после миграций уже лежат 6 seed-пресетов — фильтруем по нашим
    собственным slug'ам."""
    p_c = RatingPresetFactory(slug="test-ord-c", label="C", order=102)
    p_a = RatingPresetFactory(slug="test-ord-a", label="A", order=100)
    p_b = RatingPresetFactory(slug="test-ord-b", label="B", order=101)
    ids = list(
        RatingPreset.objects.filter(slug__startswith="test-ord-")
        .values_list("slug", flat=True)
    )
    assert ids == [p_a.slug, p_b.slug, p_c.slug]


@pytest.mark.django_db
def test_rating_preset_slug_unique():
    """slug имеет UNIQUE constraint."""
    from django.db import IntegrityError
    RatingPresetFactory(slug="dup")
    with pytest.raises(IntegrityError):
        RatingPreset.objects.create(slug="dup", label="Another")


@pytest.mark.django_db
def test_rating_preset_m2m_with_criterion():
    """M2M criteria хранит ссылки на Criterion."""
    c1 = CriterionFactory(code="noise")
    c2 = CriterionFactory(code="wifi")
    p = RatingPresetFactory(slug="x")
    p.criteria.set([c1, c2])
    assert set(p.criteria.values_list("code", flat=True)) == {"noise", "wifi"}
    # Обратный related_name:
    assert p in c1.presets.all()


@pytest.mark.django_db
def test_rating_preset_is_all_selected_default_false():
    p = RatingPresetFactory(slug="default")
    assert p.is_all_selected is False


# ── Admin ──────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_admin_criteria_count_returns_vse_for_all_selected():
    admin = RatingPresetAdmin(RatingPreset, AdminSite())
    p = RatingPresetFactory(slug="avgust", is_all_selected=True)
    assert admin.criteria_count(p) == "ВСЕ"


@pytest.mark.django_db
def test_admin_criteria_count_returns_int_for_regular_preset():
    admin = RatingPresetAdmin(RatingPreset, AdminSite())
    p = RatingPresetFactory(slug="silence", is_all_selected=False)
    p.criteria.set([CriterionFactory(code="a"), CriterionFactory(code="b")])
    assert admin.criteria_count(p) == "2"


@pytest.mark.django_db
def test_admin_criteria_count_zero_when_empty():
    admin = RatingPresetAdmin(RatingPreset, AdminSite())
    p = RatingPresetFactory(slug="empty", is_all_selected=False)
    assert admin.criteria_count(p) == "0"


@pytest.mark.django_db
def test_admin_is_registered():
    from django.contrib import admin as djadmin
    assert RatingPreset in djadmin.site._registry


# ── Seed migration ─────────────────────────────────────────────────────
#
# pytest-django применяет все миграции перед тестами, поэтому к моменту
# запуска в БД уже есть 6 пресетов (0005_seed_initial_presets). Тестируем
# их наличие и корректность.


@pytest.mark.django_db
def test_seed_migration_creates_six_presets():
    """После миграций в БД ровно 6 пресетов с ожидаемыми slug'ами."""
    slugs = set(RatingPreset.objects.values_list("slug", flat=True))
    assert slugs == {"avgust", "silence", "cold", "budget", "house", "allergy"}


@pytest.mark.django_db
def test_seed_migration_avgust_is_all_selected():
    """Пресет «Август-климат» должен иметь is_all_selected=True."""
    p = RatingPreset.objects.get(slug="avgust")
    assert p.is_all_selected is True
    assert p.order == 0


@pytest.mark.django_db
def test_seed_migration_avgust_m2m_empty():
    """У is_all_selected-пресета M2M пустой — не хранит копии кодов."""
    p = RatingPreset.objects.get(slug="avgust")
    assert p.criteria.count() == 0


@pytest.mark.django_db
def test_seed_migration_regular_presets_have_flag_false():
    """Остальные 5 пресетов — не is_all_selected."""
    non_avgust = RatingPreset.objects.exclude(slug="avgust")
    for p in non_avgust:
        assert p.is_all_selected is False, p.slug


@pytest.mark.django_db
def test_seed_migration_is_idempotent_by_slug():
    """Повторный вызов seed (update_or_create) не создаёт дубликатов."""
    import importlib
    mod = importlib.import_module(
        "ac_methodology.migrations.0005_seed_initial_presets"
    )
    from django.apps import apps
    before = RatingPreset.objects.count()

    class _FakeSchemaEditor:
        connection = None

    mod.seed(apps, _FakeSchemaEditor())
    after = RatingPreset.objects.count()
    assert after == before == 6


@pytest.mark.django_db
def test_seed_migration_silence_has_criteria_when_noise_exists():
    """Если в БД есть criterion с кодом `noise` — пресет silence должен
    его включать (substring-эвристика ловит 'noise')."""
    # Создаём критерии и перезапускаем seed.
    CriterionFactory(code="noise", name_ru="Уровень шума")
    CriterionFactory(code="fan_speeds_indoor", name_ru="Скоростей вентилятора")
    CriterionFactory(code="inverter", name_ru="Инверторный компрессор")

    import importlib
    mod = importlib.import_module(
        "ac_methodology.migrations.0005_seed_initial_presets"
    )
    from django.apps import apps

    class _FakeSchemaEditor:
        connection = None

    mod.seed(apps, _FakeSchemaEditor())

    silence = RatingPreset.objects.get(slug="silence")
    codes = set(silence.criteria.values_list("code", flat=True))
    # Как минимум все три упомянутых должны попасть (include = ['noise','fan','inverter',...]).
    assert "noise" in codes
    assert "fan_speeds_indoor" in codes
    assert "inverter" in codes


@pytest.mark.django_db
def test_seed_migration_budget_excludes_wifi_and_alice():
    """Пресет budget = exclude-эвристика — wifi и alice_control НЕ должны входить."""
    CriterionFactory(code="wifi", name_ru="Wi-Fi")
    CriterionFactory(code="alice_control", name_ru="Яндекс Алиса")
    CriterionFactory(code="noise", name_ru="Уровень шума")  # — должен остаться

    import importlib
    mod = importlib.import_module(
        "ac_methodology.migrations.0005_seed_initial_presets"
    )
    from django.apps import apps

    class _FakeSchemaEditor:
        connection = None

    mod.seed(apps, _FakeSchemaEditor())

    budget = RatingPreset.objects.get(slug="budget")
    codes = set(budget.criteria.values_list("code", flat=True))
    assert "wifi" not in codes
    assert "alice_control" not in codes
    assert "noise" in codes


@pytest.mark.django_db
def test_seed_migration_handles_criterion_with_empty_name():
    """Edge case: criterion с пустым name_ru не должен ронять seed."""
    # Форсируем пустое name_ru в обход Factory Sequence.
    c = Criterion.objects.create(
        code="empty_name_test",
        name_ru="",
        value_type=Criterion.ValueType.NUMERIC,
    )

    import importlib
    mod = importlib.import_module(
        "ac_methodology.migrations.0005_seed_initial_presets"
    )
    from django.apps import apps

    class _FakeSchemaEditor:
        connection = None

    # Не должно упасть.
    mod.seed(apps, _FakeSchemaEditor())
    # Критерий с пустым name_ru мог попасть в бюджет (exclude не сматчил).
    # Главное — никакого exception.
    assert Criterion.objects.filter(code=c.code).exists()


# ── Serializer ─────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_serializer_criteria_codes_for_regular_preset():
    from ac_catalog.serializers import RatingPresetSerializer

    c1 = CriterionFactory(code="noise")
    c2 = CriterionFactory(code="fan")
    p = RatingPresetFactory(slug="sil", is_all_selected=False)
    p.criteria.set([c1, c2])

    data = RatingPresetSerializer(p).data
    assert set(data["criteria_codes"]) == {"noise", "fan"}
    assert data["is_all_selected"] is False
    assert data["slug"] == "sil"


@pytest.mark.django_db
def test_serializer_criteria_codes_for_all_selected_uses_context():
    from ac_catalog.serializers import RatingPresetSerializer

    c = CriterionFactory(code="only_via_context")
    p = RatingPresetFactory(slug="avg-test", is_all_selected=True)
    # M2M пустой, но флаг истинен → коды берутся из context.
    ctx = {"methodology_active_criteria_codes": ["only_via_context", "another"]}

    data = RatingPresetSerializer(p, context=ctx).data
    assert data["criteria_codes"] == ["only_via_context", "another"]


@pytest.mark.django_db
def test_serializer_criteria_codes_all_selected_without_context_returns_empty():
    """Если context не содержит активных кодов — возвращаем [] (а не
    500): это защита на случай вызова сериализатора вне MethodologySerializer."""
    from ac_catalog.serializers import RatingPresetSerializer

    p = RatingPresetFactory(slug="avg-lone", is_all_selected=True)
    data = RatingPresetSerializer(p).data
    assert data["criteria_codes"] == []

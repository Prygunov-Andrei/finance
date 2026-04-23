"""Тесты публичного API ac_catalog (/api/public/v1/rating/...)."""
from __future__ import annotations

import pytest
from rest_framework.test import APIClient

from ac_brands.tests.factories import BrandFactory
from ac_catalog.models import ACModel, ModelRegion
from ac_catalog.tests.factories import (
    ACModelFactory,
    ArchivedACModelFactory,
    ModelRegionFactory,
    PublishedACModelFactory,
)
from ac_methodology.models import Criterion, MethodologyCriterion
from ac_methodology.tests.factories import (
    ActiveMethodologyVersionFactory,
    CriterionFactory,
)


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def methodology(db):
    mv = ActiveMethodologyVersionFactory(version="api-1", name="API-test")
    return mv


@pytest.fixture
def methodology_with_noise(methodology):
    crit = CriterionFactory(
        code="noise", name_ru="Шум", value_type=Criterion.ValueType.NUMERIC,
    )
    MethodologyCriterion.objects.create(
        methodology=methodology, criterion=crit,
        scoring_type=MethodologyCriterion.ScoringType.MIN_MEDIAN_MAX,
        weight=100, min_value=20, median_value=30, max_value=40,
        is_inverted=True, display_order=1,
    )
    return methodology


# ── List ───────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_list_returns_only_published(client, methodology):
    PublishedACModelFactory(brand=BrandFactory(name="A"))
    PublishedACModelFactory(brand=BrandFactory(name="B"))
    ACModelFactory(brand=BrandFactory(name="DraftBrand"))  # DRAFT — не должен попасть
    ArchivedACModelFactory(brand=BrandFactory(name="ArchivedBrand"))

    resp = client.get("/api/public/v1/rating/models/")
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body, list)
    assert len(body) == 2


@pytest.mark.django_db
def test_list_returns_plain_array_not_paginated(client, methodology):
    """M3: публичный list не обёрнут в {count, next, previous, results}."""
    PublishedACModelFactory(brand=BrandFactory(name="A"))
    PublishedACModelFactory(brand=BrandFactory(name="B"))

    resp = client.get("/api/public/v1/rating/models/")
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body, list)
    assert len(body) == 2
    # Явно проверяем отсутствие ключей пагинации.
    assert not isinstance(body, dict)


@pytest.mark.django_db
def test_list_unauthenticated_no_401(client):
    """Публичный API не требует JWT — глобальный IsAuthenticated должен быть перекрыт."""
    resp = client.get("/api/public/v1/rating/models/")
    assert resp.status_code == 200


@pytest.mark.django_db
def test_list_filter_by_brand(client, methodology):
    PublishedACModelFactory(brand=BrandFactory(name="Daikin"))
    PublishedACModelFactory(brand=BrandFactory(name="Mitsubishi"))

    resp = client.get("/api/public/v1/rating/models/?brand=Daik")
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 1
    assert items[0]["brand"] == "Daikin"


@pytest.mark.django_db
def test_list_filter_by_region(client, methodology):
    m_ru = PublishedACModelFactory(brand=BrandFactory(name="RU"))
    ModelRegionFactory(model=m_ru, region_code=ModelRegion.RegionCode.RU)
    m_eu = PublishedACModelFactory(brand=BrandFactory(name="EU"))
    ModelRegionFactory(model=m_eu, region_code=ModelRegion.RegionCode.EU)

    resp = client.get("/api/public/v1/rating/models/?region=ru")
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 1
    assert items[0]["brand"] == "RU"


@pytest.mark.django_db
def test_list_filter_by_capacity_range(client, methodology):
    PublishedACModelFactory(brand=BrandFactory(name="Low"), nominal_capacity=2000)
    PublishedACModelFactory(brand=BrandFactory(name="Mid"), nominal_capacity=3000)
    PublishedACModelFactory(brand=BrandFactory(name="High"), nominal_capacity=5000)

    resp = client.get("/api/public/v1/rating/models/?capacity_min=2500&capacity_max=4000")
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 1
    assert items[0]["brand"] == "Mid"


@pytest.mark.django_db
def test_list_filter_by_price_range(client, methodology):
    PublishedACModelFactory(brand=BrandFactory(name="Cheap"), price="10000")
    PublishedACModelFactory(brand=BrandFactory(name="Mid"), price="30000")
    PublishedACModelFactory(brand=BrandFactory(name="Expensive"), price="100000")

    resp = client.get("/api/public/v1/rating/models/?price_min=20000&price_max=50000")
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 1
    assert items[0]["brand"] == "Mid"


@pytest.mark.django_db
def test_list_invalid_capacity_param_returns_400(client, methodology):
    resp = client.get("/api/public/v1/rating/models/?capacity_min=abc")
    assert resp.status_code == 400


# ── Detail ─────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_detail_by_pk(client, methodology):
    m = PublishedACModelFactory()
    resp = client.get(f"/api/public/v1/rating/models/{m.pk}/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == m.pk
    assert body["slug"] == m.slug


@pytest.mark.django_db
def test_detail_pk_not_found(client):
    resp = client.get("/api/public/v1/rating/models/999999/")
    assert resp.status_code == 404


@pytest.mark.django_db
def test_detail_by_slug(client, methodology):
    brand = BrandFactory(name="Daikin")
    m = PublishedACModelFactory(brand=brand, series="Comfort", inner_unit="x1", outer_unit="y1")
    resp = client.get(f"/api/public/v1/rating/models/by-slug/{m.slug}/")
    assert resp.status_code == 200
    assert resp.json()["id"] == m.pk


# ── Archive ────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_archive_returns_only_archived(client, methodology):
    PublishedACModelFactory(brand=BrandFactory(name="Pub"))
    ArchivedACModelFactory(brand=BrandFactory(name="Old1"))
    ArchivedACModelFactory(brand=BrandFactory(name="Old2"))

    resp = client.get("/api/public/v1/rating/models/archive/")
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body, list)
    assert len(body) == 2


@pytest.mark.django_db
def test_archive_list_returns_plain_array(client, methodology):
    """M3: архивный list тоже plain array (не {count, results, ...})."""
    ArchivedACModelFactory(brand=BrandFactory(name="Old"))

    resp = client.get("/api/public/v1/rating/models/archive/")
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body, list)
    assert len(body) == 1


# ── Methodology ────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_methodology_returns_active(client, methodology_with_noise):
    resp = client.get("/api/public/v1/rating/methodology/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["is_active"] is True
    assert body["version"] == methodology_with_noise.version
    assert len(body["criteria"]) == 1
    assert body["criteria"][0]["code"] == "noise"


@pytest.mark.django_db
def test_methodology_404_when_no_active(client, db):
    """Без активной методики — 404 (NotFound из MethodologyView)."""
    resp = client.get("/api/public/v1/rating/methodology/")
    assert resp.status_code == 404


# ── Presets (polish-3) ────────────────────────────────────────────────
#
# Seed-миграция 0005 создаёт 6 пресетов, фикстура `methodology_with_noise`
# даёт активную методику с одним критерием.


@pytest.mark.django_db
def test_methodology_includes_presets(client, methodology_with_noise):
    """Ответ /methodology/ содержит массив presets длиной 6."""
    resp = client.get("/api/public/v1/rating/methodology/")
    assert resp.status_code == 200
    body = resp.json()
    assert "presets" in body
    assert isinstance(body["presets"], list)
    assert len(body["presets"]) == 6


@pytest.mark.django_db
def test_methodology_presets_shape(client, methodology_with_noise):
    """Каждый пресет содержит нужные поля; сортировка по order."""
    resp = client.get("/api/public/v1/rating/methodology/")
    presets = resp.json()["presets"]
    # Сортировка по `order` (0 → 5).
    orders = [p["order"] for p in presets]
    assert orders == sorted(orders)
    # Shape.
    for p in presets:
        assert set(p.keys()) >= {
            "id", "slug", "label", "order", "description",
            "is_all_selected", "criteria_codes",
        }
        assert isinstance(p["criteria_codes"], list)


@pytest.mark.django_db
def test_methodology_avgust_preset_returns_all_active_codes(
    client, methodology_with_noise,
):
    """Пресет avgust (is_all_selected) → criteria_codes = все активные
    коды активной методики."""
    resp = client.get("/api/public/v1/rating/methodology/")
    body = resp.json()
    avgust = next(p for p in body["presets"] if p["slug"] == "avgust")
    assert avgust["is_all_selected"] is True
    # В methodology_with_noise только один активный критерий — `noise`.
    assert avgust["criteria_codes"] == ["noise"]


@pytest.mark.django_db
def test_methodology_inactive_presets_excluded(client, methodology_with_noise):
    """Пресет с is_active=False не попадает в ответ."""
    from ac_methodology.models import RatingPreset
    p = RatingPreset.objects.get(slug="silence")
    p.is_active = False
    p.save(update_fields=["is_active"])

    resp = client.get("/api/public/v1/rating/methodology/")
    slugs = [p["slug"] for p in resp.json()["presets"]]
    assert "silence" not in slugs
    assert len(slugs) == 5


# ── Export CSV ─────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_export_csv_returns_csv_content_type(client, db):
    PublishedACModelFactory(brand=BrandFactory(name="ExportBrand"))
    resp = client.get("/api/public/v1/rating/export/csv/")
    assert resp.status_code == 200
    assert resp["Content-Type"].startswith("text/csv")
    assert "attachment" in resp["Content-Disposition"]
    body = resp.content.decode()
    assert "brand,model" in body  # заголовок
    assert "ExportBrand" in body


@pytest.mark.django_db
def test_export_csv_empty_db_returns_header_only(client, db):
    resp = client.get("/api/public/v1/rating/export/csv/")
    assert resp.status_code == 200
    assert resp.content.decode().strip() == "brand,model,nominal_capacity,total_index,publish_status"


# ── M2: rank / median / stats ─────────────────────────────────────────


@pytest.mark.django_db
def test_list_includes_rank_for_each_item(client, methodology):
    # 3 модели по убыванию total_index → ranks [1, 2, 3].
    PublishedACModelFactory(brand=BrandFactory(name="A"), total_index=80)
    PublishedACModelFactory(brand=BrandFactory(name="B"), total_index=60)
    PublishedACModelFactory(brand=BrandFactory(name="C"), total_index=40)

    resp = client.get("/api/public/v1/rating/models/")
    assert resp.status_code == 200
    items = resp.json()
    by_brand = {it["brand"]: it["rank"] for it in items}
    assert by_brand == {"A": 1, "B": 2, "C": 3}


@pytest.mark.django_db
def test_list_rank_handles_ties_with_same_rank_and_skip(client, methodology):
    # Две модели с одинаковым total_index → один и тот же rank;
    # следующая идёт через 2 (стандартный RANK, не DENSE_RANK).
    PublishedACModelFactory(brand=BrandFactory(name="A"), total_index=80)
    PublishedACModelFactory(brand=BrandFactory(name="B"), total_index=60)
    PublishedACModelFactory(brand=BrandFactory(name="C"), total_index=60)
    PublishedACModelFactory(brand=BrandFactory(name="D"), total_index=40)

    resp = client.get("/api/public/v1/rating/models/")
    items = resp.json()
    by_brand = {it["brand"]: it["rank"] for it in items}
    assert by_brand["A"] == 1
    assert by_brand["B"] == by_brand["C"] == 2
    assert by_brand["D"] == 4  # не 3 — это RANK, не DENSE_RANK


@pytest.mark.django_db
def test_list_rank_stays_absolute_when_filter_applied(client, methodology):
    """Фильтр по brand не должен пересчитывать rank — модель остаётся
    «№N в полном published-каталоге»."""
    PublishedACModelFactory(brand=BrandFactory(name="Daikin"), total_index=80)
    PublishedACModelFactory(brand=BrandFactory(name="Mitsubishi"), total_index=60)
    PublishedACModelFactory(brand=BrandFactory(name="Other"), total_index=40)

    # Фильтр оставляет только Mitsubishi (#2 в полном каталоге).
    resp = client.get("/api/public/v1/rating/models/?brand=Mitsubishi")
    items = resp.json()
    assert len(items) == 1
    assert items[0]["rank"] == 2  # абсолютный, не «1 из 1 отфильтрованных»


@pytest.mark.django_db
def test_detail_includes_rank_and_median(client, methodology):
    PublishedACModelFactory(brand=BrandFactory(name="A"), total_index=80)
    target = PublishedACModelFactory(brand=BrandFactory(name="B"), total_index=60)
    PublishedACModelFactory(brand=BrandFactory(name="C"), total_index=40)
    # Медиана из [40, 60, 80] = 60

    resp = client.get(f"/api/public/v1/rating/models/{target.pk}/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["rank"] == 2
    assert body["median_total_index"] == 60.0


@pytest.mark.django_db
def test_detail_rank_with_ties(client, methodology):
    # target имеет тот же total_index что и A → оба rank=1 (выше нет никого).
    PublishedACModelFactory(brand=BrandFactory(name="A"), total_index=80)
    target = PublishedACModelFactory(brand=BrandFactory(name="B"), total_index=80)
    PublishedACModelFactory(brand=BrandFactory(name="C"), total_index=40)

    resp = client.get(f"/api/public/v1/rating/models/{target.pk}/")
    assert resp.json()["rank"] == 1


@pytest.mark.django_db
def test_detail_median_for_even_count(client, methodology):
    # Чётное число → медиана = среднее двух центральных.
    PublishedACModelFactory(total_index=80)
    target = PublishedACModelFactory(total_index=60)
    PublishedACModelFactory(total_index=40)
    PublishedACModelFactory(total_index=20)
    # отсортированный: [20, 40, 60, 80] → median=(40+60)/2=50

    resp = client.get(f"/api/public/v1/rating/models/{target.pk}/")
    assert resp.json()["median_total_index"] == 50.0


@pytest.mark.django_db
def test_methodology_includes_stats(client, methodology_with_noise):
    # У methodology_with_noise один активный критерий (noise),
    # 0 published моделей в начале.
    PublishedACModelFactory(total_index=70)
    PublishedACModelFactory(total_index=50)
    PublishedACModelFactory(total_index=30)
    # отсортированный: [30, 50, 70] → median=50

    resp = client.get("/api/public/v1/rating/methodology/")
    assert resp.status_code == 200
    stats = resp.json()["stats"]
    assert stats == {
        "total_models": 3,
        "active_criteria_count": 1,
        "median_total_index": 50.0,
    }


@pytest.mark.django_db
def test_methodology_stats_with_no_models(client, methodology_with_noise):
    resp = client.get("/api/public/v1/rating/methodology/")
    stats = resp.json()["stats"]
    assert stats["total_models"] == 0
    assert stats["active_criteria_count"] == 1
    assert stats["median_total_index"] is None


@pytest.mark.django_db
def test_archive_list_rank_is_null(client, methodology):
    """У архивных моделей rank не аннотируется — поле приходит null."""
    ArchivedACModelFactory(total_index=50)
    resp = client.get("/api/public/v1/rating/models/archive/")
    items = resp.json()
    assert items[0]["rank"] is None


# ── M4: editorial / dimensions / supplier enrichment / criterion.group ─


@pytest.mark.django_db
def test_detail_includes_editorial_fields(client, methodology):
    """M4.1: detail отдаёт 4 editorial-поля; пустые приходят как «»."""
    m = PublishedACModelFactory(
        editorial_lede="Вводный абзац обзора.",
        editorial_body="Длинный обзор.\n\nВторой абзац.",
        editorial_quote="Короткая цитата редактора.",
        editorial_quote_author="А. Петров, главред",
    )
    resp = client.get(f"/api/public/v1/rating/models/{m.pk}/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["editorial_lede"] == "Вводный абзац обзора."
    assert body["editorial_body"] == "Длинный обзор.\n\nВторой абзац."
    assert body["editorial_quote"] == "Короткая цитата редактора."
    assert body["editorial_quote_author"] == "А. Петров, главред"


@pytest.mark.django_db
def test_detail_includes_unit_dimensions_and_weight(client, methodology):
    """M4.2: detail отдаёт inner/outer dimensions + weight, weight как строка
    (Decimal сериализуется DRF в строку)."""
    from decimal import Decimal
    m = PublishedACModelFactory(
        inner_unit_dimensions="850 × 295 × 189 мм",
        inner_unit_weight_kg=Decimal("10.0"),
        outer_unit_dimensions="770 × 555 × 300 мм",
        outer_unit_weight_kg=Decimal("28.5"),
    )
    resp = client.get(f"/api/public/v1/rating/models/{m.pk}/")
    body = resp.json()
    assert body["inner_unit_dimensions"] == "850 × 295 × 189 мм"
    assert body["inner_unit_weight_kg"] == "10.0"
    assert body["outer_unit_dimensions"] == "770 × 555 × 300 мм"
    assert body["outer_unit_weight_kg"] == "28.5"


@pytest.mark.django_db
def test_supplier_serializer_includes_enrichment(client, methodology):
    """M4.3: detail.suppliers[] выдаёт все 5 новых полей + availability_display."""
    from decimal import Decimal
    from ac_catalog.models import ACModelSupplier
    from ac_catalog.tests.factories import ACModelSupplierFactory

    m = PublishedACModelFactory()
    ACModelSupplierFactory(
        model=m, name="Магазин-1",
        price=Decimal("100500.00"),
        city="Москва",
        rating=Decimal("4.7"),
        availability=ACModelSupplier.Availability.IN_STOCK,
        note="с монтажом · 2 дня",
    )

    resp = client.get(f"/api/public/v1/rating/models/{m.pk}/")
    sup = resp.json()["suppliers"][0]
    assert sup["price"] == "100500.00"
    assert sup["city"] == "Москва"
    assert sup["rating"] == "4.7"
    assert sup["availability"] == "in_stock"
    assert sup["availability_display"] == "В наличии"
    assert sup["note"] == "с монтажом · 2 дня"


@pytest.mark.django_db
def test_methodology_criteria_include_group(client, methodology_with_noise):
    """M4.4 + M4.5: criteria[] содержит group + group_display."""
    # methodology_with_noise создаёт критерий с code="noise". По умолчанию
    # его group = "other"; ставим явно "acoustics" чтобы проверить пробрасывание.
    from ac_methodology.models import Criterion as CriterionModel
    crit = CriterionModel.objects.get(code="noise")
    crit.group = CriterionModel.Group.ACOUSTICS
    crit.save(update_fields=["group"])

    resp = client.get("/api/public/v1/rating/methodology/")
    assert resp.status_code == 200
    criteria = resp.json()["criteria"]
    by_code = {c["code"]: c for c in criteria}
    assert by_code["noise"]["group"] == "acoustics"
    assert by_code["noise"]["group_display"] == "Акустика"


# ── M5.6: news_mentions ────────────────────────────────────────────────


@pytest.mark.django_db
def test_detail_includes_news_mentions(client, methodology):
    """M5.6: detail отдаёт news_mentions с опубликованными упоминаниями модели.

    shape: id/title/category/category_display/pub_date/reading_time_minutes."""
    from news.models import NewsPost
    from news.tests.factories import NewsPostFactory

    m = PublishedACModelFactory()
    NewsPostFactory(
        title="Первое упоминание",
        category=NewsPost.Category.REVIEW,
        reading_time_minutes=4,
        mentioned_ac_models=[m],
    )
    NewsPostFactory(
        title="Второе упоминание",
        category=NewsPost.Category.BRANDS,
        reading_time_minutes=2,
        mentioned_ac_models=[m],
    )

    resp = client.get(f"/api/public/v1/rating/models/{m.pk}/")
    assert resp.status_code == 200
    mentions = resp.json()["news_mentions"]
    assert isinstance(mentions, list)
    assert len(mentions) == 2
    first = mentions[0]
    assert set(first.keys()) == {
        "id", "title", "category", "category_display", "pub_date", "reading_time_minutes",
    }
    # Обратная сортировка по pub_date — последний созданный факт идёт первым.
    titles = [m["title"] for m in mentions]
    assert "Первое упоминание" in titles
    assert "Второе упоминание" in titles


@pytest.mark.django_db
def test_detail_news_mentions_excludes_drafts(client, methodology):
    """M5.6: deleted / no_news_found / draft посты не попадают в news_mentions."""
    from news.tests.factories import NewsPostFactory

    m = PublishedACModelFactory()
    NewsPostFactory(title="Видимое", mentioned_ac_models=[m])
    NewsPostFactory(title="Soft-deleted", is_deleted=True, mentioned_ac_models=[m])
    NewsPostFactory(title="No-news-found", is_no_news_found=True, mentioned_ac_models=[m])
    NewsPostFactory(title="Draft", status="draft", mentioned_ac_models=[m])

    resp = client.get(f"/api/public/v1/rating/models/{m.pk}/")
    titles = [n["title"] for n in resp.json()["news_mentions"]]
    assert titles == ["Видимое"]


@pytest.mark.django_db
def test_detail_news_mentions_limit_5(client, methodology):
    """M5.6: если связано 7 опубликованных постов — возвращается 5 самых свежих."""
    from news.tests.factories import NewsPostFactory

    m = PublishedACModelFactory()
    for i in range(7):
        NewsPostFactory(title=f"Пост-{i}", mentioned_ac_models=[m])

    resp = client.get(f"/api/public/v1/rating/models/{m.pk}/")
    mentions = resp.json()["news_mentions"]
    assert len(mentions) == 5

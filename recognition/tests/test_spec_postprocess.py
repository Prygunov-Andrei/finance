"""Unit-тесты post-process E15-06:
- apply_no_qty_merge (QA #51, #53)
- cap_sticky_name (QA #55)
"""

from __future__ import annotations

from app.services.pdf_text import TableRow
from app.services.spec_normalizer import NormalizedItem
from app.services.spec_postprocess import (
    _has_variant_marker,
    _looks_like_continuation,
    apply_no_qty_merge,
    cap_sticky_name,
    cover_bbox_rows,
    restore_from_bbox_rows,
)


def _row(
    idx: int, *, name: str = "", qty: str = "", unit: str = "",
    model: str = "", brand: str = "", is_section: bool = False,
) -> TableRow:
    return TableRow(
        page_number=1,
        y_mid=float(idx),
        row_index=idx,
        cells={
            "name": name, "qty": qty, "unit": unit,
            "model": model, "brand": brand,
        },
        raw_blocks=[],
        is_header=False,
        is_section_heading=is_section,
    )


def _mk(
    name: str, *, qty: float = 1.0, unit: str = "шт", model: str = ""
) -> NormalizedItem:
    return NormalizedItem(name=name, quantity=qty, unit=unit, model_name=model)


class TestLooksLikeContinuation:
    def test_lowercase_start(self):
        assert _looks_like_continuation("на узле прохода УП1")
        assert _looks_like_continuation("с решёткой")

    def test_prepositions(self):
        for p in ["с ", "со ", "на ", "в ", "во ", "под ", "для ", "из ",
                 "над ", "при ", "через ", "без ", "ко "]:
            assert _looks_like_continuation(p + "чем-то"), p

    def test_adjectives(self):
        assert _looks_like_continuation("Круглый")
        assert _looks_like_continuation("МОРОЗОСТОЙКИЙ")
        assert _looks_like_continuation("оцинкованный")

    def test_normal_name_not_continuation(self):
        assert not _looks_like_continuation("Воздуховод 250х100")
        assert not _looks_like_continuation("Дефлектор Цаги")
        assert not _looks_like_continuation("Клапан КПУ2")

    def test_empty(self):
        assert not _looks_like_continuation("")
        assert not _looks_like_continuation("   ")


class TestApplyNoQtyMerge:
    def test_merge_continuation_lowercase(self):
        items = [
            _mk("Дефлектор Цаги", qty=1, unit="шт"),
            _mk("на узле прохода УП1", qty=0, unit=""),
        ]
        result = apply_no_qty_merge(items)
        assert len(result) == 1
        assert result[0].name == "Дефлектор Цаги на узле прохода УП1"

    def test_merge_preposition_с(self):
        items = [
            _mk("Клапан КПУ2", qty=5, unit="шт"),
            _mk("с решёткой", qty=0, unit=""),
        ]
        result = apply_no_qty_merge(items)
        assert len(result) == 1
        assert result[0].name == "Клапан КПУ2 с решёткой"

    def test_merge_adjective(self):
        items = [
            _mk("Воздуховод ВД1", qty=3, unit="м"),
            _mk("круглый морозостойкий", qty=0, unit=""),
        ]
        result = apply_no_qty_merge(items)
        assert len(result) == 1
        assert result[0].name == "Воздуховод ВД1 круглый морозостойкий"

    def test_no_merge_when_qty_positive(self):
        items = [
            _mk("Клапан КПУ2", qty=5, unit="шт"),
            _mk("с решёткой", qty=1, unit="шт"),
        ]
        result = apply_no_qty_merge(items)
        assert len(result) == 2

    def test_no_merge_when_unit_present(self):
        items = [
            _mk("Клапан КПУ2", qty=5, unit="шт"),
            # unit есть → не continuation, даже если qty=0.
            _mk("с решёткой", qty=0, unit="шт"),
        ]
        result = apply_no_qty_merge(items)
        assert len(result) == 2

    def test_no_merge_when_capital_start(self):
        items = [
            _mk("Воздуховод 250х100", qty=3, unit="м"),
            _mk("Воздуховод 315х160", qty=2, unit="м"),
        ]
        result = apply_no_qty_merge(items)
        assert len(result) == 2

    def test_no_merge_first_item_orphan(self):
        # Первый item сам похож на continuation — оставить как есть.
        items = [
            _mk("с решёткой", qty=0, unit=""),
            _mk("Воздуховод", qty=2, unit="м"),
        ]
        result = apply_no_qty_merge(items)
        assert len(result) == 2
        assert result[0].name == "с решёткой"

    def test_empty_input(self):
        assert apply_no_qty_merge([]) == []

    def test_llm_copy_qty_artefact_merged(self):
        # Живой артефакт из ov2 p1: LLM скопировал qty=58 / unit=шт в
        # continuation-row «на узле прохода УП1». Нет model/brand — склеиваем.
        items = [
            _mk("Дефлектор Цаги", qty=58, unit="шт"),
            _mk("на узле прохода УП1", qty=58, unit="шт"),
        ]
        result = apply_no_qty_merge(items)
        assert len(result) == 1
        assert result[0].name == "Дефлектор Цаги на узле прохода УП1"
        assert result[0].quantity == 58

    def test_llm_copy_qty_not_merged_when_model_present(self):
        # Если у continuation-looking item есть свой model_name — это
        # НЕ continuation, не склеиваем (защита от ложных срабатываний).
        items = [
            _mk("Клапан КПУ2", qty=5, unit="шт"),
            _mk("с решёткой", qty=5, unit="шт", model="РЕШ-250"),
        ]
        result = apply_no_qty_merge(items)
        assert len(result) == 2

    def test_llm_copy_qty_not_merged_when_qty_differs(self):
        items = [
            _mk("Дефлектор Цаги", qty=58, unit="шт"),
            _mk("на узле прохода УП1", qty=5, unit="шт"),
        ]
        result = apply_no_qty_merge(items)
        # Разные qty → это отдельный item, не продолжение.
        assert len(result) == 2

    def test_multiple_continuations(self):
        items = [
            _mk("Вентилятор ВР", qty=1, unit="шт"),
            _mk("с глушителем", qty=0, unit=""),
            _mk("и крышей", qty=0, unit=""),
        ]
        result = apply_no_qty_merge(items)
        assert len(result) == 1
        assert result[0].name == "Вентилятор ВР с глушителем и крышей"


class TestVariantMarker:
    def test_variant_patterns(self):
        assert _has_variant_marker("ПН2")
        assert _has_variant_marker("ПД1")
        assert _has_variant_marker("В1-3")
        assert _has_variant_marker("КВО-10")
        assert _has_variant_marker("АПК-10")
        assert _has_variant_marker("ПК 4,5")
        assert _has_variant_marker("КПУ2")

    def test_not_variant(self):
        assert not _has_variant_marker("Воздуховод")
        assert not _has_variant_marker("Решётка")
        assert not _has_variant_marker("250х100")
        assert not _has_variant_marker("")


class TestCapStickyName:
    def test_no_sticky_applied(self):
        items = [
            _mk("Воздуховод 250х100", qty=3, unit="м"),
            _mk("Воздуховод 315х160", qty=2, unit="м"),
        ]
        result = cap_sticky_name(items)
        assert result[0].name == "Воздуховод 250х100"
        assert result[1].name == "Воздуховод 315х160"

    def test_sticky_series_preserved(self):
        # Серия ПН1, ПН2, ПН3 после головы — sticky легитимен.
        items = [
            _mk("Клапан ПН1", qty=1),
            _mk("Клапан ПН2", qty=1),
            _mk("Клапан ПН3", qty=1),
        ]
        result = cap_sticky_name(items)
        # Серия не должна потерять «Клапан».
        assert all(r.name.startswith("Клапан ПН") for r in result)

    def test_sticky_removed_from_non_series(self):
        # Предыдущий item «Решётка», текущий «Решётка Воздуховод 250х100» —
        # sticky «Решётка» прилип ошибочно, остаток «Воздуховод…» не имеет
        # variant-marker'а → режем sticky.
        items = [
            _mk("Решётка", qty=1, model="ПН2-4,5"),
            _mk("Решётка Воздуховод 250х100", qty=3, unit="м"),
        ]
        result = cap_sticky_name(items)
        assert result[0].name == "Решётка"
        assert result[1].name == "Воздуховод 250х100"

    def test_initial_sticky_removed(self):
        # Page-boundary carry-over: initial_sticky «Решётка» пришёл с
        # предыдущей страницы, первый item «Решётка Воздуховод…».
        items = [_mk("Решётка Воздуховод 315х160", qty=2, unit="м")]
        result = cap_sticky_name(items, initial_sticky="Решётка")
        assert result[0].name == "Воздуховод 315х160"

    def test_initial_sticky_kept_for_series(self):
        # Если после initial_sticky идёт реальный variant — sticky легитимен.
        items = [_mk("Решётка ПН2-4,5", qty=1)]
        result = cap_sticky_name(items, initial_sticky="Решётка")
        # variant-marker ПН2 после sticky → не режем.
        assert result[0].name == "Решётка ПН2-4,5"

    def test_empty_items(self):
        assert cap_sticky_name([]) == []


class TestRestoreFromBboxRows:
    """QA #55 strict — sticky-cap через сверку с cells.name bbox-row."""

    def test_prefers_cells_name_when_llm_substituted(self):
        # LLM подменила: cells.name = «Воздуховод 250х100»,
        # но item.name = «Решётка» (приклеилась sticky Решётка вместо Воздуховод).
        rows = [_row(0, name="Воздуховод 250х100", qty="3", unit="м")]
        items = [
            NormalizedItem(
                name="Решётка", quantity=3.0, unit="м", source_row_index=0,
            ),
        ]
        result = restore_from_bbox_rows(items, rows)
        assert result[0].name == "Воздуховод 250х100"

    def test_skips_variant_marker(self):
        # Legit sticky: cells.name начинается с variant-marker.
        rows = [_row(0, name="ПН2-4,5", qty="1", unit="шт")]
        items = [
            NormalizedItem(
                name="Решётка ПН2-4,5", quantity=1.0,
                source_row_index=0,
            ),
        ]
        result = restore_from_bbox_rows(items, rows)
        # НЕ трогаем — legit sticky для variant.
        assert result[0].name == "Решётка ПН2-4,5"

    def test_no_op_when_cells_empty(self):
        rows = [_row(0, name="", qty="1", unit="шт", model="РЭД-1000")]
        items = [
            NormalizedItem(
                name="Выбросной колпак", quantity=1.0, model_name="РЭД-1000",
                source_row_index=0,
            ),
        ]
        result = restore_from_bbox_rows(items, rows)
        assert result[0].name == "Выбросной колпак"

    def test_regression_klapan_kpu2_not_broken(self):
        # cells.name тот же корень («Клапан КПУ2»), item.name с continuation.
        rows = [_row(0, name="Клапан КПУ2", qty="5", unit="шт")]
        items = [
            NormalizedItem(
                name="Клапан КПУ2 прямоугольный морозостойкий",
                quantity=5.0, unit="шт",
                source_row_index=0,
            ),
        ]
        result = restore_from_bbox_rows(items, rows)
        # Не трогаем — первое слово совпадает.
        assert result[0].name == "Клапан КПУ2 прямоугольный морозостойкий"

    def test_skips_when_source_row_unknown(self):
        rows = [_row(0, name="Воздуховод", qty="1", unit="м")]
        items = [
            NormalizedItem(
                name="Решётка", quantity=1.0,
                source_row_index=None,
            ),
        ]
        result = restore_from_bbox_rows(items, rows)
        assert result[0].name == "Решётка"

    def test_empty_rows_or_items(self):
        assert restore_from_bbox_rows([], []) == []
        assert restore_from_bbox_rows(
            [NormalizedItem(name="x")], []
        )[0].name == "x"


class TestCoverBboxRows:
    """QA #51 strict — coverage-check для потерянных continuation rows."""

    def test_orphan_continuation_merged(self):
        # Row 1 — полноценный item. Row 2 — continuation без qty/unit/model,
        # LLM её выбросила.
        rows = [
            _row(0, name="Клапан КПУ2", qty="5", unit="шт"),
            _row(1, name="прямоугольный, морозостойкий"),
        ]
        items = [
            NormalizedItem(
                name="Клапан КПУ2", quantity=5.0, unit="шт",
                source_row_index=0,
            ),
        ]
        result = cover_bbox_rows(items, rows)
        assert len(result) == 1
        assert "прямоугольный, морозостойкий" in result[0].name

    def test_empty_rows_ignored(self):
        rows = [
            _row(0, name="Клапан КПУ2", qty="5", unit="шт"),
            _row(1, name=""),
        ]
        items = [
            NormalizedItem(
                name="Клапан КПУ2", quantity=5.0, unit="шт",
                source_row_index=0,
            ),
        ]
        result = cover_bbox_rows(items, rows)
        assert len(result) == 1
        assert result[0].name == "Клапан КПУ2"

    def test_preserves_explicit_items(self):
        # Row 2 имеет qty/unit/model — это НЕ continuation, не трогаем.
        rows = [
            _row(0, name="Клапан КПУ2", qty="5", unit="шт"),
            _row(1, name="Воздуховод", qty="3", unit="м", model="ВД-250"),
        ]
        items = [
            NormalizedItem(
                name="Клапан КПУ2", quantity=5.0, unit="шт",
                source_row_index=0,
            ),
        ]
        # Row 1 «потеряна» items'ами (не покрыта), но у неё есть qty/unit —
        # legit lost item, cover_bbox_rows НЕ склеивает (это исказит).
        result = cover_bbox_rows(items, rows)
        assert len(result) == 1
        assert result[0].name == "Клапан КПУ2"

    def test_section_heading_ignored(self):
        rows = [
            _row(0, name="Клапан КПУ2", qty="5", unit="шт"),
            _row(1, name="Фасонные изделия", is_section=True),
        ]
        items = [
            NormalizedItem(
                name="Клапан КПУ2", quantity=5.0, unit="шт",
                source_row_index=0,
            ),
        ]
        result = cover_bbox_rows(items, rows)
        assert result[0].name == "Клапан КПУ2"

    def test_no_op_when_source_indexes_missing(self):
        # Без source_row_index coverage-check не работает (нет mapping).
        rows = [
            _row(0, name="Клапан КПУ2", qty="5", unit="шт"),
            _row(1, name="прямоугольный"),
        ]
        items = [
            NormalizedItem(name="Клапан КПУ2", quantity=5.0, unit="шт"),
        ]
        result = cover_bbox_rows(items, rows)
        assert result[0].name == "Клапан КПУ2"

    def test_orphan_before_any_item_skipped(self):
        rows = [
            _row(0, name="прямоугольный"),
            _row(1, name="Клапан КПУ2", qty="5", unit="шт"),
        ]
        items = [
            NormalizedItem(
                name="Клапан КПУ2", quantity=5.0, unit="шт",
                source_row_index=1,
            ),
        ]
        result = cover_bbox_rows(items, rows)
        # Orphan row_index=0 не имеет предыдущего item'а → skip.
        assert result[0].name == "Клапан КПУ2"

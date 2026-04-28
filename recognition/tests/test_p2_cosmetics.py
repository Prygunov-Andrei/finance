"""TD-04: P2 cosmetics — Class J/G/I/N/O.

Каждый класс — отдельный мелкий fix в финальных item.name / item.model_name.
"""

from __future__ import annotations

from app.services.spec_normalizer import NormalizedItem
from app.services.spec_postprocess import (
    _fix_digit_duplication,
    _fix_klop_punctuation_drift,
    _is_model_truncated_no_digits,
    _strip_injected_model_suffix,
    _trim_trailing_hyphen,
    apply_p2_cosmetics,
)


class TestClassJ_PunctuationDrift:
    def test_klop_no_with_mvs(self) -> None:
        before = "КЛОП-2(90)-НО-700х500, МВ/S(220)-К"
        assert _fix_klop_punctuation_drift(before) == (
            "КЛОП-2(90)-НО-700х500-МВ/S(220)-К"
        )

    def test_klop_nz_with_mvk(self) -> None:
        before = "КЛОП-1(60)-НЗ-300х200, МВ/К(220)"
        assert _fix_klop_punctuation_drift(before) == (
            "КЛОП-1(60)-НЗ-300х200-МВ/К(220)"
        )

    def test_klop_without_drift_unchanged(self) -> None:
        clean = "КЛОП-2(90)-НО-700х500-МВ/S(220)-К"
        assert _fix_klop_punctuation_drift(clean) == clean

    def test_non_klop_model_unchanged(self) -> None:
        # Запятая внутри другого кода — не наш кейс.
        unrelated = "Bahcivan BDRS, 12-2"
        assert _fix_klop_punctuation_drift(unrelated) == unrelated

    def test_empty_input(self) -> None:
        assert _fix_klop_punctuation_drift("") == ""


class TestClassG_TrailingHyphen:
    def test_trim_trailing_hyphen(self) -> None:
        assert _trim_trailing_hyphen("плёнкой каширо-") == "плёнкой каширо"

    def test_trim_trailing_hyphen_with_space(self) -> None:
        assert _trim_trailing_hyphen("плёнкой каширо- ") == "плёнкой каширо"

    def test_keep_internal_hyphens(self) -> None:
        assert _trim_trailing_hyphen("КЛОП-2-90") == "КЛОП-2-90"

    def test_no_hyphen_unchanged(self) -> None:
        assert _trim_trailing_hyphen("Воздуховод 250х100") == "Воздуховод 250х100"

    def test_empty_input(self) -> None:
        assert _trim_trailing_hyphen("") == ""


class TestClassI_InjectedModel:
    def test_strip_model_suffix(self) -> None:
        name = "Установка вентиляционная (модель: RL/159485/П3В3 v7)"
        model = "RL/159485/П3В3 v7"
        assert _strip_injected_model_suffix(name, model) == (
            "Установка вентиляционная"
        )

    def test_case_insensitive(self) -> None:
        name = "Решётка вентиляционная (Модель: ABC-123)"
        model = "ABC-123"
        assert _strip_injected_model_suffix(name, model) == (
            "Решётка вентиляционная"
        )

    def test_empty_model_no_change(self) -> None:
        name = "Установка (модель: RL/123)"
        assert _strip_injected_model_suffix(name, "") == name

    def test_no_suffix_unchanged(self) -> None:
        name = "Установка вентиляционная"
        assert _strip_injected_model_suffix(name, "RL/123") == name

    def test_model_mismatch_unchanged(self) -> None:
        # «(модель: X)» не совпадает с реальным model_name → не трогаем.
        name = "Установка (модель: OTHER/999)"
        assert _strip_injected_model_suffix(name, "RL/123") == name


class TestClassN_DigitDuplication:
    def test_fix_dup_5_digits(self) -> None:
        assert _fix_digit_duplication("Воздуховод 6400/64000") == (
            "Воздуховод 6400/6400"
        )

    def test_fix_dup_in_middle(self) -> None:
        assert _fix_digit_duplication("ОВ 1200/12000 м3/ч") == "ОВ 1200/1200 м3/ч"

    def test_no_dup_unchanged(self) -> None:
        assert _fix_digit_duplication("6400/3200") == "6400/3200"
        assert _fix_digit_duplication("6400/6400") == "6400/6400"

    def test_different_lengths_unchanged(self) -> None:
        # 6400/640000 — два дополнительных нуля, не наш паттерн.
        assert _fix_digit_duplication("6400/640000") == "6400/640000"

    def test_no_slash_unchanged(self) -> None:
        assert _fix_digit_duplication("Просто 6400") == "Просто 6400"


class TestClassO_ModelTruncated:
    def test_trailing_h_cyrillic(self) -> None:
        assert _is_model_truncated_no_digits("КЛОП-2(90)-НО-1700х") is True

    def test_trailing_x_latin(self) -> None:
        assert _is_model_truncated_no_digits("ABC-123-1700x") is True

    def test_trailing_diameter(self) -> None:
        assert _is_model_truncated_no_digits("Воздуховод-Ø") is True

    def test_complete_model_unchanged(self) -> None:
        assert _is_model_truncated_no_digits("КЛОП-2(90)-НО-1700х500") is False

    def test_empty_unchanged(self) -> None:
        assert _is_model_truncated_no_digits("") is False
        assert _is_model_truncated_no_digits("   ") is False


class TestApplyP2Cosmetics:
    def test_full_pipeline(self) -> None:
        items = [
            NormalizedItem(
                name="Установка (модель: RL/159485)",
                model_name="RL/159485",
            ),
            NormalizedItem(
                name="Воздуховод 6400/64000",
                model_name="КЛОП-2(90)-НО-700х500, МВ/S(220)",
            ),
            NormalizedItem(
                name="Плёнкой каширо-",
                model_name="КЛОП-2(90)-НО-1700х",
            ),
            NormalizedItem(
                name="Воздуховод обычный",
                model_name="Стандарт-100",
            ),
        ]
        result = apply_p2_cosmetics(items)

        # Class I — strip injected model suffix.
        assert result[0].name == "Установка"
        # Class N — fix digit dup; Class J — fix punctuation drift.
        assert result[1].name == "Воздуховод 6400/6400"
        assert result[1].model_name == "КЛОП-2(90)-НО-700х500-МВ/S(220)"
        # Class G — trim trailing hyphen; Class O — flag truncated model.
        assert result[2].name == "Плёнкой каширо"
        assert result[2].model_truncated is True
        # Untouched item.
        assert result[3].name == "Воздуховод обычный"
        assert result[3].model_truncated is False

    def test_empty_items_list(self) -> None:
        assert apply_p2_cosmetics([]) == []

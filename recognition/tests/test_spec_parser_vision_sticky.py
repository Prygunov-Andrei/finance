"""Unit tests for DEV-BACKLOG #13: Vision path применяет sticky_parent_name.

Mixed PDF (native + scan). На native странице column-aware установил sticky
(«Воздуховод»). Следующая страница уходит в Vision: LLM возвращает items без
parent-context — только variant «ф100» или пустой name. Без fix bridge рвётся.

Fix: `_apply_vision_sticky` наследует sticky к пустым/variant-only items.
"""

from app.services.spec_parser import _apply_vision_sticky


class TestApplyVisionSticky:
    def test_empty_name_inherits_sticky(self):
        """Пустой name → берём sticky полностью."""
        assert _apply_vision_sticky("", "Воздуховод") == "Воздуховод"

    def test_variant_only_prepends_sticky(self):
        """variant-only name (размер / диаметр) склеивается со sticky."""
        assert _apply_vision_sticky("ф100", "Воздуховод") == "Воздуховод ф100"
        assert (
            _apply_vision_sticky("150х100", "Воздуховод") == "Воздуховод 150х100"
        )
        assert (
            _apply_vision_sticky("Ø355", "Воздуховод") == "Воздуховод Ø355"
        )

    def test_full_name_kept(self):
        """Полное имя от LLM не трогаем — оно информативнее sticky."""
        assert _apply_vision_sticky("Клапан огнезадерживающий", "Воздуховод") == (
            "Клапан огнезадерживающий"
        )
        assert _apply_vision_sticky("Дефлектор Цаги", "Воздуховод") == "Дефлектор Цаги"

    def test_no_sticky_no_change(self):
        """Если sticky пуст — name отдаём как есть (даже пустой)."""
        assert _apply_vision_sticky("", "") == ""
        assert _apply_vision_sticky("ф100", "") == "ф100"
        assert _apply_vision_sticky("Клапан", "") == "Клапан"

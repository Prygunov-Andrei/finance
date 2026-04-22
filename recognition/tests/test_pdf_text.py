"""Unit tests for services/pdf_text.py — text-layer parser."""

from dataclasses import dataclass

import fitz

from app.services.pdf_text import (
    UNITS,
    extract_lines,
    extract_structured_rows,
    has_usable_text_layer,
    is_header_row,
    is_section_heading,
    is_stamp_line,
    is_stamp_text,
    is_variant_only_line,
    parse_page_items,
    parse_quantity,
)


@dataclass
class FakePage:
    """Минимальный stand-in для fitz.Page — дёшево эмулируем `get_text()`.

    Реальный fitz.insert_text без кастомного Unicode-шрифта не пишет кириллицу,
    поэтому формировать PDF «с нуля» с русским текстом неудобно — подсовываем
    фейк с нужным выводом get_text().
    """

    _text: str

    def get_text(self, *_args: object, **_kwargs: object) -> str:
        return self._text


def _make_page_with_lines(lines: list[str]) -> FakePage:
    return FakePage(_text="\n".join(lines) + "\n")


class TestIsStamp:
    def test_stamp_exact(self):
        assert is_stamp_line("Формат А3")
        assert is_stamp_line("Изм.")
        assert is_stamp_line("Лист")
        assert is_stamp_line("Подп.")
        assert is_stamp_line("ГИП")
        assert is_stamp_line("+10%")
        assert is_stamp_line("2024г.")

    def test_page_number(self):
        assert is_stamp_line("1")
        assert is_stamp_line("42")
        assert is_stamp_line("100")

    def test_doc_code(self):
        assert is_stamp_line("470-05/2025-ОВ2.СО")

    def test_model_not_stamp(self):
        assert not is_stamp_line("KLR-DU-400-80H-5,5x10-HF")
        assert not is_stamp_line("OKL-2D-30-1200х500-S-220-V-S")
        assert not is_stamp_line("УП1-ф355-1000-оц-фл.фл")
        assert not is_stamp_line("Дефлектор Цаги")

    def test_empty(self):
        assert is_stamp_line("")
        assert is_stamp_line("   ")


class TestIsSection:
    def test_section_headings(self):
        assert is_section_heading("Система общеобменной вытяжной вентиляции. Жилая часть.")
        assert is_section_heading("Клапаны на кровле (снаружи)")
        assert is_section_heading("Противодымная вентиляция")
        assert is_section_heading("Отопление встроенных помещений")

    def test_item_names_not_section(self):
        assert not is_section_heading("Дефлектор Цаги")
        assert not is_section_heading("KLR-DU-400-80H-5,5x10-HF")
        assert not is_section_heading("Огнезащитная клеящая смесь")
        assert not is_section_heading("Противопожарная изоляция EI30")


class TestParseQuantity:
    def test_integer(self):
        assert parse_quantity("58") == 58.0

    def test_comma_decimal(self):
        assert parse_quantity("1,5") == 1.5

    def test_approx(self):
        assert parse_quantity("~4900") == 4900.0

    def test_not_number(self):
        assert parse_quantity("шт") is None
        assert parse_quantity("abc") is None
        assert parse_quantity("") is None


class TestHasTextLayer:
    def test_rich_text(self):
        page = _make_page_with_lines(["Строка 1", "Строка 2", "Строка 3", "Строка 4"])
        assert has_usable_text_layer(page, min_chars=10)

    def test_empty_page(self):
        doc = fitz.open()
        page = doc.new_page()
        assert not has_usable_text_layer(page, min_chars=50)
        doc.close()


class TestParsePageItems:
    def test_simple_item(self):
        lines = [
            "Система общеобменной вытяжной вентиляции. Жилая часть.",
            "Дефлектор Цаги",
            "ф355-оц-фл",
            "шт",
            "58",
        ]
        page = _make_page_with_lines(lines)
        items, section, _ = parse_page_items(page, current_section="")
        assert section == "Система общеобменной вытяжной вентиляции. Жилая часть."
        assert len(items) == 1
        assert items[0]["name"] == "Дефлектор Цаги"
        assert items[0]["model_name"] == "ф355-оц-фл"
        assert items[0]["unit"] == "шт"
        assert items[0]["quantity"] == 58.0
        assert items[0]["section_name"] == "Система общеобменной вытяжной вентиляции. Жилая часть."

    def test_multiple_items_same_section(self):
        lines = [
            "Клапаны на кровле (снаружи)",
            "Вентилятор дымоудаления",
            "KLR-DU-400",
            "шт",
            "3",
            "Клапан противопожарный",
            "OKL-2D-30",
            "шт",
            "5",
        ]
        page = _make_page_with_lines(lines)
        items, _, _ = parse_page_items(page, current_section="")
        assert len(items) == 2
        assert items[0]["section_name"] == "Клапаны на кровле (снаружи)"
        assert items[1]["section_name"] == "Клапаны на кровле (снаружи)"

    def test_inherit_section_from_previous_page(self):
        lines = [
            "Вентилятор дымоудаления",
            "KLR-DU-400",
            "шт",
            "3",
        ]
        page = _make_page_with_lines(lines)
        items, section, _sticky = parse_page_items(
            page, current_section="Противодымная вентиляция"
        )
        assert section == "Противодымная вентиляция"
        assert items[0]["section_name"] == "Противодымная вентиляция"

    def test_decimal_quantity(self):
        lines = ["Воздуховод", "ф100", "м.п.", "1,5"]
        page = _make_page_with_lines(lines)
        items, _, _ = parse_page_items(page, current_section="")
        assert items[0]["quantity"] == 1.5

    def test_stamp_lines_ignored(self):
        lines = [
            "Формат А3",
            "Лист",
            "Вентилятор",
            "VX-100",
            "шт",
            "1",
            "Изм.",
            "Подп.",
        ]
        page = _make_page_with_lines(lines)
        items, _, _ = parse_page_items(page, current_section="")
        assert len(items) == 1

    def test_multiline_name(self):
        lines = [
            "Моноблочная установка приточная",
            "с рекуператором",
            "UTR 50-25",
            "шт",
            "2",
        ]
        page = _make_page_with_lines(lines)
        items, _, _ = parse_page_items(page, current_section="")
        assert len(items) == 1
        # name = буфер без последней, model = последняя строка
        assert "Моноблочная установка приточная" in items[0]["name"]
        assert items[0]["model_name"] == "UTR 50-25"

    def test_units_coverage(self):
        """Все ключевые unit-слова распознаются."""
        for unit in ["шт", "м.п.", "м.кв.", "кг", "т", "комплект"]:
            lines = ["Элемент", "Код-1", unit, "10"]
            page = _make_page_with_lines(lines)
            items, _, _ = parse_page_items(page, current_section="")
            assert len(items) == 1, f"failed for unit {unit!r}"
            assert items[0]["unit"] == unit


class TestIsVariantOnly:
    def test_dimensions(self):
        assert is_variant_only_line("150х100")
        assert is_variant_only_line("200x200")
        assert is_variant_only_line("100х100х50")
        assert is_variant_only_line("300 х 300")

    def test_diameter(self):
        assert is_variant_only_line("ф100")
        assert is_variant_only_line("ф355")
        assert is_variant_only_line("Ø200")

    def test_names_not_variant(self):
        assert not is_variant_only_line("Дефлектор Цаги")
        assert not is_variant_only_line("Вентилятор канальный WNK 100")
        assert not is_variant_only_line("Огнезащитная клеящая смесь")

    def test_too_long_not_variant(self):
        # ограничение 25 символов — защита от случайных совпадений в длинных именах
        assert not is_variant_only_line("ф100 " + "x" * 30)

    def test_empty(self):
        assert not is_variant_only_line("")


class TestStickyParentName:
    def test_sticky_applied_to_variant_row(self):
        """Воздуховод / ф100 / м.п. / 1,5 → первый item; затем 150х100 / м.п.
        / 3135 должен унаследовать name="Воздуховод", model="150х100"."""
        lines = [
            "Воздуховод",
            "ф100",
            "м.п.",
            "1,5",
            "150х100",
            "м.п.",
            "3135",
            "200х200",
            "м.п.",
            "850",
        ]
        page = _make_page_with_lines(lines)
        items, _section, sticky = parse_page_items(page, current_section="")
        assert len(items) == 3
        assert items[0] == {
            "name": "Воздуховод",
            "model_name": "ф100",
            "unit": "м.п.",
            "quantity": 1.5,
            "section_name": "",
        }
        assert items[1]["name"] == "Воздуховод"
        assert items[1]["model_name"] == "150х100"
        assert items[1]["quantity"] == 3135.0
        assert items[2]["name"] == "Воздуховод"
        assert items[2]["model_name"] == "200х200"
        assert sticky == "Воздуховод"

    def test_sticky_persists_across_pages(self):
        """Передаём sticky на следующую страницу — variant в начале новой
        страницы всё ещё наследует parent."""
        page = _make_page_with_lines(["150х100", "м.п.", "500"])
        items, _section, sticky = parse_page_items(
            page, current_section="Sys", sticky_parent_name="Воздуховод"
        )
        assert len(items) == 1
        assert items[0]["name"] == "Воздуховод"
        assert items[0]["model_name"] == "150х100"
        assert sticky == "Воздуховод"

    def test_new_section_resets_sticky(self):
        """Секционный заголовок обнуляет sticky — parent из предыдущей секции
        не должен протечь."""
        lines = [
            "Система общеобменной вытяжной вентиляции",
            "Воздуховод",
            "ф100",
            "м.п.",
            "1,5",
            "Клапаны на кровле (снаружи)",
            "150х100",
            "м.п.",
            "500",
        ]
        page = _make_page_with_lines(lines)
        items, section, sticky = parse_page_items(page, current_section="")
        assert len(items) == 2
        assert items[0]["name"] == "Воздуховод"
        # После смены секции sticky обнулился → name остаётся raw "150х100".
        # И sticky остаётся пустым (variant сам по себе не становится parent).
        assert items[1]["name"] == "150х100"
        assert items[1]["model_name"] == ""
        assert section == "Клапаны на кровле (снаружи)"
        assert sticky == ""

    def test_full_item_updates_sticky(self):
        """Item с многострочным name обновляет sticky → следующий variant
        прилипает к новому parent."""
        lines = [
            "Воздуховод",
            "ф100",
            "м.п.",
            "1,5",
            "Заглушка торцевая",
            "ЗТ-100",
            "шт",
            "10",
            "ф355",
            "шт",
            "5",
        ]
        page = _make_page_with_lines(lines)
        items, _s, sticky = parse_page_items(page, current_section="")
        assert len(items) == 3
        assert items[0]["name"] == "Воздуховод"
        assert items[1]["name"] == "Заглушка торцевая"  # новый parent
        # Третий item — variant ф355 → прилипает к новому sticky
        assert items[2]["name"] == "Заглушка торцевая"
        assert items[2]["model_name"] == "ф355"
        assert sticky == "Заглушка торцевая"

    def test_no_sticky_no_inheritance(self):
        """Без sticky variant-строка становится item.name, но sticky НЕ
        обновляется — иначе следующая variant приклеилась бы к ней как к
        parent, что семантически неверно."""
        page = _make_page_with_lines(["150х100", "м.п.", "500", "200х200", "м.п.", "300"])
        items, _s, sticky = parse_page_items(page, current_section="")
        assert len(items) == 2
        assert items[0]["name"] == "150х100"
        assert items[0]["model_name"] == ""
        # Второй variant НЕ приклеился к первому
        assert items[1]["name"] == "200х200"
        assert items[1]["model_name"] == ""
        assert sticky == ""


def test_units_set_nonempty():
    assert "шт" in UNITS
    assert "м.п." in UNITS


def test_extract_lines_filters_empty():
    page = _make_page_with_lines(["А", "", "Б", "   ", "В"])
    lines = extract_lines(page)
    assert all(ln.strip() for ln in lines)


# ---------------------------------------------------------------------------
# Column-aware bbox extraction (E15.04)
# ---------------------------------------------------------------------------


def _build_synthetic_page(rows: list[list[tuple[float, str]]], rotation: int = 0):
    """Создать fitz-страницу с реальным text layer.

    rows = list of «row»; каждый row = список (display_x, text), для одной y.
    Строки идут построчно (12pt спейсинг). Рисуем горизонтальный текст в
    портретной странице (rotation=0) — derotation = identity.
    """
    doc = fitz.open()
    page = doc.new_page(width=1191, height=842)
    y = 50.0
    for row in rows:
        for x, text in row:
            page.insert_text((x, y + 8), text, fontsize=10, fontname="helv")
        y += 21.0
    if rotation:
        page.set_rotation(rotation)
    return doc, page


class TestExtractStructuredRows:
    def test_basic_row_with_columns(self):
        # Шапка ЕСКД (3 маркера на одной y) + 1 data row
        doc, page = _build_synthetic_page(
            [
                # Шапка — exact-match маркеры (lower)
                [(82.0, "Pos."), (392.0, "Naimenovanie i tehnicheskaya"),
                 (665.0, "Tip, marka,"), (937.0, "Ed."), (985.0, "Kolichestvo")],
                # Data row
                [(82.0, "VD1"), (200.0, "Ventilator"), (665.0, "WNK-100"),
                 (937.0, "sht"), (985.0, "5")],
            ]
        )
        try:
            rows = extract_structured_rows(page)
            # Хотя бы один data row, и pos/name/model/unit/qty присутствуют
            data_rows = [r for r in rows if not r.is_section_heading]
            # synthetic-шрифт HELV не имеет кириллицы — для bbox-теста используем
            # ASCII-маркеры с теми же координатами; колонки определяются shift'ом
            assert len(data_rows) >= 1
            r = data_rows[-1]
            assert "VD1" in (r.cells.get("pos") or "")
            assert "Ventilator" in (r.cells.get("name") or "")
            assert "WNK-100" in (r.cells.get("model") or "")
            assert (r.cells.get("qty") or "") == "5"
        finally:
            doc.close()

    def test_empty_page_returns_empty(self):
        doc = fitz.open()
        page = doc.new_page()
        try:
            assert extract_structured_rows(page) == []
        finally:
            doc.close()

    def test_default_bounds_assign_data_correctly(self):
        # Без распознанной шапки (нет header markers) — должны сработать
        # _DEFAULT_COLUMN_BOUNDS. Проверяем что disp_x попадает в правильные колонки.
        doc, page = _build_synthetic_page(
            [
                [(82.0, "P1"), (200.0, "Name long"), (665.0, "MODEL-1"),
                 (870.0, "Brand"), (937.0, "sht"), (985.0, "10")],
            ]
        )
        try:
            rows = extract_structured_rows(page)
            data_rows = [r for r in rows if not r.is_section_heading]
            assert len(data_rows) == 1
            r = data_rows[0]
            assert r.cells.get("pos") == "P1"
            assert "Name long" in (r.cells.get("name") or "")
            assert r.cells.get("model") == "MODEL-1"
            assert r.cells.get("brand") == "Brand"
            assert r.cells.get("unit") == "sht"
            assert r.cells.get("qty") == "10"
        finally:
            doc.close()

    def test_qty_digit_is_not_filtered_as_page_number(self):
        # Регрессия: «1» в qty-колонке не должен фильтроваться как номер листа.
        doc, page = _build_synthetic_page(
            [
                [(200.0, "Ventil"), (665.0, "M1"), (937.0, "sht"), (985.0, "1")],
            ]
        )
        try:
            rows = extract_structured_rows(page)
            data_rows = [r for r in rows if not r.is_section_heading]
            assert any(r.cells.get("qty") == "1" for r in data_rows)
        finally:
            doc.close()

    def test_stamp_text_filtered(self):
        # «+10%» / шифр документа фильтруются is_stamp_text. Используем
        # ASCII-плэйсхолдеры там, где helv-шрифт не пишет кириллицу,
        # но stamp-маркеры берём из реального _STAMP_EXACT — только латиница.
        # «+10%» — типовой запас в Примечание-колонке.
        doc, page = _build_synthetic_page(
            [
                [(200.0, "Item A"), (665.0, "M-A"), (937.0, "sht"), (985.0, "2"),
                 (1125.0, "+10%")],
                [(50.0, "470-05/2025-OV2.SO"), (665.0, "999-01/2024-OV1.X")],
            ]
        )
        try:
            rows = extract_structured_rows(page)
            for r in rows:
                joined = " ".join(r.cells.values())
                assert "+10%" not in joined
                assert "470-05/2025" not in joined
        finally:
            doc.close()

    def test_multiline_name_splits_into_two_rows(self):
        # Многострочное имя в name-колонке: bbox-парсер вернёт ДВЕ row'ки
        # (одна с name+model+unit+qty, вторая с name только) — LLM-нормализация
        # склеит. Здесь проверяем именно что обе row'ки представлены raw.
        doc, page = _build_synthetic_page(
            [
                [(200.0, "Header A"), (665.0, "M1"), (937.0, "sht"), (985.0, "1")],
                [(200.0, "tail line 2")],  # продолжение name
            ]
        )
        try:
            rows = extract_structured_rows(page)
            data_rows = [r for r in rows if not r.is_section_heading]
            assert len(data_rows) >= 2
            assert data_rows[0].cells.get("model") == "M1"
            # Вторая row — только name
            assert "tail line 2" in (data_rows[1].cells.get("name") or "")
        finally:
            doc.close()


class TestIsHeaderRow:
    def test_header_row_detected(self):
        # ≥3 header marker'а → header row
        assert is_header_row({"pos": "Поз.", "name": "Наименование", "model": "Тип, марка,"})

    def test_non_header_row(self):
        assert not is_header_row({"name": "Воздуховод", "model": "ф100"})


class TestIsStampText:
    def test_strict_stamp_keywords(self):
        assert is_stamp_text("Формат А3")
        assert is_stamp_text("Изм.")
        assert is_stamp_text("Подп.")
        assert is_stamp_text("470-05/2025-ОВ2.СО")
        assert is_stamp_text("+10%")

    def test_qty_not_stamp(self):
        # Регрессия: column-aware filter не должен резать числа.
        assert not is_stamp_text("1")
        assert not is_stamp_text("58")
        assert not is_stamp_text("4900")

    def test_e15_05_extended_stamp_variants(self):
        """E15.05 it1: штамп «Взаим.инв.» / «Вз.инв.» / «Инв.№ подл.» в
        различных раскладках пунктуации (из spec-aov)."""
        assert is_stamp_text("Взаим.инв.№")
        assert is_stamp_text("Взаим. инв. №")
        assert is_stamp_text("Взаим.инв.")
        assert is_stamp_text("Вз.инв.№")
        assert is_stamp_text("Вз. инв. №")
        assert is_stamp_text("Инв. № подл.")
        assert is_stamp_text("Инв.№ подл.")
        assert is_stamp_text("Согласовано :")

    def test_stamp_regex_does_not_eat_item_name(self):
        """«Взаим.инв. № 5.6 Шпилька М8х1000» — это штамп + имя позиции в одном
        span'е. Span-level фильтр не должен его матчить целиком (чтобы не
        потерять позицию). Префикс штампа удаляет prompt-правило 7b."""
        assert not is_stamp_text("Взаим.инв. № 5.6 Шпилька М8х1000")
        assert not is_stamp_text("Шпилька М8х1000")


class TestIsSectionExtended:
    """E15.05 it1: расширенный _SECTION_RE ловит ЭОМ/автоматику/кабели +
    числовой префикс «N. », «N.N »."""

    def test_e15_05_new_sections(self):
        assert is_section_heading("Оборудование автоматизации")
        assert is_section_heading("Щитовое оборудование")
        assert is_section_heading("Кабели и провода")
        assert is_section_heading("Электроустановочные изделия")
        assert is_section_heading("Лотки")
        assert is_section_heading("Автоматика")

    def test_numeric_prefix_allowed(self):
        assert is_section_heading("1. Оборудование автоматизации")
        assert is_section_heading("2. Щитовое оборудование")
        assert is_section_heading("3. Кабели и провода")
        assert is_section_heading("3.1 Клапаны на кровле (снаружи)")
        assert is_section_heading("5. Лотки")

    def test_multiline_description_not_section(self):
        """Регрессия: многострочное продолжение имени НЕ должно считаться
        секцией (нет ни ключевого слова, ни префикса, совпадающего с разделом)."""
        assert not is_section_heading(
            "не содержащей галогенов, не выделяющей коррозионно-активных газообразных"
        )
        assert not is_section_heading("продуктов при горении и тлении, ГОСТ 31996-2012")


# ---------------------------------------------------------------------------
# E15.05 it2 — R23 multi-row header + R24 span-join x-gap + R25 stamp cells
# ---------------------------------------------------------------------------


class TestConcatHeaderFragments:
    """R23: склейка вертикальных фрагментов шапки с word-dash rule."""

    def test_word_concat_with_dash(self):
        from app.services.pdf_text import _concat_header_fragments, _Span

        spans = [
            _Span(text="оборудо-", disp_x=100.0, disp_y=10.0, width=40.0,
                  size=10.0, flags=0, is_bold=False),
            _Span(text="вания", disp_x=100.0, disp_y=22.0, width=30.0,
                  size=10.0, flags=0, is_bold=False),
        ]
        assert _concat_header_fragments(spans) == "оборудования"

    def test_concat_without_dash_uses_space(self):
        from app.services.pdf_text import _concat_header_fragments, _Span

        spans = [
            _Span(text="Тип, марка,", disp_x=100.0, disp_y=10.0, width=60.0,
                  size=10.0, flags=0, is_bold=False),
            _Span(text="обозначение документа", disp_x=100.0, disp_y=22.0,
                  width=120.0, size=10.0, flags=0, is_bold=False),
        ]
        merged = _concat_header_fragments(spans)
        assert merged == "Тип, марка, обозначение документа"

    def test_multi_row_6_fragments(self):
        from app.services.pdf_text import _concat_header_fragments, _Span

        # ЕСКД шапка «Завод-изготовитель» через 3 переноса.
        spans = [
            _Span(text="Завод-", disp_x=100.0, disp_y=10.0, width=40.0,
                  size=10.0, flags=0, is_bold=False),
            _Span(text="изгото-", disp_x=100.0, disp_y=22.0, width=35.0,
                  size=10.0, flags=0, is_bold=False),
            _Span(text="витель", disp_x=100.0, disp_y=34.0, width=35.0,
                  size=10.0, flags=0, is_bold=False),
        ]
        merged = _concat_header_fragments(spans)
        assert merged == "Завод-изготовитель" or merged == "Заводизготовитель"

    def test_long_dash_not_concat(self):
        """Длинное тире `—` НЕ триггерит dash-concat — только обычный `-`."""
        from app.services.pdf_text import _concat_header_fragments, _Span

        spans = [
            _Span(text="A —", disp_x=100.0, disp_y=10.0, width=30.0,
                  size=10.0, flags=0, is_bold=False),
            _Span(text="B", disp_x=100.0, disp_y=22.0, width=10.0,
                  size=10.0, flags=0, is_bold=False),
        ]
        assert _concat_header_fragments(spans) == "A — B"


class TestMatchColumnFromMergedText:
    """R23: сопоставление склеенного текста шапки с column key."""

    def test_manufacturer_beats_brand(self):
        from app.services.pdf_text import _match_column_from_merged_text

        # «Завод-изготовитель» → manufacturer (не brand).
        assert _match_column_from_merged_text("Завод-изготовитель") == "manufacturer"
        assert _match_column_from_merged_text("Производитель") == "manufacturer"

    def test_brand_patterns(self):
        from app.services.pdf_text import _match_column_from_merged_text

        assert _match_column_from_merged_text("Поставщик") == "brand"
        assert _match_column_from_merged_text("Код продукции") == "brand"

    def test_name_patterns(self):
        from app.services.pdf_text import _match_column_from_merged_text

        assert _match_column_from_merged_text(
            "Наименование и техническая характеристика"
        ) == "name"
        assert _match_column_from_merged_text("Наименование") == "name"

    def test_model_patterns(self):
        from app.services.pdf_text import _match_column_from_merged_text

        assert _match_column_from_merged_text("Тип, марка, обозначение документа") == "model"

    def test_unit_patterns(self):
        from app.services.pdf_text import _match_column_from_merged_text

        assert _match_column_from_merged_text("Ед. изм.") == "unit"
        assert _match_column_from_merged_text("Единица измерения") == "unit"

    def test_qty_patterns(self):
        from app.services.pdf_text import _match_column_from_merged_text

        assert _match_column_from_merged_text("Количество") == "qty"

    def test_no_match_returns_none(self):
        from app.services.pdf_text import _match_column_from_merged_text

        assert _match_column_from_merged_text("Вентилятор дымоудаления") is None
        assert _match_column_from_merged_text("") is None


class TestJoinSpansWithGap:
    """R24: span-join без лишних пробелов через x-gap."""

    def test_close_spans_no_space(self):
        from app.services.pdf_text import _join_column_spans_with_gap, _Span

        # «3» + «0» + «0» с gap=1pt при font_size=10 → threshold=3pt → concat.
        spans = [
            _Span(text="3", disp_x=100.0, disp_y=10.0, width=6.0,
                  size=10.0, flags=0, is_bold=False),
            _Span(text="0", disp_x=107.0, disp_y=10.0, width=6.0,
                  size=10.0, flags=0, is_bold=False),
            _Span(text="0", disp_x=114.0, disp_y=10.0, width=6.0,
                  size=10.0, flags=0, is_bold=False),
        ]
        assert _join_column_spans_with_gap(spans, 10.0) == "300"

    def test_far_spans_with_space(self):
        from app.services.pdf_text import _join_column_spans_with_gap, _Span

        # «Pc=300» + «Па» с gap=4pt при font_size=10 → threshold=3pt → space.
        spans = [
            _Span(text="Pc=300", disp_x=100.0, disp_y=10.0, width=40.0,
                  size=10.0, flags=0, is_bold=False),
            _Span(text="Па", disp_x=144.0, disp_y=10.0, width=15.0,
                  size=10.0, flags=0, is_bold=False),
        ]
        assert _join_column_spans_with_gap(spans, 10.0) == "Pc=300 Па"

    def test_pc_300_regression(self):
        """QA-FINDINGS-2026-04-22 #38: «Pc=3 0 0 Па» → «Pc=300 Па»."""
        from app.services.pdf_text import _join_column_spans_with_gap, _Span

        # Реалистичный пример: 5 кернинг-spans формируют «Pc=300 Па».
        spans = [
            _Span(text="Pc=", disp_x=100.0, disp_y=10.0, width=18.0,
                  size=10.0, flags=0, is_bold=False),
            _Span(text="3", disp_x=118.0, disp_y=10.0, width=6.0,
                  size=10.0, flags=0, is_bold=False),
            _Span(text="0", disp_x=124.5, disp_y=10.0, width=6.0,
                  size=10.0, flags=0, is_bold=False),
            _Span(text="0", disp_x=131.0, disp_y=10.0, width=6.0,
                  size=10.0, flags=0, is_bold=False),
            _Span(text="Па", disp_x=141.0, disp_y=10.0, width=15.0,
                  size=10.0, flags=0, is_bold=False),
        ]
        joined = _join_column_spans_with_gap(spans, 10.0)
        # Допускаем «Pc=300Па» или «Pc=300 Па» — ключевое, что «3 0 0» схлопнулись.
        assert "3 0 0" not in joined
        assert "300" in joined

    def test_single_span(self):
        from app.services.pdf_text import _join_column_spans_with_gap, _Span

        s = _Span(text="Вентилятор", disp_x=100.0, disp_y=10.0, width=50.0,
                  size=10.0, flags=0, is_bold=False)
        assert _join_column_spans_with_gap([s], 10.0) == "Вентилятор"

    def test_empty_list(self):
        from app.services.pdf_text import _join_column_spans_with_gap

        assert _join_column_spans_with_gap([], 10.0) == ""


class TestIsStampCell:
    """R25: расширенный штамп-фильтр на уровне ячеек."""

    def test_date_signature_stamps(self):
        from app.services.pdf_text import is_stamp_cell

        assert is_stamp_cell("Дата и подпись")
        assert is_stamp_cell("Код уч № док")

    def test_inv_variations(self):
        from app.services.pdf_text import is_stamp_cell

        assert is_stamp_cell("Инв.№ подп.")
        assert is_stamp_cell("Инв. № подп.")
        assert is_stamp_cell("Инв.№ подл.")

    def test_raschet_fasonnyh(self):
        from app.services.pdf_text import is_stamp_cell

        # Artefact из правой подписи штампа.
        assert is_stamp_cell("Расчет фасонных деталей")

    def test_specifikatsia_oborudovania(self):
        from app.services.pdf_text import is_stamp_cell

        assert is_stamp_cell("Спецификация оборудования")

    def test_real_item_not_stamp(self):
        from app.services.pdf_text import is_stamp_cell

        # Защита от ложноположительных (item names не должны матчиться).
        assert not is_stamp_cell("Вентилятор канальный")
        assert not is_stamp_cell("Клапан противопожарный")
        assert not is_stamp_cell("KLR-DU-400")
        assert not is_stamp_cell("1")
        assert not is_stamp_cell("58")


class TestNormalizeSectionName:
    """R26: нормализация section_name (trailing :/—/-)."""

    def test_trailing_colon_removed(self):
        from app.services.spec_normalizer import _normalize_section_name

        assert _normalize_section_name("Вентиляция :") == "Вентиляция"
        assert _normalize_section_name("Кондиционирование: ") == "Кондиционирование"
        assert _normalize_section_name("Отопление:") == "Отопление"

    def test_trailing_dash_removed(self):
        from app.services.spec_normalizer import _normalize_section_name

        assert _normalize_section_name("Вентиляция —") == "Вентиляция"
        assert _normalize_section_name("Вентиляция -") == "Вентиляция"

    def test_multiple_trailing_chars_removed(self):
        from app.services.spec_normalizer import _normalize_section_name

        assert _normalize_section_name("Вентиляция : -") == "Вентиляция"

    def test_internal_colon_preserved(self):
        """Двоеточие/тире в середине секции не трогаются."""
        from app.services.spec_normalizer import _normalize_section_name

        assert (
            _normalize_section_name("Клапаны: на кровле")
            == "Клапаны: на кровле"
        )

    def test_empty(self):
        from app.services.spec_normalizer import _normalize_section_name

        assert _normalize_section_name("") == ""
        assert _normalize_section_name("   ") == ""


class TestLooksLikeSectionHeading:
    """E15.05 it1: структурная эвристика для числовых-префиксных секций."""

    def test_numeric_prefix_short_name_only(self):
        from app.services.pdf_text import _looks_like_section_heading

        assert _looks_like_section_heading(
            {"name": "1. Оборудование автоматизации"}, []
        )
        assert _looks_like_section_heading(
            {"name": "5. Лотки"}, []
        )
        assert _looks_like_section_heading(
            {"name": "3.2 Кабели и провода"}, []
        )

    def test_rejects_multiline_description(self):
        """Продолжение имени («продуктов при горении...») без числового префикса
        НЕ попадает в секции — защита от ложного склеивания."""
        from app.services.pdf_text import _looks_like_section_heading

        assert not _looks_like_section_heading(
            {"name": "продуктов при горении и тлении, ГОСТ 31996-2012"}, []
        )
        assert not _looks_like_section_heading(
            {"name": "не содержащей галогенов, не выделяющей коррозионно-активных"}, []
        )

    def test_rejects_full_item_row(self):
        from app.services.pdf_text import _looks_like_section_heading

        # Row с brand/unit/qty — это item, не секция.
        assert not _looks_like_section_heading(
            {
                "name": "1.1 Комплект автоматизации",
                "brand": "КОРФ",
                "unit": "шт.",
                "qty": "1,00",
            },
            [],
        )

    def test_rejects_too_long_name(self):
        from app.services.pdf_text import _looks_like_section_heading

        long_name = "1. " + "x" * 90
        assert not _looks_like_section_heading({"name": long_name}, [])

    def test_empty_cells_rejected(self):
        from app.services.pdf_text import _looks_like_section_heading

        assert not _looks_like_section_heading({}, [])
        assert not _looks_like_section_heading({"name": ""}, [])

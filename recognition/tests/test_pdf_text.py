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
        assert is_stamp_line("2024г.")

    def test_plus_percent_is_not_stamp(self):
        # E15-06 (#54): «+10%» это валидное значение колонки «Примечание»
        # (запас/резерв на монтаж), не элемент штампа. Должно долетать до
        # cells.comments → items[].comments.
        assert not is_stamp_line("+10%")
        assert not is_stamp_line("+5%")

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

    def test_td03_extended_sections(self):
        """DEV-BACKLOG #15: новые разделы (non-ОВиК + ЕСКД-аббревиатуры)."""
        # Обычные слова-разделы.
        assert is_section_heading("Канализация внутренняя")
        assert is_section_heading("Вентиляция приточная")
        assert is_section_heading("Электроосвещение")
        assert is_section_heading("Электрооборудование")
        assert is_section_heading("Теплоснабжение")
        assert is_section_heading("Пожаротушение водяное")
        assert is_section_heading("Дренаж кондиционеров")
        # Аббревиатуры ЕСКД с контекстом.
        assert is_section_heading("Раздел ЭОМ")
        assert is_section_heading("Марка комплекта СС")
        assert is_section_heading("Комплект АОВ")
        assert is_section_heading("Раздел ИТП")
        # Аббревиатура как заголовок страницы.
        assert is_section_heading("ЭОМ. Электрооборудование")
        assert is_section_heading("АОВ. Автоматизация")

    def test_td03_extended_sections_negatives(self):
        """DEV-BACKLOG #15: расширение не должно ловить item-имена."""
        # Вентилятор (не «Вентиляция») — граница слова \b защищает.
        assert not is_section_heading("Вентилятор канальный ВК-100")
        # ЭОМ-кабель без точки+пробела после — не заголовок.
        assert not is_section_heading("ЭОМ-кабель")
        # Просто «ЭОМ» без контекста — не заголовок (нужен Раздел/Комплект/точка).
        assert not is_section_heading("ЭОМ")


class TestStampExactShortTokens:
    """DEV-BACKLOG #14: короткие exact-match токены (А3/А4/Р/во/ния) не должны
    ложно срабатывать на item-именах и моделях с похожими короткими подстроками."""

    def test_model_with_short_token_is_not_stamp(self):
        # «ИП-55» — фрагмент обозначения, не штамп. Exact-match гарантирует,
        # что «ИП-55» != «ИП», даже если «ИП» вдруг появится в _STAMP_EXACT.
        assert not is_stamp_line("ИП-55")
        # «А3-формат» длиннее «А3» — exact-match не матчит.
        assert not is_stamp_line("А3-формат")
        # «Резерв» начинается с «Р», но длиннее — exact-match не срабатывает.
        assert not is_stamp_line("Резерв")
        # «ГИПС» длиннее «ГИП» — safe.
        assert not is_stamp_line("ГИПС")
        # «Решётка» начинается с «Р» — не матчит как exact.
        assert not is_stamp_line("Решётка")

    def test_bare_short_tokens_still_match(self):
        # При этом «голый» штамп («Лист», «А3») всё ещё ловится — контракт сохранён.
        assert is_stamp_line("Лист")
        assert is_stamp_line("А3")
        assert is_stamp_line("ГИП")


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


def _build_synthetic_page(
    rows: list[list[tuple[float, str]]],
    rotation: int = 0,
    row_y_step: float = 21.0,
    cluster_gap: float | None = None,
):
    """Создать fitz-страницу с реальным text layer.

    rows = list of «row»; каждый row = список (display_x, text), для одной y.
    `row_y_step` — расстояние между rows (по умолчанию 21pt — discrete clusters).
    `cluster_gap` — если задан, после каждых 3 rows вставляется большой gap
    `cluster_gap`pt — позволяет создавать несколько отдельных visual clusters.
    """
    doc = fitz.open()
    page = doc.new_page(width=1191, height=842)
    y = 50.0
    for idx, row in enumerate(rows):
        for x, text in row:
            page.insert_text((x, y + 8), text, fontsize=10, fontname="helv")
        if cluster_gap is not None and (idx + 1) % 3 == 0 and idx + 1 < len(rows):
            y += cluster_gap
        else:
            y += row_y_step
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
        # E15-06 (#54): шифр документа фильтруется is_stamp_text, а «+10%» —
        # валидное значение колонки comments и должно сохраняться.
        doc, page = _build_synthetic_page(
            [
                [(200.0, "Item A"), (665.0, "M-A"), (937.0, "sht"), (985.0, "2"),
                 (1125.0, "+10%")],
                [(50.0, "470-05/2025-OV2.SO"), (665.0, "999-01/2024-OV1.X")],
            ]
        )
        try:
            rows = extract_structured_rows(page)
            # row[1] полностью штамп → отброшен.
            data_rows = [r for r in rows if not r.is_section_heading]
            assert len(data_rows) == 1, (
                f"ожидаем 1 item row + штамп отфильтрован, got {len(data_rows)}"
            )
            row = data_rows[0]
            # «+10%» должен попасть в cells.comments (крайняя правая колонка).
            assert row.cells.get("comments") == "+10%", (
                f"«+10%» должно сохраниться в comments, got {row.cells}"
            )
            # Шифр документа — не в cells.
            for r in rows:
                joined = " ".join(r.cells.values())
                assert "470-05/2025" not in joined
        finally:
            doc.close()

    def test_multiline_name_absorbed_into_main(self):
        # E20-1 Class E (cluster-merge): multi-line name continuation absorb-ится
        # в main row если Δy между rows ≤ _CLUSTER_Y_GAP_THRESHOLD (visual
        # cluster). До E20-1 эти rows оставались split, LLM склеивала post-process;
        # теперь склейка делается pre-LLM, чтобы LLM получала чистую row на item.
        doc, page = _build_synthetic_page(
            [
                [(200.0, "Header A"), (665.0, "M1"), (937.0, "sht"), (985.0, "1")],
                [(200.0, "tail line 2")],  # продолжение name (Δy ~14pt)
            ],
            row_y_step=14.0,  # внутри _CLUSTER_Y_GAP_THRESHOLD
        )
        try:
            rows = extract_structured_rows(page)
            data_rows = [r for r in rows if not r.is_section_heading]
            # Cluster-merge склеил multi-line name в один row.
            assert len(data_rows) == 1
            assert data_rows[0].cells.get("model") == "M1"
            assert "Header A" in (data_rows[0].cells.get("name") or "")
            assert "tail line 2" in (data_rows[0].cells.get("name") or "")
        finally:
            doc.close()


class TestE201Fixes:
    """E20-1: Spec-4 pre-LLM pipeline fixes (Class E + Class B+F)."""

    def test_merge_multiline_model_codes_smesitelnyj_uzel(self):
        """Class E: модель «MUB.L.04.04.B.CP.TM.NS.\\n159485.1» на 2 PDF-строках
        (Spec-4 стр 83 «Смесительный узел для П2В2») склеивается в один row.

        Pre-fix: 3 row pre-LLM (model-prefix, main, model-suffix) → +2 phantom после LLM.
        Post-fix: 1 row с model = «MUB.L.04.04.B.CP.TM.NS. 159485.1».
        """
        doc, page = _build_synthetic_page(
            [
                # Model-prefix row (orphan: только model, без name/qty).
                [(665.0, "MUB.L.04.04.B.CP.TM.NS.")],
                # Main row (name + qty + unit).
                [(200.0, "Smesitelnyj uzel dlya P2V2"), (937.0, "kompl"), (985.0, "1")],
                # Model-suffix row (orphan: только model).
                [(665.0, "159485.1")],
            ],
            row_y_step=12.0,  # внутри _CLUSTER_Y_GAP_THRESHOLD (15pt)
        )
        try:
            rows = extract_structured_rows(page)
            data_rows = [r for r in rows if not r.is_section_heading]
            assert len(data_rows) == 1, f"expected 1 row after merge, got {len(data_rows)}: {[r.cells for r in data_rows]}"
            r = data_rows[0]
            assert "Smesitelnyj uzel" in (r.cells.get("name") or "")
            model = r.cells.get("model") or ""
            assert "MUB.L.04.04" in model
            assert "159485.1" in model
            assert (r.cells.get("qty") or "") == "1"
        finally:
            doc.close()

    def test_merge_klop_two_row_pattern_three_rows(self):
        """Class B+F (page 15): КЛОП на 3 visual row (name+model + orphan-main qty/unit/mfr +
        name-tail+model-tail) → склеивается в один main row без phantom rows.

        Используем `brand` column для mfr (synthetic page без header — fallback на
        _DEFAULT_COLUMN_BOUNDS, где «manufacturer» не выделена отдельно от «brand»).
        Логика _absorb_into_main одинакова для placeholder в любой колонке.
        """
        doc, page = _build_synthetic_page(
            [
                # row 0: name + model (КЛОП-prefix), placeholder mfr.
                [(200.0, "Klapan protivopozharnyj kanalnyj, normalno otkrytyj"),
                 (665.0, "KLOP-2(90)-NO-300x300"),
                 (870.0, "-")],
                # row 1: orphan_main (только qty/unit/mfr).
                [(870.0, "VINGS-M"), (937.0, "sht"), (985.0, "1")],
                # row 2: name-tail + model-tail (КЛОП-suffix).
                [(200.0, "(NO), privod klapana snaruzhi"),
                 (665.0, "MV/S(220)-K")],
            ],
            row_y_step=12.0,  # внутри _CLUSTER_Y_GAP_THRESHOLD
        )
        try:
            rows = extract_structured_rows(page)
            data_rows = [r for r in rows if not r.is_section_heading]
            assert len(data_rows) == 1, f"expected 1 row after merge, got {len(data_rows)}: {[r.cells for r in data_rows]}"
            r = data_rows[0]
            name = r.cells.get("name") or ""
            assert "Klapan protivopozharnyj" in name
            assert "(NO)" in name
            model = r.cells.get("model") or ""
            assert "KLOP-2" in model
            assert "MV/S" in model
            # placeholder mfr «-» в row 0 заменён реальным «VINGS-M» из orphan_main row.
            assert "VINGS-M" in (r.cells.get("brand") or "")
            assert (r.cells.get("qty") or "") == "1"
            assert (r.cells.get("unit") or "") == "sht"
        finally:
            doc.close()

    def test_klop_clusters_dont_merge_across_visual_gap(self):
        """Защита от over-merge: два разных КЛОП-item с большим Δy между кластерами
        НЕ должны склеиться в один row.
        """
        doc, page = _build_synthetic_page(
            [
                # КЛОП #1 (cluster 1, y=100-115)
                [(200.0, "Klapan protivopozharnyj kanalnyj, normalno otkrytyj"),
                 (665.0, "KLOP-2(90)-NO-300x300"), (870.0, "-")],
                [(870.0, "VINGS-M"), (937.0, "sht"), (985.0, "1")],
                [(200.0, "(NO), privod klapana"), (665.0, "MV/S(220)-K")],
                # КЛОП #2 (cluster 2, y отстоит >20pt от cluster 1 — явный визуальный разрыв)
                [(200.0, "Klapan protivopozharnyj kanalnyj, normalno otkrytyj"),
                 (665.0, "KLOP-2(90)-NO-400x400"), (870.0, "-")],
                [(870.0, "VINGS-M"), (937.0, "sht"), (985.0, "2")],
                [(200.0, "(NO), privod klapana"), (665.0, "MV/S(220)-K")],
            ],
            row_y_step=14.0,  # внутри cluster
            cluster_gap=40.0,  # между КЛОП #1 и КЛОП #2 — явный визуальный разрыв
        )
        try:
            rows = extract_structured_rows(page)
            data_rows = [r for r in rows if not r.is_section_heading]
            assert len(data_rows) == 2, f"expected 2 КЛОП rows, got {len(data_rows)}: {[r.cells for r in data_rows]}"
            assert "300x300" in (data_rows[0].cells.get("model") or "")
            assert "400x400" in (data_rows[1].cells.get("model") or "")
        finally:
            doc.close()

    def test_bbox_column_alignment_preserves_correct_qty(self):
        """Class L (BBOX_COLUMN_BLEED, аудит-tracker стр 7 item #103): bbox-extractor
        корректно ассигнирует qty/unit к row с правильным name. Тест воспроизводит
        ситуацию «Фасонные изделия (30%) qty=60», «То же 1200х800 qty=13» —
        каждая qty должна остаться на своей row, без bleed на соседнюю.

        Pre-LLM rows на реальной Spec-4 page 7 — корректные. Class L (qty=13 на row
        Фасонных вместо qty=60) — это bug LLM-нормализации, а не bbox extraction.
        Этот тест документирует контракт pre-LLM stage.
        """
        doc, page = _build_synthetic_page(
            [
                # «То же 1200х800 δ=0,9мм» — qty=9
                [(200.0, "Toze 1200x800"), (665.0, "GOST 14918-80"),
                 (937.0, "p.m."), (985.0, "9")],
                # «То же 1200х600 δ=0,9мм» — qty=13
                [(200.0, "Toze 1200x600"), (665.0, "GOST 14918-80"),
                 (937.0, "p.m."), (985.0, "13")],
                # «Фасонные изделия (30%)» — qty=60
                [(200.0, "Fasonnye izdeliya (30%)"), (937.0, "m2"), (985.0, "60")],
            ],
            row_y_step=23.0,  # большой gap → разные cluster, не merge.
        )
        try:
            rows = extract_structured_rows(page)
            data_rows = [r for r in rows if not r.is_section_heading]
            assert len(data_rows) == 3
            assert (data_rows[0].cells.get("qty") or "") == "9"
            assert (data_rows[1].cells.get("qty") or "") == "13"
            assert (data_rows[2].cells.get("qty") or "") == "60"
            # Фасонные имеют unit=м², НЕ п.м. от соседней row.
            assert "m2" in (data_rows[2].cells.get("unit") or "")
        finally:
            doc.close()

    def test_obm_vent_continuation_not_absorbed_into_neighbour(self):
        """E20-1 retrofit (PR #2 review regression): длинное многострочное
        описание ОБМ-Вент огнезащитного покрытия НЕ должно приклеиться к
        соседнему main row (например Самоклеющая лента).

        Прямой вызов _merge_cluster_into_main с TableRow в кириллице (fitz/helv
        не рендерит кириллицу — тестируем функцию напрямую).
        """
        from app.services.pdf_text import TableRow, _merge_cluster_into_main
        rows = [
            TableRow(
                page_number=1, y_mid=100.0, row_index=0,
                cells={
                    "name": "Самоклеющая лента ROCKWOOL для теплозащитного покрытия воздуховодов",
                    "unit": "п.м.", "qty": "130",
                },
            ),
            # continuation от ВЫШЕ-расположенного ОБМ-Вент item — должен SKIP
            # (находится "ниже" main по индексу cluster, но симулирует случай
            # когда orphan ВЫШЕ main, через позицию индекса в cluster).
            TableRow(
                page_number=1, y_mid=88.0, row_index=1,
                cells={"name": "ванный обкладочным материалом из алюминиевой фольги"},
            ),
            TableRow(
                page_number=1, y_mid=80.0, row_index=2,
                cells={"name": "щего компонента в системах комплексной огнезащиты"},
            ),
        ]
        # Cluster ordered by index. main_idx=0 (главный — Самоклеющая лента).
        # j=1, j=2: оба «> main_idx» в индексе но физически ВЫШЕ по y_mid.
        # Защита смотрит на индекс cluster — для этого теста используем
        # обратный порядок rows.
        rows_reversed = [rows[2], rows[1], rows[0]]
        cluster = [0, 1, 2]
        main_idx = 2  # main в конце cluster (orphan-rows ВЫШЕ)
        absorbed = _merge_cluster_into_main(rows_reversed, cluster, main_idx)
        # Защита должна skip continuation rows.
        assert absorbed == [], f"continuation rows ВЫШЕ main с blacklist-pattern должны SKIP, got: {absorbed}"
        # main.name остался без continuation.
        name = rows_reversed[main_idx].cells.get("name", "")
        assert "Самоклеющая лента" in name
        assert "ванный обкладочным" not in name
        assert "щего компонента" not in name

    def test_klop_continuation_morozostoykoe_correct_y_order(self):
        """E20-1 retrofit: КЛОП cluster на page 76 склеивается в y-order
        даже когда фрагменты ВЫШЕ и НИЖЕ main — orphan_main (qty/unit/mfr).

        Page 76 ПД14 КЛОП:
          row 0: «Клапан противопожарный стеновой...» (bare-name)
          row 1: «розостойкое исполнение...», model «КЛОП-4(120)-НЗ-МС-С-»
          row 2: qty/unit/mfr (orphan_main proxy)
          row 3: «нормально закрытый (НЗ)...», model «700х700-MBE/S(220)-ВН»
          row 4: «термоизоляцией» (bare-name continuation)
        Result: один row с name «Клапан … розостойкое … нормально закрытый … термоизоляцией».
        """
        from app.services.pdf_text import TableRow, _merge_cluster_into_main
        rows = [
            TableRow(
                page_number=1, y_mid=178.0, row_index=0,
                cells={"name": "Клапан противопожарный стеновой, без вылета заслонок, мо-"},
            ),
            TableRow(
                page_number=1, y_mid=191.84, row_index=1,
                cells={
                    "name": "розостойкое исполнение  с огнестойкостью 120мин (EI120),",
                    "model": "КЛОП-4(120)-НЗ-МС-С-",
                },
            ),
            TableRow(
                page_number=1, y_mid=198.77, row_index=2,
                cells={"manufacturer": "ЗАО \"BИНГС-М\"", "unit": "шт.", "qty": "1"},
            ),
            TableRow(
                page_number=1, y_mid=205.64, row_index=3,
                cells={
                    "name": "нормально закрытый (НЗ), привод клапана внутри, заслонки с",
                    "model": "700х700-MBE/S(220)-ВН",
                },
            ),
            TableRow(
                page_number=1, y_mid=219.44, row_index=4,
                cells={"name": "термоизоляцией"},
            ),
        ]
        cluster = [0, 1, 2, 3, 4]
        main_idx = 2  # orphan_main (qty/unit/mfr) — proxy main
        absorbed = _merge_cluster_into_main(rows, cluster, main_idx)
        # Все 4 не-main rows должны быть absorbed.
        assert sorted(absorbed) == [0, 1, 3, 4], f"ожидаем absorb всех 4 rows, got: {absorbed}"
        main = rows[main_idx]
        name = main.cells.get("name", "")
        idx_klapan = name.find("Клапан")
        idx_rozost = name.find("розостойкое")
        idx_normal = name.find("нормально закрытый")
        idx_termo = name.find("термоизоляцией")
        assert all(i != -1 for i in (idx_klapan, idx_rozost, idx_normal, idx_termo)), (
            f"все 4 части name должны быть в результате, got: {name}"
        )
        assert idx_klapan < idx_rozost < idx_normal < idx_termo, (
            f"name parts не в y-order: {name}"
        )
        # model склеена: «КЛОП-...» (ends '-') + «700х700-MBE/S(220)-ВН» = склейка inline.
        model = main.cells.get("model", "")
        assert "КЛОП-4" in model
        assert "MBE/S" in model
        # placeholder mfr/unit/qty взяты из orphan_main row (row 2).
        assert main.cells.get("qty") == "1"
        assert main.cells.get("unit") == "шт."

    def test_running_name_threshold_blocks_below_threshold(self):
        """Защита от over-merge: если main.name (running) > 80 chars и orphan
        начинается с lowercase Cyrillic — skip (явная continuation предыдущего)."""
        from app.services.pdf_text import (
            TableRow, _merge_cluster_into_main, _MAIN_NAME_COMPLETE_THRESHOLD,
        )
        long_name_part = "Огнезащитное покрытие воздуховодов системы вентиляции с" \
                         " теплоизоляцией базальтовой марки"
        assert len(long_name_part) > _MAIN_NAME_COMPLETE_THRESHOLD
        rows = [
            TableRow(
                page_number=1, y_mid=80.0, row_index=0,
                cells={"name": long_name_part},  # accumulator above main
            ),
            TableRow(
                page_number=1, y_mid=92.0, row_index=1,
                cells={"name": "ванный обкладочным материалом"},  # blacklist + lowercase
            ),
            TableRow(
                page_number=1, y_mid=104.0, row_index=2,
                cells={"name": "Самоклеющая лента", "unit": "п.м.", "qty": "60"},
            ),
        ]
        cluster = [0, 1, 2]
        main_idx = 2
        absorbed = _merge_cluster_into_main(rows, cluster, main_idx)
        # row 1 (continuation) должен быть SKIPped: main running name >80, lowercase + blacklist.
        assert 1 not in absorbed, f"continuation '{rows[1].cells['name']}' должна SKIP, got absorbed={absorbed}"


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

    def test_plus_percent_is_not_stamp(self):
        # E15-06 (#54): запасные проценты в колонке Примечание.
        assert not is_stamp_text("+10%")
        assert not is_stamp_text("+5%")
        assert not is_stamp_text("+100%")

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

    def test_trailing_dot_removed(self):
        """TD-01: точка в конце секции (spec-ov2 «Жилая часть.»)."""
        from app.services.spec_normalizer import _normalize_section_name

        assert _normalize_section_name("Жилая часть.") == "Жилая часть"
        assert _normalize_section_name("Офисная часть .") == "Офисная часть"
        assert _normalize_section_name("Foo:") == "Foo"
        assert _normalize_section_name("Bar,.") == "Bar"
        assert _normalize_section_name("Baz") == "Baz"

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

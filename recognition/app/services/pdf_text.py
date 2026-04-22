"""Text-layer parser для PDF-спецификаций — без LLM.

Два режима:

1. **Column-aware bbox extraction** (`extract_structured_rows`, E15.04) —
   парсит span'ы страницы, применяет `rotation_matrix`, кластеризует по y
   в визуальные row'ы, по x — в колонки. Возвращает `list[TableRow]`,
   который `SpecParser._normalize_via_llm` нормализует через gpt-4o-mini.
   Основной путь для ЕСКД-таблиц.

2. **Legacy line-based эвристика** (`parse_page_items`) — читает лайны
   reading-order, якорь по unit+qty. Используется как fallback, когда
   LLM недоступен (нет OPENAI_API_KEY) или column-aware извлекло 0 rows.

Общий фильтр штампов ЕСКД (`is_stamp_line`, `_STAMP_EXACT`) применяется в
обоих путях. Secondary fallback на LLM Vision — когда text-layer в принципе
нет (скан).
"""

import re
from dataclasses import dataclass, field
from typing import Any

# Единая точка истины для порога text layer — используется SpecParser'ом при
# выборе hybrid/vision пути И endpoint'ом /v1/probe при оценке времени.
# 50 симв/стр — консервативно: у нативных ОВиК-специфик 500-2000 на страницу,
# у сканов/watermark — 0-20. Значение <50 = страница не пригодна для text-layer
# парсинга, уходит в Vision.
TEXT_LAYER_MIN_CHARS_PER_PAGE = 50

# Канонические единицы измерения (сравнение по lower()).
UNITS: set[str] = {
    "шт",
    "шт.",
    "м",
    "м.",
    "м.п.",
    "мп",
    "м.кв.",
    "м2",
    "м.куб.",
    "м3",
    "кг",
    "т",
    "комплект",
    "компл",
    "компл.",
    "к-т",
    "уп",
    "пар",
    "л",
}

# Строки, которые являются штампами чертежа или заголовками колонок.
# Используется точное совпадение после strip — подстрочное сравнение давало
# ложные срабатывания ("во" в «Противодымная» и пр.).
_STAMP_EXACT: set[str] = {
    "Формат А3",
    "Формат А4",
    "Формат А2",
    "Изм.",
    "Кол.уч.",
    "Подп.",
    "№ док.",
    "Разраб.",
    "Проверил",
    "Н. контр.",
    "Нач. отд.",
    "ГИП",
    "Стадия",
    "Листов",
    "Лист",
    "Дата",
    "Взам. инв. №",
    "Взаим. инв. №",
    "Взаим.инв. №",
    "Взаим.инв.№",
    "Взаим. инв.",
    "Взаим.инв.",
    "Вз. инв. №",
    "Вз.инв. №",
    "Вз.инв.№",
    "Вз. инв.",
    "Вз.инв.",
    "Подп. и дата",
    "Инв. № подл.",
    "Инв.№ подл.",
    "Согласовано :",
    "Согласовано:",
    "Поз.",
    "характеристика",
    "Тип, марка,",
    "обозначение",
    "документа,",
    "опросного листа",
    "Код",
    "продукции",
    "Поставщик",
    "Ед.",
    "изме-",
    "ре-",
    "ния",
    "Коли-",
    "чест-",
    "во",
    "Масса",
    "1 ед.,",
    "Приме-",
    "чание",
    "Наименование и техническая",
    "Спецификация оборудования,",
    "изделий и материалов",
    "А3",
    "А4",
    "А2",
    "Р",
}

# Начало секционного заголовка — слова с высокой «sectional» сигнальностью.
# Допустимый числовой префикс в начале строки («1.», «2.1», «3. Раздел») —
# в ЕСКД-спецификациях разделы часто нумеруются.
# Держим список коротким: ложноположительный section важнее пропущенного.
_SECTION_RE = re.compile(
    r"^(?:\d+(?:\.\d+)*\.?\s+)?"  # опциональный префикс "1. ", "2.1 ", "3.1.1 "
    r"(?:Система\s|Клапаны\s|Противодымная\b|Противодымной\b|Общеобменн"
    r"|Воздуховоды\s|Воздуховод\s+приточной"
    r"|Слаботочн|Отопление\s|Кондиционирован|Дымоудален|Приточная\s|Вытяжная\s"
    # E15.05 расширения из spec-aov (ЭОМ/автоматика/кабели):
    r"|Оборудование\s+автоматизации|Щитовое\s+оборудование"
    r"|Кабели\s+и\s+провода|Электроустановочные\s+изделия|Лотки\b"
    # Общие ОВиК/СС разделы (встречаются во многих PDF):
    r"|Фасонные\s|Трубопроводы\s|Арматура\s|Холодоснабжение|Водоснабжение"
    r"|Электроснабжение|Силовое|Автоматика\b)",
    re.IGNORECASE,
)

# Строгий числовой префикс («1.», «2.1», «3. », «4.2.1 ») — используется
# `_looks_like_section_heading` как безопасный сигнал: такой префикс в
# середине многострочного описания не появляется, только в оглавлениях
# разделов. Требование префикса + малая длина защищает от ложных срабатываний
# на продолжениях имени («продуктов при горении и тлении, ГОСТ 31996-2012»).
_NUMERIC_SECTION_PREFIX_RE = re.compile(r"^\d+(?:\.\d+)*\.?\s+\S")

# Лёгкий регексп для числа в конце строки или отдельной строкой.
_QTY_RE = re.compile(r"^[~≈]?\s*[\d]+[\d\s]*(?:[.,]\d+)?\s*$")

# Variant-only строка: размер / диаметр / код-артикул без имени.
# Примеры: «150х100», «200х200», «ф100», «Ø355», «100х100х50».
# Используется для sticky parent name: когда buffer содержит одну такую
# строку, name не виден в текущей row и берётся у предыдущего full-item.
_VARIANT_RE = re.compile(
    r"^(?:"
    r"[фØ]\s*\d+"  # диаметр
    r"|\d+(?:[.,]\d+)?\s*[xхXХ×]\s*\d+(?:[.,]\d+)?"  # WxH (можно WxHxD через повтор)
    r")"
)


def is_stamp_line(text: str) -> bool:
    """True если строка целиком является элементом штампа/шапки таблицы.

    Используется line-based парсером (`parse_page_items`), где stamp/qty
    различаются только эвристикой. В column-aware пути (`extract_structured_rows`)
    предпочтительнее `is_stamp_text` — строгий фильтр без эвристики чисел,
    т.к. колонка уже сообщает контекст («1» в qty-колонке = quantity, не
    номер листа).
    """
    s = text.strip()
    if not s:
        return True
    if is_stamp_text(s):
        return True
    # Одиночный номер страницы (цифры длиной 1-3) — мусор для line-based;
    # column-aware фильтр это не применяет, чтобы не зарубить qty=1, qty=58.
    if re.fullmatch(r"\d{1,3}", s):
        return True
    return False


def is_stamp_text(text: str) -> bool:
    """Строгий стамп-фильтр без числовой эвристики.

    Матчит только бесспорные элементы штампа ЕСКД (точные строки + шифр
    документа + «+10%»). Безопасен для column-aware пути: «1» в qty-колонке
    остаётся числом, а «Формат А3» / «470-05/2025-ОВ2.СО» режется.
    """
    s = text.strip()
    if not s:
        return True
    if s in _STAMP_EXACT:
        return True
    if _STAMP_REGEX.match(s):
        return True
    if re.fullmatch(r"\+\d{1,3}%?", s):
        return True
    if re.fullmatch(r"\d{4}г\.?", s):
        return True
    if re.match(r"^\d{2,4}-\d{1,4}/\d{4}-", s):
        return True
    return False


# Regex-фильтр вариантов штампа ЕСКД, которые не ловятся по exact-match
# из-за микро-отличий в пунктуации (точки/пробелы/номер). Матчит целиком
# штамп, так что «Взаим.инв.» дропается, а «Взаим.инв. № 5.6 Шпилька…» —
# не матчится (остаётся на обработку prompt-правилом 7b, которое срежет
# префикс и оставит имя позиции).
_STAMP_REGEX = re.compile(
    r"^(?:Взаим\.?\s*инв\.?\s*(?:№\s*)?"
    r"|Вз\.?\s*инв\.?\s*(?:№\s*)?"
    r"|Инв\.?\s*№\s*подл\.?"
    r"|Взам\.?\s*инв\.?\s*(?:№\s*)?"
    r"|Согласовано\s*:?)$",
    re.IGNORECASE,
)


def is_section_heading(text: str) -> bool:
    """True для заголовка раздела спецификации."""
    return bool(_SECTION_RE.match(text.strip()))


def parse_quantity(text: str) -> float | None:
    """Разобрать количество из одиночной строки. None если не число."""
    s = text.strip().replace("~", "").replace("≈", "").replace(" ", "").replace(",", ".")
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def extract_lines(page: object) -> list[str]:
    """Прочитать страницу как список непустых trimmed-строк.

    Используем plain `get_text()` — он учитывает rotation/reading-order и для
    таблиц даёт ячейки построчно. Экзотические раскладки (нестандартный порядок)
    пока не поддерживаем — это покроет Vision fallback.
    """
    text: str = page.get_text()  # type: ignore[attr-defined]
    return [ln.strip() for ln in text.split("\n") if ln.strip()]


def is_variant_only_line(text: str) -> bool:
    """True если строка выглядит как variant-spec (размер/диаметр), не имя.

    Пример: «Воздуховод / ф100 / м.п. / 1,5 / 150х100 / м.п. / 3135 / ...» —
    «150х100» идёт без собственного name: имя должно «прилипнуть» от
    предыдущего item «Воздуховод» через sticky parent name.
    """
    s = text.strip()
    if not s or len(s) > 25:
        return False
    return bool(_VARIANT_RE.match(s))


def parse_page_items(
    page: object,
    current_section: str = "",
    sticky_parent_name: str = "",
) -> tuple[list[dict[str, Any]], str, str]:
    """Извлечь позиции из одной страницы по text-layer эвристике.

    Возвращает (items, new_current_section, new_sticky_parent_name). Обе
    строки состояния прокидываются между страницами: часть страниц не
    содержат собственного заголовка или parent-name, и мы наследуем
    значения с предыдущей страницы.

    Формат items: dict с ключами name, model_name, unit, quantity, section_name.
    Другие поля (page_number, sort_order, tech_specs, brand) заполняет вызывающий.
    """
    lines = extract_lines(page)
    items: list[dict[str, Any]] = []
    buffer: list[str] = []
    section = current_section
    sticky_name = sticky_parent_name

    i = 0
    while i < len(lines):
        ln = lines[i]

        if is_stamp_line(ln):
            i += 1
            continue

        # Секционный заголовок: обновляем секцию, если буфер пуст (чтобы не
        # рвать многострочный name позиции). Новая секция обнуляет sticky
        # parent — parent из «Вентиляции» не должен протечь в «Клапаны».
        if is_section_heading(ln) and not buffer:
            section = ln
            sticky_name = ""
            i += 1
            continue

        # Якорь — строка-единица измерения + следующая строка-количество.
        if ln.lower() in UNITS and i + 1 < len(lines):
            qty = parse_quantity(lines[i + 1])
            if qty is not None and buffer:
                name, model, sticky_name = _split_name_model(buffer, sticky_name)
                items.append(
                    {
                        "name": name,
                        "model_name": model,
                        "unit": ln,
                        "quantity": qty,
                        "section_name": section,
                    }
                )
                buffer = []
                i += 2
                continue

        buffer.append(ln)
        i += 1

    return items, section, sticky_name


def _split_name_model(
    buffer: list[str], sticky_parent_name: str
) -> tuple[str, str, str]:
    """Разделить буфер на (name, model_name) и вернуть обновлённый sticky name.

    Правила (порядок важен):
    - len>=2 — многострочный name: всё кроме последней = name, последняя
      = model. Sticky обновляется на новый name.
    - len==1, строка похожа на variant (размер/диаметр):
        * если есть sticky — применяем: name=sticky, model=variant; sticky не
          меняется (variant-строка никогда не становится parent'ом).
        * если sticky пусто — считаем что автор опирался на подразумеваемый
          контекст (напр. section heading «Воздуховоды ...»). Пишем item
          name=variant, model="" — но sticky НЕ ставим в variant, чтобы
          следующая variant-строка не зацепилась за предыдущую variant как
          за parent.
    - len==1, обычное имя — name=строка, model=""; sticky обновляется.
    """
    if len(buffer) >= 2:
        name = " ".join(buffer[:-1])
        model = buffer[-1]
        return name, model, name
    only = buffer[0]
    if is_variant_only_line(only):
        if sticky_parent_name:
            return sticky_parent_name, only, sticky_parent_name
        return only, "", sticky_parent_name  # не обновляем sticky variant'ом
    return only, "", only


def has_usable_text_layer(
    page: object, min_chars: int = TEXT_LAYER_MIN_CHARS_PER_PAGE
) -> bool:
    """True если у страницы есть достаточный text layer для парсинга без LLM."""
    text: str = page.get_text()  # type: ignore[attr-defined]
    return len(text.strip()) >= min_chars


# ---------------------------------------------------------------------------
# Column-aware bbox extraction (E15.04, Вариант B)
# ---------------------------------------------------------------------------

COLUMN_KEYS: tuple[str, ...] = (
    "pos",
    "name",
    "model",
    "brand",
    "unit",
    "qty",
    "mass",
    "comments",
)

# Каждый span шапки сравнивается ТОЧНО (lower+strip) с этими ключами. Часть
# ячеек шапки в ЕСКД-форме разбита на строки («Наименование и техническая» +
# «характеристика», «Коли-/чест-/во», «Ед./изме-/ре-/ния») — поэтому короткие
# токены вроде «во», «ре-», «кг» включены отдельно. Exact-match защищает от
# ложных совпадений с именами оборудования (startswith «во» цеплял
# «Воздуховод» как qty-header).
_HEADER_MARKERS: dict[str, str] = {
    "поз.": "pos",
    "наименование и техническая": "name",
    "наименование": "name",
    "характеристика": "name",
    "тип, марка,": "model",
    "тип, марка, обозначение": "model",
    "обозначение": "model",
    "документа,": "model",
    "опросного листа": "model",
    "код": "brand",
    "продукции": "brand",
    "поставщик": "brand",
    "ед.": "unit",
    "изме-": "unit",
    "ре-": "unit",
    "ния": "unit",
    "коли-": "qty",
    "чест-": "qty",
    "во": "qty",
    "количество": "qty",
    "масса": "mass",
    "1 ед.,": "mass",
    "кг": "mass",
    "приме-": "comments",
    "чание": "comments",
    "примечание": "comments",
}

# Канонические границы колонок ЕСКД спецификации в display-space (landscape
# A3, 1191×842 после rotation_matrix). Промерены на golden PDF + соответствуют
# ГОСТ-сетке для формы 1а. Колонка `pos` намеренно узкая — в ЕСКД-таблицах
# в неё помещают индекс системы (ВД1, ПД1, ПВ-ИТП), не имя оборудования.
# Колонка `name` широкая, поскольку «Наименование и техническая характеристика»
# часто содержит длинные строки и многострочные текстовые блоки.
_DEFAULT_COLUMN_BOUNDS: list[tuple[str, float, float]] = [
    ("pos", float("-inf"), 130.0),
    ("name", 130.0, 645.0),
    ("model", 645.0, 810.0),
    ("brand", 810.0, 915.0),
    ("unit", 915.0, 960.0),
    ("qty", 960.0, 1015.0),
    ("mass", 1015.0, 1080.0),
    ("comments", 1080.0, float("inf")),
]

# Канонические центры — нужны для калибровки если PDF чуть смещён по x
# (поля иногда отличаются на 5-15pt между макетами разных проектных
# организаций). Среднее смещение шапки от этих значений сдвигает все границы.
_DEFAULT_COLUMN_CENTERS: dict[str, float] = {
    "pos": 82.0,
    "name": 390.0,
    "model": 665.0,
    "brand": 870.0,
    "unit": 937.0,
    "qty": 985.0,
    "mass": 1043.0,
    "comments": 1125.0,
}

# Y-tolerance для группировки span'ов в визуальный row (в display space,
# единицы — pt). 5pt ≈ половина строки 10pt-шрифта в ЕСКД спецификации.
_ROW_Y_TOLERANCE = 5.5

# Минимальное число header-маркеров в зоне шапки для уверенного column
# detection. Если меньше — падаем на `_DEFAULT_COLUMN_CENTERS`.
_MIN_HEADER_MARKERS = 3


@dataclass
class _Span:
    text: str
    disp_x: float  # левый край в derotated space (увеличивается вправо визуально)
    disp_y: float  # верхний край в derotated space (увеличивается вниз визуально)
    width: float   # ширина в derotated space
    size: float
    flags: int
    is_bold: bool


@dataclass
class TableRow:
    """Структурированная строка таблицы спецификации.

    Значения — raw text из PDF. Нормализация (склейка переносов имён, sticky
    parent, секции, отбрасывание штампов) — на стороне LLM.
    """

    page_number: int  # 1-based
    y_mid: float      # display_y центра row (для sticky-cross-page ordering)
    row_index: int    # внутри страницы, 0-based
    cells: dict[str, str] = field(default_factory=dict)
    raw_blocks: list[str] = field(default_factory=list)
    is_header: bool = False
    is_section_heading: bool = False


def _derotate_span(bb: tuple[float, float, float, float], matrix) -> tuple[float, float, float]:
    """Применить rotation_matrix к span bbox → (disp_x, disp_y, disp_width).

    rotation_matrix у fitz-page мапит raw-точки в display-space (как страницу
    видит зритель с учётом page.rotation). После rotation=90 текст в ЕСКД
    landscape A3 PDF'е становится читаемым horizontal left-to-right.
    """
    x0, y0, x1, y1 = bb
    a, b, c, d, e, f = matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f
    # Корнеры bbox под трансформацией — берём min/max чтобы получить
    # axis-aligned bbox в display space (rotation кратна 90° → результат
    # тоже axis-aligned).
    pts = [
        (a * px + c * py + e, b * px + d * py + f)
        for px in (x0, x1)
        for py in (y0, y1)
    ]
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return min(xs), min(ys), max(xs) - min(xs)


def _collect_spans(page: object) -> list[_Span]:
    """Собрать все непустые span'ы страницы в display-space с метаданными."""
    data = page.get_text("dict")  # type: ignore[attr-defined]
    matrix = page.rotation_matrix  # type: ignore[attr-defined]
    out: list[_Span] = []
    for block in data.get("blocks", ()):
        if block.get("type", 0) != 0:
            continue
        for line in block.get("lines", ()):
            for span in line.get("spans", ()):
                text = str(span.get("text", "")).strip()
                if not text:
                    continue
                bb = span.get("bbox") or (0, 0, 0, 0)
                dx, dy, dw = _derotate_span(bb, matrix)
                flags = int(span.get("flags", 0))
                out.append(
                    _Span(
                        text=text,
                        disp_x=dx,
                        disp_y=dy,
                        width=dw,
                        size=float(span.get("size", 0)),
                        flags=flags,
                        is_bold=bool(flags & 16),  # fitz flag 16 = bold
                    )
                )
    out.sort(key=lambda s: (round(s.disp_y, 1), s.disp_x))
    return out


def _bucket_by_y(spans: list[_Span], tolerance: float = _ROW_Y_TOLERANCE) -> list[list[_Span]]:
    """Сгруппировать span'ы в визуальные row'ы по display_y (±tolerance)."""
    buckets: list[list[_Span]] = []
    current: list[_Span] = []
    current_y: float | None = None
    for span in sorted(spans, key=lambda s: s.disp_y):
        if current_y is None or abs(span.disp_y - current_y) <= tolerance:
            current.append(span)
            if current_y is None:
                current_y = span.disp_y
            else:
                current_y = (current_y * (len(current) - 1) + span.disp_y) / len(current)
        else:
            buckets.append(current)
            current = [span]
            current_y = span.disp_y
    if current:
        buckets.append(current)
    return buckets


def _match_header_column(text: str) -> str | None:
    return _HEADER_MARKERS.get(text.lower().strip())


def _detect_column_ranges(
    buckets: list[list[_Span]],
) -> tuple[dict[str, tuple[float, float]], int]:
    """Определить диапазоны display_x каждой колонки + last_header_bucket_idx.

    ЕСКД спецификация всегда имеет одну и ту же ширину колонок (форма 1а
    ГОСТ 21.110), поэтому используем фиксированные `_DEFAULT_COLUMN_BOUNDS`,
    а шапку детектируем только чтобы знать, где заканчивается header zone.

    Если детектированные центры шапки сильно смещены от `_DEFAULT_COLUMN_CENTERS`
    (среднее отклонение > 15pt) — сдвигаем все границы на это смещение
    (компенсация полей разных макетов).
    """
    col_centers: dict[str, list[float]] = {k: [] for k in COLUMN_KEYS}
    last_header_idx = -1
    first_header_idx = -1
    for idx, bucket in enumerate(buckets):
        matches = 0
        bucket_cols: dict[str, float] = {}
        for span in bucket:
            col = _match_header_column(span.text)
            if col:
                matches += 1
                center = span.disp_x + span.width / 2
                bucket_cols.setdefault(col, center)
        if matches >= _MIN_HEADER_MARKERS:
            for col, center in bucket_cols.items():
                col_centers[col].append(center)
            if first_header_idx == -1:
                first_header_idx = idx
            last_header_idx = idx
        elif first_header_idx != -1 and last_header_idx != -1 and idx == last_header_idx + 1:
            # Хвостовые подстроки шапки («во», «ния», «кг») часто остаются в
            # отдельных y-bucket'ах с <3 матчей — пропускаем их вместе с шапкой,
            # пока bucket'ы идут подряд.
            if matches >= 1:
                last_header_idx = idx

    # Среднее смещение по обнаруженным колонкам vs канонические центры.
    deltas: list[float] = []
    for col, xs in col_centers.items():
        if xs and col in _DEFAULT_COLUMN_CENTERS:
            avg = sum(xs) / len(xs)
            deltas.append(avg - _DEFAULT_COLUMN_CENTERS[col])
    shift = (sum(deltas) / len(deltas)) if deltas else 0.0

    ranges: dict[str, tuple[float, float]] = {}
    for col, lo, hi in _DEFAULT_COLUMN_BOUNDS:
        new_lo = lo if lo == float("-inf") else lo + shift
        new_hi = hi if hi == float("inf") else hi + shift
        ranges[col] = (new_lo, new_hi)
    return ranges, last_header_idx


def _assign_column(disp_x_center: float, ranges: dict[str, tuple[float, float]]) -> str:
    """По центру span'а определить колонку. Если ни в один диапазон не попал —
    вернуть пустую строку (такой span пойдёт в raw_blocks)."""
    for col, (lo, hi) in ranges.items():
        if lo <= disp_x_center < hi:
            return col
    return ""


def _is_title_block_bucket(bucket: list[_Span], page_rect: object) -> bool:
    """Эвристика: bucket принадлежит basic-stamp / title-block зоне?

    ЕСКД title block — нижний-правый угол листа; после rotation=90
    в display space это bottom-right (disp_y close to page_height,
    disp_x close to page_width). Span'ы «Формат А3», «Изм.», «Подп.»
    сидят именно там. Если ≥half span'ов bucket'а целиком в правом
    штампе И содержат stamp-ключевики — отбрасываем bucket.
    """
    try:
        w = page_rect.width  # type: ignore[attr-defined]
        h = page_rect.height  # type: ignore[attr-defined]
    except AttributeError:
        return False
    stamp_zone_x = w * 0.72
    stamp_zone_y = h * 0.72
    stamp_hits = 0
    for span in bucket:
        in_zone = span.disp_x >= stamp_zone_x and span.disp_y >= stamp_zone_y
        if in_zone or is_stamp_line(span.text):
            stamp_hits += 1
    return stamp_hits >= max(1, len(bucket) // 2 + 1)


def extract_structured_rows(page: object) -> list[TableRow]:
    """Извлечь таблицу спецификации из страницы PDF в виде bbox-структуры.

    Алгоритм:
    1. `page.rotation_matrix` → derotated display coordinates (landscape ЕСКД
       читаемо left-to-right после трансформации).
    2. `page.get_text("dict")` → span'ы с text+bbox+size+flags.
    3. Y-bucketing (±5.5pt) — каждый bucket = визуальный row.
    4. Column detection: ищем bucket'ы в шапке по startswith-маркерам; их
       центры disp_x кластеризуем → column x-ranges. Fallback на «канонические»
       центры ЕСКД (`_DEFAULT_COLUMN_CENTERS`), если шапка обрезана.
    5. Для каждого data-bucket'а: span'ы → колонки (по disp_x + width/2),
       multi-span колонки склеиваются через пробел в естественном
       disp_x-порядке.
    6. Фильтр bucket'ов title-block (правый-нижний штамп) + явных stamp-строк.
    7. Section heading detection: bucket с непустой колонкой `name` + пустыми
       остальными + bold-spans или font_size > baseline * 1.1.
    """
    page_number = int(getattr(page, "number", 0)) + 1
    spans = _collect_spans(page)
    if not spans:
        return []

    page_rect = getattr(page, "rect", None)
    buckets = _bucket_by_y(spans)
    ranges, last_header_idx = _detect_column_ranges(buckets)

    baseline_size = _baseline_font_size(spans)
    rows: list[TableRow] = []
    row_idx = 0
    for bidx, bucket in enumerate(buckets):
        if bidx <= last_header_idx:
            # Шапка — пропускаем (фильтр + маркер).
            continue
        if page_rect is not None and _is_title_block_bucket(bucket, page_rect):
            continue

        # Фильтр: откидываем spans-штампы строгим фильтром (без числовой
        # эвристики — иначе qty=1, qty=58 уйдут вместе с номером листа).
        kept: list[_Span] = []
        for span in bucket:
            if is_stamp_text(span.text):
                continue
            kept.append(span)
        if not kept:
            continue

        cells: dict[str, list[_Span]] = {k: [] for k in COLUMN_KEYS}
        raw_blocks: list[str] = []
        for span in sorted(kept, key=lambda s: s.disp_x):
            center = span.disp_x + span.width / 2
            col = _assign_column(center, ranges)
            raw_blocks.append(span.text)
            if col:
                cells[col].append(span)

        merged_cells: dict[str, str] = {}
        for col, col_spans in cells.items():
            if not col_spans:
                continue
            text = " ".join(s.text for s in sorted(col_spans, key=lambda s: s.disp_x)).strip()
            if text:
                merged_cells[col] = text

        if not merged_cells and not raw_blocks:
            continue

        y_mid = sum(s.disp_y for s in kept) / len(kept)

        # Section heading: bucket, у которого текст только в name-колонке
        # (возможно также без pos) и font > baseline * 1.1 либо bold.
        # Fallback — если font-signal не сработал, проверяем структурный
        # паттерн «N. Xxx» (defensive, только для строк с числовым префиксом).
        is_section = _looks_like_section(merged_cells, kept, baseline_size) or (
            _looks_like_section_heading(merged_cells, raw_blocks)
        )

        rows.append(
            TableRow(
                page_number=page_number,
                y_mid=y_mid,
                row_index=row_idx,
                cells=merged_cells,
                raw_blocks=raw_blocks,
                is_header=False,
                is_section_heading=is_section,
            )
        )
        row_idx += 1

    return _merge_multiline_section_headings(rows)


def _merge_multiline_section_headings(rows: list[TableRow]) -> list[TableRow]:
    """Склеить multi-line section headings в один row.

    Пример: row A — ⚑SEC «Система общеобменной вытяжной вентиляции.»
    (name только), row B — «МОП и Коммерческие помещения» (name только,
    model/unit/qty пусты, не section по regex). Обе относятся к одной
    секции, но extract_structured_rows пометил только A как section. Тут
    дотягиваем B в name секции A.

    Эвристика: row B следует за section-heading row A (consecutive), у B
    только name, нет model/unit/qty. Склеиваем name(A) + " " + name(B),
    удаляем B.
    """
    merged: list[TableRow] = []
    i = 0
    while i < len(rows):
        row = rows[i]
        if (
            row.is_section_heading
            and i + 1 < len(rows)
            and _is_bare_name_row(rows[i + 1])
        ):
            next_row = rows[i + 1]
            combined_name = (
                row.cells.get("name", "").rstrip(",.")
                + " "
                + next_row.cells.get("name", "")
            ).strip()
            merged_cells = dict(row.cells)
            merged_cells["name"] = combined_name
            merged.append(
                TableRow(
                    page_number=row.page_number,
                    y_mid=row.y_mid,
                    row_index=row.row_index,
                    cells=merged_cells,
                    raw_blocks=row.raw_blocks + next_row.raw_blocks,
                    is_header=False,
                    is_section_heading=True,
                )
            )
            i += 2
            continue
        merged.append(row)
        i += 1
    return merged


def _is_bare_name_row(row: TableRow) -> bool:
    """Row с непустым name и пустыми model/unit/qty/brand — кандидат
    на продолжение секции или многострочного имени."""
    filled = {k for k, v in row.cells.items() if v}
    if "name" not in filled:
        return False
    # Допускаем pos (системный префикс), но больше ничего.
    return filled.issubset({"name", "pos"}) and not row.is_section_heading


def _baseline_font_size(spans: list[_Span]) -> float:
    """Медиана размеров шрифта — baseline для детекции section heading."""
    sizes = sorted(s.size for s in spans if s.size > 0)
    if not sizes:
        return 10.0
    mid = len(sizes) // 2
    if len(sizes) % 2 == 1:
        return sizes[mid]
    return (sizes[mid - 1] + sizes[mid]) / 2


def _looks_like_section_heading(cells: dict[str, str], raw_blocks: list[str]) -> bool:  # noqa: ARG001
    """Эвристика section-heading на основе формы cells (без font-signal).

    Row похож на заголовок раздела, если:
      - заполнен ТОЛЬКО `cells.name` (pos допустим как артефакт bbox-сдвига),
      - имя короче 80 символов,
      - имя начинается с ЧИСЛОВОГО префикса "N.", "N.N", "N.N.N" и т.п.

    Требование числового префикса — важная защита. Многострочные описания
    позиций («не содержащей галогенов…», «продуктов при горении и тлении,
    ГОСТ 31996-2012») тоже проходят «только name + короткое», но НЕ имеют
    числового префикса. Без этой проверки они ошибочно склеивались бы
    `_merge_multiline_section_headings` в фейковые секции и теряли items.

    Используется в связке с `_looks_like_section` (font-signal / _SECTION_RE) —
    если font-сигнала нет, но форма cells+префикс характерные — всё равно
    помечаем как section, чтобы LLM не склеила заголовок в name предыдущего
    item.
    """
    non_empty = {k: v for k, v in cells.items() if v and v.strip()}
    if not non_empty:
        return False
    if not set(non_empty.keys()).issubset({"name", "pos"}):
        return False
    name = (cells.get("name") or "").strip()
    if not name or len(name) > 80:
        return False
    return bool(_NUMERIC_SECTION_PREFIX_RE.match(name))


def _looks_like_section(
    cells: dict[str, str], bucket_spans: list[_Span], baseline_size: float
) -> bool:
    """Bucket похож на section heading?

    Консервативно: ТОЛЬКО при явном font-визуальном signal'е (bold ИЛИ size
    > baseline * 1.08) ИЛИ совпадении `_SECTION_RE`. Без двойного-signal
    продолжения многострочного имени («покрытие - нармированная фольга»)
    ошибочно уйдут в секцию — LLM тогда делает пустую секцию и теряет
    item. Лучше false-negative (LLM сам разберётся по regex в промпте),
    чем false-positive.
    """
    filled = {k for k, v in cells.items() if v}
    if not filled:
        return False
    allowed = {"name", "pos"}
    if not filled.issubset(allowed):
        return False
    if "name" not in filled:
        return False
    name = cells.get("name", "")
    if is_section_heading(name):
        return True
    max_size = max((s.size for s in bucket_spans), default=baseline_size)
    has_bold = any(s.is_bold for s in bucket_spans)
    if has_bold and max_size > baseline_size * 1.08:
        return True
    return False


def is_header_row(row_cells: dict[str, str]) -> bool:
    """True если row совпадает с шапкой таблицы (column headers).

    Используется тестами; реальная логика исключения шапки в extract_structured_rows
    делается через last_header_idx и _HEADER_MARKERS."""
    hits = 0
    for text in row_cells.values():
        if _match_header_column(text):
            hits += 1
    return hits >= _MIN_HEADER_MARKERS

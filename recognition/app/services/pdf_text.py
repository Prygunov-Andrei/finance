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
#
# DEV-BACKLOG #14: набор ориентирован на ГОСТ / ЕСКД. Короткие токены («А3»,
# «А4», «Р», «во», «ния», «Лист», «ГИП») exact-match безопасны только пока
# PDF следуют ЕСКД. На экзотических шаблонах (не-ГОСТ, иностранные поставщики
# с русским переводом штампа) возможны коллизии с реальными item-именами
# («Р-резервный», «Лист изоляции»). При первом regression — переводить
# короткие токены на pattern-based match с контекстом (штамп-зона + x/y
# bucket), вместо exact.
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
    r"|Электроснабжение|Силовое|Автоматика\b"
    # DEV-BACKLOG #15: дополнительные разделы — Канализация, Вентиляция,
    # электро-подсистемы, ИТП, пожаротушение.
    r"|Канализация|Вентиляция\b|Электроосвещение|Электрооборудование"
    r"|Теплоснабжение|Пожаротушение|Дренаж"
    # Аббревиатуры разделов проектной документации (ЕСКД обозначения):
    # «Раздел ЭОМ», «Марка комплекта СС», «Комплект АОВ», «Раздел ИТП».
    r"|(?:Раздел|Марка(?:\s+комплекта)?|Комплект)\s+"
    r"(?:ЭОМ|СС|ИТП|АОВ|ВКТ|ОВВК|ТС|ГС)\b"
    # Аббревиатура как самостоятельный заголовок «ЭОМ. ...» / «АОВ. ...».
    # Требуем после аббревиатуры `.` + пробел, чтобы не ловить ЭОМ-кабель.
    r"|(?:ЭОМ|СС|ИТП|АОВ|ВКТ|ОВВК)\.\s)",
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
    документа). Безопасен для column-aware пути: «1» в qty-колонке остаётся
    числом, а «Формат А3» / «470-05/2025-ОВ2.СО» режется.

    E15-06 (#54): «+10%», «+5%» РАНЬШЕ матчились как штамп — именно поэтому
    колонка «Примечание» теряла эти значения. Убрано: значения «+N%»
    остаются в spans и попадают в cells.comments через bbox-assignment.
    Если такой span действительно физически находится в штампе, его
    отловит `_is_title_block_bucket` по координатам (in_zone).
    """
    s = text.strip()
    if not s:
        return True
    if s in _STAMP_EXACT:
        return True
    if _STAMP_REGEX.match(s):
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


# E15.05 it2 (R25): расширенный штамп-фильтр для ЯЧЕЕК column-aware парсера.
# В отличие от `_STAMP_REGEX` — матч по **startswith** (без `$`), поскольку
# эти фразы в title-block ЕСКД «Дата и подпись», «Код уч № док Подпись»
# приходят одной ячейкой и не содержат полезного item-имени после себя.
# Включает «Расчет фасонных деталей» (artefact часто попадает в cells.name
# из правой подписи штампа), «Спецификация оборудования…» и «Инв. № подп.»
# как отдельную фразу (в отличие от «Инв. № подл.» — эта считается одним
# и тем же, но в спецификации ТАБС пишут через «п»).
_STAMP_CELL_REGEX = re.compile(
    r"^(?:Код\s+уч\s+№\s+док"
    r"|Дата\s+и\s+подпись"
    r"|Расчет\s+фасонных\s+деталей"
    r"|Н\.?\s*контр\.?"
    r"|Инв\.?\s*№\s*подп\.?"
    r"|Спецификация\s+оборудования)",
    re.IGNORECASE,
)


def is_stamp_cell(text: str) -> bool:
    """Ячейка целиком является штампом/подписью из title-block.

    Используется column-mapping'ом для дропа cells, в которые попали подписи
    штампа («Дата и подпись», «Код уч № док»). Шире чем `is_stamp_text`: кроме
    строгих маркеров Изм./Подп./шифра матчит полные фразы title-block по
    startswith (см. `_STAMP_CELL_REGEX`). На span-level остаётся `is_stamp_text`
    — не дропать лишнего (qty=1, qty=58 должны уцелеть).
    """
    s = text.strip()
    if not s:
        return True
    if is_stamp_text(s):
        return True
    if _STAMP_CELL_REGEX.match(s):
        return True
    return False


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
    "manufacturer",
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
#
# E15.05 it2 (R22): split brand / manufacturer.
#   brand        = «Код продукции» / «Поставщик» (торговая марка)
#   manufacturer = «Завод-изготовитель» / «Производитель» / «Изготовитель»
#
# В реальных PDF названия колонок перекрываются: в некоторых проектах
# «Поставщик» фактически играет роль производителя (ООО «КОРФ»). LLM
# разбирается уже на prompt-уровне; тут — грубое column-mapping только
# чтобы значение не потерялось.
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
    "завод-изготовитель": "manufacturer",
    "завод- изготовитель": "manufacturer",
    "изготовитель": "manufacturer",
    "производитель": "manufacturer",
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


# E15.05 it2 (R23): паттерн-матчинг по «склеенному» тексту шапки (многострочная
# шапка с переносами слов через дефис). Проверяется после
# `_merge_multi_row_header` — когда склеенный текст в x-кластере содержит
# подстроку из patterns → колонка определена.
#
# Порядок важен: более специфичные (manufacturer, brand) идут раньше общих
# (name, model). `"изготовитель"` в pattern может схватить «Завод-изготовитель»
# — именно поэтому manufacturer проверяется первым.
_HEADER_MARKER_PATTERNS: list[tuple[str, tuple[str, ...]]] = [
    ("pos", ("поз.", "позиция", "поз ")),
    ("manufacturer", (
        "завод-изготовитель", "завод- изготовитель", "завод изготовитель",
        "производитель", "изготовитель",
    )),
    ("brand", ("код продукции", "код оборудования", "поставщик")),
    ("name", ("наименование", "характеристика")),
    ("model", (
        "тип, марка", "тип марка", "обозначение документа",
        "обозначение", "опросного листа",
    )),
    ("mass", ("масса",)),
    ("unit", ("ед. изм", "ед.изм", "единица изм", "единицы изм", "ед изм", "единица")),
    ("qty", ("количество", "кол-во", "кол. ")),
    ("comments", ("примечание",)),
]


def _match_column_from_merged_text(
    merged_text: str,
    *,
    patterns: list[tuple[str, tuple[str, ...]]] | None = None,
) -> str | None:
    """Сопоставить склеенный текст шапки колонки с column key.

    Работает по подстроке (first-match wins) после lower() и удаления
    хвостовой пунктуации. Порядок patterns критичен — см. комментарий
    в `_HEADER_MARKER_PATTERNS`.

    `patterns` — переопределяемый набор (спецификация vs счёт-фактура vs
    другой тип документа). Default — `_HEADER_MARKER_PATTERNS` для
    ЕСКД-таблиц (spec parser backward-compat).
    """
    t = merged_text.strip().lower()
    t = re.sub(r"[\s\-,.:;]+$", "", t)
    if not t:
        return None
    for col, pats in patterns or _HEADER_MARKER_PATTERNS:
        for p in pats:
            if p in t:
                return col
    return None


def _concat_header_fragments(spans: list["_Span"]) -> str:
    """Склеить фрагменты шапки одного x-кластера в единый текст.

    Sort by y (top→down), concat с word-dash rule:
      - если предыдущий фрагмент заканчивается на `-` → concat без пробела,
        дефис отрезается («оборудо-» + «вания» → «оборудования»);
      - иначе — через пробел («Тип, марка,» + «обозначение документа»).

    Длинное тире `—` не trigger'ит dash-concat — только обычный `-`.
    """
    if not spans:
        return ""
    spans_sorted = sorted(spans, key=lambda s: s.disp_y)
    parts: list[str] = []
    for s in spans_sorted:
        txt = s.text.strip()
        if not txt:
            continue
        if parts:
            last = parts[-1]
            if last.endswith("-") and not last.endswith(" -") and not last.endswith("—"):
                parts[-1] = last[:-1] + txt
                continue
            parts.append(" " + txt)
        else:
            parts.append(txt)
    return "".join(parts).strip()

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


def _derotate_span(bb: tuple[float, float, float, float], matrix: Any) -> tuple[float, float, float]:
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

    Сначала пытаемся detect per-page boundaries через multi-row header склейку
    (R23, E15.05 it2): шапка в ЕСКД часто занимает 3-6 строк с word-dash
    переносами, `_merge_multi_row_header` кластеризует span'ы header zone по x
    и матчит склеенный текст против patterns.

    Если удалось поймать ≥3 колонок — возвращаем per-page ranges (mid-point
    boundaries между соседними detected columns).

    Fallback (меньше 3 detected) — старый single-row mode с shift-калибровкой
    `_DEFAULT_COLUMN_BOUNDS`. Гарантия backward-совместимости для spec-ov2 и
    spec-aov, где шапка одно-/двустрочная и хорошо ложится на канон ГОСТ 21.110.
    """
    # R23 — multi-row header detection. Триггерится когда шапка multi-row
    # И detector поймал ≥ 4 колонок — иначе остаёмся на проверенной
    # shift-калибровке `_DEFAULT_COLUMN_BOUNDS` (spec-ov2/aov single-row
    # шапка). Порог 4 (а не 3) — защита от single-row PDF'ов с частично
    # совпадающими маркерами, где per-page detection даёт narrow bounds
    # и теряет spans за пределами header extent.
    detected, last_header_idx_multi = _merge_multi_row_header(buckets)
    if _is_multi_row_header(buckets, last_header_idx_multi) and len(detected) >= 4:
        return _build_ranges_from_detected(detected), last_header_idx_multi

    # Fallback — single-row с shift-калибровкой (pre-it2 поведение).
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
            if matches >= 1:
                last_header_idx = idx

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


def _merge_multi_row_header(
    buckets: list[list[_Span]],
    *,
    probe_buckets: int = 14,
    x_tolerance: float = 20.0,
    patterns: list[tuple[str, tuple[str, ...]]] | None = None,
) -> tuple[dict[str, tuple[float, float]], int]:
    """R23: склеить многострочную шапку → per-column x-extent.

    Алгоритм:
    1. Ищем «header zone» — непрерывный диапазон первых buckets
       (в верхней части страницы), где хотя бы один span совпадает с
       `_HEADER_MARKER_PATTERNS`.
    2. Collect все span'ы header zone → кластеризуем по x-центру
       (±x_tolerance ≈ половина символа при 10pt шрифте).
    3. Для каждого кластера: `_concat_header_fragments` склеивает фрагменты
       top→down с word-dash rule → match против patterns.
    4. Возвращаем (per-column (x_min, x_max), last_header_idx).

    Если зона шапки не найдена — `({}, -1)`.
    """
    active_patterns = patterns or _HEADER_MARKER_PATTERNS
    first_header_idx = -1
    last_header_idx = -1
    probe_limit = min(len(buckets), probe_buckets)
    for idx in range(probe_limit):
        bucket = buckets[idx]
        has_marker = False
        for span in bucket:
            t = span.text.strip().lower()
            if not t:
                continue
            for _col, pats in active_patterns:
                if any(p in t for p in pats):
                    has_marker = True
                    break
            if has_marker:
                break
        if has_marker:
            if first_header_idx == -1:
                first_header_idx = idx
            last_header_idx = idx

    if first_header_idx == -1:
        return {}, -1

    header_spans: list[_Span] = []
    for idx in range(first_header_idx, last_header_idx + 1):
        header_spans.extend(buckets[idx])

    # Кластеризация по x-center с жадным greedy grouping.
    header_spans.sort(key=lambda s: s.disp_x + s.width / 2)
    clusters: list[list[_Span]] = []
    for span in header_spans:
        c_new = span.disp_x + span.width / 2
        if clusters:
            prev = clusters[-1]
            prev_center = sum(
                (s.disp_x + s.width / 2) for s in prev
            ) / len(prev)
            if abs(c_new - prev_center) <= x_tolerance:
                prev.append(span)
                continue
        clusters.append([span])

    detected: dict[str, tuple[float, float]] = {}
    for cluster in clusters:
        merged = _concat_header_fragments(cluster)
        col = _match_column_from_merged_text(merged, patterns=active_patterns)
        if not col:
            continue
        x_min = min(s.disp_x for s in cluster)
        x_max = max(s.disp_x + s.width for s in cluster)
        if col in detected:
            lo, hi = detected[col]
            detected[col] = (min(lo, x_min), max(hi, x_max))
        else:
            detected[col] = (x_min, x_max)

    return detected, last_header_idx


def _is_multi_row_header(buckets: list[list[_Span]], last_header_idx: int) -> bool:
    """Признак multi-row header: header zone занимает ≥ 2 y-bucket'а.

    Single-row header (spec-ov2/aov) — ровно 1 bucket. Multi-row (spec-tabs) —
    3-6 buckets. Используется как gate для per-page column detection: чтобы
    не ломать проверенный shift-path для простых шапок.
    """
    if last_header_idx < 1:
        return False
    # Считаем сколько buckets содержат хотя бы один header-marker.
    header_buckets = 0
    for idx in range(min(last_header_idx + 1, len(buckets))):
        bucket = buckets[idx]
        for span in bucket:
            t = span.text.strip().lower()
            if not t:
                continue
            matched = False
            for _col, patterns in _HEADER_MARKER_PATTERNS:
                if any(p in t for p in patterns):
                    matched = True
                    break
            if matched:
                header_buckets += 1
                break
    return header_buckets >= 2


def _build_ranges_from_detected(
    detected: dict[str, tuple[float, float]],
) -> dict[str, tuple[float, float]]:
    """Преобразовать detected x-extents → непересекающиеся column ranges.

    Границы между соседними columns = midpoint между правым краем левого
    column и левым краем правого. Для крайних columns — ±∞ (чтобы spans
    за пределами детектированных центров всё равно попали в ближайшую).
    """
    order = sorted(detected.items(), key=lambda kv: (kv[1][0] + kv[1][1]) / 2)
    ranges: dict[str, tuple[float, float]] = {}
    for i, (col, (x0, x1)) in enumerate(order):
        left = float("-inf") if i == 0 else (order[i - 1][1][1] + x0) / 2
        right = float("inf") if i == len(order) - 1 else (x1 + order[i + 1][1][0]) / 2
        ranges[col] = (left, right)
    return ranges


def _assign_column(disp_x_center: float, ranges: dict[str, tuple[float, float]]) -> str:
    """По центру span'а определить колонку. Если ни в один диапазон не попал —
    вернуть пустую строку (такой span пойдёт в raw_blocks)."""
    for col, (lo, hi) in ranges.items():
        if lo <= disp_x_center < hi:
            return col
    return ""


def _is_title_block_bucket(bucket: list[_Span], page_rect: object) -> bool:
    """Эвристика: bucket — это ТОЛЬКО штамп (title block)?

    Дропаем весь bucket СТРОГО только когда в нём НЕТ cell-like spans
    (qty-число / model-код / unit-единица). В таблицах спецификации
    ЕСКД колонки qty/unit/comments физически лежат в правом нижнем
    углу страницы — там же где ЕСКД-штамп. Поэтому нельзя дропать
    bucket «если большинство spans в правой-нижней зоне» — так мы
    выбрасываем реальные строки с +10% / м.п. / 1245 (QA-заход 1/10:
    4 Воздуховода на стр.2 spec-ov2 терялись именно так).

    Правильное поведение: пропускать через bucket, на уровне spans
    фильтр `is_stamp_text` отсекает штамповые слова («Подп. и дата»,
    «Инв. № подл.»), а `is_stamp_cell` зачищает штамповые cells
    post-merge. Если остаются cell-like spans (есть числа-qty или
    коды-model) — это реальная data-row, сохраняем.

    Функция остаётся как safety-net для bucket'ов где ВСЕ spans —
    штампы (например «Лист | 470-05/ОВ2.СО | Формат А3»).
    """
    try:
        w = page_rect.width  # type: ignore[attr-defined]
        h = page_rect.height  # type: ignore[attr-defined]
    except AttributeError:
        return False

    # Признак cell-like span: содержит число-qty (1-6 цифр подряд, опционально
    # с префиксом `~`/`≈` для приблизительных значений), типичный model-код
    # (буквы+цифры+разделители), comments-маркер, или длинное наименование
    # кириллицей / латиницей (item name не бывает в штампе).
    has_cell_like = False
    for span in bucket:
        text = span.text.strip()
        if not text:
            continue
        # qty / count: 1-6 цифр, опционально с приблизительным префиксом
        # и децимальной точкой/запятой. «~140», «≈ 110», «1245».
        if _QTY_LIKE_RE.fullmatch(text):
            has_cell_like = True
            break
        # model-code или size: буквы+цифры+разделители, длина ≥ 3.
        if _MODEL_OR_SIZE_LIKE_RE.fullmatch(text):
            has_cell_like = True
            break
        # comments «+10%», «+5%» — тоже cell-content.
        if text in ("+10%", "+5%", "+3%", "+15%", "+20%"):
            has_cell_like = True
            break
        # Длинное name-like наименование (≥12 букв подряд, без stamp-keywords).
        # Штамп ЕСКД содержит короткие слова («Изм.», «Подп.», «Формат А3»).
        # Реальная item.name: «Огнезащитная клеящая смесь», «Противопожарная
        # изоляция» — 20+ букв. Spans таких длин не принадлежат штампу.
        if _LONG_NAME_RE.fullmatch(text) and not is_stamp_line(text):
            has_cell_like = True
            break
    if has_cell_like:
        return False

    # Нет cell-like spans → это, скорее всего, штамп. Применяем старый
    # zone+keyword тест для страховки (не отбрасываем случайные buckets
    # из середины страницы).
    stamp_zone_x = w * 0.72
    stamp_zone_y = h * 0.72
    stamp_hits = 0
    for span in bucket:
        in_zone = span.disp_x >= stamp_zone_x and span.disp_y >= stamp_zone_y
        if in_zone or is_stamp_line(span.text):
            stamp_hits += 1
    return stamp_hits >= max(1, len(bucket) // 2 + 1)


_QTY_LIKE_RE = re.compile(r"[~≈]?\s*[\d]+(?:[.,]\d+)?")
# Pos-col accidentally захватил слово из name-col (pos-box широкий).
# Пример «5.6 Шпилька» → pos='5.6', остаток 'Шпилька' в name.
# Требует: числовой pos (X.Y или X), пробел, слово с заглавной ≥4 букв русских.
_POS_WITH_WORD_RE = re.compile(
    r"^(\d+(?:\.\d+)?)\s+([А-ЯЁ][А-Яа-яЁё]{3,}.*?)\s*$"
)
_MODEL_OR_SIZE_LIKE_RE = re.compile(
    r"[A-Za-zА-Яа-яЁё]*\d+(?:[-х×x/\\.A-Za-zА-Яа-яЁё\d]*)"
)
# Длинное наименование: ≥12 подряд букв/пробелов/дефисов — типично для
# name в data-row, никогда не встречается в штампе ЕСКД (штамп имеет
# только короткие слова «Изм.», «Подп.», «Формат А3», максимум 10-12
# символов типа «Кол.уч.»).
_LONG_NAME_RE = re.compile(
    r"[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё\s\-]{11,}",
)


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
            # R24 — x-gap aware join (E15.05 it2): не склеиваем «Pc=3 0 0 Па»
            # с лишними пробелами. Spans с маленьким x-gap (<font_size*0.3)
            # идут вплотную, с большим — через пробел.
            text = _join_column_spans_with_gap(col_spans, baseline_size).strip()
            if text:
                merged_cells[col] = text

        # R25 — stamp filter по всем cells (E15.05 it2, был только cells.name).
        # Если ячейка целиком штамп («Дата и подпись», «Код уч № док») —
        # чистим её. Если после очистки в row не осталось полезных cells →
        # дропаем row полностью (title-block fragment).
        merged_cells = {
            col: val for col, val in merged_cells.items() if not is_stamp_cell(val)
        }

        # Spec-2 заход 2/10: split pos если словосочетание попало в pos-column.
        # Пример: cells.pos='5.6 Шпилька' → pos='5.6', name='Шпилька ' + прежний.
        # Safe на spec-ov2: pos там буквенный (ПН2-4,5, ВД1), не matches regex.
        pos_raw = merged_cells.get("pos", "")
        m = _POS_WITH_WORD_RE.match(pos_raw)
        if m:
            merged_cells["pos"] = m.group(1)
            word = m.group(2).strip()
            existing_name = merged_cells.get("name", "").strip()
            merged_cells["name"] = (
                f"{word} {existing_name}".strip() if existing_name else word
            )

        if not merged_cells and not raw_blocks:
            continue
        if not merged_cells:
            # Все cells-штампы отфильтрованы, ни одна не попала в колонки —
            # это artefact title-block. Не emit'им TableRow.
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


def _join_column_spans_with_gap(spans: list[_Span], baseline_size: float) -> str:
    """R24 (E15.05 it2): склейка span'ов одной колонки с учётом x-gap.

    PDF часто выводит «Pc=300 Па» как 4-5 отдельных span'ов из-за kerning
    (`Pc=` + `3` + `0` + `0` + `Па`). Старая склейка через `" ".join()` давала
    «Pc=3 0 0 Па». Здесь смотрим на физический x-gap между соседними spans:

      gap < font_size * 0.3  → внутри слова/числа, concat без пробела
      gap ≥ font_size * 0.3  → между словами, concat через пробел

    Threshold 30% от font_size — типовая ширина пробела в моноширинном 10pt
    шрифте. Baseline font size используется если в спане size=0 (missing
    metadata — редкий edge case у синтетических pdf).
    """
    if not spans:
        return ""
    spans_sorted = sorted(spans, key=lambda s: s.disp_x)
    parts: list[str] = [spans_sorted[0].text]
    for i in range(1, len(spans_sorted)):
        prev = spans_sorted[i - 1]
        cur = spans_sorted[i]
        gap = cur.disp_x - (prev.disp_x + prev.width)
        font_size = max(cur.size, prev.size, baseline_size)
        threshold = font_size * 0.3
        if gap < threshold:
            parts.append(cur.text)
        else:
            parts.append(" " + cur.text)
    return "".join(parts)


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


# ---------------------------------------------------------------------------
# E16 it1 — Invoice column-aware extraction
# ---------------------------------------------------------------------------
#
# Parser счетов от поставщиков. Колонки отличаются от ЕСКД-таблицы:
#   pos         — «№» / «#»
#   name        — «Товары (работы, услуги)» / «Товар / Услуга» / «Наименование»
#   supply_type — «ЗТ*» (ЛУИС+: X = заказной; редко в других поставщиках)
#   lead_time   — «Срок» (поставки, «7 р.д.»)
#   unit        — «Ед.» / «Ед. изм.» (не всегда — часто сливается в qty)
#   qty         — «Кол-во»
#   price_unit  — «Цена» / «Цена, руб»
#   vat_amount  — «в т.ч. НДС» (абсолютный НДС по строке, invoice-01)
#   price_total — «Сумма» / «Сумма, руб»
#   notes       — «Примечание»
#
# Шапка счетов почти всегда одно- или двухстрочная — в отличие от ЕСКД (3-6
# строк с переносами слов через дефис), так что агрессивный single-row
# fallback из `_detect_column_ranges` (shift-калибровка к _DEFAULT_COLUMN_BOUNDS)
# неприменим: нет канонических границ ЕСКД для invoice-форм. Используем
# только per-page detection через `_merge_multi_row_header` с
# `_INVOICE_HEADER_MARKER_PATTERNS`. Если шапка не распознана или детектировано
# < 4 колонок → возвращаем `[]` (парсер инвойса упадёт на multimodal/vision
# fallback либо Phase 0 LLM-title-block подхватит без items).

INVOICE_COLUMN_KEYS: tuple[str, ...] = (
    "pos",
    "name",
    "supply_type",
    "lead_time",
    "unit",
    "qty",
    "price_unit",
    "vat_amount",
    "price_total",
    "notes",
)

# Порядок patterns критичен: более специфичные (supply_type «зт*», vat_amount
# «в т.ч. ндс», price_total «сумма», price_unit «цена») идут РАНЬШЕ общих
# (name, qty). «Цена» матчится по substring — должна уйти в price_unit, а не в
# price_total (который содержит «сумма»).
_INVOICE_HEADER_MARKER_PATTERNS: list[tuple[str, tuple[str, ...]]] = [
    ("pos", ("№", "# ", " №", "позиция", "поз.")),
    ("supply_type", ("зт*", "зт ", " зт", "тип товара", "зт\n")),
    ("lead_time", ("срок постав", "срок")),
    ("vat_amount", ("в т.ч. ндс", "в т. ч. ндс", "в том числе ндс", "ндс, руб", "в том")),
    ("price_unit", ("цена",)),
    ("price_total", ("сумма",)),
    ("qty", ("кол-во", "количество", "кол.")),
    ("unit", ("ед. изм", "ед.изм", "единица изм", "ед изм", "ед.")),
    ("notes", ("примечан", "комментар")),
    ("name", (
        "наименование",
        "товар / услуга",
        "товар/услуга",
        "товары (работы",
        "товары, работы",
        "работ, услуг",
        "работы, услуги",
    )),
]


_QTY_UNIT_COMBINED_RE = re.compile(
    r"^(?P<qty>\d+(?:[.,]\d+)?)\s+(?P<unit>[а-яА-Яa-zA-Z]+\.?)\s*$"
)

# Разделяет «813 591,00 в наличии» → ("813 591,00", "в наличии"). Правила:
# - число может быть с разделителями пробелами и запятой/точкой («1 714 790,31»);
# - после числа идёт ≥1 пробел и произвольный текст (комментарий).
_NUM_WITH_TAIL_RE = re.compile(
    # tail ОБЯЗАН начинаться с буквы — иначе «6 687,50» может расщепиться
    # на num="6", tail="687,50" из-за backtracking. Цифра-после-пробела
    # это разделитель тысяч, а не отдельный текстовый хвост.
    r"^(?P<num>\d+(?:[\s   ][\d]{3})*(?:[.,]\d+)?)"
    r"\s+(?P<tail>[А-Яа-яA-Za-z][^\n]*)$"
)

# Парсинг lead_time «7 р.д.» / «30 дней» / «2 нед.».
_LEAD_TIME_RE = re.compile(
    r"^(?P<n>\d+)\s*(?P<unit>р\.?\s*д\.?|дн(?:ей|я|\.?)|нед(?:ел[яьи]|\.?))\s*$",
    re.IGNORECASE,
)

# «Итоговые» маркеры в name-колонке — такие row не item, а footer (итого /
# НДС / всего к оплате / прописью). Фильтруется на уровне extractor'а, чтобы
# LLM не тратил токены на footer-rows.
_INVOICE_FOOTER_RE = re.compile(
    r"^(?:"
    r"итого[,:\s]|"
    r"в\s*т\.?\s*ч\.?\s*ндс|"
    r"в\s*том\s*числе\s*ндс|"
    r"всего\s*к\s*оплате|"
    r"всего\s*наименован|"
    r"сумма\s*прописью|"
    r"прописью[:\s]|"
    r"подитог|"
    r"итого\s*по\s*документу"
    r")",
    re.IGNORECASE,
)


def split_qty_unit(value: str) -> tuple[str, str]:
    """«27 шт.» → ("27", "шт."). Если не split'ится — вся строка как qty,
    unit="" (сигнал нормализатору: попробовать распарсить как число целиком).

    Используется когда в bbox-header не нашлась отдельная колонка «Ед.изм.»
    и единица измерения сидит внутри «Кол-во» (формат ЛУИС+).
    """
    if not value:
        return "", ""
    m = _QTY_UNIT_COMBINED_RE.match(value.strip())
    if not m:
        return value.strip(), ""
    return m.group("qty"), m.group("unit")


def parse_lead_time_days(value: str) -> int | None:
    """«7 р.д.» → 7; «30 дней» → 30; «2 нед.» → 14. None если не парсится.

    В счёте ЛУИС+ значение в колонке «Срок» приходит как «7 р.д.» — для
    backlog-payments важно иметь число дней, чтобы планировать поставку.
    """
    if not value:
        return None
    m = _LEAD_TIME_RE.match(value.strip())
    if not m:
        return None
    n = int(m.group("n"))
    unit = m.group("unit").lower()
    if unit.startswith("нед"):
        return n * 7
    return n


def _split_number_with_tail(cell: str) -> tuple[str, str]:
    """«813 591,00 в наличии» → ("813 591,00", "в наличии"). Если текст после
    числа не найден → (cell, ""). Используется чтобы вытащить `notes` из
    суммарной колонки price_total когда span-extraction PyMuPDF объединил оба
    в одну ячейку (edge case ЛУИС+).
    """
    if not cell:
        return "", ""
    m = _NUM_WITH_TAIL_RE.match(cell.strip())
    if not m:
        return cell.strip(), ""
    return m.group("num").strip(), m.group("tail").strip()


def _is_invoice_footer_row(merged_cells: dict[str, str]) -> bool:
    """Row — footer (итого, НДС, всего к оплате, прописью)?

    Проверяем все ячейки, т.к. «Итого:» / «в т.ч. НДС:» могут попасть в
    ЛЮБУЮ колонку в зависимости от column detection (invoice-01: «Итого:»
    при x=488 падает в vat_amount; ЛУИС+: «Итого, руб:» падает в qty).
    """
    for v in merged_cells.values():
        text = (v or "").strip()
        if text and _INVOICE_FOOTER_RE.match(text):
            return True
    return False


def _detect_invoice_header(
    buckets: list[list[_Span]],
) -> tuple[dict[str, tuple[float, float]], int]:
    """Column-detection для счетов — single dense header row.

    В отличие от ЕСКД-таблицы (multi-row со склейкой дефисов), шапка счёта
    почти всегда одно- или двухстрочная и содержит 5-8 различных маркеров.
    Ищем ПЕРВЫЙ y-bucket где ≥3 distinct invoice-column markers матчатся
    одновременно — это канонический header row.

    Возвращает ({col: (x_min, x_max)}, last_header_idx). Пустой dict если
    не нашлось.
    """
    def _bucket_markers(
        bucket: list[_Span],
    ) -> dict[str, list[tuple[float, float]]]:
        out: dict[str, list[tuple[float, float]]] = {}
        for span in bucket:
            t = span.text.strip().lower()
            if not t:
                continue
            for col, patterns in _INVOICE_HEADER_MARKER_PATTERNS:
                if any(p in t for p in patterns):
                    out.setdefault(col, []).append(
                        (span.disp_x, span.disp_x + span.width)
                    )
                    break
        return out

    def _bucket_y(bucket: list[_Span]) -> float:
        return sum(s.disp_y for s in bucket) / max(len(bucket), 1)

    # Max y-distance между смежными buckets, которые ещё считаются одной
    # шапкой. 11pt — близко к высоте 10pt строки (baseline-to-baseline
    # ~11-12pt): продолжение шапки «в том» / «числе» / «НДС» получает
    # gap ≈ 9pt, а смежные строки параграфа «! Срок действия счёта !»
    # ≈ 12-13pt и отрежутся.
    _HEADER_Y_STICK_TOLERANCE = 11.0

    header_idx = -1
    header_cols: dict[str, list[tuple[float, float]]] = {}

    for idx, bucket in enumerate(buckets[:40]):
        bucket_cols = _bucket_markers(bucket)
        # Порог 3 different columns в одном bucket — надёжный сигнал header
        # row. Заголовок счёта всегда плотный: минимум name+qty+price_unit+
        # price_total + что-то ещё.
        if len(bucket_cols) >= 3:
            header_idx = idx
            dense_y = _bucket_y(bucket)
            for col, xs in bucket_cols.items():
                header_cols.setdefault(col, []).extend(xs)
            # Look-back: многостроковая шапка (vat_amount в invoice-01:
            # «в том» / «числе» / «НДС» на y=410-429) — эти строки бывают
            # ВЫШЕ dense header. Но только если y-gap < _HEADER_Y_STICK —
            # иначе мы затянем параграф «! Срок действия счёта !» из тела.
            last_y = dense_y
            for look_back in range(1, 4):
                pidx = idx - look_back
                if pidx < 0:
                    break
                prev_bucket = buckets[pidx]
                prev_y = _bucket_y(prev_bucket)
                if last_y - prev_y > _HEADER_Y_STICK_TOLERANCE:
                    break
                prev_cols = _bucket_markers(prev_bucket)
                if not prev_cols:
                    break
                for col, xs in prev_cols.items():
                    header_cols.setdefault(col, []).extend(xs)
                last_y = prev_y
            # Look-ahead: шапка продолжается ниже (invoice-01 «НДС» на
            # y=429.4 после dense y=419.3).
            last_y = dense_y
            for look_ahead in range(1, 4):
                nidx = idx + look_ahead
                if nidx >= len(buckets):
                    break
                next_bucket = buckets[nidx]
                next_y = _bucket_y(next_bucket)
                if next_y - last_y > _HEADER_Y_STICK_TOLERANCE:
                    break
                next_cols = _bucket_markers(next_bucket)
                if not next_cols:
                    break
                for col, xs in next_cols.items():
                    header_cols.setdefault(col, []).extend(xs)
                header_idx = nidx
                last_y = next_y
            break

    if not header_cols:
        return {}, -1

    detected: dict[str, tuple[float, float]] = {}
    for col, extents in header_cols.items():
        x_min = min(x0 for x0, _ in extents)
        x_max = max(x1 for _, x1 in extents)
        detected[col] = (x_min, x_max)
    return detected, header_idx


def extract_invoice_rows(page: object) -> list[TableRow]:
    """Извлечь таблицу items счёта из страницы PDF в виде bbox-структуры.

    Mirror `extract_structured_rows` (spec parser) по алгоритму:
      1. Spans → derotate → y-bucket.
      2. Column detection через `_detect_invoice_header` — ищет dense
         header row с ≥3 маркерами invoice-паттернов.
      3. Per-bucket: spans → колонки по x-center + x-gap aware join.
      4. Footer filter (итого / НДС / всего к оплате).
      5. Post-process split:
         - qty «27 шт.» → qty + unit (если unit-колонка пуста).
         - price_total «813 591,00 в наличии» → price_total + notes
           (если notes-колонка пуста).
    """
    page_number = int(getattr(page, "number", 0)) + 1
    spans = _collect_spans(page)
    if not spans:
        return []

    page_rect = getattr(page, "rect", None)
    buckets = _bucket_by_y(spans)

    detected, last_header_idx = _detect_invoice_header(buckets)
    if len(detected) < 4:
        # Шапка счёта не распознана (либо мусорная вёрстка, либо скан без
        # text layer). Не рискуем — возвращаем пусто, пусть multimodal/vision
        # fallback отработает на картинке.
        return []

    ranges = _build_ranges_from_detected(detected)
    baseline_size = _baseline_font_size(spans)

    rows: list[TableRow] = []
    row_idx = 0
    for bidx, bucket in enumerate(buckets):
        if bidx <= last_header_idx:
            continue
        if page_rect is not None and _is_title_block_bucket(bucket, page_rect):
            continue

        kept: list[_Span] = []
        for span in bucket:
            if is_stamp_text(span.text):
                continue
            kept.append(span)
        if not kept:
            continue

        cells: dict[str, list[_Span]] = {k: [] for k in INVOICE_COLUMN_KEYS}
        raw_blocks: list[str] = []
        for span in sorted(kept, key=lambda s: s.disp_x):
            center = span.disp_x + span.width / 2
            col = _assign_column(center, ranges)
            raw_blocks.append(span.text)
            if col and col in cells:
                cells[col].append(span)

        merged_cells: dict[str, str] = {}
        for col, col_spans in cells.items():
            if not col_spans:
                continue
            text = _join_column_spans_with_gap(col_spans, baseline_size).strip()
            if text:
                merged_cells[col] = text

        # Footer filter — итого/НДС/всего не попадают в items.
        if _is_invoice_footer_row(merged_cells):
            continue

        merged_cells = _post_process_invoice_cells(merged_cells)

        if not merged_cells:
            continue

        y_mid = sum(s.disp_y for s in kept) / len(kept)
        rows.append(
            TableRow(
                page_number=page_number,
                y_mid=y_mid,
                row_index=row_idx,
                cells=merged_cells,
                raw_blocks=raw_blocks,
                is_header=False,
                is_section_heading=False,
            )
        )
        row_idx += 1

    return rows


def _post_process_invoice_cells(cells: dict[str, str]) -> dict[str, str]:
    """Split-heuristics: qty+unit / price_total+notes.

    PyMuPDF часто склеивает соседние фрагменты текста в один span, если между
    ними нет зазора. В инвойсе ЛУИС+ колонки «Сумма» и «Примечание» идут
    вплотную → «813 591,00 в наличии» попадает как одна ячейка. Разделяем
    явно, чтобы нормализатор (LLM) получил чистые значения.
    """
    out = dict(cells)

    qty = out.get("qty", "")
    if qty and not out.get("unit"):
        qty_num, qty_unit = split_qty_unit(qty)
        if qty_unit:
            out["qty"] = qty_num
            out["unit"] = qty_unit

    total = out.get("price_total", "")
    if total and not out.get("notes"):
        num, tail = _split_number_with_tail(total)
        if tail:
            out["price_total"] = num
            out["notes"] = tail

    # Если «7 р.д.» попал в qty (ЛУИС+ row 4 — нет отдельного qty на этой
    # строке, lead_time попал в qty-колонку из-за смещения) — нужно перенести
    # в lead_time. Детект: qty не парсится как число, но парсится как период.
    qty_after = out.get("qty", "")
    if qty_after and parse_quantity(qty_after) is None:
        lt_days = parse_lead_time_days(qty_after)
        if lt_days is not None and not out.get("lead_time"):
            out["lead_time"] = qty_after
            del out["qty"]

    return out

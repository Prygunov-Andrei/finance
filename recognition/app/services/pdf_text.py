"""Text-layer parser для PDF-спецификаций — без LLM.

Работает по нативно-экспортированным PDF (PyMuPDF `page.get_text()` возвращает
осмысленный текст). Эвристика:

1. Читаем строки в порядке reading order (как отдаёт fitz, с учётом rotation).
2. Якорь строки данных — unit-ключевое слово (шт, м.п., м.кв., кг, ...).
3. Предыдущие N строк в буфере — name/model, следующая строка — quantity.
4. Секционные заголовки (Система / Клапаны / ...) выставляют current_section.
5. Штампы (Формат А3 / Изм. / Подп. / ... и column headers) фильтруются.

Тестировалось на реальной спецификации ОВ2 (9 A3 страниц, 152 позиции) —
recall ≈98% без LLM.
"""

import re
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
    "Подп. и дата",
    "Инв. № подл.",
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
# Держим список коротким: ложноположительный section важнее пропущенного.
_SECTION_RE = re.compile(
    r"^(?:Система\s|Клапаны\s|Противодымная\b|Противодымной\b|Общеобменн"
    r"|Воздуховоды\s|Воздуховод\s+приточной"
    r"|Слаботочн|Отопление\s|Кондиционирован|Дымоудален|Приточная\s|Вытяжная\s)",
    re.IGNORECASE,
)

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
    """True если строка целиком является элементом штампа/шапки таблицы."""
    s = text.strip()
    if not s:
        return True
    if s in _STAMP_EXACT:
        return True
    # Одиночный номер страницы (цифры длиной 1-3) — мусор.
    if re.fullmatch(r"\d{1,3}", s):
        return True
    # «+10%», «+15%» — колонки запаса.
    if re.fullmatch(r"\+\d{1,3}%?", s):
        return True
    # Год («2024г.», «2025г.»).
    if re.fullmatch(r"\d{4}г\.?", s):
        return True
    # Шифр спецификации типа «470-05/2025-ОВ2.СО»: формат NNN-NN/YYYY-...
    # Модели оборудования обычно не содержат «/YYYY-» → риск коллизии низкий.
    if re.match(r"^\d{2,4}-\d{1,4}/\d{4}-", s):
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

"""Post-process hooks для E15-06: safety-net поверх LLM нормализации.

1. `apply_no_qty_merge` (QA #51/#53) — склеить «продолжения» имени, которые
   LLM по какой-то причине выдал отдельными items. Эвристика: если у item
   quantity=0 И unit пуст И name начинается с lowercase / предлога /
   характерного прилагательного — это орфан, который должен был приклеиться
   к предыдущему item.

2. `cap_sticky_name` (QA #55) — отрезать sticky parent name у items, где он
   был применён к НЕ-серийной позиции. Sticky разрешён только когда текущая
   name содержит variant-marker (буквы + цифра): ПН2, ПД1, КВО-10 и т.п.
   Если LLM приписал sticky «Решётка» к «Воздуховод 250х100» — это ошибка.

E15-06 it2:

3. `restore_from_bbox_rows` (QA #55 strict) — сверить item.name с cells.name
   исходной bbox-row. Если LLM эмитировала «Решётка» для row где cells.name =
   «Воздуховод 250х100» — восстановить «Воздуховод» как источник истины.
   `cap_sticky_name` не видит подмены (работает только с LLM output).

4. `cover_bbox_rows` (QA #51 strict) — coverage-check: для каждой bbox-row
   с непустым cells.name убедиться что есть соответствующий item. Если
   row не покрыт items — это потерянная continuation, склеиваем в
   предыдущий item.name.
"""

from __future__ import annotations

import re

from .pdf_text import TableRow
from .spec_normalizer import NormalizedItem

# Предлоги / союзы которые однозначно начинают continuation.
_CONTINUATION_PREFIXES = (
    "с ", "на ", "в ", "под ", "для ", "из ", "над ", "при ", "через ",
    "со ", "во ", "ко ", "без ",
)

# Прилагательные в начале continuation-фрагментов (нижний регистр
# гарантирован is-lowercase проверкой выше, но регистронезависимо
# нужен на случай когда LLM сохраняет заглавную).
_CONTINUATION_ADJECTIVES_RE = re.compile(
    r"^(круглый|круглое|круглая|круглые|круглых|"
    r"морозостойкий|морозостойкие|морозостойких|"
    r"оцинкованный|оцинкованные|оцинкованных|оцинкованный|"
    r"защитный|защитное|защитная|защитные|защитных|"
    r"прямоугольный|прямоугольные|квадратный|квадратные|"
    r"стальной|стальные|стальных|"
    r"гибкий|гибкие|гибких|"
    r"утеплённый|утеплённые|утеплённых|утепленный|утепленные)\b",
    re.IGNORECASE,
)


def _looks_like_continuation(name: str) -> bool:
    """True если name выглядит как продолжение предыдущего item-а."""
    s = name.strip()
    if not s:
        return False
    if s[0].islower():
        return True
    lower = s.lower()
    if any(lower.startswith(p) for p in _CONTINUATION_PREFIXES):
        return True
    if _CONTINUATION_ADJECTIVES_RE.match(s):
        return True
    return False


def apply_no_qty_merge(items: list[NormalizedItem]) -> list[NormalizedItem]:
    """QA #51/#53: merge continuation-строк в предыдущий item.

    Правила merge (ЛЮБОЕ из двух триггерит склейку):

    (A) Классический «остаток» — quantity==0 И пустой unit И name выглядит
        как continuation (lowercase / предлог / continuation-прилагательное).

    (B) LLM-copy-qty артефакт — LLM иногда копирует qty+unit из предыдущей
        row в continuation-row (потому что в bbox-rows continuation сидит
        рядом с полной строкой). Признаки: (1) name выглядит как
        continuation, (2) qty И unit СОВПАДАЮТ с предыдущим item'ом,
        (3) у current item нет собственного model_name и brand/manufacturer
        (полноценная позиция всегда имеет хотя бы model или brand). В этом
        случае это не отдельная позиция, а продолжение имени.

    Первый item, даже если по виду похож на continuation, сохраняется как
    есть (некуда приклеивать).
    """
    if not items:
        return items
    out: list[NormalizedItem] = [items[0]]
    for item in items[1:]:
        qty = item.quantity or 0
        unit = (item.unit or "").strip()
        name_is_cont = _looks_like_continuation(item.name)

        # (A) no-qty & no-unit continuation.
        if name_is_cont and qty == 0 and unit == "":
            prev = out[-1]
            prev.name = f"{prev.name.rstrip()} {item.name.strip()}".strip()
            continue

        # (B) LLM-copy-qty: qty/unit совпадают с предком, пустой model/brand.
        if name_is_cont:
            prev = out[-1]
            prev_qty = prev.quantity or 0
            prev_unit = (prev.unit or "").strip()
            no_identity = not (item.model_name or item.brand or item.manufacturer)
            if (
                no_identity
                and prev_qty > 0
                and abs(qty - prev_qty) < 1e-6
                and unit == prev_unit
            ):
                prev.name = f"{prev.name.rstrip()} {item.name.strip()}".strip()
                continue

        out.append(item)
    return out


# ---------------------------------------------------------------------------
# QA #55 — sticky-name cap для не-серийных позиций
# ---------------------------------------------------------------------------
#
# variant-marker: буквенный (латиница/кириллица) префикс длиной 1–4 символа,
# затем опциональный разделитель (`-`, ` `, `.`), цифра. Примеры «да»:
# ПН2, ПД1, В1-3, ПК 4,5, КВО-10, АПК-10, КПУ2. Примеры «нет»: «Воздуховод»,
# «250х100», «Защитный козырёк» — НЕ содержат (букв+цифра) в начале.
_VARIANT_MARKER_RE = re.compile(r"^[A-Za-zА-Яа-яЁё]{1,4}[-\s.]?\d", re.UNICODE)


def _has_variant_marker(name: str) -> bool:
    """True если name начинается с кода-варианта (серия)."""
    s = (name or "").strip()
    if not s:
        return False
    return bool(_VARIANT_MARKER_RE.match(s))


def cap_sticky_name(
    items: list[NormalizedItem],
    *,
    initial_sticky: str = "",
) -> list[NormalizedItem]:
    """QA #55: отрезать sticky parent name у non-series items.

    Эвристика: если у item.name есть «parent sticky» (совпадает с предыдущим
    item.name или с initial_sticky, пришедшим с входа страницы), и при этом
    current item НЕ содержит variant-marker в оставшемся хвосте → sticky
    применился ошибочно, убираем его.

    В реальности LLM формирует name как единую строку («Решётка воздуховод
    250х100»), а не «parent + child». Поэтому мы проверяем: начинается ли
    name с known-sticky-parent, и если да — остаток не содержит variant-
    marker → режем sticky.

    Работает чисто защитно: если parent не определяется ни как повтор
    предыдущего, ни как initial_sticky — ничего не трогаем.
    """
    if not items:
        return items

    out: list[NormalizedItem] = []
    last_full_name = initial_sticky.strip() if initial_sticky else ""
    last_real_base: str = last_full_name  # «база» серии — то, что может стать sticky
    for item in items:
        original = item.name.strip()
        if not original:
            out.append(item)
            continue

        # Кандидаты на sticky-parent, с которого могло начаться item.name:
        # 1) base предыдущей серии (если у предыдущего name содержал variant-marker
        #    — например «Клапан КПУ2» → sticky-база «Клапан»);
        # 2) full name предыдущего item (если предыдущий сам был головой серии);
        # 3) initial_sticky со входа страницы.
        candidates: list[str] = []
        if last_real_base:
            candidates.append(last_real_base)
        if last_full_name and last_full_name != last_real_base:
            candidates.append(last_full_name)

        stripped = original
        sticky_applied = ""
        for cand in candidates:
            c = cand.strip()
            if not c:
                continue
            # current item начинается с candidate + space → sticky-применение.
            if stripped.startswith(c + " "):
                remainder = stripped[len(c):].lstrip()
                # Отрезаем sticky ТОЛЬКО если:
                #   (a) остаток начинается с БУКВЫ (т.е. это другое имя,
                #       а не размеры/артикул/variant-code),
                #   (b) остаток НЕ начинается с variant-marker (буква+цифра —
                #       это series, sticky легитимен),
                #   (c) остаток — осмысленная фраза длиной ≥ 4 символов.
                #
                # Если remainder начинается с цифры («250х100», «1,5») — это
                # размеры-продолжение legitimate parent'а, sticky не режем.
                remainder_safe = (
                    len(remainder) >= 4
                    and remainder[0].isalpha()
                    and not _has_variant_marker(remainder)
                )
                if remainder_safe:
                    sticky_applied = c
                    stripped = remainder
                break

        if sticky_applied:
            item.name = stripped[:500]

        # Обновляем контекст для следующей итерации.
        last_full_name = item.name.strip()
        # Базой серии считаем «head» имени до первого variant-marker-слова.
        # Если текущий name начинается с variant-marker → он сам — голова серии,
        # и base = пусто (sticky будет сброшен на следующей ИТОГОВОЙ голове).
        if _has_variant_marker(last_full_name):
            # Например «ПН2-4,5-Решётка» — это variant, base = то, что перед
            # variant-marker'ом, т.е. пусто. Но такие items обычно не дают
            # sticky-родителя, они сами являются вариантом.
            last_real_base = ""
        else:
            last_real_base = last_full_name

        out.append(item)

    return out


# ---------------------------------------------------------------------------
# E15-06 it2 — bbox-row safety-net (QA #55 strict, #51 strict)
# ---------------------------------------------------------------------------

# «Значимое слово» в cells.name — буквенная последовательность ≥ 4 символов,
# начинающаяся с заглавной буквы (имя собственное / термин). Используется
# как якорь для detection подмены LLM'ом name.
_WORD_CAPITAL_RE = re.compile(r"^[A-ZА-ЯЁ][A-Za-zА-Яа-яЁё]{3,}", re.UNICODE)


def _first_significant_word(text: str) -> str:
    """Вернуть первое «значимое слово» (≥4 букв с заглавной) из text, либо ''.

    Нужно для comparison item.name vs cells.name: если cells.name начинается
    с «Воздуховод», а item.name — с «Решётка», первое слово различается →
    LLM подменила.
    """
    s = (text or "").strip()
    if not s:
        return ""
    first_chunk = s.split()[0] if s.split() else ""
    m = _WORD_CAPITAL_RE.match(first_chunk)
    if not m:
        return ""
    return m.group(0)


def restore_from_bbox_rows(
    items: list[NormalizedItem],
    rows: list[TableRow],
) -> list[NormalizedItem]:
    """QA #55 strict: восстановить item.name из cells.name если LLM подменила.

    Фон: `cap_sticky_name` режет sticky только если видит её как префикс в
    item.name. Но LLM часто ПОЛНОСТЬЮ заменяет cells.name = «Воздуховод» на
    sticky «Решётка» (не добавляет, а подставляет). cap_sticky_name этого не
    ловит.

    Эвристика:

    1. Для каждого item с source_row_index != None находим соответствующую row.
    2. Если cells.name пусто — skip (row-variant без name, legit sticky).
    3. Если cells.name начинается с variant-marker (ПН2, В1-3) — skip
       (legit sticky: «Клапан ПН2» и cells.name = «ПН2-4,5»).
    4. Иначе сравниваем первое значимое слово item.name vs cells.name:
       - если разные И первое слово cells.name ≥ 4 символов — item.name
         подменили, восстанавливаем name = cells.name (full value, не только
         первое слово).

    Не ломаем: если у row cells.name == item.name — ничего не трогаем. Если
    item.model_name непуст и cells.model непуст — это полноценный item с
    корректной parent-name сверху (НЕ case #55), тоже не трогаем.
    """
    if not items or not rows:
        return items

    rows_by_idx: dict[int, TableRow] = {r.row_index: r for r in rows}

    for item in items:
        idx = item.source_row_index
        if idx is None:
            continue
        row = rows_by_idx.get(idx)
        if row is None:
            continue
        cells_name = (row.cells.get("name") or "").strip()
        if not cells_name:
            continue
        # Legit sticky: cells.name начинается с variant-marker ("ПН2-4,5") —
        # это row-variant, имя legit наследуется от sticky-parent.
        if _has_variant_marker(cells_name):
            continue
        # Если cells.name целиком совпадает с item.name — порядок.
        if cells_name == item.name.strip():
            continue

        first_cells = _first_significant_word(cells_name)
        first_item = _first_significant_word(item.name)
        if not first_cells:
            # cells.name короткая / без capital word — не наш кейс.
            continue
        if first_cells == first_item:
            # LLM добавила/склеила continuation к cells.name, но корень тот же.
            continue
        # ПОДМЕНА: item.name начинается с другого корня чем cells.name.
        # Восстанавливаем cells.name полностью. model/brand/qty остаются от item.
        item.name = cells_name[:500]

    return items


def cover_bbox_rows(
    items: list[NormalizedItem],
    rows: list[TableRow],
) -> list[NormalizedItem]:
    """QA #51 strict: склеить bbox-rows которые LLM потеряла как continuation.

    Фон: `apply_no_qty_merge` работает на items — а LLM иногда просто
    ВЫБРАСЫВАЕТ continuation-row вовсе, и в items её нет. Post-process по
    items не видит что пропала.

    Эвристика:

    1. Собираем set covered_rows = {source_row_index для items с != None}.
    2. Идём по rows по порядку. Для row i где cells.name непуст, row не
       section-heading, row не покрыт items:
       - cells.qty/unit/model/brand пусты → это continuation, склеиваем
         cells.name с предыдущим выведенным items[].name (ближайшим с
         source_row_index < i).
       - иначе → legit lost item, не наше дело (log как warning и оставить).

    Не добавляет новых items (мы не знаем qty/unit потерянной позиции);
    только склеивает continuation-строки. Потеря complete-позиции остаётся
    видимой через vision_counter / expected_count tolerance.

    Если source_row_index не заполнен вообще (LLM проигнорировал правило 17)
    — пропускаем (без mapping coverage-check неадекватен).
    """
    if not items or not rows:
        return items

    have_any_index = any(it.source_row_index is not None for it in items)
    if not have_any_index:
        return items

    covered: set[int] = {
        it.source_row_index for it in items if it.source_row_index is not None
    }

    for row in rows:
        if row.row_index in covered:
            continue
        cells_name = (row.cells.get("name") or "").strip()
        if not cells_name:
            continue
        if row.is_section_heading:
            continue
        # Это continuation (нет qty/unit/model/brand)?
        has_qty = bool((row.cells.get("qty") or "").strip())
        has_unit = bool((row.cells.get("unit") or "").strip())
        has_model = bool((row.cells.get("model") or "").strip())
        has_brand = bool((row.cells.get("brand") or "").strip())
        is_continuation = not (has_qty or has_unit or has_model or has_brand)
        if not is_continuation:
            # Это полноценная потерянная позиция — склеивать в name
            # соседнего item нельзя, это исказит данные. Оставляем для
            # vision_counter / suspicious-flag.
            continue
        # Находим ближайший предыдущий item (по source_row_index < row.row_index).
        prev_item: NormalizedItem | None = None
        prev_idx = -1
        for it in items:
            if it.source_row_index is None:
                continue
            if it.source_row_index < row.row_index and it.source_row_index > prev_idx:
                prev_idx = it.source_row_index
                prev_item = it
        if prev_item is None:
            # Continuation до первого item — пропускаем (некуда приклеивать).
            continue
        # Приклеиваем только если остаток действительно похож на continuation
        # (иначе это заголовок / шум, не трогаем).
        if not (
            _looks_like_continuation(cells_name)
            or len(cells_name) <= 60
        ):
            continue
        prev_item.name = (
            f"{prev_item.name.rstrip()} {cells_name.strip()}".strip()
        )[:500]
        covered.add(row.row_index)

    return items

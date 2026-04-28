"""Post-process hooks для E15-06: safety-net поверх LLM нормализации.

0. `backfill_source_row_index` (spec-2 заход 2/10) — fallback если LLM
   (gpt-5.2) молча игнорирует правило 17 промпта и не заполняет
   source_row_index. Без этого restore_from_bbox_rows и cover_bbox_rows
   disabled — весь safety-net не работает. Fallback: sequential mapping
   items[i] → i-я «head row» (row с непустым pos OR qty).

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

# Spec-3 Class B: word-break с дефисом + пробел в name (LLM-уровень).
# Pattern: cyrillic lowercase + «-» + whitespace + cyrillic letter (любой регистр)
# → склейка без tire и space. «по- крытием» → «покрытием», «по- Теплозащитное»
# → «поТеплозащитное» (дубль-name из overlap-LLM, перед anti-duplicate).
# Первая буква — только lowercase (чтобы не зацепить list items «1 - Заголовок»
# или коды «А - 12»). Latin вообще не трогаем (могут быть коды типа «TI-HF»).
_WORD_BREAK_DASH_RE = re.compile(r"([а-яё])-\s+([а-яёА-ЯЁ])")


def _unbreak_dash_word(text: str) -> str:
    """Починить word-break с дефисом+пробелом в name-строке."""
    if not text or "-" not in text:
        return text
    return _WORD_BREAK_DASH_RE.sub(r"\1\2", text)


# ---------------------------------------------------------------------------
# TD-04 — P2 cosmetics (Class J/G/I/N/O из AUDIT-TRACKER)
# ---------------------------------------------------------------------------

# Class J — PUNCTUATION_DRIFT в КЛОП-моделях.
# «КЛОП-2(90)-НО-700х500, МВ/S(220)-К» → «КЛОП-2(90)-НО-700х500-МВ/S(220)-К».
# Запятая-пробел между размером и «МВ/S» / «MB/K» / etc — должна быть `-`
# (фрагмент кода серии, не отдельный qualifier).
_KLOP_DRIFT_RE = re.compile(
    r"(КЛОП-\d+\([^)]+\)-(?:НО|НЗ)-[^\s,]+),\s*(М[ВB]/[SК])",
    re.IGNORECASE,
)


def _fix_klop_punctuation_drift(model: str) -> str:
    """Class J: КЛОП-...-700х500, МВ/S → КЛОП-...-700х500-МВ/S."""
    if not model or "КЛОП" not in model.upper():
        return model
    return _KLOP_DRIFT_RE.sub(r"\1-\2", model)


# Class G — TRAILING_HYPHEN: word-break без продолжения.
# «...плёнкой каширо-» в финальном name — обрыв слова без следующей строки.
# Удаляем висячий дефис (но НЕ дефис в середине: «КЛОП-2-90» сохраняется).
_TRAILING_HYPHEN_RE = re.compile(r"(\S)-\s*$")


def _trim_trailing_hyphen(name: str) -> str:
    """Class G: «слово-» в конце → «слово» (обрыв без продолжения)."""
    if not name:
        return name
    return _TRAILING_HYPHEN_RE.sub(r"\1", name)


# Class I — MODEL_INJECTED_INTO_NAME: LLM дописывает «(модель: …)» в name,
# дублируя model_name. Strip-аем в конце name'а если совпадает с model_name.
def _strip_injected_model_suffix(name: str, model_name: str) -> str:
    """Class I: «...установка ... (модель: RL/...)» → «...установка ...»."""
    if not name or not model_name:
        return name
    cleaned = model_name.strip()
    if not cleaned:
        return name
    pattern = re.compile(
        rf"\s*\(модель:\s*{re.escape(cleaned)}\)\s*$",
        re.IGNORECASE,
    )
    return pattern.sub("", name).rstrip()


# Class N — DIGIT_DUPLICATION: «6400/6400» → LLM выдала «6400/64000» (последняя
# цифра дублируется). Pattern: одинаковое число до и после `/`, но второе
# число имеет ровно одну лишнюю цифру в хвосте, дублирующую последнюю.
_DIGIT_DUP_RE = re.compile(r"(?<!\d)(\d{3,})/(\d{4,})(?!\d)")


def _fix_digit_duplication(name: str) -> str:
    """Class N: «6400/64000» → «6400/6400» если 1-е == 2-е без последней цифры
    AND последняя цифра 2-го == последняя 1-го (явный дубль)."""
    if not name or "/" not in name:
        return name

    def _repl(m: re.Match[str]) -> str:
        first, second = m.group(1), m.group(2)
        if len(second) != len(first) + 1:
            return m.group(0)
        if second[:-1] != first:
            return m.group(0)
        if second[-1] != first[-1]:
            return m.group(0)
        return f"{first}/{first}"

    return _DIGIT_DUP_RE.sub(_repl, name)


# Class O — MODEL_TRAILING_DASH_NO_DIGITS: «КЛОП-2(90)-НО-1700х» (нет числа
# после `х`/`x`/`Ø`). Маркируем флагом model_truncated; UI показывает иконку.
_MODEL_TRUNCATED_RE = re.compile(r"(?:[-]|^)(?:Ø|[xх])\s*$|(?<=\d)[xх]\s*$")


def _is_model_truncated_no_digits(model: str) -> bool:
    """Class O: model заканчивается на размер-разделитель без числа."""
    if not model:
        return False
    s = model.strip()
    if not s:
        return False
    return bool(_MODEL_TRUNCATED_RE.search(s))


# Spec-3 заход 3/10 повтор (#5): дублированный pos-prefix «А1-А1-Шкаф...».
# Phase 2c pre-inject кладёт «pos-» в name, но LLM иногда ПРИ ВОЗВРАТЕ тоже
# добавляет свой «pos-» — получается «А1-А1-name». Убираем дубль после LLM.
_DUPLICATE_POS_PREFIX_RE = re.compile(
    r"^([A-Za-zА-Яа-яЁё]{1,2}\d+(?:\.\d+)?)-\1-", re.IGNORECASE
)


def _strip_duplicate_pos_prefix(text: str) -> str:
    """Убрать дублированный короткий alphanum-pos префикс «X1-X1-» → «X1-»."""
    if not text:
        return text
    return _DUPLICATE_POS_PREFIX_RE.sub(r"\1-", text)


# Spec-3 Class G/H: series-suffix items наследуют parent name.
# Паттерны явно определяют «это лишь размер/вариант, а не самостоятельное имя»:
# «n=3сек.» (секции радиатора), «Ду15» (диаметр трубы), «ф100/Ø100» (диаметр
# воздуховода). Такие items с тем же model_name как у соседнего выше —
# продолжение series, name должен inheritовать parent.
_SERIES_SUFFIX_RE = re.compile(
    r"^(?:n=\d+\s*[cс]ек\.?|Ду\d+|[фØø∅]\s*\d+(?:[x×х]\d+)?)\s*$",
    re.IGNORECASE,
)


def inherit_series_parent(
    items: list[NormalizedItem],
    rows: "list[TableRow] | None" = None,
) -> list[NormalizedItem]:
    """Class G/H: items с name-suffix («n=4сек.», «Ду15», «ф100») inheritуют
    полное name от ближайшего предыдущего items с ТОЧНО ТЕМ ЖЕ model_name.

    ДВУХПРОХОДНЫЙ алгоритм: первый pass snapshot'ит ОРИГИНАЛЬНЫЕ names и
    suffix-флаги, второй pass применяет inheritance по snapshot'у — чтобы
    items[i+1] НЕ получил уже-inheritанный name от items[i]. Иначе radiator
    series 114+ аккумулировала «parent n=3 n=4 n=5 ...» (zacход 3/10 повтор).

    Strict match — parent.model_name == item.model_name (обе непустые).

    Safety на spec-ov2/АОВ:
    - spec-ov2 items series «ПН2-4,5 Решетка» уже полный name, не suffix-only
      pattern → не matches.
    - spec-АОВ кабели имеют полное name → не matches.
    """
    _ = rows  # reserved for future use
    if not items:
        return items
    # Pass 1: snapshot original names + is_suffix flag.
    snapshot: list[tuple[str, bool]] = [
        (it.name, bool(_SERIES_SUFFIX_RE.match(it.name.strip())))
        for it in items
    ]
    # Pass 2: apply inheritance только для suffix items, читая ORIGINAL names.
    for i, it in enumerate(items):
        _, is_suffix = snapshot[i]
        if not is_suffix:
            continue
        if not it.model_name:
            continue
        # Ищем назад до 5 items ближайший с тем же model_name AND ОРИГИНАЛЬНЫМ
        # полным name (не suffix-only). Используем snapshot, не изменённые items.
        for j in range(i - 1, max(-1, i - 6), -1):
            prev_name_orig, prev_is_suffix = snapshot[j]
            if prev_is_suffix:
                continue
            prev = items[j]
            if prev.model_name != it.model_name:
                continue
            alpha_count = sum(1 for c in prev_name_orig if c.isalpha())
            if alpha_count < 15:
                continue
            suffix = it.name.strip()
            it.name = f"{prev_name_orig.rstrip()} {suffix}".strip()
            break
    return items

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


def backfill_source_row_index(
    items: list[NormalizedItem],
    rows: "list[TableRow] | None" = None,
) -> list[NormalizedItem]:
    """Sequential fallback для source_row_index если LLM не заполнила.

    gpt-5.2 (E15-06 it2+) игнорирует правило 17 промпта и оставляет
    все items.source_row_index=None. Без этого restore_from_bbox_rows
    и cover_bbox_rows возвращают items без изменений — весь bbox
    safety-net отключён.

    Эвристика: items обычно выдаются в том же порядке что и bbox
    «head rows» (row с непустым cells.pos ИЛИ непустым cells.qty).
    Continuation rows (pos='' AND qty='') — LLM их должна была слить
    в parent item. Мы назначаем items[i].source_row_index = i-я
    head-row.

    Не трогаем items которые LLM уже заполнила корректно (не-None).
    Если rows меньше чем head-items — поздние items остаются None.
    """
    if not items or not rows:
        return items
    # Если хотя бы половина items уже имеют source_row_index — доверяем LLM.
    with_idx = sum(1 for it in items if it.source_row_index is not None)
    if with_idx >= len(items) // 2 and with_idx > 0:
        return items
    # Собираем head-row indices.
    head_indices: list[int] = []
    for r in rows:
        pos = (r.cells.get("pos") or "").strip()
        qty = (r.cells.get("qty") or "").strip()
        if pos or qty:
            head_indices.append(r.row_index)
    # Назначаем по порядку.
    for i, item in enumerate(items):
        if item.source_row_index is not None:
            continue
        if i < len(head_indices):
            item.source_row_index = head_indices[i]
    return items


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
            _merge_continuation_into_prev(prev, item)
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
                _merge_continuation_into_prev(prev, item)
                continue

        out.append(item)
    return out


def _merge_continuation_into_prev(
    prev: NormalizedItem, cont: NormalizedItem
) -> None:
    """Слить continuation-item в предыдущий. Name клеится всегда; model/brand/
    manufacturer — только если у continuation они непустые И у prev — пустые
    ИЛИ короткий (e.g. у prev model='КГППнг(A)-HF 3х1,5', у cont model='(N)-0,66'
    → получаем 'КГППнг(A)-HF 3х1,5 (N)-0,66'). Без anti-duplicate — simple join.

    Spec-3 заход 3/10 Class B: dash-rule word-break. Если prev.name
    заканчивается на '-' AND cont.name начинается с lowercase —
    склейка БЕЗ space, tire убираем («...по-» + «крытием» → «...покрытием»).
    """
    prev_name = prev.name.rstrip()
    cont_name = cont.name.strip()
    if prev_name.endswith("-") and cont_name and cont_name[0].islower():
        prev.name = prev_name[:-1] + cont_name
    else:
        prev.name = f"{prev_name} {cont_name}".strip()
    if cont.model_name and cont.model_name not in prev.model_name:
        prev.model_name = (
            f"{prev.model_name.rstrip()} {cont.model_name.strip()}".strip()
            if prev.model_name
            else cont.model_name.strip()
        )
    if cont.brand and not prev.brand:
        prev.brand = cont.brand
    if cont.manufacturer and not prev.manufacturer:
        prev.manufacturer = cont.manufacturer
    if cont.comments and cont.comments not in prev.comments:
        prev.comments = (
            f"{prev.comments.rstrip()} {cont.comments.strip()}".strip()
            if prev.comments
            else cont.comments.strip()
        )


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


def apply_p2_cosmetics(items: list[NormalizedItem]) -> list[NormalizedItem]:
    """TD-04: P2 cosmetics — Class J/G/I/N/O.

    Применяется в `_apply_postprocess` ПОСЛЕ всех merge-операций — на финальных
    item.name / item.model_name. Каждый класс — независимый regex-fix; никакой
    inter-class зависимости нет.

    - J: punctuation drift в КЛОП model_name.
    - G: trailing hyphen в name (обрыв слова без продолжения).
    - I: «(модель: …)» suffix в name дублирующий model_name.
    - N: digit duplication «6400/64000» → «6400/6400».
    - O: model trailing-dash-no-digits → флаг `model_truncated`.
    """
    for it in items:
        if it.model_name:
            it.model_name = _fix_klop_punctuation_drift(it.model_name)
        if it.name:
            it.name = _strip_injected_model_suffix(it.name, it.model_name)
            it.name = _fix_digit_duplication(it.name)
            it.name = _trim_trailing_hyphen(it.name)
        if it.model_name and _is_model_truncated_no_digits(it.model_name):
            it.model_truncated = True
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
        # Это continuation (нет qty/unit/brand)?
        has_qty = bool((row.cells.get("qty") or "").strip())
        has_unit = bool((row.cells.get("unit") or "").strip())
        has_model = bool((row.cells.get("model") or "").strip())
        has_brand = bool((row.cells.get("brand") or "").strip())
        is_name_only = not (has_qty or has_unit or has_model or has_brand)
        # Spec-2 заход 2/10 Класс B: continuation row с собственным
        # cells.model (fragment серии, например «(N)-0,66») — склеиваем
        # model в parent item.model_name и name тоже (если name-continuation).
        is_name_plus_model = (
            not has_qty and not has_unit and not has_brand and has_model
        )
        if not (is_name_only or is_name_plus_model):
            # Это полноценная потерянная позиция (с qty/unit/brand) —
            # склеивать в name соседнего item нельзя, исказит данные.
            # Оставляем для vision_counter / suspicious-flag.
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
        # Приклеиваем СТРОГО если cells_name — явное continuation
        # (lowercase/предлог/continuation-прилагательное).
        # E15-06 it2 hotfix: убрали fallback `len <= 60` — он ложно склеивал
        # "Воздуховод" (реальная следующая позиция, просто без qty в bbox) и
        # legend-текст "* Вентиляторы бытовые..." к предыдущим items.
        # Короткие non-continuation names теперь остаются uncovered и
        # детектятся через vision_counter / expected_count tolerance.
        if not _looks_like_continuation(cells_name):
            continue
        # Склейка name — если ещё не содержится в prev (anti-duplicate).
        if cells_name not in prev_item.name:
            prev_name = prev_item.name.rstrip()
            cname = cells_name.strip()
            # Spec-3 Class B: dash-rule word-break для cover_bbox_rows тоже.
            if prev_name.endswith("-") and cname and cname[0].islower():
                merged = (prev_name[:-1] + cname)[:500]
            else:
                merged = f"{prev_name} {cname}".strip()[:500]
            prev_item.name = merged
        # Spec-2 Класс B: склейка model если у continuation row есть cells.model.
        cells_model = (row.cells.get("model") or "").strip()
        if cells_model and cells_model not in (prev_item.model_name or ""):
            prev_item.model_name = (
                f"{prev_item.model_name.rstrip()} {cells_model}".strip()
                if prev_item.model_name
                else cells_model
            )[:500]
        covered.add(row.row_index)

    return items

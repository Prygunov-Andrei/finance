"""LLM-нормализация column-aware bbox-rows → SpecItem (E15.04, Вариант B).

Принцип: `extract_structured_rows` уже разложил PDF в `list[TableRow]` с
правильными колонками. Здесь — только NLP-задачи которые трудно сделать
эвристикой:

1. Склейка многострочных имён («Дефлектор Цаги» + «на узле прохода УП1»).
2. Sticky parent name (артикульные варианты «Выбросной колпак» + 6 кодов
   РЭД-ВВШ-SP без повторения name в каждой строке).
3. Детекция секционных заголовков среди rows (когда _looks_like_section
   не сработал — например font size почти не отличается).
4. Префикс-колонка «ПВ-ИТП»: склейка к name через `-`.
5. Фильтр шапки/штампа (residual rows которые bbox-фильтр не поймал).

Один LLM-call на страницу: gpt-4o (E15.05 it2 — был gpt-4o-mini), temperature=0,
response_format=json. E15.05 it2 — conditional multimodal retry при низком
confidence score (см. `normalize_via_llm_multimodal` + `compute_confidence`).
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import asdict, dataclass, field

from ..providers.base import BaseLLMProvider, TextCompletion
from ._common import _strip_markdown_fence
from .pdf_text import TableRow

logger = logging.getLogger(__name__)


@dataclass
class NormalizedItem:
    name: str
    model_name: str = ""
    brand: str = ""
    # E15.05 it2 (R22): отдельное поле под «Завод-изготовитель» / «Производитель».
    # LLM получает колонку cells.manufacturer из bbox-parser и маппит 1:1.
    manufacturer: str = ""
    unit: str = "шт"
    quantity: float = 1.0
    comments: str = ""
    system_prefix: str = ""
    # Секция, в которой находился item на момент эмита. Нужно для страниц с
    # несколькими разделами (spec-aov — до 3 разделов на странице). Если LLM
    # не указал — вызывающий код применит page-level new_section.
    section_name: str = ""


@dataclass
class NormalizedPage:
    items: list[NormalizedItem]
    new_section: str
    new_sticky: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cached_tokens: int = 0  # TD-01: prompt caching hit
    raw_response: str = ""
    warnings: list[str] = field(default_factory=list)


NORMALIZE_PROMPT_TEMPLATE = """Ты обрабатываешь страницу проектной спецификации ОВиК/ЭОМ (форма 1а ГОСТ 21.110).
Я уже извлёк строки таблицы по bbox из text-layer PDF. Каждая строка — словарь
с колонками: pos, name, model, brand, manufacturer, unit, qty, mass, comments.
Плюс raw_blocks (все исходные текст-блоки строки, на случай если cells пустоваты).

Твоя задача — вернуть финальный список items этой страницы в JSON.

ПРАВИЛА:

КРИТИЧЕСКОЕ ПРАВИЛО 0 — маппинг cells → output (НЕ ПЕРЕСТАВЛЯЙ КОЛОНКИ):

Для каждой row копируй значения строго 1:1 по ключам:
  cells.name         → items[].name (с учётом sticky/multi-line, см. ниже)
  cells.model        → items[].model_name
  cells.brand        → items[].brand
  cells.manufacturer → items[].manufacturer
  cells.unit         → items[].unit
  cells.qty          → items[].quantity (распарсенное число)
  cells.comments     → items[].comments
  cells.pos          → items[].system_prefix (см. правило 5)

Если в row какое-то поле отсутствует в cells — ставь пустую строку / default:
  - model_name = ""
  - brand = ""
  - manufacturer = ""
  - unit = "шт" (default)
  - quantity = 1 (default)
  - comments = ""

НИКОГДА не пытайся «догадаться», переставить или заполнить отсутствующее значение
данными из соседних cells той же row. Циркулярный shift (cells.brand → model_name,
cells.unit → brand, cells.qty → unit) ЛОМАЕТ структуру сметы и КАТЕГОРИЧЕСКИ
ЗАПРЕЩЁН. Если в cells значение ожидалось, но его нет — значит его нет в PDF.

1. Section heading. Если в строке заполнен ТОЛЬКО name (model/unit/qty пустые),
   и текст выглядит как заголовок раздела ("Система ...", "Клапаны ...",
   "Противодымная вентиляция", "Фасонные изделия ...", "Оборудование
   автоматизации", "Щитовое оборудование", "Кабели и провода",
   "Электроустановочные изделия", "Лотки"), — это НЕ item, это обновление
   section. Положи строку в new_section. Если заголовок занимает несколько
   строк (продолжение в следующей row, тоже только name) — склей через пробел
   в одну new_section.

   Если текст заголовка начинается с номера раздела ("1. Оборудование
   автоматизации", "3.2 Кабели"), — ОЧИСТИ числовой префикс перед записью в
   new_section:
     "1. Оборудование автоматизации" → new_section = "Оборудование автоматизации"
     "3.2 Кабели и провода"          → new_section = "Кабели и провода"
   Префикс оставь только если без него имя становится бессмысленным.

1d. Normalize section_name. ВСЕГДА удаляй с конца section_name и new_section
    пробелы, двоеточия (`:`), тире (`—`), дефисы (`-`). Примеры:
      "Вентиляция :"         → "Вентиляция"
      "Кондиционирование : " → "Кондиционирование"
      "Отопление: "          → "Отопление"
    Если две подряд секции после нормализации дают одинаковый текст
    («Вентиляция» + «Вентиляция :») — это ТА ЖЕ секция, не создавай дубль,
    items второй секции получают то же section_name.

2. Sticky parent. Если name пуст в текущей row, но model/unit/qty заполнены —
   это «вариант» предыдущего item: используй sticky_parent_name (на входе
   страницы или установленный в предыдущих rows этой страницы) как name.
   Sticky обновляется на каждый item с явным name.

3. КРИТИЧЕСКИ-ВАЖНОЕ ПРАВИЛО — orphan-name rows (E15.05 it2, R18-strict).

   Если в row ЗАПОЛНЕН ТОЛЬКО `cells.name` (cells.pos, cells.model,
   cells.brand, cells.manufacturer, cells.unit, cells.qty, cells.mass,
   cells.comments — ВСЕ пусты или отсутствуют) — это ВСЕГДА continuation
   предыдущего item (продолжение многострочного name через перенос).

   НИКОГДА не создавай из такой row отдельный item. Склей `cells.name`
   с name предыдущего item через пробел.

   Если перед orphan-row нет предыдущего item на этой странице:
     a) используй `sticky_parent_name` из входа (продолжение со вчерашней
        страницы);
     b) если текст соответствует section-heading (правило 1) — положи в
        new_section, не создавай item;
     c) иначе — пропусти row (не изобретай item из одного поля).

   Это правило самое важное из всех после Правила 0. Проверяй его перед
   созданием КАЖДОГО item: «есть ли тут заполненные поля кроме name? если
   нет — это НЕ item, это продолжение».

   Пример (spec-tabs-116-ov.pdf page 1):
     r7: {pos: "П1/В 1", name: "Приточно-вытяжная установка...",
          brand: "LUFT MEER", qty: "1", comments: "подвесная"}
     r8: {name: "комплектно со см. узлом, пластинчатым рекуператором"}
     r9: {name: "комплектом автоматики"}

     ПРАВИЛЬНО: ОДИН item с name =
       "Приточно-вытяжная установка... комплектно со см. узлом,
        пластинчатым рекуператором комплектом автоматики"
     НЕПРАВИЛЬНО: 3 отдельных items.

4. Артикульные варианты. «Выбросной колпак» (отдельная row только с name) +
   6 строк где есть только model «РЭД-ВВШ-SP-1000х550-10» с brand/unit/qty —
   это 6 отдельных items, у всех name=«Выбросной колпак», model=код.

5. Префикс-колонка (cells.pos):
   a) ЧИСТЫЙ номер: cells.pos = r"\\d+(\\.\\d+)*\\.?" (например "1", "1.1",
      "2.4", "3.1.") — это порядковый номер позиции, НЕ склеивай с name.
      В output items[].system_prefix = "". Не тяни этот номер внутрь name.

   b) СИСТЕМНЫЙ КОД: cells.pos содержит буквы (латиницу/кириллицу) или
      символы помимо цифр/точек/дефисов-после-цифр (например "ПВ-ИТП", "ВД1",
      "ВД1,2,3", "П-ИТП") — склей к name через дефис:
        name_final = f"{cells.pos.strip()}-{cells.name.strip()}"
      В output items[].system_prefix = cells.pos. Если name уже начинается с
      префикса (дублирование) — не добавляй повторно.

   c) Если cells.name НАЧИНАЕТСЯ с чистого числового префикса («1.1 », «2.4 »,
      «3. ») — этот префикс ТОЖЕ порядковая нумерация (попала в name-колонку
      из-за bbox). УБЕРИ его из name:
        "1.1 Комплект автоматизации..." → name = "Комплект автоматизации..."
        "3.2 Кабель с медными жилами..." → name = "Кабель с медными жилами..."
      system_prefix остаётся "".

6. Comments. Колонка comments идёт в comments как есть.

7. Фильтр. НЕ возвращай items для:
   a) Шапки таблицы («Поз.», «Наименование», «Тип, марка», ... — должны быть
      уже отфильтрованы, но проверь). Также residual подстроки шапки
      ("документа, опросного листа", "изделия, материала", "чество") — это
      продолжения заголовочных ячеек, не items.
   b) Штамп ЕСКД: если cells.name начинается с "Взаим.инв.", "Вз. инв.",
      "Инв. № подл.", "Изм.", "Подп." — это НЕ item. Удали штамп из начала
      cells.name (до первого различимого имени: "5.6 Шпилька М8х1000" после
      "Взаим.инв. № 5.6 Шпилька…") или пропусти row полностью, если после
      удаления штампа имя пустое. Аналогично для cells.pos — чистый штамп
      без item — пропусти row.
   c) Orphan comments: row где НЕПУСТ только cells.comments, всё остальное
      пусто — это продолжение comments предыдущего item. Если у предыдущего
      item comments пусто — приклей к нему через пробел. Если уже есть —
      проигнорируй (чтобы не дублировать).
   d) Штампов («Формат А3», «Изм.», «Подп.», «Лист», шифр документа
      «NNN-NN/YYYY-XX...», фрагменты основной надписи: адрес объекта,
      название ГИПа/проектировщика/даты).
   e) Сносок («* Вентиляторы бытовые устанавливают жильцы», начало с * или
      пояснительный текст вне колонок).

8. Quantity — число. Распарси «1,5» как 1.5, «1,00» как 1, «~4900» как 4900,
   «1246,5» как 1246.5. Если qty пуст и нет sticky-варианта, default = 1.

9. Не выдумывай позиции. Если из rows нельзя восстановить item — пропусти.
   Не добавляй items не из исходных rows.

10. Склейка "Модель" + "Код оборудования". Если в row явно присутствуют ОБА
    значения — читаемое название модели (в cells.name через запятую в конце
    либо в raw_blocks) И отдельный цифровой/артикульный код (в cells.model) —
    используй cells.model как model_name. Если наоборот цифровой код попал в
    отдельный cell (напр. brand из-за сдвига колонок), — НЕ склеивай насильно,
    оставь по правилу 0. Пример корректного маппинга:
      cells.name="2.1 Корпус металлический ... TITAN 5 ЩМП-40.30.20"
      cells.model="TI5-10-N-040-030-020-66"
      → items[].model_name = "TI5-10-N-040-030-020-66"
      → items[].name       = "Корпус металлический ... TITAN 5 ЩМП-40.30.20"
    Сохрани читаемую модель в name, а артикул в model_name.

ВЫХОДНОЙ JSON (строго один объект, ничего вокруг):
- new_section: str — секция по окончании страницы (без числового префикса,
  без trailing `:`/`—`/`-`, см. правило 1d)
- new_sticky: str — sticky parent name по окончании страницы
- items: array of {name, model_name, brand, manufacturer, unit, quantity,
  comments, system_prefix, section_name}

Поле system_prefix = значение pos из row если был системный код (правило 5b);
иначе "".

Поле items[].section_name — название секции, в которой находился item в
момент эмита. Страница может содержать НЕСКОЛЬКО секций (напр. «1.
Оборудование автоматизации», затем «2. Щитовое оборудование», затем «3.
Кабели и провода»). Веди внутренний счётчик текущей секции при обработке
rows: каждый раз когда попадается section-heading row — обновляй текущую
секцию. Каждому следующему item присваивай ИМЕННО текущую секцию, а не
финальную. Числовой префикс («1. », «3.2 ») в section_name тоже удаляй.
Если section на момент item неизвестен — используй current_section из входа.

ВХОД:
current_section: __CURRENT_SECTION__
sticky_parent_name: __STICKY__
rows: __ROWS_JSON__
"""

# Экспортируется для совместимости с docs / тестов которые могут импортировать.
NORMALIZE_PROMPT = NORMALIZE_PROMPT_TEMPLATE

# TD-01 prompt caching: разделяем static INSTRUCTIONS_BLOCK (правила 0-11,
# схема output, объяснение полей — одинаковое для всех страниц и
# документов) и per-call INPUT_BLOCK (current_section / sticky / rows
# которые меняются). OpenAI автоматически кэширует одинаковый prefix
# ≥1024 токенов на gpt-4o family (ephemeral ~5 мин). INSTRUCTIONS_BLOCK
# идёт как role=system — это каноничный и самый надёжный pattern для
# prompt caching.
_SPLIT_MARKER = "\nВХОД:\n"
_PARTS = NORMALIZE_PROMPT_TEMPLATE.split(_SPLIT_MARKER, 1)
assert len(_PARTS) == 2, "NORMALIZE_PROMPT_TEMPLATE must contain 'ВХОД:' separator"
NORMALIZE_INSTRUCTIONS_BLOCK = _PARTS[0].rstrip()
_NORMALIZE_INPUT_TEMPLATE = "ВХОД:\n" + _PARTS[1]


def _build_prompt(current_section: str, sticky_parent_name: str, rows_json: str) -> str:
    """Подстановка значений без str.format() — иначе фигурные скобки в
    JSON-схеме внутри промпта схватываются как format-слоты и падают
    с KeyError на 'pos'/'name' и т.п.

    DEPRECATED: возвращает весь промпт одним куском (backward-compat для
    тестов). Runtime использует `_build_user_input` + INSTRUCTIONS_BLOCK
    через system_prompt — см. normalize_via_llm.
    """
    return (
        NORMALIZE_PROMPT_TEMPLATE
        .replace("__CURRENT_SECTION__", json.dumps(current_section, ensure_ascii=False))
        .replace("__STICKY__", json.dumps(sticky_parent_name, ensure_ascii=False))
        .replace("__ROWS_JSON__", rows_json)
    )


def _build_user_input(
    current_section: str, sticky_parent_name: str, rows_json: str
) -> str:
    """Per-call ВХОД-блок (без instructions) — идёт как user message.
    Instructions подаются отдельно через system_prompt (TD-01 caching)."""
    return (
        _NORMALIZE_INPUT_TEMPLATE
        .replace("__CURRENT_SECTION__", json.dumps(current_section, ensure_ascii=False))
        .replace("__STICKY__", json.dumps(sticky_parent_name, ensure_ascii=False))
        .replace("__ROWS_JSON__", rows_json)
    )


# R26 post-processing: нормализация section_name (страховка на случай если
# LLM проигнорировал правило 1d). Удаляет хвост из пробелов, двоеточий, тире,
# дефисов, точек и запятых. Важно: не трогает начало строки — там возможны
# осмысленные префиксы вроде «Клапаны на кровле (снаружи)».
_SECTION_TAIL_CLEANUP_RE = re.compile(r"[\s:—\-.,]+$")


def _normalize_section_name(s: str) -> str:
    if not s:
        return ""
    return _SECTION_TAIL_CLEANUP_RE.sub("", s.strip())


def _row_to_dict(row: TableRow) -> dict:
    """Сериализация TableRow в компактный JSON-ready dict."""
    return {
        "row_index": row.row_index,
        "y_mid": round(row.y_mid, 1),
        "is_section_heading": row.is_section_heading,
        "cells": dict(row.cells),
        "raw_blocks": row.raw_blocks,
    }


async def normalize_via_llm(
    provider: BaseLLMProvider,
    rows: list[TableRow],
    *,
    page_number: int,
    current_section: str = "",
    sticky_parent_name: str = "",
    max_tokens: int | None = None,
) -> NormalizedPage:
    """Прогнать rows через LLM и собрать NormalizedPage.

    Один call на страницу. Если LLM вернул не-JSON или нарушил схему —
    бросаем `LLMNormalizationError`, вызывающий код падает на legacy
    line-based парсер (`parse_page_items`).
    """
    if not rows:
        return NormalizedPage(
            items=[], new_section=current_section, new_sticky=sticky_parent_name
        )

    rows_json = json.dumps([_row_to_dict(r) for r in rows], ensure_ascii=False)
    user_input = _build_user_input(current_section, sticky_parent_name, rows_json)

    # TD-01: INSTRUCTIONS_BLOCK → system (кэшируется), per-call ВХОД → user.
    completion: TextCompletion = await provider.text_complete(
        user_input,
        max_tokens=max_tokens,
        temperature=0.0,
        system_prompt=NORMALIZE_INSTRUCTIONS_BLOCK,
    )
    raw = completion.content

    try:
        data = json.loads(_strip_markdown_fence(raw))
    except json.JSONDecodeError as e:
        logger.warning(
            "llm normalize JSON parse error",
            extra={"page": page_number, "error": str(e), "raw_head": raw[:200]},
        )
        raise LLMNormalizationError(f"page {page_number}: invalid JSON") from e

    if not isinstance(data, dict):
        raise LLMNormalizationError(f"page {page_number}: expected JSON object, got {type(data).__name__}")

    items_raw = data.get("items")
    if not isinstance(items_raw, list):
        raise LLMNormalizationError(f"page {page_number}: missing 'items' array")

    warnings: list[str] = []
    items: list[NormalizedItem] = []
    for entry in items_raw:
        if not isinstance(entry, dict):
            warnings.append(f"item is not dict: {type(entry).__name__}")
            continue
        name = str(entry.get("name") or "").strip()
        if not name:
            # Без имени item бесполезен в смете (frontend требует name) —
            # пропускаем, но логируем чтобы видеть проблему в QA.
            warnings.append(f"item without name skipped: {entry}")
            continue
        try:
            quantity = float(entry.get("quantity") or 1)
        except (TypeError, ValueError):
            warnings.append(f"item bad quantity: {entry.get('quantity')!r}, default 1")
            quantity = 1.0
        items.append(
            NormalizedItem(
                name=name[:500],  # parallel to E15.03-hotfix защитный truncate
                model_name=str(entry.get("model_name") or "").strip(),
                brand=str(entry.get("brand") or "").strip(),
                manufacturer=str(entry.get("manufacturer") or "").strip(),
                unit=str(entry.get("unit") or "шт").strip() or "шт",
                quantity=quantity,
                comments=str(entry.get("comments") or "").strip(),
                system_prefix=str(entry.get("system_prefix") or "").strip(),
                section_name=_normalize_section_name(
                    str(entry.get("section_name") or "")
                ),
            )
        )

    new_section = _normalize_section_name(
        str(data.get("new_section") or current_section)
    )
    new_sticky = str(data.get("new_sticky") or sticky_parent_name)

    if len(items) > len(rows) * 2:
        warnings.append(
            f"items_count={len(items)} > rows_count*2={len(rows) * 2}: возможна "
            "галлюцинация LLM"
        )

    return NormalizedPage(
        items=items,
        new_section=new_section,
        new_sticky=new_sticky,
        prompt_tokens=completion.prompt_tokens,
        completion_tokens=completion.completion_tokens,
        cached_tokens=completion.cached_tokens,
        raw_response=raw,
        warnings=warnings,
    )


class LLMNormalizationError(Exception):
    """LLM вернул невалидный/пустой ответ — fallback на legacy парсер."""


def asdict_table_rows(rows: list[TableRow]) -> list[dict]:
    """Утилита для отладки/тестов: list[TableRow] → list[dict]."""
    return [asdict(r) for r in rows]


# ---------------------------------------------------------------------------
# E15.05 it2 (R27) — multimodal Vision fallback + confidence score
# ---------------------------------------------------------------------------


def compute_confidence(norm: NormalizedPage, rows: list[TableRow]) -> float:
    """Эвристика качества нормализации для conditional multimodal retry.

    Возвращает [0.0 … 1.0]. Thresholds подобраны эмпирически на 3 goldens:
      - 0.9-1.0: column detection отработал идеально (ов2, aov baseline);
      - 0.6-0.9: частичные потери model/brand, но секции и count в норме;
      - <0.6:  column detection сломался (ТАБС — все model_name=""), требуется
              retry через multimodal Vision.

    Слагаемые (веса суммируются в 1.0):
      - model_ratio   0.40 — доля items с непустым model_name (главный сигнал)
      - brand_ratio   0.20 — доля items с brand/manufacturer непустым
      - section_score 0.20 — количество распознанных секций (2+ → 1.0)
      - count_score   0.20 — items.count ∈ [30%, 90%] от rows.count

    Если items пусты → 0.0. Если на странице нет rows (text-layer пуст) —
    confidence не применяется вообще (multimodal retry тоже ничего не даст).
    """
    if not norm.items:
        return 0.0

    total = len(norm.items)
    items_with_model = sum(1 for it in norm.items if it.model_name)
    model_ratio = items_with_model / total

    items_with_brand = sum(1 for it in norm.items if it.brand or it.manufacturer)
    brand_ratio = items_with_brand / total

    sections = {it.section_name for it in norm.items if it.section_name}
    section_score = min(len(sections) / 2.0, 1.0)

    row_count_ratio = total / max(len(rows), 1)
    count_score = 1.0 if 0.3 <= row_count_ratio <= 0.9 else 0.5

    return (
        model_ratio * 0.40
        + brand_ratio * 0.20
        + section_score * 0.20
        + count_score * 0.20
    )


MULTIMODAL_PROMPT_PREFIX = """У тебя есть ДВА источника данных для этой страницы:

1. JSON rows с bbox-cells — АВТОРИТЕТНЫЙ источник ТЕКСТА.
2. PNG-изображение страницы — для ВИЗУАЛЬНОЙ structure (колонки, секции, bold).

ПРАВИЛО: текст бери ИЗ JSON (там точный text layer). Картинку используй только
для:
  - правильного разделения name и model (если в JSON они попали в одну cell
    или разъехались по ошибке column-detection);
  - детекции секционных заголовков (bold font / центрированный текст);
  - понимания границ row при переносах (visual row boundaries).

НИКОГДА не бери цифры/слова/артикулы из картинки — только из JSON. OCR может
ошибаться в русском тексте, а у нас text layer точный.

Типичный сценарий: column detection в JSON сработал частично (например, все
model_name = ""), и ты по картинке видишь, что в PDF есть отдельная колонка
«Тип, марка». Тогда — визуально определи, какой текст в JSON принадлежит
колонке model (он уже присутствует в cells.name или raw_blocks) и переложи
в items[].model_name.

--- ДАЛЕЕ идёт стандартный промпт нормализации ---

"""


async def normalize_via_llm_multimodal(
    provider: BaseLLMProvider,
    rows: list[TableRow],
    image_b64: str,
    *,
    page_number: int,
    current_section: str = "",
    sticky_parent_name: str = "",
    max_tokens: int | None = None,
) -> NormalizedPage:
    """R27 phase 2: retry через multimodal Vision с JSON rows в промпте.

    Вызывается только когда `compute_confidence(phase1_result) < threshold`.
    Требует `provider.multimodal_complete` — для тестовых stubs без imp
    бросит NotImplementedError → SpecParser оставит phase1_result.
    """
    if not rows:
        return NormalizedPage(
            items=[], new_section=current_section, new_sticky=sticky_parent_name
        )

    rows_json = json.dumps([_row_to_dict(r) for r in rows], ensure_ascii=False)
    user_input = MULTIMODAL_PROMPT_PREFIX + _build_user_input(
        current_section, sticky_parent_name, rows_json
    )

    # TD-01: тот же prompt caching что и для text-пути (instructions → system,
    # per-call → user с картинкой).
    completion: TextCompletion = await provider.multimodal_complete(
        user_input,
        image_b64=image_b64,
        max_tokens=max_tokens,
        temperature=0.0,
        system_prompt=NORMALIZE_INSTRUCTIONS_BLOCK,
    )
    raw = completion.content

    try:
        data = json.loads(_strip_markdown_fence(raw))
    except json.JSONDecodeError as e:
        logger.warning(
            "llm multimodal JSON parse error",
            extra={"page": page_number, "error": str(e), "raw_head": raw[:200]},
        )
        raise LLMNormalizationError(
            f"page {page_number}: multimodal invalid JSON"
        ) from e

    if not isinstance(data, dict):
        raise LLMNormalizationError(
            f"page {page_number}: multimodal expected JSON object"
        )

    items_raw = data.get("items")
    if not isinstance(items_raw, list):
        raise LLMNormalizationError(
            f"page {page_number}: multimodal missing 'items' array"
        )

    warnings: list[str] = []
    items: list[NormalizedItem] = []
    for entry in items_raw:
        if not isinstance(entry, dict):
            warnings.append(f"item is not dict: {type(entry).__name__}")
            continue
        name = str(entry.get("name") or "").strip()
        if not name:
            warnings.append(f"item without name skipped: {entry}")
            continue
        try:
            quantity = float(entry.get("quantity") or 1)
        except (TypeError, ValueError):
            warnings.append(f"item bad quantity: {entry.get('quantity')!r}, default 1")
            quantity = 1.0
        items.append(
            NormalizedItem(
                name=name[:500],
                model_name=str(entry.get("model_name") or "").strip(),
                brand=str(entry.get("brand") or "").strip(),
                manufacturer=str(entry.get("manufacturer") or "").strip(),
                unit=str(entry.get("unit") or "шт").strip() or "шт",
                quantity=quantity,
                comments=str(entry.get("comments") or "").strip(),
                system_prefix=str(entry.get("system_prefix") or "").strip(),
                section_name=_normalize_section_name(
                    str(entry.get("section_name") or "")
                ),
            )
        )

    new_section = _normalize_section_name(
        str(data.get("new_section") or current_section)
    )
    new_sticky = str(data.get("new_sticky") or sticky_parent_name)

    return NormalizedPage(
        items=items,
        new_section=new_section,
        new_sticky=new_sticky,
        prompt_tokens=completion.prompt_tokens,
        completion_tokens=completion.completion_tokens,
        cached_tokens=completion.cached_tokens,
        raw_response=raw,
        warnings=warnings,
    )

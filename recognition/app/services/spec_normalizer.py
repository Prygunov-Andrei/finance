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

Один LLM-call на страницу: gpt-4o-mini, temperature=0, response_format=json.
"""

from __future__ import annotations

import json
import logging
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
    raw_response: str = ""
    warnings: list[str] = field(default_factory=list)


NORMALIZE_PROMPT_TEMPLATE = """Ты обрабатываешь страницу проектной спецификации ОВиК/ЭОМ (форма 1а ГОСТ 21.110).
Я уже извлёк строки таблицы по bbox из text-layer PDF. Каждая строка — словарь
с колонками: pos, name, model, brand, unit, qty, mass, comments. Плюс raw_blocks
(все исходные текст-блоки строки, на случай если cells пустоваты).

Твоя задача — вернуть финальный список items этой страницы в JSON.

ПРАВИЛА:

КРИТИЧЕСКОЕ ПРАВИЛО 0 — маппинг cells → output (НЕ ПЕРЕСТАВЛЯЙ КОЛОНКИ):

Для каждой row копируй значения строго 1:1 по ключам:
  cells.name     → items[].name (с учётом sticky/multi-line, см. ниже)
  cells.model    → items[].model_name
  cells.brand    → items[].brand
  cells.unit     → items[].unit
  cells.qty      → items[].quantity (распарсенное число)
  cells.comments → items[].comments
  cells.pos      → items[].system_prefix (см. правило 5)

Если в row какое-то поле отсутствует в cells — ставь пустую строку / default:
  - model_name = ""
  - brand = ""
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

2. Sticky parent. Если name пуст в текущей row, но model/unit/qty заполнены —
   это «вариант» предыдущего item: используй sticky_parent_name (на входе
   страницы или установленный в предыдущих rows этой страницы) как name.
   Sticky обновляется на каждый item с явным name.

3. Multi-line name. Если в row name присутствует, а unit/qty пусты, и в
   следующей row name тоже присутствует с продолжением — склей name через
   пробел. Пример: «Дефлектор Цаги» + «на узле прохода УП1» = одно имя.

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
- new_section: str — секция по окончании страницы (без числового префикса)
- new_sticky: str — sticky parent name по окончании страницы
- items: array of {name, model_name, brand, unit, quantity, comments,
  system_prefix, section_name}

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


def _build_prompt(current_section: str, sticky_parent_name: str, rows_json: str) -> str:
    """Подстановка значений без str.format() — иначе фигурные скобки в
    JSON-схеме внутри промпта схватываются как format-слоты и падают
    с KeyError на 'pos'/'name' и т.п."""
    return (
        NORMALIZE_PROMPT_TEMPLATE
        .replace("__CURRENT_SECTION__", json.dumps(current_section, ensure_ascii=False))
        .replace("__STICKY__", json.dumps(sticky_parent_name, ensure_ascii=False))
        .replace("__ROWS_JSON__", rows_json)
    )


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
    prompt = _build_prompt(current_section, sticky_parent_name, rows_json)

    completion: TextCompletion = await provider.text_complete(
        prompt, max_tokens=max_tokens, temperature=0.0
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
                unit=str(entry.get("unit") or "шт").strip() or "шт",
                quantity=quantity,
                comments=str(entry.get("comments") or "").strip(),
                system_prefix=str(entry.get("system_prefix") or "").strip(),
                section_name=str(entry.get("section_name") or "").strip(),
            )
        )

    new_section = str(data.get("new_section") or current_section)
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
        raw_response=raw,
        warnings=warnings,
    )


class LLMNormalizationError(Exception):
    """LLM вернул невалидный/пустой ответ — fallback на legacy парсер."""


def asdict_table_rows(rows: list[TableRow]) -> list[dict]:
    """Утилита для отладки/тестов: list[TableRow] → list[dict]."""
    return [asdict(r) for r in rows]

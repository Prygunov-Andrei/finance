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


@dataclass
class NormalizedPage:
    items: list[NormalizedItem]
    new_section: str
    new_sticky: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    raw_response: str = ""
    warnings: list[str] = field(default_factory=list)


NORMALIZE_PROMPT_TEMPLATE = """Ты обрабатываешь страницу проектной спецификации ОВиК (форма 1а ГОСТ 21.110).
Я уже извлёк строки таблицы по bbox из text-layer PDF. Каждая строка — словарь
с колонками: pos, name, model, brand, unit, qty, mass, comments. Плюс raw_blocks
(все исходные текст-блоки строки, на случай если cells пустоваты).

Твоя задача — вернуть финальный список items этой страницы в JSON.

ПРАВИЛА:

1. Section heading. Если в строке заполнен ТОЛЬКО name (model/unit/qty пустые),
   и текст выглядит как заголовок раздела ("Система ...", "Клапаны ...",
   "Противодымная вентиляция", "Фасонные изделия ..."), - это НЕ item, это
   обновление section. Положи строку в new_section. Если заголовок занимает
   несколько строк (продолжение в следующей row, тоже только name) — склей
   через пробел в одну new_section.

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

5. Префикс-колонка «ПВ-ИТП». Если pos содержит короткий код системы (ПВ-ИТП,
   ВД1, ПД2, ВД1...5, ВД1,2,3 и т.п.) — склей с name через `-`:
   name_final = "<pos>-<name>" если pos непуст. Пример: «ПВ-ИТП-Вентилятор
   канальный (системы П-ИТП, В-ИТП)». Если pos уже включает имя оборудования
   («ПВ-ИТП Вентилятор канальный») — оставь как есть, не дублируй.

6. Comments. Колонка comments идёт в comments как есть.

7. Фильтр. НЕ возвращай items для:
   - Шапки таблицы («Поз.», «Наименование», «Тип, марка», ... — должны быть
     уже отфильтрованы, но проверь).
   - Штампов («Формат А3», «Изм.», «Подп.», «Лист», шифр документа
     «NNN-NN/YYYY-XX...»).
   - Сносок («* Вентиляторы бытовые устанавливают жильцы», начало с * или
     пояснительный текст вне колонок).

8. Quantity — число. Распарси «1,5» как 1.5, «~4900» как 4900, «1246,5» как
   1246.5. Если qty пуст и нет sticky-варианта, default = 1.

9. Не выдумывай позиции. Если из rows нельзя восстановить item — пропусти.
   Не добавляй items не из исходных rows.

ВЫХОДНОЙ JSON (строго один объект, ничего вокруг):
- new_section: str — секция по окончании страницы
- new_sticky: str — sticky parent name по окончании страницы
- items: array of {name, model_name, brand, unit, quantity, comments, system_prefix}

Поле system_prefix = значение pos из row если был префикс системы; иначе "".

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

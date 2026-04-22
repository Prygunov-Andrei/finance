"""LLM-нормализация invoice rows → InvoiceItem (E16 it1).

Mirror `spec_normalizer` по структуре (один LLM-call на страницу, text_complete
→ JSON, опциональный multimodal retry), но с invoice-specific правилами:
  - поля: price_unit / price_total / vat_amount / lead_time_days / notes /
    supply_type;
  - multi-line name склейка (orphan-name continuation);
  - split «27 шт.» → quantity + unit (если unit-колонка не обнаружена);
  - lead_time parse «7 р.д.» → 7;
  - footer filter («Итого», «Всего к оплате», «прописью») — если попал в
    items вопреки bbox-фильтру.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field

from ..providers.base import BaseLLMProvider, TextCompletion
from ._common import _strip_markdown_fence
from .pdf_text import TableRow

logger = logging.getLogger(__name__)


@dataclass
class NormalizedInvoiceItem:
    name: str
    model_name: str = ""
    brand: str = ""
    unit: str = "шт"
    quantity: float = 1.0
    price_unit: float = 0.0
    price_total: float = 0.0
    vat_amount: float = 0.0
    vat_rate: int | None = None
    lead_time_days: int | None = None
    notes: str = ""
    supply_type: str = ""


@dataclass
class NormalizedInvoicePage:
    items: list[NormalizedInvoiceItem]
    prompt_tokens: int = 0
    completion_tokens: int = 0
    raw_response: str = ""
    warnings: list[str] = field(default_factory=list)


class LLMInvoiceNormalizationError(Exception):
    """LLM вернул невалидный/пустой JSON."""


NORMALIZE_INVOICE_PROMPT_TEMPLATE = """Ты обрабатываешь страницу СЧЁТА НА ОПЛАТУ
от поставщика. Я уже извлёк строки таблицы items по bbox из text-layer PDF.
Каждая row — dict с колонками: pos, name, unit, qty, price_unit, price_total,
vat_amount, lead_time, notes, supply_type (некоторые могут отсутствовать).
Плюс raw_blocks (все исходные текст-блоки строки для справки).

Твоя задача — вернуть финальный список items страницы в JSON.

ПРАВИЛА:

КРИТИЧЕСКОЕ ПРАВИЛО 0 — маппинг cells → output 1:1 (НЕ ПЕРЕСТАВЛЯЙ КОЛОНКИ):

  cells.name         → items[].name (с учётом multi-line, см. ниже)
  cells.unit         → items[].unit
  cells.qty          → items[].quantity (float, см. правило 5)
  cells.price_unit   → items[].price_unit (float)
  cells.price_total  → items[].price_total (float)
  cells.vat_amount   → items[].vat_amount (float; 0.0 если нет в row)
  cells.lead_time    → items[].lead_time_days (int; см. правило 4)
  cells.notes        → items[].notes
  cells.supply_type  → items[].supply_type ("X" если заказной, иначе "")
  cells.pos          → ИГНОРИРУЙ (порядковый номер позиции в счёте)

Если какое-то поле отсутствует в cells — default:
  - model_name = "", brand = ""
  - unit = "шт", quantity = 1
  - price_unit = 0.0, price_total = 0.0, vat_amount = 0.0
  - lead_time_days = null, notes = "", supply_type = ""

НИКОГДА не переставляй значения между колонками и не додумывай данные,
которых нет в cells.

1. Ед. изм. внутри qty. Если cells.unit пустая, а cells.qty = «27 шт.» /
   «10 упак» / «5 м» — разделяй: quantity=27 (float), unit="шт." Если
   cells.qty = «7 р.д.» — это lead_time (а не quantity), положи
   lead_time_days=7, а quantity оставь 1.0 (default).

2. Multi-line name (ОЧЕНЬ ВАЖНО). Если в row ЗАПОЛНЕНО ТОЛЬКО cells.name
   (остальные cells.unit, cells.qty, cells.price_*, cells.vat_amount —
   все пусты), — это ВСЕГДА continuation предыдущего item (продолжение
   переноса в названии). Склей cells.name с name предыдущего item через
   пробел. НИКОГДА не создавай отдельный item из такой row.

   Пример ЛУИС+ row 1:
     row A: {name: "1 Контроллер доступа ЛКД-КС-8000", qty: "27", ...}
     row B: {name: "сетевой, в корпусе, БП в компл., одна"}
     row C: {name: "точка прохода, 8000 идентификаторов,"}
     row D: {name: "RS-485, Ethernet LS826762 (ЛКД)"}
   ПРАВИЛЬНО: один item с name = «Контроллер доступа ЛКД-КС-8000 сетевой,
              в корпусе, БП в компл., одна точка прохода, 8000
              идентификаторов, RS-485, Ethernet LS826762 (ЛКД)»
   НЕПРАВИЛЬНО: 4 отдельных items.

   Если перед orphan-name row нет предыдущего item — пропусти row (не
   изобретай item из одного name без цен).

3. Префикс-номер в name. cells.name часто начинается с порядкового номера
   позиции («1 Контроллер доступа...», «3. Считыватель...»). Удали этот
   префикс из начала name:
     «1 Контроллер доступа» → «Контроллер доступа»
     «3. Считыватель» → «Считыватель»
   Оставляй префикс только если без него имя становится бессмысленным
   (редкий кейс — обычно всегда можно убрать).

4. lead_time_days — ОБЯЗАТЕЛЬНО парсить cells.lead_time:
     «7 р.д.»  → 7
     «30 дней» → 30
     «2 нед.»  → 14 (1 нед = 7 дн)
     «в наличии» / пусто → null
   Если cells.lead_time = «7 р.д.» — items[].lead_time_days ДОЛЖЕН быть 7
   (целое число), НЕ null. cells.notes тоже может содержать «7 р.д.»
   (дубль из ЛУИС+ формы) — это подтверждение срока, парси то же число
   в lead_time_days. Если cells.lead_time не парсится, ставь null.

5. Цифры — float, НЕ строка. Убирай пробелы-разделители тысяч и заменяй
   запятую на точку:
     «6 687,50»    → 6687.50
     «1 714 790,31» → 1714790.31
     «30 133,00»   → 30133.00
   Если cells.price_* пусто или нечисло — 0.0.

6. quantity — float:
     «27»  → 27.0
     «10»  → 10.0
     «1,5» → 1.5
   Если qty пусто или нечисло — 1.0.

7. vat_amount per-item (колонка «в т.ч. НДС» в invoice-01) — абсолютное
   значение НДС по строке. В invoice-02 нет per-item НДС — ставь 0.0.

8. supply_type. Колонка «ЗТ*»: «X» / «Х» = заказной товар, пусто = в
   наличии. Скопируй как есть (если пусто — "").

9. Фильтр footer rows. НЕ возвращай items для:
   a) Итоговых строк «Итого, руб:», «в т.ч. НДС, руб:», «Всего к оплате:»,
      «Всего наименований N, на сумму M руб.»
   b) Сумма прописью («Шестнадцать тысяч четыреста шестьдесят шесть рублей
      25 копеек»).
   c) Условий поставки / подписей / параграфов договора (тексты
      «1. Оплата Товара», «2. Поставка Товара», «Ваш персональный
      менеджер», телефонные номера).
   d) Сносок / примечаний о формате колонки ЗТ («*В колонке «ЗТ» указан
      тип товара: Х – заказной...»).
   e) Рекламных элементов (URL, QR-код описание, адрес склада).

10. Не выдумывай items. Если из rows нельзя восстановить валидный item
    (нет цены И нет qty), пропусти.

ВЫХОДНОЙ JSON (строго один объект):
{
  "items": [
    {
      "name": "...",
      "model_name": "",
      "brand": "",
      "unit": "шт.",
      "quantity": 27.0,
      "price_unit": 30133.00,
      "price_total": 813591.00,
      "vat_amount": 0.0,
      "vat_rate": null,
      "lead_time_days": null,
      "notes": "в наличии",
      "supply_type": ""
    },
    ...
  ]
}

ВХОД:
rows: __ROWS_JSON__
"""


MULTIMODAL_INVOICE_PROMPT_PREFIX = """У тебя есть ДВА источника данных для
этой страницы:

1. JSON rows с bbox-cells — АВТОРИТЕТНЫЙ источник ТЕКСТА.
2. PNG-изображение страницы — для ВИЗУАЛЬНОЙ structure (определение границ
   колонок, если cells перемешаны).

ПРАВИЛО: текст бери ТОЛЬКО из JSON (там точный text layer). Картинку
используй только чтобы:
  - правильно разделить name / price_* если column-detection в JSON ошибся
    (например колонки price_total и notes слиплись в одну cell);
  - визуально понять границы multi-line row (какие строки принадлежат
    одному item).

НИКОГДА не бери цифры/слова из картинки — text layer точный. Если в JSON
поле пусто, оставляй 0.0 / "" / null.

--- Далее стандартный промпт нормализации: ---

"""


def _row_to_dict(row: TableRow) -> dict:
    """Сериализация TableRow в компактный JSON-ready dict."""
    return {
        "row_index": row.row_index,
        "y_mid": round(row.y_mid, 1),
        "cells": dict(row.cells),
        "raw_blocks": row.raw_blocks,
    }


def _build_prompt(rows_json: str) -> str:
    return NORMALIZE_INVOICE_PROMPT_TEMPLATE.replace("__ROWS_JSON__", rows_json)


async def normalize_invoice_items_via_llm(
    provider: BaseLLMProvider,
    rows: list[TableRow],
    *,
    page_number: int,
    max_tokens: int | None = None,
) -> NormalizedInvoicePage:
    """Прогнать invoice rows страницы через LLM, собрать NormalizedInvoicePage."""
    if not rows:
        return NormalizedInvoicePage(items=[])

    rows_json = json.dumps([_row_to_dict(r) for r in rows], ensure_ascii=False)
    prompt = _build_prompt(rows_json)

    completion: TextCompletion = await provider.text_complete(
        prompt, temperature=0.0, max_tokens=max_tokens
    )
    return _parse_normalized_response(completion, rows, page_number)


async def normalize_invoice_items_via_llm_multimodal(
    provider: BaseLLMProvider,
    rows: list[TableRow],
    image_b64: str,
    *,
    page_number: int,
    max_tokens: int | None = None,
) -> NormalizedInvoicePage:
    """Phase 2 retry: multimodal (PNG + JSON rows) → NormalizedInvoicePage.

    Требует `provider.multimodal_complete` — NotImplementedError
    пробрасывается вызывающему коду (stub-провайдер в тестах).
    """
    if not rows:
        return NormalizedInvoicePage(items=[])

    rows_json = json.dumps([_row_to_dict(r) for r in rows], ensure_ascii=False)
    prompt = MULTIMODAL_INVOICE_PROMPT_PREFIX + _build_prompt(rows_json)

    completion: TextCompletion = await provider.multimodal_complete(
        prompt, image_b64=image_b64, temperature=0.0, max_tokens=max_tokens
    )
    return _parse_normalized_response(completion, rows, page_number)


def _parse_normalized_response(
    completion: TextCompletion,
    rows: list[TableRow],
    page_number: int,
) -> NormalizedInvoicePage:
    raw = completion.content
    try:
        data = json.loads(_strip_markdown_fence(raw))
    except json.JSONDecodeError as e:
        logger.warning(
            "invoice normalize JSON parse error",
            extra={"page": page_number, "error": str(e), "raw_head": raw[:200]},
        )
        raise LLMInvoiceNormalizationError(
            f"page {page_number}: invalid JSON"
        ) from e
    if not isinstance(data, dict):
        raise LLMInvoiceNormalizationError(
            f"page {page_number}: expected JSON object, got {type(data).__name__}"
        )
    items_raw = data.get("items")
    if not isinstance(items_raw, list):
        raise LLMInvoiceNormalizationError(
            f"page {page_number}: missing 'items' array"
        )

    warnings: list[str] = []
    items: list[NormalizedInvoiceItem] = []
    for entry in items_raw:
        if not isinstance(entry, dict):
            warnings.append(f"item is not dict: {type(entry).__name__}")
            continue
        name = str(entry.get("name") or "").strip()
        if not name:
            warnings.append(f"item without name skipped: {entry}")
            continue
        items.append(
            NormalizedInvoiceItem(
                name=name[:500],
                model_name=str(entry.get("model_name") or "").strip(),
                brand=str(entry.get("brand") or "").strip(),
                unit=(str(entry.get("unit") or "шт").strip() or "шт"),
                quantity=_to_float(entry.get("quantity"), default=1.0),
                price_unit=_to_float(entry.get("price_unit"), default=0.0),
                price_total=_to_float(entry.get("price_total"), default=0.0),
                vat_amount=_to_float(entry.get("vat_amount"), default=0.0),
                vat_rate=_to_int_or_none(entry.get("vat_rate")),
                lead_time_days=_to_int_or_none(entry.get("lead_time_days")),
                notes=str(entry.get("notes") or "").strip(),
                supply_type=str(entry.get("supply_type") or "").strip(),
            )
        )

    if len(items) > len(rows) * 2:
        warnings.append(
            f"items_count={len(items)} > rows_count*2={len(rows) * 2}: "
            "возможна галлюцинация LLM"
        )

    return NormalizedInvoicePage(
        items=items,
        prompt_tokens=completion.prompt_tokens,
        completion_tokens=completion.completion_tokens,
        raw_response=raw,
        warnings=warnings,
    )


def compute_invoice_confidence(
    norm: NormalizedInvoicePage, rows: list[TableRow]
) -> float:
    """Heuristic [0.0, 1.0] качества invoice-нормализации.

    Слагаемые (суммарный вес 1.0):
      - price_unit_ratio   0.30 — доля items с price_unit > 0
      - price_total_ratio  0.30 — доля items с price_total > 0
      - qty_ratio          0.20 — доля items с quantity > 0
      - count_score        0.20 — items.count ∈ [30%, 100%] от rows.count

    Если items пусты → 0.0. Порог retry (settings.llm_multimodal_retry_threshold,
    по умолчанию 0.7): ниже → multimodal retry.
    """
    if not norm.items:
        return 0.0

    total = len(norm.items)
    price_unit_ratio = sum(1 for it in norm.items if it.price_unit > 0) / total
    price_total_ratio = sum(1 for it in norm.items if it.price_total > 0) / total
    qty_ratio = sum(1 for it in norm.items if it.quantity > 0) / total

    row_count = max(len(rows), 1)
    row_count_ratio = total / row_count
    count_score = 1.0 if 0.3 <= row_count_ratio <= 1.0 else 0.5

    return (
        price_unit_ratio * 0.30
        + price_total_ratio * 0.30
        + qty_ratio * 0.20
        + count_score * 0.20
    )


def _to_float(value: object, *, default: float) -> float:
    if value is None or value == "":
        return default
    if isinstance(value, bool):
        return default
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        s = value.replace(" ", "").replace("\xa0", "").replace(",", ".")
        if not s:
            return default
        try:
            return float(s)
        except ValueError:
            return default
    return default


def _to_int_or_none(value: object) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        s = value.strip().replace("%", "")
        if not s:
            return None
        try:
            return int(float(s))
        except ValueError:
            return None
    return None

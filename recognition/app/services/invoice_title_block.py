"""Phase 0 — Title block extraction для счетов поставщиков (E16 it1).

В отличие от ЕСКД-спецификации, где supplier и invoice_meta живут в
ограниченной форме-штампе (или не живут вовсе), в счёте это главная
смысловая часть шапки: банковские реквизиты, номер/дата, договор, НДС,
итог. Формат вёрстки сильно варьируется (бухгалтерский блок vs списковый
формат ЛУИС+), поэтому bbox-парсер для шапки ненадёжен.

Решение: отдельный text-only LLM call (gpt-4o full) на весь text layer
page 1 с структурным JSON-промптом. Multimodal fallback если
`supplier.inn` или `invoice_meta.total_amount` пустые (low confidence
signal: LLM не нашёл два самых надёжных поля шапки).
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass

from ..providers.base import BaseLLMProvider
from ..schemas.invoice import InvoiceMeta, InvoiceSupplier
from ._common import _strip_markdown_fence

logger = logging.getLogger(__name__)


TITLE_BLOCK_PROMPT_TEMPLATE = """Ты обрабатываешь ШАПКУ счёта на оплату от поставщика
(извлечённый text layer первой страницы PDF). Извлеки структурированные данные
поставщика и метаданные счёта.

ВНИМАНИЕ: в счёте всегда есть ДВЕ организации — «Поставщик» (он же «Продавец»,
«Получатель платежа») и «Покупатель». Бери ТОЛЬКО данные поставщика: его
название, ИНН, КПП, банк, расчётный счёт, БИК. Если явно написано
«Покупатель: ООО "ГРУППА КОМПАНИЙ АВГУСТ"» или «Покупатель: … ИНН 5032322673» —
это наша компания, ПРОПУСТИ этот блок. ИНН нашей компании: 5032322673.

Верни JSON (строго):
{
  "supplier": {
    "name": "полное наименование поставщика (ООО / АО / ИП)",
    "inn": "10-12 цифр",
    "kpp": "9 цифр (может отсутствовать у ИП — тогда пустая строка)",
    "bank_account": "р/с 20 цифр",
    "bik": "9 цифр",
    "correspondent_account": "к/с 20 цифр",
    "bank_name": "название банка (например АО «АЛЬФА-БАНК»)",
    "address": "юридический адрес поставщика",
    "phone": "телефон поставщика если виден в шапке"
  },
  "invoice_meta": {
    "number": "номер счёта (как в документе — «20047» или «ЛП001556»)",
    "date": "ISO дата YYYY-MM-DD (из «02 марта 2026» → 2026-03-02, из «06.03.2026» → 2026-03-06)",
    "total_amount": число (итоговая сумма «Всего к оплате» / «Итого, руб»),
    "vat_amount": число (сумма НДС, из «в т.ч. НДС» / «В том числе НДС»),
    "vat_rate": число (ставка НДС в %: 22 / 20 / 10 / 0). null если «Без НДС»,
    "currency": "RUB" (default) / "USD" / "EUR",
    "contract_ref": "номер и дата договора-основания («12/20-315 от 22.12.2020» / «ЛП2024/0416-2 от 16.04.2024») если указан, иначе пустая строка",
    "project_ref": "проектная / объектная привязка из примечания («Озеры 123 ДПУ») если указана, иначе пустая строка"
  }
}

ПРАВИЛА:
1. Не выдумывай значения. Если поле не найдено в тексте — оставь пустую
   строку для строк и 0 для чисел, null для vat_rate.
2. Цифровые значения (total_amount, vat_amount) возвращай как float: убирай
   пробелы-разделители тысяч и запятую замени на точку. «1 714 790,31» → 1714790.31.
3. Номер счёта оставь КАК В ДОКУМЕНТЕ, включая префиксы-буквы («№ЛП001556»
   → «ЛП001556», «Счет на оплату № 20047» → «20047»).
4. contract_ref — только ссылка на договор поставки. Не путай с номером
   самого счёта. Формат: «N от DD.MM.YYYY».
5. project_ref — только если в документе явно указан проект/объект
   («Примечание: Озеры 123 ДПУ»). Обычно это одна короткая фраза.
6. Если между «Поставщик:» и «Покупатель:» есть блок с ИНН 5032322673 —
   это наша компания, НЕ бери её в supplier.

ТЕКСТ ДОКУМЕНТА (может содержать несколько страниц, разделённых «--- page N ---»):
__PAGE_TEXT__
"""


MULTIMODAL_RETRY_PROMPT_PREFIX = """У тебя есть ДВА источника данных:

1. JSON-версия text layer первой страницы (авторитетный источник ТЕКСТА).
2. PNG-изображение первой страницы (для визуального сигнала — бухгалтерский
   блок банковских реквизитов, многоколоночная шапка, размещение номера
   счёта и даты).

Текст бери ТОЛЬКО из text layer (он точный). Картинку используй чтобы:
  - разобрать visually связанные поля (банк получателя vs банк покупателя);
  - найти номер счёта и дату в шапке когда text layer их перемешал;
  - подтвердить что блок «Покупатель: ГК АВГУСТ» не попал в supplier.

Никогда не читай цифры из картинки — OCR русского текста делает ошибки,
а text layer точный. Если какое-то поле всё равно не находится — оставь
пусто / 0 / null.

--- Ниже стандартный промпт: ---

"""


@dataclass
class TitleBlockResult:
    """Результат Phase 0 + служебная информация для отчёта."""

    supplier: InvoiceSupplier
    meta: InvoiceMeta
    multimodal_retry_used: bool = False
    prompt_tokens: int = 0
    completion_tokens: int = 0


_OUR_COMPANY_INN = "5032322673"


class TitleBlockError(Exception):
    """LLM вернул невалидный JSON — вызывающий код записывает в errors и
    продолжает с пустыми supplier/meta."""


async def extract_title_block(
    provider: BaseLLMProvider,
    page_1_text: str,
    *,
    multimodal_fallback_image_b64: str | None = None,
    max_tokens: int | None = None,
) -> TitleBlockResult:
    """ONE text-LLM call → supplier + invoice_meta.

    Multimodal retry если supplier.inn пустой или total_amount=0 — два
    самых надёжных поля, по отсутствию которых судим о том что LLM
    запутался в формате шапки.
    """
    if not page_1_text.strip():
        return TitleBlockResult(supplier=InvoiceSupplier(), meta=InvoiceMeta())

    prompt = TITLE_BLOCK_PROMPT_TEMPLATE.replace("__PAGE_TEXT__", page_1_text)

    completion = await provider.text_complete(
        prompt, temperature=0.0, max_tokens=max_tokens
    )
    supplier, meta = _parse_title_block_json(completion.content)

    prompt_tokens = completion.prompt_tokens
    completion_tokens = completion.completion_tokens
    retry_used = False

    low_confidence = (
        not supplier.inn
        or supplier.inn == _OUR_COMPANY_INN
        or meta.total_amount == 0.0
    )
    if low_confidence and multimodal_fallback_image_b64:
        retry_used = True
        logger.info(
            "title_block multimodal retry",
            extra={"had_inn": bool(supplier.inn), "total": meta.total_amount},
        )
        mm_prompt = MULTIMODAL_RETRY_PROMPT_PREFIX + prompt
        try:
            mm_completion = await provider.multimodal_complete(
                mm_prompt,
                image_b64=multimodal_fallback_image_b64,
                temperature=0.0,
                max_tokens=max_tokens,
            )
        except NotImplementedError:
            logger.info("provider has no multimodal_complete, skip title-block retry")
        else:
            mm_supplier, mm_meta = _parse_title_block_json(mm_completion.content)
            supplier = _merge_supplier(supplier, mm_supplier)
            meta = _merge_meta(meta, mm_meta)
            prompt_tokens += mm_completion.prompt_tokens
            completion_tokens += mm_completion.completion_tokens

    # Guard: если LLM всё-таки подсунул наши реквизиты — чистим supplier.
    if supplier.inn == _OUR_COMPANY_INN:
        logger.warning(
            "title_block returned buyer (our INN) as supplier — clearing",
            extra={"inn": supplier.inn},
        )
        supplier = InvoiceSupplier()

    return TitleBlockResult(
        supplier=supplier,
        meta=meta,
        multimodal_retry_used=retry_used,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
    )


def _parse_title_block_json(raw: str) -> tuple[InvoiceSupplier, InvoiceMeta]:
    """Parse LLM JSON → (InvoiceSupplier, InvoiceMeta). Raises TitleBlockError
    если JSON невалидный — на этом уровне решения о retry нет (retry
    принимает `extract_title_block` по confidence-флагам)."""
    try:
        data = json.loads(_strip_markdown_fence(raw))
    except json.JSONDecodeError as e:
        raise TitleBlockError(f"invalid JSON from LLM: {e}") from e
    if not isinstance(data, dict):
        raise TitleBlockError(f"expected JSON object, got {type(data).__name__}")

    supplier_raw = data.get("supplier") or {}
    meta_raw = data.get("invoice_meta") or {}
    if not isinstance(supplier_raw, dict):
        supplier_raw = {}
    if not isinstance(meta_raw, dict):
        meta_raw = {}

    supplier = InvoiceSupplier(
        name=str(supplier_raw.get("name") or "").strip(),
        inn=_digits_only(str(supplier_raw.get("inn") or "")),
        kpp=_digits_only(str(supplier_raw.get("kpp") or "")),
        bank_account=_digits_only(str(supplier_raw.get("bank_account") or "")),
        bik=_digits_only(str(supplier_raw.get("bik") or "")),
        correspondent_account=_digits_only(
            str(supplier_raw.get("correspondent_account") or "")
        ),
        address=str(supplier_raw.get("address") or "").strip(),
        bank_name=str(supplier_raw.get("bank_name") or "").strip(),
        phone=str(supplier_raw.get("phone") or "").strip(),
    )

    meta = InvoiceMeta(
        number=str(meta_raw.get("number") or "").strip(),
        date=str(meta_raw.get("date") or "").strip(),
        total_amount=_to_float(meta_raw.get("total_amount")),
        vat_amount=_to_float(meta_raw.get("vat_amount")),
        currency=str(meta_raw.get("currency") or "RUB").strip() or "RUB",
        vat_rate=_to_int_or_none(meta_raw.get("vat_rate")),
        contract_ref=str(meta_raw.get("contract_ref") or "").strip(),
        project_ref=str(meta_raw.get("project_ref") or "").strip(),
    )

    return supplier, meta


def _merge_supplier(
    primary: InvoiceSupplier, fallback: InvoiceSupplier
) -> InvoiceSupplier:
    """Field-wise merge: primary (text-only) wins если не пустой, иначе
    fallback (multimodal). Защита от regression: multimodal не может
    затереть правильное значение, полученное text-only."""
    out = primary.model_copy(deep=True)
    for field in (
        "name",
        "inn",
        "kpp",
        "bank_account",
        "bik",
        "correspondent_account",
        "bank_name",
        "address",
        "phone",
    ):
        if not getattr(out, field) and getattr(fallback, field):
            setattr(out, field, getattr(fallback, field))
    return out


def _merge_meta(primary: InvoiceMeta, fallback: InvoiceMeta) -> InvoiceMeta:
    out = primary.model_copy(deep=True)
    # Строки — primary имеет приоритет если непустая.
    for field in ("number", "date", "currency", "contract_ref", "project_ref"):
        if not getattr(out, field) and getattr(fallback, field):
            setattr(out, field, getattr(fallback, field))
    # Числа — primary имеет приоритет если != 0.
    if out.total_amount == 0.0 and fallback.total_amount:
        out.total_amount = fallback.total_amount
    if out.vat_amount == 0.0 and fallback.vat_amount:
        out.vat_amount = fallback.vat_amount
    if out.vat_rate is None and fallback.vat_rate is not None:
        out.vat_rate = fallback.vat_rate
    return out


_DIGITS_RE = re.compile(r"\D+")


def _digits_only(value: str) -> str:
    """Вытащить только цифры из строки. ИНН «7720605108» → «7720605108»;
    «ИНН 7720605108» → «7720605108». Защитный strip от LLM-ошибок где
    префикс/пробел попал в значение."""
    return _DIGITS_RE.sub("", value or "")


def _to_float(value: object) -> float:
    if value is None or value == "":
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        s = value.replace(" ", "").replace("\xa0", "").replace(",", ".")
        try:
            return float(s)
        except ValueError:
            return 0.0
    return 0.0


def _to_int_or_none(value: object) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value) if value == int(value) else None
    if isinstance(value, str):
        s = value.strip().replace("%", "")
        if not s:
            return None
        try:
            return int(float(s))
        except ValueError:
            return None
    return None

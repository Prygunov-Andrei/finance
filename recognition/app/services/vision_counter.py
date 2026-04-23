"""Cheap vision counter: LLM смотрит на картинку страницы и возвращает
ТОЛЬКО количество реальных позиций с qty. Используется как safety-net
для детекции потерь bbox-extractor'ом.

E15-06 it2 (QA-заход 1/10): expected_count из `normalize_via_llm` работает
на тех же bbox-rows, что и нормализация — если extractor/LLM теряют
хвостовые rows, expected_count тоже их «не видит», safety-net не триггерит.
Vision counter — независимый источник истины: один дешёвый call с картинкой
страницы, только число позиций → cross-check против parsed.
"""

from __future__ import annotations

import logging
import re

from ..providers.base import BaseLLMProvider

logger = logging.getLogger(__name__)

COUNT_PROMPT = """Ты смотришь на страницу Спецификации ОВиК/ЭОМ (форма 1а
ГОСТ 21.110).

Посчитай СТРОГО количество РЕАЛЬНЫХ позиций оборудования / материала на
этой странице.

РЕАЛЬНАЯ позиция — та, у которой в таблице есть значение в столбце
«Количество» (число > 0 или дробное число).

НЕ считай:
- заголовки разделов и подразделов,
- строки-продолжения имени (перенос, содержащий только продолжение
  наименования без количества),
- пустые строки,
- строки штампа ЕСКД внизу страницы,
- многоуровневые заголовки таблицы.

Верни ответ СТРОГО в формате JSON, один объект:
{"count": N}

где N — целое число ≥ 0.
"""


async def count_items_on_page(
    page_image_b64: str,
    provider: BaseLLMProvider,
) -> int:
    """Возвращает самооценку количества реальных позиций по картинке.

    При ошибке/невалидном ответе — возвращает 0 (fallback не
    триггерит safety-net, парсер работает как раньше).

    Модель выбирается провайдером из settings.llm_multimodal_model
    (тот же канал что и R27 multimodal retry).
    """
    try:
        resp = await provider.multimodal_complete(
            "Посчитай позиции.",
            image_b64=page_image_b64,
            system_prompt=COUNT_PROMPT,
            temperature=0.0,
            max_tokens=40,
        )
    except NotImplementedError:
        # Тестовый / stub-провайдер без multimodal — тихо отключаем counter.
        return 0
    except Exception as e:
        logger.warning("vision_counter failed: %s", e)
        return 0

    raw = (resp.content or "").strip()
    match = re.search(r'"count"\s*:\s*(\d+)', raw)
    if not match:
        match = re.search(r"\b(\d+)\b", raw)
    if not match:
        logger.warning("vision_counter returned no number: %r", raw[:100])
        return 0
    try:
        return int(match.group(1))
    except (ValueError, TypeError):
        return 0

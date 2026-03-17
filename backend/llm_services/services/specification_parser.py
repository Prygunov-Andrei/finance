"""
SpecificationParser — постраничный LLM Vision парсинг проектных спецификаций.

Отличие от DocumentParser (счета):
- Нет цен, поставщиков, ИНН
- Есть тех. характеристики, бренды, модели
- Объём 10-200+ страниц (постраничная обработка)
- Partial success: ошибка на одной странице не ломает документ
"""
import json
import logging
from typing import Dict, List, Optional, Tuple

import fitz  # PyMuPDF

from llm_services.models import LLMProvider
from llm_services.providers import get_provider
from llm_services.providers.base import BaseLLMProvider

logger = logging.getLogger(__name__)

# DPI для рендеринга страниц (200 для мелкого текста в спецификациях)
PAGE_DPI = 200

# Максимум ретраев на одну страницу
MAX_PAGE_RETRIES = 2

CLASSIFY_SYSTEM_PROMPT = """\
Ты — эксперт по строительной проектной документации.
Определи тип страницы и верни JSON (без markdown):

{
  "page_type": "specification" | "drawing" | "title" | "toc" | "text" | "other",
  "section_name": "ОВ" | "ВК" | "ЭО" | "АР" | "КР" | "" ,
  "has_table": true | false
}

Типы:
- "specification" — таблица спецификации или ведомости оборудования/материалов
- "drawing" — чертёж (план, разрез, схема)
- "title" — титульный лист
- "toc" — оглавление, содержание
- "text" — пояснительная записка, текстовый блок
- "other" — прочее (пустая страница, штамп и т.д.)
"""

EXTRACT_SYSTEM_PROMPT = """\
Ты — эксперт по строительным спецификациям и ведомостям оборудования.
Извлеки ВСЕ позиции оборудования и материалов со страницы.

Для каждой позиции верни:
- name: полное наименование (обязательно)
- model_name: модель/артикул (если указан, иначе "")
- brand: производитель/бренд (если указан, иначе "")
- unit: единица измерения (шт, м.п., м², комплект, и т.д.)
- quantity: количество (число)
- tech_specs: технические характеристики (мощность, размер, диаметр и т.д.)
- section_name: раздел/система (ОВ, ВК, ЭО, АР, КР и т.д.)

НЕ извлекай:
- Расходники без конкретной марки (саморезы, дюбели, хомуты и т.п.)
- Заголовки таблиц, примечания, итоговые строки

Верни JSON (без markdown):
{
  "items": [
    {
      "name": "...",
      "model_name": "...",
      "brand": "...",
      "unit": "шт",
      "quantity": 1,
      "tech_specs": "...",
      "section_name": "ОВ"
    }
  ],
  "continued_from_previous": false
}

Если на странице нет позиций оборудования — верни {"items": [], "continued_from_previous": false}.
"""


class SpecificationParser:
    """Постраничный LLM Vision парсинг проектных спецификаций.

    Использование:
        parser = SpecificationParser()
        result = parser.parse_pdf(pdf_bytes, filename='spec.pdf')
        # result = {
        #     'items': [...],
        #     'pages_total': 30,
        #     'pages_processed': 28,
        #     'pages_skipped': 10,   # чертежи, титул и т.д.
        #     'pages_error': 2,
        #     'errors': ['Стр. 5: timeout', 'Стр. 17: invalid JSON'],
        #     'status': 'done' | 'partial' | 'error',
        # }
    """

    def __init__(self, provider: Optional[LLMProvider] = None):
        self.provider_model = provider or LLMProvider.get_default()
        self.provider = get_provider(self.provider_model)

    def parse_pdf(
        self,
        pdf_content: bytes,
        filename: str = 'document.pdf',
        on_page_progress: Optional[callable] = None,
    ) -> Dict:
        """Парсит PDF-спецификацию постранично.

        Args:
            pdf_content: PDF-файл в байтах.
            filename: Имя файла (для логов).
            on_page_progress: Callback(page_num, pages_total) для отслеживания прогресса.

        Returns:
            Dict с items, статистикой и ошибками.
        """
        doc = fitz.open(stream=pdf_content, filetype='pdf')
        pages_total = len(doc)

        all_items: List[Dict] = []
        errors: List[str] = []
        pages_processed = 0
        pages_skipped = 0
        current_section = ''

        logger.info(
            'SpecificationParser: начинаю парсинг "%s" (%d стр.)',
            filename, pages_total,
        )

        for page_num in range(pages_total):
            try:
                page_img = self._render_page(doc, page_num)

                # Этап 1: классификация страницы
                classification = self._classify_page(page_img, page_num)

                if classification.get('section_name'):
                    current_section = classification['section_name']

                page_type = classification.get('page_type', 'other')
                if page_type not in ('specification', 'excel'):
                    pages_skipped += 1
                    pages_processed += 1
                    logger.debug(
                        'Стр. %d: %s — пропущена', page_num + 1, page_type,
                    )
                    if on_page_progress:
                        on_page_progress(page_num + 1, pages_total)
                    continue

                # Этап 2: извлечение позиций
                items = self._extract_items(page_img, page_num, current_section)
                all_items.extend(items)
                pages_processed += 1

                logger.info(
                    'Стр. %d: извлечено %d позиций', page_num + 1, len(items),
                )

            except Exception as exc:
                error_msg = f'Стр. {page_num + 1}: {type(exc).__name__}: {exc}'
                errors.append(error_msg)
                pages_processed += 1
                logger.warning(
                    'SpecificationParser: ошибка на стр. %d: %s',
                    page_num + 1, exc,
                )

            if on_page_progress:
                on_page_progress(page_num + 1, pages_total)

        doc.close()

        # Определяем статус
        pages_with_data = pages_processed - pages_skipped
        if not all_items and errors:
            status = 'error'
        elif errors and all_items:
            status = 'partial'
        else:
            status = 'done'

        # Нумерация и дедупликация
        all_items = self._deduplicate_items(all_items)
        for i, item in enumerate(all_items):
            item['sort_order'] = i

        result = {
            'items': all_items,
            'pages_total': pages_total,
            'pages_processed': pages_processed,
            'pages_skipped': pages_skipped,
            'pages_error': len(errors),
            'errors': errors,
            'status': status,
        }

        logger.info(
            'SpecificationParser: "%s" — %s. %d позиций, %d/%d стр., %d ошибок',
            filename, status, len(all_items),
            pages_processed, pages_total, len(errors),
        )

        return result

    def _render_page(self, doc: fitz.Document, page_num: int) -> bytes:
        """Рендерит страницу PDF в PNG."""
        page = doc.load_page(page_num)
        mat = fitz.Matrix(PAGE_DPI / 72, PAGE_DPI / 72)
        pix = page.get_pixmap(matrix=mat)
        return pix.tobytes('png')

    def _classify_page(self, page_img: bytes, page_num: int) -> Dict:
        """Классифицирует тип страницы через LLM Vision."""
        for attempt in range(MAX_PAGE_RETRIES + 1):
            try:
                result = self.provider.parse_with_prompt(
                    file_content=page_img,
                    file_type='png',
                    system_prompt=CLASSIFY_SYSTEM_PROMPT,
                    user_prompt=f'Определи тип страницы {page_num + 1}:',
                )
                if isinstance(result, dict):
                    return result
                return json.loads(result)
            except (json.JSONDecodeError, TypeError):
                if attempt < MAX_PAGE_RETRIES:
                    continue
                logger.warning(
                    'Стр. %d: невалидный JSON от LLM при классификации',
                    page_num + 1,
                )
                return {'page_type': 'other', 'section_name': '', 'has_table': False}
            except Exception:
                if attempt < MAX_PAGE_RETRIES:
                    continue
                raise

    def _extract_items(
        self, page_img: bytes, page_num: int, current_section: str,
    ) -> List[Dict]:
        """Извлекает позиции оборудования со страницы через LLM Vision."""
        for attempt in range(MAX_PAGE_RETRIES + 1):
            try:
                result = self.provider.parse_with_prompt(
                    file_content=page_img,
                    file_type='png',
                    system_prompt=EXTRACT_SYSTEM_PROMPT,
                    user_prompt=f'Извлеки позиции со страницы {page_num + 1}:',
                )
                if not isinstance(result, dict):
                    result = json.loads(result)

                items = result.get('items', [])

                # Проставляем section_name если не указан
                for item in items:
                    if not item.get('section_name') and current_section:
                        item['section_name'] = current_section
                    item['page_number'] = page_num + 1
                    # Нормализация
                    item.setdefault('name', '')
                    item.setdefault('model_name', '')
                    item.setdefault('brand', '')
                    item.setdefault('unit', 'шт')
                    item.setdefault('tech_specs', '')
                    item.setdefault('section_name', '')
                    try:
                        item['quantity'] = float(item.get('quantity', 1))
                    except (ValueError, TypeError):
                        item['quantity'] = 1.0

                # Фильтрация пустых
                return [it for it in items if it.get('name', '').strip()]

            except (json.JSONDecodeError, TypeError):
                if attempt < MAX_PAGE_RETRIES:
                    continue
                logger.warning(
                    'Стр. %d: невалидный JSON от LLM при извлечении',
                    page_num + 1,
                )
                return []
            except Exception:
                if attempt < MAX_PAGE_RETRIES:
                    continue
                raise

    def _deduplicate_items(self, items: List[Dict]) -> List[Dict]:
        """Дедупликация позиций: группировка по name+model+brand, суммирование quantity."""
        seen = {}
        for item in items:
            key = (
                item.get('name', '').strip().lower(),
                item.get('model_name', '').strip().lower(),
                item.get('brand', '').strip().lower(),
            )
            if key in seen:
                seen[key]['quantity'] += item.get('quantity', 1.0)
            else:
                seen[key] = dict(item)
        return list(seen.values())

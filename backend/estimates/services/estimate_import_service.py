import logging
import re
from decimal import Decimal, InvalidOperation
from typing import List, Dict, Any, Optional, Tuple

import openpyxl
from django.db import transaction
from django.db.models import F, Max

from estimates.models import Estimate, EstimateSection, EstimateItem
from .estimate_import_schemas import EstimateImportRow, ParsedEstimate

logger = logging.getLogger(__name__)

HEADER_KEYWORDS = {
    'name': ['наименование', 'название', 'товар', 'материал', 'оборудование', 'позиция'],
    'model_name': ['модель', 'марка', 'тип', 'артикул'],
    'unit': ['ед', 'единица', 'ед.изм', 'ед. изм'],
    'quantity': ['кол-во', 'количество', 'кол.', 'к-во'],
    'material_price': ['цена мат', 'стоимость мат', 'цена за ед', 'цена', 'стоимость'],
    'work_price': ['цена работ', 'стоимость работ', 'монтаж', 'работа'],
}

SECTION_KEYWORDS = ['раздел', 'система', 'итого по разделу', 'подраздел']


def _safe_decimal(value) -> Decimal:
    if value is None:
        return Decimal('0')
    try:
        s = str(value).strip().replace(',', '.').replace(' ', '').replace('\xa0', '')
        s = re.sub(r'[^\d.\-]', '', s)
        if not s or s in ('.', '-', '-.'):
            return Decimal('0')
        return Decimal(s)
    except (InvalidOperation, ValueError):
        return Decimal('0')


def _clean_text(value) -> str:
    if value is None:
        return ''
    return str(value).strip()


def _match_header(text: str, keywords: list) -> bool:
    if not text:
        return False
    lower = text.lower().strip()
    return any(kw in lower for kw in keywords)


def _detect_columns(header_row: list) -> Dict[str, int]:
    mapping = {}
    for col_idx, cell_value in enumerate(header_row):
        text = _clean_text(cell_value)
        if not text:
            continue
        for field, keywords in HEADER_KEYWORDS.items():
            if field not in mapping and _match_header(text, keywords):
                mapping[field] = col_idx
                break
    return mapping


def _is_section_row(row_values: list) -> Tuple[bool, str]:
    non_empty = [_clean_text(v) for v in row_values if _clean_text(v)]
    if len(non_empty) == 1:
        text = non_empty[0]
        lower = text.lower()
        if any(kw in lower for kw in SECTION_KEYWORDS):
            return True, text
        if len(text) > 3 and not any(c.isdigit() for c in text[:3]):
            return True, text
    return False, ''


def _is_totals_row(row_values: list) -> bool:
    text = ' '.join(_clean_text(v) for v in row_values).lower()
    return any(kw in text for kw in ['итого', 'всего', 'total', 'итог'])


class EstimateImportService:
    """Сервис импорта смет из Excel и PDF"""

    def import_from_excel(self, file_content: bytes, filename: str) -> ParsedEstimate:
        wb = openpyxl.load_workbook(
            filename=__import__('io').BytesIO(file_content),
            read_only=True,
            data_only=True,
        )
        ws = wb.active

        all_rows = list(ws.iter_rows(values_only=True))
        if not all_rows:
            return ParsedEstimate(rows=[], sections=[], total_rows=0, confidence=0.0)

        header_row_idx = None
        col_mapping = {}
        for idx, row in enumerate(all_rows[:20]):
            mapping = _detect_columns(list(row))
            if 'name' in mapping:
                header_row_idx = idx
                col_mapping = mapping
                break

        if header_row_idx is None:
            for idx, row in enumerate(all_rows[:20]):
                non_empty = [_clean_text(v) for v in row if _clean_text(v)]
                if len(non_empty) >= 3:
                    header_row_idx = idx
                    for ci, cv in enumerate(row):
                        t = _clean_text(cv)
                        if not t:
                            continue
                        if ci == 0 and t.replace('.', '').isdigit():
                            continue
                        if 'name' not in col_mapping:
                            col_mapping['name'] = ci
                        elif 'unit' not in col_mapping and len(t) <= 10:
                            col_mapping['unit'] = ci
                        elif 'quantity' not in col_mapping:
                            col_mapping['quantity'] = ci
                    break

        if 'name' not in col_mapping:
            col_mapping['name'] = 0

        data_rows = all_rows[header_row_idx + 1:] if header_row_idx is not None else all_rows

        parsed_rows: List[EstimateImportRow] = []
        item_counter = 0

        for row in data_rows:
            row_list = list(row)

            if _is_totals_row(row_list):
                continue

            name_idx = col_mapping.get('name', 0)
            name_val = _clean_text(row_list[name_idx]) if name_idx < len(row_list) else ''
            if not name_val:
                continue

            item_counter += 1
            model_idx = col_mapping.get('model_name')
            unit_idx = col_mapping.get('unit')
            qty_idx = col_mapping.get('quantity')
            mat_price_idx = col_mapping.get('material_price')
            work_price_idx = col_mapping.get('work_price')

            parsed_rows.append(EstimateImportRow(
                item_number=item_counter,
                name=name_val,
                model_name=_clean_text(row_list[model_idx]) if model_idx and model_idx < len(row_list) else '',
                unit=_clean_text(row_list[unit_idx]) if unit_idx and unit_idx < len(row_list) else 'шт',
                quantity=_safe_decimal(row_list[qty_idx]) if qty_idx and qty_idx < len(row_list) else Decimal('1'),
                material_unit_price=_safe_decimal(row_list[mat_price_idx]) if mat_price_idx and mat_price_idx < len(row_list) else Decimal('0'),
                work_unit_price=_safe_decimal(row_list[work_price_idx]) if work_price_idx and work_price_idx < len(row_list) else Decimal('0'),
                section_name='',
            ))

        wb.close()

        confidence = 0.9 if len(col_mapping) >= 4 else 0.7 if len(col_mapping) >= 2 else 0.4

        return ParsedEstimate(
            rows=parsed_rows,
            sections=[],
            total_rows=len(parsed_rows),
            confidence=confidence,
        )

    def import_from_pdf(self, file_content: bytes, filename: str) -> ParsedEstimate:
        try:
            from llm_services.models import LLMProvider
            from llm_services.providers import get_provider
        except ImportError:
            logger.warning("LLM services not available for PDF parsing")
            return ParsedEstimate(rows=[], sections=[], total_rows=0, confidence=0.0)

        provider_model = LLMProvider.get_default()
        if not provider_model:
            return ParsedEstimate(rows=[], sections=[], total_rows=0, confidence=0.0)

        provider = get_provider(provider_model)

        system_prompt = """Ты — эксперт по строительным сметам. Тебе дан PDF-файл сметы.
Извлеки все строки сметы в структурированном виде.

Для каждой строки укажи:
- item_number: порядковый номер
- name: наименование товара/материала/оборудования
- model_name: модель/марка/артикул (если есть)
- unit: единица измерения (шт, м.п., м², компл, кг и т.д.)
- quantity: количество (число)
- material_unit_price: цена материала за единицу (число, 0 если не указана)
- work_unit_price: цена работы за единицу (число, 0 если не указана)
- section_name: название раздела/системы, к которому относится строка

Верни JSON в формате:
{
  "rows": [...],
  "sections": ["список уникальных разделов"],
  "confidence": 0.0-1.0
}"""

        import base64
        file_b64 = base64.b64encode(file_content).decode()

        try:
            result = provider.parse_with_schema(
                file_content=file_content,
                filename=filename,
                system_prompt=system_prompt,
                response_schema=ParsedEstimate,
            )
            if isinstance(result, ParsedEstimate):
                result.total_rows = len(result.rows)
                return result
        except AttributeError:
            try:
                response = provider.parse_document(file_content, filename, system_prompt)
                if response and isinstance(response, dict):
                    rows_data = response.get('rows', [])
                    parsed_rows = []
                    for r in rows_data:
                        try:
                            parsed_rows.append(EstimateImportRow(**r))
                        except Exception:
                            continue
                    return ParsedEstimate(
                        rows=parsed_rows,
                        sections=response.get('sections', []),
                        total_rows=len(parsed_rows),
                        confidence=response.get('confidence', 0.5),
                    )
            except Exception as e:
                logger.error(f"PDF parsing failed: {e}")

        return ParsedEstimate(rows=[], sections=[], total_rows=0, confidence=0.0)

    @transaction.atomic
    def save_imported_items(
        self,
        estimate_id: int,
        parsed: ParsedEstimate,
    ) -> List[EstimateItem]:
        estimate = Estimate.objects.get(pk=estimate_id)

        section_map: Dict[str, EstimateSection] = {}
        for section_name in parsed.sections:
            if not section_name:
                continue
            section, _ = EstimateSection.objects.get_or_create(
                estimate=estimate,
                name=section_name,
                defaults={'sort_order': len(section_map)},
            )
            section_map[section_name] = section

        default_section = None
        if not section_map:
            default_section, _ = EstimateSection.objects.get_or_create(
                estimate=estimate,
                name='Основной раздел',
                defaults={'sort_order': 0},
            )

        existing_max = EstimateItem.objects.filter(estimate=estimate).order_by('-item_number').values_list('item_number', flat=True).first() or 0

        created_items = []
        for row in parsed.rows:
            section = section_map.get(row.section_name, default_section)
            if not section:
                section = default_section or list(section_map.values())[0]

            item = EstimateItem.objects.create(
                estimate=estimate,
                section=section,
                item_number=existing_max + row.item_number,
                sort_order=existing_max + row.item_number,
                name=row.name,
                model_name=row.model_name,
                unit=row.unit or 'шт',
                quantity=row.quantity,
                material_unit_price=row.material_unit_price,
                work_unit_price=row.work_unit_price,
            )
            created_items.append(item)

        return created_items

    @transaction.atomic
    def save_rows_from_preview(
        self,
        estimate_id: int,
        rows: List[Dict[str, Any]],
    ) -> List[EstimateItem]:
        """Сохраняет строки из предпросмотра (JSON) с назначенными разделами.

        Строки с is_section=True становятся разделами (EstimateSection).
        Остальные строки привязываются к ближайшему разделу сверху.
        """
        estimate = Estimate.objects.get(pk=estimate_id)

        existing_max = (
            EstimateItem.objects.filter(estimate=estimate)
            .order_by('-item_number')
            .values_list('item_number', flat=True)
            .first()
        ) or 0

        # Первый проход: создаём разделы
        section_map: Dict[str, EstimateSection] = {}
        sort_order = 0
        for row_data in rows:
            if row_data.get('is_section'):
                name = row_data.get('name', '').strip()
                if name and name not in section_map:
                    section, _ = EstimateSection.objects.get_or_create(
                        estimate=estimate,
                        name=name,
                        defaults={'sort_order': sort_order},
                    )
                    section_map[name] = section
                    sort_order += 1

        # Дефолтный раздел, если разделов нет
        default_section = None
        if not section_map:
            default_section, _ = EstimateSection.objects.get_or_create(
                estimate=estimate,
                name='Основной раздел',
                defaults={'sort_order': 0},
            )

        # Второй проход: создаём строки
        current_section = default_section
        created_items = []
        item_counter = 0

        for row_data in rows:
            if row_data.get('is_section'):
                name = row_data.get('name', '').strip()
                current_section = section_map.get(name, default_section)
                continue

            item_counter += 1
            section = current_section or default_section or next(iter(section_map.values()))

            item = EstimateItem.objects.create(
                estimate=estimate,
                section=section,
                item_number=existing_max + item_counter,
                sort_order=existing_max + item_counter,
                name=row_data.get('name', ''),
                model_name=row_data.get('model_name', ''),
                unit=row_data.get('unit', 'шт') or 'шт',
                quantity=_safe_decimal(row_data.get('quantity', 1)),
                material_unit_price=_safe_decimal(row_data.get('material_unit_price', 0)),
                work_unit_price=_safe_decimal(row_data.get('work_unit_price', 0)),
            )
            created_items.append(item)

        return created_items

    @staticmethod
    def _renumber_items(estimate):
        """Перенумерует все строки сметы последовательно (1, 2, 3, ...)."""
        items = list(
            EstimateItem.objects.filter(estimate=estimate)
            .order_by('section__sort_order', 'sort_order', 'item_number')
            .values_list('pk', flat=True)
        )
        for i, pk in enumerate(items, 1):
            EstimateItem.objects.filter(pk=pk).update(item_number=i)

    @transaction.atomic
    def promote_item_to_section(self, item_id: int) -> Dict[str, Any]:
        """Превращает строку сметы в раздел (секцию).

        Все строки ниже в той же секции переезжают в новую секцию.
        Исходная строка удаляется.
        """
        item = EstimateItem.objects.select_related('section').get(pk=item_id)
        estimate = item.estimate
        old_section = item.section

        # Сдвигаем sort_order секций после текущей
        EstimateSection.objects.filter(
            estimate=estimate,
            sort_order__gt=old_section.sort_order,
        ).update(sort_order=F('sort_order') + 1)

        # Создаём новую секцию
        new_section = EstimateSection.objects.create(
            estimate=estimate,
            name=item.name,
            sort_order=old_section.sort_order + 1,
        )

        # Items ниже в той же секции → переезжают в новую
        EstimateItem.objects.filter(
            section=old_section,
            sort_order__gt=item.sort_order,
        ).update(section=new_section)

        # Удаляем исходный item
        item.delete()

        # Если старая секция осталась пустой и есть другие секции — удалить
        total_sections = EstimateSection.objects.filter(estimate=estimate).count()
        if total_sections > 1 and not old_section.items.exists():
            old_section.delete()

        self._renumber_items(estimate)
        return {'section_id': new_section.id}

    @transaction.atomic
    def demote_section_to_item(self, section_id: int) -> Dict[str, Any]:
        """Превращает раздел обратно в обычную строку.

        Новая строка встаёт на место заголовка раздела,
        затем идут все строки бывшего раздела — порядок сохраняется.
        """
        section = EstimateSection.objects.get(pk=section_id)
        estimate = section.estimate

        prev_section = EstimateSection.objects.filter(
            estimate=estimate,
            sort_order__lt=section.sort_order,
        ).order_by('-sort_order').first()

        if not prev_section:
            prev_section = EstimateSection.objects.filter(
                estimate=estimate,
            ).exclude(pk=section_id).order_by('sort_order').first()
            if not prev_section:
                prev_section = EstimateSection.objects.create(
                    estimate=estimate,
                    name='Основной раздел',
                    sort_order=0,
                )

        max_sort = (
            EstimateItem.objects.filter(section=prev_section)
            .aggregate(m=Max('sort_order'))['m'] or 0
        )

        # Строки бывшего раздела — в порядке отображения
        demoted_item_pks = list(
            section.items.order_by('sort_order', 'item_number')
            .values_list('pk', flat=True)
        )

        # Новая строка встаёт сразу после последнего item предыдущей секции
        new_item = EstimateItem.objects.create(
            estimate=estimate,
            section=prev_section,
            name=section.name,
            sort_order=max_sort + 1,
            item_number=0,
            unit='шт',
            quantity=0,
            material_unit_price=0,
            work_unit_price=0,
        )

        # Бывшие items раздела идут сразу после новой строки (sort_order не пересекается)
        for offset, pk in enumerate(demoted_item_pks, start=2):
            EstimateItem.objects.filter(pk=pk).update(
                section=prev_section,
                sort_order=max_sort + offset,
            )

        section.delete()
        self._renumber_items(estimate)
        return {'item_id': new_item.id}

import json
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
        # B9: обработка ошибок при открытии Excel
        try:
            import io
            wb = openpyxl.load_workbook(
                filename=io.BytesIO(file_content),
                read_only=True,
                data_only=True,
            )
        except Exception as e:
            logger.warning('Не удалось открыть Excel %s: %s', filename, e)
            return ParsedEstimate(
                rows=[], sections=[], total_rows=0, confidence=0.0,
                warnings=[f'Не удалось открыть файл: {e}'],
            )

        ws = wb.active

        all_rows = list(ws.iter_rows(values_only=True))
        if not all_rows:
            wb.close()
            # B10: явное уведомление о пустом файле
            return ParsedEstimate(
                rows=[], sections=[], total_rows=0, confidence=0.0,
                warnings=['Файл не содержит данных'],
            )

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
            logger.warning("No default LLM provider configured")
            return ParsedEstimate(rows=[], sections=[], total_rows=0, confidence=0.0)

        provider = get_provider(provider_model)

        system_prompt = """Ты — эксперт по строительным сметам. Тебе дан PDF-файл сметы.
Извлеки все строки сметы в структурированном виде.

Для каждой строки укажи:
- item_number: порядковый номер (целое число)
- name: наименование товара/материала/оборудования (строка)
- model_name: модель/марка/артикул, если есть (строка, "" если нет)
- unit: единица измерения — шт, м.п., м², компл, кг и т.д. (строка)
- quantity: количество (число)
- material_unit_price: цена материала за единицу (число, 0 если не указана)
- work_unit_price: цена работы за единицу (число, 0 если не указана)
- section_name: название раздела/системы, к которому относится строка (строка, "" если нет)

Верни ТОЛЬКО валидный JSON без markdown-форматирования в формате:
{
  "rows": [{"item_number": 1, "name": "...", "model_name": "", "unit": "шт", "quantity": 1, "material_unit_price": 0, "work_unit_price": 0, "section_name": ""}],
  "sections": ["список уникальных названий разделов"],
  "confidence": 0.85
}"""

        # Определяем тип файла
        ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'pdf'
        file_type = ext if ext in ('pdf', 'png', 'jpg', 'jpeg') else 'pdf'

        # Ограничиваем PDF — макс 15 страниц, чтобы не убить воркер по памяти/таймауту
        warnings = []
        if file_type == 'pdf':
            try:
                import fitz
                doc = fitz.open(stream=file_content, filetype="pdf")
                total_pages = len(doc)
                if total_pages > 15:
                    logger.info(f"PDF has {total_pages} pages, truncating to 15")
                    warnings.append(f'Обработаны только первые 15 из {total_pages} страниц. Для полного импорта используйте кнопку "Импорт PDF" (постраничный режим).')
                    new_doc = fitz.open()
                    new_doc.insert_pdf(doc, to_page=14)
                    file_content = new_doc.tobytes()
                    new_doc.close()
                doc.close()
            except Exception as e:
                logger.warning(f"PDF pre-processing failed: {e}")

        try:
            response = provider.parse_with_prompt(
                file_content=file_content,
                file_type=file_type,
                system_prompt=system_prompt,
                user_prompt="Извлеки все строки из этой сметы:",
            )
            result = self._parse_llm_response(response)
            result.warnings = warnings
            return result
        except json.JSONDecodeError as e:
            logger.warning(f"PDF estimate: truncated/invalid JSON, salvaging rows: {e}")
            # B12: безопасный доступ к e.doc
            raw = getattr(e, 'doc', '') or ''
            result = self._salvage_truncated_json(raw)
            result.warnings = warnings
            if result.rows:
                return result
        except Exception as e:
            logger.error(f"PDF estimate parsing failed: {e}", exc_info=True)

        return ParsedEstimate(rows=[], sections=[], total_rows=0, confidence=0.0, warnings=warnings)

    @staticmethod
    def _parse_llm_response(response: dict) -> ParsedEstimate:
        if not response or not isinstance(response, dict):
            return ParsedEstimate(rows=[], sections=[], total_rows=0, confidence=0.0)
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

    @staticmethod
    def _salvage_truncated_json(raw_content: str) -> ParsedEstimate:
        """Извлекает строки из обрезанного JSON-ответа LLM."""
        if not raw_content:
            return ParsedEstimate(rows=[], sections=[], total_rows=0, confidence=0.0)
        parsed_rows = []
        # Находим все полные JSON-объекты строк внутри массива rows
        rows_match = re.search(r'"rows"\s*:\s*\[', raw_content)
        if not rows_match:
            return ParsedEstimate(rows=[], sections=[], total_rows=0, confidence=0.0)
        rows_start = rows_match.end()
        # Ищем все полные объекты {...} один за другим
        pos = rows_start
        brace_pattern = re.compile(r'\{[^{}]*\}')
        for m in brace_pattern.finditer(raw_content, pos):
            try:
                obj = json.loads(m.group())
                if 'name' in obj:
                    parsed_rows.append(EstimateImportRow(**obj))
            except Exception:
                continue
        if parsed_rows:
            logger.info(f"Salvaged {len(parsed_rows)} rows from truncated JSON")
        return ParsedEstimate(
            rows=parsed_rows,
            sections=[],
            total_rows=len(parsed_rows),
            confidence=0.3,
        )

    @transaction.atomic
    def save_imported_items(
        self,
        estimate_id: int,
        parsed: ParsedEstimate,
    ) -> List[EstimateItem]:
        estimate = Estimate.objects.get(pk=estimate_id)

        # B13: учитываем существующие секции при назначении sort_order
        max_section_sort = (
            EstimateSection.objects.filter(estimate=estimate)
            .aggregate(m=Max('sort_order'))['m'] or -1
        )

        section_map: Dict[str, EstimateSection] = {}
        for section_name in parsed.sections:
            if not section_name:
                continue
            section, _ = EstimateSection.objects.get_or_create(
                estimate=estimate,
                name=section_name,
                defaults={'sort_order': max_section_sort + 1 + len(section_map)},
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

        items_to_create = []
        for row in parsed.rows:
            section = section_map.get(row.section_name, default_section)
            # B14: safety fallback (теоретически невозможно, но на всякий случай)
            if not section:
                section = default_section or next(iter(section_map.values()), None)
            if not section:
                default_section, _ = EstimateSection.objects.get_or_create(
                    estimate=estimate, name='Основной раздел', defaults={'sort_order': 0},
                )
                section = default_section

            items_to_create.append(EstimateItem(
                estimate=estimate,
                section=section,
                item_number=existing_max + row.item_number,
                sort_order=existing_max + row.item_number,
                name=row.name[:1000],
                model_name=row.model_name[:300],
                unit=(row.unit or 'шт')[:50],
                quantity=row.quantity,
                material_unit_price=row.material_unit_price,
                work_unit_price=row.work_unit_price,
            ))

        return EstimateItem.objects.bulk_create(items_to_create)

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

        # B13: учитываем существующие секции при назначении sort_order
        max_section_sort = (
            EstimateSection.objects.filter(estimate=estimate)
            .aggregate(m=Max('sort_order'))['m'] or -1
        )

        # Первый проход: создаём разделы
        section_map: Dict[str, EstimateSection] = {}
        sort_order = max_section_sort + 1
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

        # Второй проход: собираем объекты для bulk_create
        current_section = default_section
        items_to_create = []
        item_counter = 0

        for row_data in rows:
            if row_data.get('is_section'):
                name = row_data.get('name', '').strip()
                current_section = section_map.get(name, default_section)
                continue

            item_counter += 1
            # B15: safety fallback
            section = current_section or default_section or next(iter(section_map.values()), None)
            if not section:
                default_section, _ = EstimateSection.objects.get_or_create(
                    estimate=estimate, name='Основной раздел', defaults={'sort_order': 0},
                )
                section = default_section

            items_to_create.append(EstimateItem(
                estimate=estimate,
                section=section,
                item_number=existing_max + item_counter,
                sort_order=existing_max + item_counter,
                name=row_data.get('name', '')[:1000],
                model_name=row_data.get('model_name', '')[:300],
                unit=(row_data.get('unit', 'шт') or 'шт')[:50],
                quantity=_safe_decimal(row_data.get('quantity', 1)),
                material_unit_price=_safe_decimal(row_data.get('material_unit_price', 0)),
                work_unit_price=_safe_decimal(row_data.get('work_unit_price', 0)),
            ))

        return EstimateItem.objects.bulk_create(items_to_create)

    @staticmethod
    def _renumber_items(estimate):
        """Перенумерует все строки сметы последовательно (1, 2, 3, ...)."""
        items = list(
            EstimateItem.objects.filter(estimate=estimate)
            .order_by('section__sort_order', 'sort_order', 'item_number')
            .only('pk', 'item_number')
        )
        to_update = []
        for i, item in enumerate(items, 1):
            if item.item_number != i:
                item.item_number = i
                to_update.append(item)
        if to_update:
            EstimateItem.objects.bulk_update(to_update, ['item_number'])

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

        # Флаг: при fallback на следующую секцию строки вставляем ПЕРЕД её items
        prepend = False

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
            else:
                prepend = True

        # Строки бывшего раздела — в порядке отображения
        demoted_item_pks = list(
            section.items.order_by('sort_order', 'item_number')
            .values_list('pk', flat=True)
        )

        demoted_count = len(demoted_item_pks) + 1  # +1 для новой строки-заголовка

        if prepend:
            # Сдвигаем существующие items целевой секции вниз, освобождая место
            prev_section.items.update(sort_order=F('sort_order') + demoted_count + 1)

            # Новая строка встаёт первой в целевой секции
            new_item = EstimateItem.objects.create(
                estimate=estimate,
                section=prev_section,
                name=section.name,
                sort_order=1,
                item_number=0,
                unit='шт',
                quantity=0,
                material_unit_price=0,
                work_unit_price=0,
            )

            # Бывшие items раздела идут сразу после новой строки
            for offset, pk in enumerate(demoted_item_pks, start=2):
                EstimateItem.objects.filter(pk=pk).update(
                    section=prev_section,
                    sort_order=offset,
                )
        else:
            max_sort = (
                EstimateItem.objects.filter(section=prev_section)
                .aggregate(m=Max('sort_order'))['m'] or 0
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

            # Бывшие items раздела идут сразу после новой строки
            for offset, pk in enumerate(demoted_item_pks, start=2):
                EstimateItem.objects.filter(pk=pk).update(
                    section=prev_section,
                    sort_order=max_sort + offset,
                )

        section.delete()
        self._renumber_items(estimate)
        return {'item_id': new_item.id}

    @transaction.atomic
    def move_item_up(self, item_id: int) -> Dict[str, Any]:
        """Перемещает строку на одну позицию вверх внутри своей секции."""
        item = EstimateItem.objects.get(pk=item_id)

        prev_item = (
            EstimateItem.objects.filter(
                section=item.section,
                sort_order__lt=item.sort_order,
            )
            .order_by('-sort_order')
            .first()
        )
        if not prev_item:
            return {'moved': False}

        # Swap sort_order AND item_number (adjacent swap — no full renumber needed)
        item.sort_order, prev_item.sort_order = prev_item.sort_order, item.sort_order
        item.item_number, prev_item.item_number = prev_item.item_number, item.item_number
        item.save(update_fields=['sort_order', 'item_number'])
        prev_item.save(update_fields=['sort_order', 'item_number'])

        return {'moved': True}

    @transaction.atomic
    def move_item_down(self, item_id: int) -> Dict[str, Any]:
        """Перемещает строку на одну позицию вниз внутри своей секции."""
        item = EstimateItem.objects.get(pk=item_id)

        next_item = (
            EstimateItem.objects.filter(
                section=item.section,
                sort_order__gt=item.sort_order,
            )
            .order_by('sort_order')
            .first()
        )
        if not next_item:
            return {'moved': False}

        # Swap sort_order AND item_number (adjacent swap — no full renumber needed)
        item.sort_order, next_item.sort_order = next_item.sort_order, item.sort_order
        item.item_number, next_item.item_number = next_item.item_number, item.item_number
        item.save(update_fields=['sort_order', 'item_number'])
        next_item.save(update_fields=['sort_order', 'item_number'])

        return {'moved': True}

    @transaction.atomic
    def move_item_to_section(self, item_id: int, target_section_id: int) -> Dict[str, Any]:
        """Перемещает строку в другой раздел (в конец)."""
        item = EstimateItem.objects.select_related('section').get(pk=item_id)
        target_section = EstimateSection.objects.get(pk=target_section_id)

        if item.section_id == target_section_id:
            return {'moved': False}

        max_sort = (
            EstimateItem.objects.filter(section=target_section)
            .aggregate(m=Max('sort_order'))['m'] or 0
        )

        item.section = target_section
        item.sort_order = max_sort + 1
        item.save(update_fields=['section', 'sort_order'])

        self._renumber_items(item.estimate)
        return {'moved': True}

    @transaction.atomic
    def bulk_move_items(self, item_ids: List[int], target_position: int) -> Dict[str, Any]:
        """Перемещает группу строк на указанную позицию (1-based item_number).

        Алгоритм:
        1. Загружаем все строки сметы в текущем порядке
        2. Извлекаем выбранные строки
        3. Вставляем их на позицию target_position
        4. Переназначаем sort_order и item_number
        """
        if not item_ids:
            return {'moved': 0}

        selected_items = list(
            EstimateItem.objects.filter(id__in=item_ids).select_related('section')
        )
        if not selected_items:
            return {'moved': 0}

        estimate = selected_items[0].estimate
        selected_ids_set = set(item_ids)

        # Все строки сметы в текущем порядке
        all_items = list(
            EstimateItem.objects.filter(estimate=estimate)
            .order_by('section__sort_order', 'sort_order', 'item_number')
        )

        # Разделяем на "остающиеся" и "перемещаемые" (сохраняя порядок)
        remaining = [it for it in all_items if it.id not in selected_ids_set]
        moving = [it for it in all_items if it.id in selected_ids_set]

        # Clamp позицию
        insert_idx = max(0, min(target_position - 1, len(remaining)))

        # Вставляем перемещаемые строки на нужную позицию
        new_order = remaining[:insert_idx] + moving + remaining[insert_idx:]

        # Переназначаем sort_order
        to_update = []
        for i, item in enumerate(new_order):
            new_sort = i + 1
            if item.sort_order != new_sort:
                item.sort_order = new_sort
                to_update.append(item)

        if to_update:
            EstimateItem.objects.bulk_update(to_update, ['sort_order'])

        self._renumber_items(estimate)
        return {'moved': len(moving)}

    @transaction.atomic
    def merge_items(self, item_ids: List[int]) -> Dict[str, Any]:
        """Объединяет несколько строк сметы в одну.

        Первая строка (по sort_order) становится целевой:
        - name, model_name, original_name — конкатенация через пробел (пустые пропускаются)
        - quantity, unit, prices, product, work_item — берутся из первой строки
        - custom_data — shallow merge (первая строка приоритетнее)
        Остальные строки удаляются. Нумерация пересчитывается.
        """
        if len(item_ids) < 2:
            raise ValueError('Для объединения нужно минимум 2 строки')

        items = list(
            EstimateItem.objects.filter(id__in=item_ids)
            .order_by('section__sort_order', 'sort_order', 'item_number')
        )

        if len(items) < 2:
            raise ValueError('Не все строки найдены')

        sections = set(item.section_id for item in items)
        if len(sections) > 1:
            raise ValueError('Все объединяемые строки должны быть в одном разделе')

        target = items[0]
        rest = items[1:]

        # Конкатенация текстовых полей (пустые пропускаются)
        names = [item.name for item in items if item.name.strip()]
        target.name = ' '.join(names)[:1000]

        model_names = [item.model_name for item in items if item.model_name.strip()]
        target.model_name = ' '.join(model_names)[:300]

        original_names = [item.original_name for item in items if item.original_name.strip()]
        target.original_name = ' '.join(original_names)[:1000]

        # Shallow merge custom_data (первая строка приоритетнее)
        merged_custom = {}
        for item in reversed(items):
            if item.custom_data:
                merged_custom.update(item.custom_data)
        target.custom_data = merged_custom

        target.save(update_fields=['name', 'model_name', 'original_name', 'custom_data'])

        rest_ids = [item.id for item in rest]
        EstimateItem.objects.filter(id__in=rest_ids).delete()

        self._renumber_items(target.estimate)

        return {'merged_into': target.id, 'deleted_ids': rest_ids}

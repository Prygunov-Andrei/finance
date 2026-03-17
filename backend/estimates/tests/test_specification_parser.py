"""Тесты SpecificationParser — Заход 2 (мок LLM)."""
import json
import pytest
from unittest.mock import patch, MagicMock

from llm_services.services.specification_parser import SpecificationParser


def _make_classify_response(page_type='specification', section='ОВ'):
    return {
        'page_type': page_type,
        'section_name': section,
        'has_table': page_type == 'specification',
    }


def _make_extract_response(items=None):
    if items is None:
        items = [
            {
                'name': 'Вентилятор канальный ВКК-160',
                'model_name': 'ВКК-160',
                'brand': 'Вентс',
                'unit': 'шт',
                'quantity': 2,
                'tech_specs': 'Расход 350 м3/ч',
                'section_name': 'ОВ',
            },
        ]
    return {'items': items, 'continued_from_previous': False}


def _make_pdf_bytes(num_pages=3):
    """Создаёт минимальный PDF с N страниц через fitz."""
    import fitz
    doc = fitz.open()
    for i in range(num_pages):
        page = doc.new_page(width=595, height=842)
        page.insert_text((72, 72), f'Page {i+1}')
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


@pytest.fixture
def mock_provider():
    """Мок LLM-провайдера."""
    provider = MagicMock()
    return provider


@pytest.fixture
def parser(mock_provider):
    """SpecificationParser с замоканным провайдером."""
    with patch('llm_services.services.specification_parser.get_provider', return_value=mock_provider):
        with patch('llm_services.services.specification_parser.LLMProvider') as mock_model:
            mock_model.get_default.return_value = MagicMock()
            p = SpecificationParser()
            p.provider = mock_provider
            return p


class TestSpecificationParserHappyPath:
    """Happy path: успешный парсинг."""

    def test_single_page_spec(self, parser, mock_provider):
        """Одна страница-спецификация — извлечены позиции."""
        mock_provider.parse_with_prompt.side_effect = [
            _make_classify_response('specification', 'ОВ'),
            _make_extract_response(),
        ]
        result = parser.parse_pdf(_make_pdf_bytes(1), 'test.pdf')

        assert result['status'] == 'done'
        assert len(result['items']) == 1
        assert result['items'][0]['name'] == 'Вентилятор канальный ВКК-160'
        assert result['pages_total'] == 1
        assert result['pages_processed'] == 1
        assert result['pages_error'] == 0

    def test_multi_page(self, parser, mock_provider):
        """Многостраничный PDF: 2 спец + 1 чертёж."""
        mock_provider.parse_with_prompt.side_effect = [
            # Стр 1: спец
            _make_classify_response('specification', 'ОВ'),
            _make_extract_response([
                {'name': 'Вентилятор', 'unit': 'шт', 'quantity': 1, 'model_name': '', 'brand': '', 'tech_specs': '', 'section_name': 'ОВ'},
            ]),
            # Стр 2: чертёж (пропускается)
            _make_classify_response('drawing', 'ОВ'),
            # Стр 3: спец
            _make_classify_response('specification', 'ВК'),
            _make_extract_response([
                {'name': 'Насос', 'unit': 'шт', 'quantity': 3, 'model_name': '', 'brand': '', 'tech_specs': '', 'section_name': 'ВК'},
            ]),
        ]
        result = parser.parse_pdf(_make_pdf_bytes(3), 'test.pdf')

        assert result['status'] == 'done'
        assert len(result['items']) == 2
        assert result['pages_total'] == 3
        assert result['pages_skipped'] == 1  # чертёж

    def test_section_propagation(self, parser, mock_provider):
        """section_name из классификации передаётся в items."""
        mock_provider.parse_with_prompt.side_effect = [
            _make_classify_response('specification', 'ЭО'),
            _make_extract_response([
                {'name': 'Кабель ВВГнг', 'unit': 'м', 'quantity': 100,
                 'model_name': '', 'brand': '', 'tech_specs': '', 'section_name': ''},
            ]),
        ]
        result = parser.parse_pdf(_make_pdf_bytes(1), 'test.pdf')

        assert result['items'][0]['section_name'] == 'ЭО'

    def test_deduplication(self, parser, mock_provider):
        """Дубли (same name+model+brand) объединяются, quantity суммируется."""
        mock_provider.parse_with_prompt.side_effect = [
            _make_classify_response('specification'),
            _make_extract_response([
                {'name': 'Труба PPR 25мм', 'model_name': '', 'brand': '', 'unit': 'м', 'quantity': 10, 'tech_specs': '', 'section_name': ''},
                {'name': 'Труба PPR 25мм', 'model_name': '', 'brand': '', 'unit': 'м', 'quantity': 15, 'tech_specs': '', 'section_name': ''},
            ]),
        ]
        result = parser.parse_pdf(_make_pdf_bytes(1), 'test.pdf')

        assert len(result['items']) == 1
        assert result['items'][0]['quantity'] == 25.0

    def test_empty_items_filtered(self, parser, mock_provider):
        """Позиции с пустым name фильтруются."""
        mock_provider.parse_with_prompt.side_effect = [
            _make_classify_response('specification'),
            _make_extract_response([
                {'name': '', 'unit': 'шт', 'quantity': 1, 'model_name': '', 'brand': '', 'tech_specs': '', 'section_name': ''},
                {'name': 'Клапан', 'unit': 'шт', 'quantity': 1, 'model_name': '', 'brand': '', 'tech_specs': '', 'section_name': ''},
            ]),
        ]
        result = parser.parse_pdf(_make_pdf_bytes(1), 'test.pdf')

        assert len(result['items']) == 1
        assert result['items'][0]['name'] == 'Клапан'


class TestSpecificationParserErrors:
    """Тесты ошибок и partial success."""

    def test_page_error_partial(self, parser, mock_provider):
        """Ошибка на одной странице → partial, остальные распарсены."""
        call_count = [0]

        def side_effect(*args, **kwargs):
            call_count[0] += 1
            if call_count[0] == 1:
                return _make_classify_response('specification')
            elif call_count[0] == 2:
                return _make_extract_response()
            elif call_count[0] == 3:
                raise TimeoutError('LLM timeout')
            # Ретраи на стр.2 тоже фейлятся
            raise TimeoutError('LLM timeout')

        mock_provider.parse_with_prompt.side_effect = side_effect
        result = parser.parse_pdf(_make_pdf_bytes(2), 'test.pdf')

        assert result['status'] == 'partial'
        assert len(result['items']) == 1
        assert result['pages_error'] == 1
        assert len(result['errors']) == 1
        assert 'timeout' in result['errors'][0].lower() or 'Timeout' in result['errors'][0]

    def test_all_pages_error(self, parser, mock_provider):
        """Все страницы с ошибками → status=error."""
        mock_provider.parse_with_prompt.side_effect = RuntimeError('API down')
        result = parser.parse_pdf(_make_pdf_bytes(2), 'test.pdf')

        assert result['status'] == 'error'
        assert len(result['items']) == 0
        assert result['pages_error'] == 2

    def test_invalid_json_graceful(self, parser, mock_provider):
        """Невалидный JSON от LLM — graceful degradation."""
        mock_provider.parse_with_prompt.side_effect = [
            'not json at all',  # classify retry
            'still not json',   # classify retry
            'nope',             # classify 3rd attempt → fallback to 'other'
        ]
        result = parser.parse_pdf(_make_pdf_bytes(1), 'test.pdf')

        # Страница классифицирована как 'other' → пропущена
        assert result['status'] == 'done'
        assert len(result['items']) == 0
        assert result['pages_skipped'] == 1

    def test_all_pages_drawings(self, parser, mock_provider):
        """Все страницы — чертежи → 0 позиций, status=done."""
        mock_provider.parse_with_prompt.side_effect = [
            _make_classify_response('drawing'),
            _make_classify_response('drawing'),
        ]
        result = parser.parse_pdf(_make_pdf_bytes(2), 'test.pdf')

        assert result['status'] == 'done'
        assert len(result['items']) == 0
        assert result['pages_skipped'] == 2

    def test_progress_callback(self, parser, mock_provider):
        """on_page_progress вызывается для каждой страницы."""
        mock_provider.parse_with_prompt.side_effect = [
            _make_classify_response('title'),
            _make_classify_response('drawing'),
            _make_classify_response('specification'),
            _make_extract_response(),
        ]
        progress_calls = []
        result = parser.parse_pdf(
            _make_pdf_bytes(3), 'test.pdf',
            on_page_progress=lambda p, t: progress_calls.append((p, t)),
        )

        assert progress_calls == [(1, 3), (2, 3), (3, 3)]


class TestSpecificationParserNormalization:
    """Тесты нормализации данных."""

    def test_quantity_normalization(self, parser, mock_provider):
        """Невалидное quantity → 1.0."""
        mock_provider.parse_with_prompt.side_effect = [
            _make_classify_response('specification'),
            _make_extract_response([
                {'name': 'Труба', 'quantity': 'много', 'unit': 'м', 'model_name': '', 'brand': '', 'tech_specs': '', 'section_name': ''},
            ]),
        ]
        result = parser.parse_pdf(_make_pdf_bytes(1), 'test.pdf')

        assert result['items'][0]['quantity'] == 1.0

    def test_defaults_applied(self, parser, mock_provider):
        """Отсутствующие поля получают дефолтные значения."""
        mock_provider.parse_with_prompt.side_effect = [
            _make_classify_response('specification'),
            {'items': [{'name': 'Минимальная позиция'}], 'continued_from_previous': False},
        ]
        result = parser.parse_pdf(_make_pdf_bytes(1), 'test.pdf')

        item = result['items'][0]
        assert item['unit'] == 'шт'
        assert item['quantity'] == 1.0
        assert item['model_name'] == ''
        assert item['brand'] == ''
        assert item['tech_specs'] == ''

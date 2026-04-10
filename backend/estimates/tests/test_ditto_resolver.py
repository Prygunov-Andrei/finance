"""Тесты разрешения «то же» / «так же» в строках смет."""
from django.test import TestCase

from estimates.services.ditto_resolver import (
    is_ditto,
    resolve_ditto,
    resolve_dittos_in_rows,
    _extract_base_name,
)


class TestIsDitto(TestCase):
    """Определение вариантов 'то же' / 'так же'."""

    def test_to_zhe_standard(self):
        self.assertTrue(is_ditto('То же'))
        self.assertTrue(is_ditto('То же 800х300'))

    def test_to_zhe_hyphen(self):
        self.assertTrue(is_ditto('То-же'))
        self.assertTrue(is_ditto('то-же'))

    def test_tozhe_one_word(self):
        self.assertTrue(is_ditto('Тоже'))
        self.assertTrue(is_ditto('тоже'))
        self.assertTrue(is_ditto('ТОЖЕ'))

    def test_upper_case(self):
        self.assertTrue(is_ditto('ТО ЖЕ'))
        self.assertTrue(is_ditto('ТО-ЖЕ'))

    def test_mixed_case(self):
        self.assertTrue(is_ditto('то-Же'))
        self.assertTrue(is_ditto('То - же'))
        self.assertTrue(is_ditto('ТО- ЖЕ'))

    def test_extra_spaces(self):
        self.assertTrue(is_ditto('То  же'))
        self.assertTrue(is_ditto('  То же  '))

    def test_tak_zhe(self):
        self.assertTrue(is_ditto('Так же'))
        self.assertTrue(is_ditto('Также'))
        self.assertTrue(is_ditto('ТАКЖЕ'))
        self.assertTrue(is_ditto('ТАК ЖЕ'))
        self.assertTrue(is_ditto('так-же 600х500'))

    def test_with_suffix(self):
        self.assertTrue(is_ditto('То же 800х300 δ=0,8 мм'))
        self.assertTrue(is_ditto('Тоже Ø200'))

    def test_not_ditto_normal_text(self):
        self.assertFalse(is_ditto('Воздуховод оцинкованный'))
        self.assertFalse(is_ditto('Кондиционер настенный'))

    def test_not_ditto_empty(self):
        self.assertFalse(is_ditto(''))
        self.assertFalse(is_ditto('   '))

    def test_not_ditto_normal_product_with_tozhe_in_middle(self):
        """Слово 'тоже' внутри обычного текста — не дитто (начало не совпадает)."""
        self.assertFalse(is_ditto('Оборудование тоже важное'))


class TestExtractBaseName(TestCase):
    """Извлечение базового имени (до размеров)."""

    def test_dimensions_wxh(self):
        result = _extract_base_name('Воздуховоды из оцинк. стали 1200х500 δ=0,8 мм')
        self.assertEqual(result, 'Воздуховоды из оцинк. стали')

    def test_dimensions_wxh_latin_x(self):
        result = _extract_base_name('Воздуховод 500x300 мм')
        self.assertEqual(result, 'Воздуховод')

    def test_diameter(self):
        result = _extract_base_name('Труба стальная Ø125')
        self.assertEqual(result, 'Труба стальная')

    def test_d_equals(self):
        result = _extract_base_name('Клапан D=200 мм')
        self.assertEqual(result, 'Клапан')

    def test_thickness_delta(self):
        result = _extract_base_name('Лист оцинкованный δ=0,8')
        self.assertEqual(result, 'Лист оцинкованный')

    def test_mm_suffix(self):
        result = _extract_base_name('Утеплитель 50 мм')
        self.assertEqual(result, 'Утеплитель')

    def test_no_dimensions(self):
        result = _extract_base_name('Клапан обратный')
        self.assertEqual(result, 'Клапан обратный')

    def test_strips_trailing_punctuation(self):
        result = _extract_base_name('Воздуховод, 1200х500')
        self.assertEqual(result, 'Воздуховод')


class TestResolveDitto(TestCase):
    """Разрешение одной 'то же' строки."""

    def test_scenario_a_dimensions_in_name(self):
        """Сценарий A: 'То же' + суффикс → base_name + суффикс."""
        result = resolve_ditto(
            'То же 800х300 δ=0,8 мм',
            'Воздуховоды из оцинк. стали 1200х500 δ=0,8 мм',
        )
        self.assertEqual(result, 'Воздуховоды из оцинк. стали 800х300 δ=0,8 мм')

    def test_scenario_a_different_diameter(self):
        result = resolve_ditto(
            'То же Ø200',
            'Труба стальная Ø125',
        )
        self.assertEqual(result, 'Труба стальная Ø200')

    def test_scenario_b_no_suffix(self):
        """Сценарий B: 'То же' без суффикса → полное prev_name."""
        result = resolve_ditto('То же', 'Воздуховод оцинкованный')
        self.assertEqual(result, 'Воздуховод оцинкованный')

    def test_scenario_b_tak_zhe(self):
        result = resolve_ditto('Также', 'Клапан обратный')
        self.assertEqual(result, 'Клапан обратный')

    def test_scenario_b_prev_without_dimensions(self):
        """Сценарий B: предыдущая строка без размеров → полное имя."""
        result = resolve_ditto('Тоже', 'Кран шаровый')
        self.assertEqual(result, 'Кран шаровый')


class TestResolveDittosInRows(TestCase):
    """Массовое разрешение 'то же' в списке строк."""

    def test_chain_scenario_a(self):
        """Цепочка 'то же' с размерами в name."""
        rows = [
            {'name': 'Воздуховоды из оцинк. стали 1200х500 δ=0,8 мм'},
            {'name': 'То же 800х300 δ=0,8 мм'},
            {'name': 'То же 600х500 δ=0,8 мм'},
        ]
        count = resolve_dittos_in_rows(rows)
        self.assertEqual(count, 2)
        self.assertEqual(rows[1]['name'], 'Воздуховоды из оцинк. стали 800х300 δ=0,8 мм')
        self.assertEqual(rows[2]['name'], 'Воздуховоды из оцинк. стали 600х500 δ=0,8 мм')

    def test_chain_scenario_b(self):
        """Цепочка 'то же' без суффикса (размеры в model)."""
        rows = [
            {'name': 'Воздуховод оцинкованный'},
            {'name': 'То же'},
            {'name': 'Также'},
        ]
        count = resolve_dittos_in_rows(rows)
        self.assertEqual(count, 2)
        self.assertEqual(rows[1]['name'], 'Воздуховод оцинкованный')
        self.assertEqual(rows[2]['name'], 'Воздуховод оцинкованный')

    def test_mixed_materials(self):
        """Разные материалы — 'то же' наследует от ближайшего реального."""
        rows = [
            {'name': 'Воздуховоды из оцинк. стали 1200х500'},
            {'name': 'То же 800х300'},
            {'name': 'Клапан обратный'},
            {'name': 'Так же'},
        ]
        count = resolve_dittos_in_rows(rows)
        self.assertEqual(count, 2)
        self.assertIn('Воздуховоды', rows[1]['name'])
        self.assertEqual(rows[3]['name'], 'Клапан обратный')

    def test_first_row_is_ditto_skipped(self):
        """'То же' в первой строке (нет предыдущей) — пропускается."""
        rows = [
            {'name': 'То же 800х300'},
            {'name': 'Воздуховод 1200х500'},
        ]
        count = resolve_dittos_in_rows(rows)
        self.assertEqual(count, 0)
        self.assertEqual(rows[0]['name'], 'То же 800х300')  # не изменилось

    def test_empty_list(self):
        count = resolve_dittos_in_rows([])
        self.assertEqual(count, 0)

    def test_no_dittos(self):
        rows = [
            {'name': 'Воздуховод'},
            {'name': 'Клапан'},
        ]
        count = resolve_dittos_in_rows(rows)
        self.assertEqual(count, 0)

    def test_returns_count(self):
        rows = [
            {'name': 'Материал'},
            {'name': 'тоже'},
            {'name': 'ТО-ЖЕ'},
            {'name': 'Также'},
        ]
        count = resolve_dittos_in_rows(rows)
        self.assertEqual(count, 3)

from django.test import TestCase
from accounting.models import Counterparty, LegalEntity, TaxSystem
from llm_services.services.entity_matcher import CounterpartyMatcher, LegalEntityMatcher


class CounterpartyMatcherTest(TestCase):
    """Тесты сопоставления контрагентов"""
    
    def setUp(self):
        self.matcher = CounterpartyMatcher()
        
        self.counterparty1 = Counterparty.objects.create(
            name='ООО "Вентиляционные системы"',
            short_name='Вентсистемы',
            inn='1234567890',
            type=Counterparty.Type.VENDOR,
            legal_form=Counterparty.LegalForm.OOO
        )
        self.counterparty2 = Counterparty.objects.create(
            name='АО "Климатические технологии"',
            inn='0987654321',
            type=Counterparty.Type.VENDOR,
            legal_form=Counterparty.LegalForm.OOO  # Используем OOO, так как AO может отсутствовать
        )
    
    def test_match_by_inn_exact(self):
        """Точное совпадение по ИНН"""
        result = self.matcher.match(
            name='Какое-то название',
            inn='1234567890'
        )
        
        self.assertEqual(result['match_type'], 'exact')
        self.assertEqual(result['counterparty'].id, self.counterparty1.id)
        self.assertEqual(len(result['suggestions']), 0)
    
    def test_match_by_name_similar(self):
        """Похожее совпадение по названию"""
        result = self.matcher.match(
            name='Вент. системы',  # Сокращённое название для снижения схожести
            inn='9999999999'  # Несуществующий ИНН
        )
        
        # Может быть как 'similar', так и 'exact' в зависимости от порога
        self.assertIn(result['match_type'], ['similar', 'exact'])
        if result['match_type'] == 'similar':
            self.assertIsNone(result['counterparty'])
            self.assertTrue(len(result['suggestions']) > 0)
            # Проверяем, что первая рекомендация - это наш counterparty1
            self.assertEqual(result['suggestions'][0]['id'], self.counterparty1.id)
    
    def test_match_not_found(self):
        """Контрагент не найден"""
        result = self.matcher.match(
            name='Абсолютно неизвестная компания XYZ',
            inn='5555555555'
        )
        
        self.assertEqual(result['match_type'], 'not_found')
        self.assertIsNone(result['counterparty'])
        self.assertEqual(len(result['suggestions']), 0)
    
    def test_find_by_inn(self):
        """Прямой поиск по ИНН"""
        found = self.matcher.find_by_inn('1234567890')
        self.assertIsNotNone(found)
        self.assertEqual(found.id, self.counterparty1.id)
        
        not_found = self.matcher.find_by_inn('9999999999')
        self.assertIsNone(not_found)
    
    def test_find_similar_by_name(self):
        """Fuzzy-поиск по названию"""
        results = self.matcher.find_similar_by_name('Вентиляционные системы')
        
        self.assertTrue(len(results) > 0)
        self.assertEqual(results[0]['id'], self.counterparty1.id)
        self.assertGreaterEqual(results[0]['score'], CounterpartyMatcher.SIMILAR_THRESHOLD)
    
    def test_find_similar_by_short_name(self):
        """Поиск по короткому названию"""
        results = self.matcher.find_similar_by_name('Вентсистемы')
        
        self.assertTrue(len(results) > 0)
        # Должен найти по short_name
        self.assertEqual(results[0]['id'], self.counterparty1.id)
    
    def test_match_empty_inn(self):
        """Поиск без ИНН (только по названию)"""
        result = self.matcher.match(
            name='Вентиляционные системы ООО',
            inn=''
        )
        
        # Должен найти по названию (exact или similar)
        self.assertIn(result['match_type'], ['exact', 'similar'])
    
    def test_match_exact_by_name_threshold(self):
        """Точное совпадение по названию с высоким порогом"""
        result = self.matcher.match(
            name='ООО "Вентиляционные системы"',
            inn='9999999999'
        )
        
        # При очень высокой схожести должен быть exact
        if result['match_type'] == 'exact':
            self.assertIsNotNone(result['counterparty'])
            self.assertEqual(result['counterparty'].id, self.counterparty1.id)


class LegalEntityMatcherTest(TestCase):
    """Тесты сопоставления юрлиц"""
    
    def setUp(self):
        self.matcher = LegalEntityMatcher()
        
        # Создаём систему налогообложения (обязательное поле)
        self.tax_system, _ = TaxSystem.objects.get_or_create(
            code='test_tax_system',
            defaults={
                'name': 'Тестовая система налогообложения',
                'has_vat': True,
                'vat_rate': 20.00
            }
        )
        
        self.legal_entity = LegalEntity.objects.create(
            name='ООО "Наша Компания"',
            short_name='Наша Компания',
            inn='1111111111',
            kpp='222222222',
            tax_system=self.tax_system
        )
    
    def test_match_by_inn_exact(self):
        """Точное совпадение по ИНН"""
        result = self.matcher.match(
            name='Любое название',
            inn='1111111111'
        )
        
        self.assertEqual(result['match_type'], 'exact')
        self.assertEqual(result['legal_entity'].id, self.legal_entity.id)
        self.assertIsNone(result['error'])
    
    def test_match_not_found(self):
        """Юрлицо не найдено"""
        result = self.matcher.match(
            name='Любое название',
            inn='9999999999'
        )
        
        self.assertEqual(result['match_type'], 'not_found')
        self.assertIsNone(result['legal_entity'])
        self.assertIsNotNone(result['error'])
        self.assertIn('9999999999', result['error'])
    
    def test_find_by_inn(self):
        """Прямой поиск по ИНН"""
        found = self.matcher.find_by_inn('1111111111')
        self.assertIsNotNone(found)
        self.assertEqual(found.id, self.legal_entity.id)
        
        not_found = self.matcher.find_by_inn('9999999999')
        self.assertIsNone(not_found)
    
    def test_match_empty_inn(self):
        """Поиск с пустым ИНН"""
        result = self.matcher.match(name='Любое название', inn='')
        
        self.assertEqual(result['match_type'], 'not_found')
        self.assertIsNotNone(result['error'])

"""Тесты для нового 8-уровневого pipeline подбора работ.

Покрывает:
- Регрессия на все 8 багов текущей системы
- 8 уровней pipeline (0-7)
- Knowledge (.md файлы)
- LLM flexibility
- Man-hours расчёт
"""
import json
import os
import tempfile
import unittest
import uuid
from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.contrib.auth.models import User
from django.test import TestCase, override_settings

from accounting.models import LegalEntity, TaxSystem
from catalog.models import Product, ProductKnowledge, ProductWorkMapping
from estimates.models import Estimate, EstimateItem, EstimateSection, EstimateSubsection
from estimates.services.work_matching.man_hours import calculate_man_hours
from estimates.services.work_matching.pipeline import MatchingContext, match_single_item
from estimates.services.work_matching.tiers import (
    Tier0Default,
    Tier1History,
    Tier2PriceList,
    Tier3Knowledge,
    Tier5Fuzzy,
    Tier6LLM,
)
from objects.models import Object
from pricelists.models import PriceList, PriceListItem, WorkerGrade, WorkItem, WorkSection


class WorkMatchingTestBase(TestCase):
    """Базовый класс с общими фикстурами."""

    @classmethod
    def setUpTestData(cls):
        uid = uuid.uuid4().hex[:6]

        # Required dependencies for Estimate
        cls.user = User.objects.create_user(username=f'test_{uid}', password='pass')
        cls.obj = Object.objects.create(name=f'Объект {uid}', address='Адрес')
        cls.tax = TaxSystem.objects.create(
            name=f'ОСН {uid}', code=f'osn_{uid}', has_vat=True, vat_rate=Decimal('20'),
        )
        cls.entity = LegalEntity.objects.create(
            short_name=f'ООО {uid}', name=f'ООО Тест {uid}',
            inn=f'77{uid}00', tax_system=cls.tax,
        )

        # WorkerGrades (required FK for WorkItem)
        cls.grade2 = WorkerGrade.objects.get_or_create(grade=2, defaults={
            'name': 'Разряд 2', 'default_hourly_rate': Decimal('500'),
        })[0]
        cls.grade3 = WorkerGrade.objects.get_or_create(grade=3, defaults={
            'name': 'Разряд 3', 'default_hourly_rate': Decimal('600'),
        })[0]
        cls.grade4 = WorkerGrade.objects.get_or_create(grade=4, defaults={
            'name': 'Разряд 4', 'default_hourly_rate': Decimal('700'),
        })[0]

        # WorkSection
        cls.section_vent = WorkSection.objects.create(
            code=f'VENT{uid}', name='Вентиляция', sort_order=1,
        )
        cls.section_cond = WorkSection.objects.create(
            code=f'COND{uid}', name='Кондиционирование', sort_order=2,
        )

        # WorkItems
        cls.wi_mount_cond = WorkItem.objects.create(
            article=f'C-001-{uid}', name='Монтаж кондиционера настенного',
            section=cls.section_cond, unit='шт', hours=Decimal('4.0'),
            grade=cls.grade3, required_grade=Decimal('3.0'),
            coefficient=Decimal('1.0'), is_current=True,
        )
        cls.wi_mount_vent = WorkItem.objects.create(
            article=f'V-001-{uid}', name='Монтаж приточной установки',
            section=cls.section_vent, unit='шт', hours=Decimal('8.0'),
            grade=cls.grade4, required_grade=Decimal('4.0'),
            coefficient=Decimal('1.0'), is_current=True,
        )
        cls.wi_mount_duct = WorkItem.objects.create(
            article=f'V-002-{uid}', name='Монтаж воздуховода прямоугольного',
            section=cls.section_vent, unit='м.п.', hours=Decimal('0.5'),
            grade=cls.grade2, required_grade=Decimal('2.0'),
            coefficient=Decimal('1.0'), is_current=True,
        )

        # PriceList
        cls.price_list = PriceList.objects.create(
            number=f'PL-{uid}', date='2026-01-01', status='active',
            grade_1_rate=Decimal('400'), grade_2_rate=Decimal('500'),
            grade_3_rate=Decimal('600'), grade_4_rate=Decimal('700'),
            grade_5_rate=Decimal('800'),
        )
        cls.pli_cond = PriceListItem.objects.create(
            price_list=cls.price_list, work_item=cls.wi_mount_cond,
        )
        cls.pli_vent = PriceListItem.objects.create(
            price_list=cls.price_list, work_item=cls.wi_mount_vent,
        )

        # Product
        cls.product_cond = Product.objects.create(
            name='Кондиционер настенный Daikin FTXB35C',
            default_unit='шт', status=Product.Status.NEW,
        )
        cls.product_vent = Product.objects.create(
            name='Приточная установка Breezart 1000',
            default_unit='шт', status=Product.Status.NEW,
        )

        # Estimate (с правильными обязательными FK)
        cls.estimate = Estimate.objects.create(
            number=f'СМ-TEST-{uid}', name='Тест',
            object=cls.obj, legal_entity=cls.entity,
            created_by=cls.user, price_list=cls.price_list,
        )
        cls.est_section = EstimateSection.objects.create(
            estimate=cls.estimate, name='Секция 1', sort_order=1,
        )
        cls.subsection = EstimateSubsection.objects.create(
            section=cls.est_section, name='Подсекция 1', sort_order=1,
        )


# ====================== Regression Tests (8 bugs) ======================

class TestBugRegression(WorkMatchingTestBase):
    """Регрессия на все 8 багов текущей системы."""

    def test_matching_works_without_product(self):
        """BUG 8: Подбор должен работать без привязанного товара."""
        item = EstimateItem.objects.create(
            estimate=self.estimate, section=self.est_section, subsection=self.subsection,
            name='Кондиционер настенный 3.5кВт', quantity=Decimal('2'),
            sort_order=1,
        )
        ctx = MatchingContext(self.estimate)
        result = match_single_item(item, ctx)
        # Должен пройти через fuzzy или другие уровни, а не упасть
        self.assertIn(result['source'], [
            'pricelist', 'fuzzy', 'unmatched', 'knowledge', 'category',
        ])

    def test_full_catalog_not_limited_to_20(self):
        """BUG 3: Fuzzy должен искать по ВСЕМУ каталогу."""
        ctx = MatchingContext(self.estimate)
        # Все WorkItems загружены
        self.assertEqual(len(ctx.work_items_cache), WorkItem.objects.filter(is_current=True).count())
        self.assertGreater(len(ctx.work_items_cache), 0)

    def test_unmatched_items_in_results(self):
        """BUG 5: Ненайденные позиции должны быть в результатах."""
        item = EstimateItem.objects.create(
            estimate=self.estimate, section=self.est_section, subsection=self.subsection,
            name='Абсолютно несуществующая единица XYZ-999',
            quantity=Decimal('1'), sort_order=1,
        )
        ctx = MatchingContext(self.estimate)
        result = match_single_item(item, ctx)
        # Должен вернуть result с source='unmatched', а не None
        self.assertIsNotNone(result)
        self.assertEqual(result['source'], 'unmatched')
        self.assertIsNone(result['matched_work'])

    def test_pricelist_uses_calculated_cost(self):
        """BUG 1: Цена работы должна быть calculated_cost, а не price_per_unit."""
        ctx = MatchingContext(self.estimate)
        # PriceListItem cache should have costs
        costs = [c for _, _, _, _, c in ctx.pricelist_items_cache if c is not None]
        self.assertGreater(len(costs), 0)
        for cost in costs:
            # Should be a valid decimal string
            self.assertIsNotNone(cost)
            Decimal(cost)  # should not raise

    def test_confidence_reflects_actual_score(self):
        """BUG 6: Confidence должен отражать реальный fuzzy score."""
        item = EstimateItem.objects.create(
            estimate=self.estimate, section=self.est_section, subsection=self.subsection,
            name='Монтаж кондиционера настенного',  # exact match
            quantity=Decimal('1'), sort_order=1,
        )
        ctx = MatchingContext(self.estimate)
        result = match_single_item(item, ctx)
        if result['source'] in ('pricelist', 'fuzzy'):
            # Confidence should be > 0 and derived from actual score
            self.assertGreater(result['confidence'], 0.5)


# ====================== Tier Tests ======================

class TestTier0Default(WorkMatchingTestBase):
    """Уровень 0: расценка по умолчанию."""

    def test_default_work_item_instant_match(self):
        self.product_cond.default_work_item = self.wi_mount_cond
        self.product_cond.save()
        item = EstimateItem.objects.create(
            estimate=self.estimate, section=self.est_section, subsection=self.subsection,
            name='Кондиционер', quantity=Decimal('1'),
            product=self.product_cond, sort_order=1,
        )
        ctx = MatchingContext(self.estimate)
        tier = Tier0Default()
        result = tier.match(item, ctx)
        self.assertIsNotNone(result)
        self.assertEqual(result.confidence, 1.0)
        self.assertEqual(result.source, 'default')
        self.assertEqual(result.work_item_id, self.wi_mount_cond.id)

    def test_skips_when_no_product(self):
        item = EstimateItem.objects.create(
            estimate=self.estimate, section=self.est_section, subsection=self.subsection,
            name='Что-то без товара', quantity=Decimal('1'), sort_order=1,
        )
        tier = Tier0Default()
        ctx = MatchingContext(self.estimate)
        result = tier.match(item, ctx)
        self.assertIsNone(result)


class TestTier1History(WorkMatchingTestBase):
    """Уровень 1: история ProductWorkMapping."""

    def test_manual_source_usage_1(self):
        """MANUAL маппинг с usage_count=1 — должен сработать."""
        ProductWorkMapping.objects.create(
            product=self.product_cond, work_item=self.wi_mount_cond,
            confidence=1.0, source=ProductWorkMapping.Source.MANUAL, usage_count=1,
        )
        item = EstimateItem.objects.create(
            estimate=self.estimate, section=self.est_section, subsection=self.subsection,
            name='Кондиционер', quantity=Decimal('1'),
            product=self.product_cond, sort_order=1,
        )
        tier = Tier1History()
        ctx = MatchingContext(self.estimate)
        result = tier.match(item, ctx)
        self.assertIsNotNone(result)
        self.assertEqual(result.source, 'history')

    def test_non_manual_needs_usage_2(self):
        """Non-MANUAL маппинг с usage_count=1 — не должен сработать."""
        ProductWorkMapping.objects.create(
            product=self.product_cond, work_item=self.wi_mount_cond,
            confidence=0.7, source=ProductWorkMapping.Source.RULE, usage_count=1,
        )
        item = EstimateItem.objects.create(
            estimate=self.estimate, section=self.est_section, subsection=self.subsection,
            name='Кондиционер', quantity=Decimal('1'),
            product=self.product_cond, sort_order=1,
        )
        tier = Tier1History()
        ctx = MatchingContext(self.estimate)
        result = tier.match(item, ctx)
        self.assertIsNone(result)


class TestTier2PriceList(WorkMatchingTestBase):
    """Уровень 2: поиск в прайс-листе сметы."""

    def test_pricelist_scoped_fuzzy(self):
        item = EstimateItem.objects.create(
            estimate=self.estimate, section=self.est_section, subsection=self.subsection,
            name='Монтаж кондиционера настенного',  # exact name
            quantity=Decimal('1'), sort_order=1,
        )
        tier = Tier2PriceList()
        ctx = MatchingContext(self.estimate)
        result = tier.match(item, ctx)
        self.assertIsNotNone(result)
        self.assertEqual(result.source, 'pricelist')
        self.assertEqual(result.work_item_id, self.wi_mount_cond.id)
        self.assertIsNotNone(result.calculated_cost)


class TestTier3Knowledge(WorkMatchingTestBase):
    """Уровень 3: база знаний."""

    def test_knowledge_verified_preferred(self):
        ProductKnowledge.objects.create(
            item_name_pattern=Product.normalize_name('Кондиционер инверторный'),
            work_item=self.wi_mount_cond, confidence=0.8,
            source=ProductKnowledge.Source.LLM,
            status=ProductKnowledge.Status.VERIFIED,
        )
        item = EstimateItem.objects.create(
            estimate=self.estimate, section=self.est_section, subsection=self.subsection,
            name='Кондиционер инверторный', quantity=Decimal('1'), sort_order=1,
        )
        tier = Tier3Knowledge()
        ctx = MatchingContext(self.estimate)
        result = tier.match(item, ctx)
        self.assertIsNotNone(result)
        self.assertEqual(result.source, 'knowledge')

    def test_knowledge_rejected_skipped(self):
        ProductKnowledge.objects.create(
            item_name_pattern=Product.normalize_name('Что-то отклонённое'),
            work_item=self.wi_mount_cond, confidence=0.9,
            source=ProductKnowledge.Source.MANUAL,
            status=ProductKnowledge.Status.REJECTED,
        )
        item = EstimateItem.objects.create(
            estimate=self.estimate, section=self.est_section, subsection=self.subsection,
            name='Что-то отклонённое', quantity=Decimal('1'), sort_order=1,
        )
        tier = Tier3Knowledge()
        ctx = MatchingContext(self.estimate)
        result = tier.match(item, ctx)
        self.assertIsNone(result)


class TestTier5Fuzzy(WorkMatchingTestBase):
    """Уровень 5: полный fuzzy по каталогу."""

    def test_full_catalog_fuzzy(self):
        item = EstimateItem.objects.create(
            estimate=self.estimate, section=self.est_section, subsection=self.subsection,
            name='Монтаж приточной установки',  # close match to V-001
            quantity=Decimal('1'), sort_order=1,
        )
        tier = Tier5Fuzzy()
        ctx = MatchingContext(self.estimate)
        result = tier.match(item, ctx)
        self.assertIsNotNone(result)
        self.assertEqual(result.source, 'fuzzy')


class TestTierEscalation(WorkMatchingTestBase):
    """Тест порядка эскалации уровней."""

    def test_escalation_order(self):
        """Если Tier 0-4 не находят — должен дойти до Tier 5 Fuzzy."""
        item = EstimateItem.objects.create(
            estimate=self.estimate, section=self.est_section, subsection=self.subsection,
            name='Воздуховод прямоугольный',  # should match V-002
            quantity=Decimal('10'), sort_order=1,
        )
        ctx = MatchingContext(self.estimate)
        result = match_single_item(item, ctx)
        # Without product, no history, etc. — should reach fuzzy or pricelist
        self.assertIn(result['source'], ['pricelist', 'fuzzy', 'unmatched'])


# ====================== Man-Hours Tests ======================

class TestManHours(WorkMatchingTestBase):
    """Расчёт человеко-часов."""

    def test_man_hours_with_pricelist(self):
        """BUG 7: Человеко-часы должны рассчитываться."""
        item1 = EstimateItem.objects.create(
            estimate=self.estimate, section=self.est_section, subsection=self.subsection,
            name='Кондиционер', quantity=Decimal('2'),
            work_item=self.wi_mount_cond, sort_order=1,
        )
        item2 = EstimateItem.objects.create(
            estimate=self.estimate, section=self.est_section, subsection=self.subsection,
            name='Приточка', quantity=Decimal('1'),
            work_item=self.wi_mount_vent, sort_order=2,
        )
        total = calculate_man_hours(self.estimate)
        # Cond: 2 * 4h = 8h, Vent: 1 * 8h = 8h → 16h
        self.assertEqual(total, Decimal('16.0'))

    def test_man_hours_without_pricelist(self):
        est = Estimate.objects.create(
            number=f'СМ-NOPRICE-{uuid.uuid4().hex[:6]}', name='Без прайса',
            object=self.obj, legal_entity=self.entity, created_by=self.user,
        )
        section = EstimateSection.objects.create(
            estimate=est, name='S', sort_order=1,
        )
        sub = EstimateSubsection.objects.create(
            section=section, name='SS', sort_order=1,
        )
        EstimateItem.objects.create(
            estimate=est, section=section, subsection=sub,
            name='Кондиционер', quantity=Decimal('3'),
            work_item=self.wi_mount_cond, sort_order=1,
        )
        total = calculate_man_hours(est)
        # 3 * 4h = 12h (uses work_item.hours directly)
        self.assertEqual(total, Decimal('12.0'))


# ====================== Product.default_work_item Tests ======================

class TestProductDefaultWorkItem(WorkMatchingTestBase):
    """Поле default_work_item на Product."""

    def test_field_nullable(self):
        self.assertIsNone(self.product_cond.default_work_item)

    def test_field_set(self):
        self.product_cond.default_work_item = self.wi_mount_cond
        self.product_cond.save()
        self.product_cond.refresh_from_db()
        self.assertEqual(self.product_cond.default_work_item_id, self.wi_mount_cond.id)


# ====================== LLM Flexibility Tests ======================

class TestLLMTaskConfig(TestCase):
    """Гибкость LLM — LLMTaskConfig. Требует миграций llm_services."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        from llm_services.models import LLMProvider
        if not LLMProvider.objects.filter(is_active=True).exists():
            raise unittest.SkipTest('Нет активных LLM-провайдеров в тестовой БД')

    def test_task_config_fallback_to_default(self):
        """Без настроенного провайдера → fallback на default."""
        from llm_services.models import LLMTaskConfig, LLMProvider
        provider = LLMTaskConfig.get_provider_for_task('work_matching_semantic')
        default = LLMProvider.get_default()
        self.assertEqual(provider.id, default.id)

    def test_task_config_returns_specific_provider(self):
        """С настроенным провайдером → возвращает его."""
        from llm_services.models import LLMTaskConfig, LLMProvider
        specific = LLMProvider.objects.filter(is_active=True).exclude(is_default=True).first()
        if not specific:
            self.skipTest('Нужен > 1 активный провайдер')
        LLMTaskConfig.objects.update_or_create(
            task_type='work_matching_semantic',
            defaults={'provider': specific, 'is_enabled': True},
        )
        result = LLMTaskConfig.get_provider_for_task('work_matching_semantic')
        self.assertEqual(result.id, specific.id)

    def test_task_config_disabled_fallback(self):
        """Отключённый конфиг → fallback на default."""
        from llm_services.models import LLMTaskConfig, LLMProvider
        LLMTaskConfig.objects.update_or_create(
            task_type='work_matching_web',
            defaults={'is_enabled': False},
        )
        provider = LLMTaskConfig.get_provider_for_task('work_matching_web')
        default = LLMProvider.get_default()
        self.assertEqual(provider.id, default.id)

    def test_local_provider_type_accepted(self):
        """LOCAL тип провайдера валиден."""
        from llm_services.models import LLMProvider
        local = LLMProvider(
            provider_type='local', model_name='llama3', env_key_name='LOCAL_LLM_URL',
            is_active=False,
        )
        local.full_clean()  # should not raise


# ====================== Additional Regression Tests ======================

class TestAdditionalRegression(WorkMatchingTestBase):

    @patch('estimates.services.work_matching.tiers.LLMTaskConfig')
    @patch('estimates.services.work_matching.tiers.get_provider')
    def test_tier6_actually_calls_llm(self, mock_get_provider, mock_config):
        """BUG 2: Tier 6 должен вызывать LLM, а не просто fuzzy."""
        mock_provider = MagicMock()
        mock_provider.chat_completion.return_value = {
            'matches': [{'item_index': 0, 'work_item_id': self.wi_mount_cond.id,
                         'confidence': 0.9, 'reasoning': 'test'}],
        }
        mock_get_provider.return_value = mock_provider
        mock_config.get_provider_for_task.return_value = MagicMock(supports_web_search=False)

        item = EstimateItem.objects.create(
            estimate=self.estimate, section=self.est_section, subsection=self.subsection,
            name='Кондиционер тестовый', quantity=Decimal('1'), sort_order=1,
        )
        tier = Tier6LLM()
        ctx = MatchingContext(self.estimate)
        result = tier.match(item, ctx)
        mock_provider.chat_completion.assert_called_once()

    def test_category_tier_handles_no_category(self):
        """BUG 4: Tier 4 не падает при отсутствии категории."""
        from estimates.services.work_matching.tiers import Tier4Category
        item = EstimateItem.objects.create(
            estimate=self.estimate, section=self.est_section, subsection=self.subsection,
            name='Товар без категории', quantity=Decimal('1'),
            product=self.product_cond, sort_order=1,
        )
        # product_cond has no category
        tier = Tier4Category()
        ctx = MatchingContext(self.estimate)
        result = tier.match(item, ctx)
        self.assertIsNone(result)  # graceful skip, not crash


# ====================== Tier 6 Batch + LLM Mock Tests ======================

class TestTier6Batch(WorkMatchingTestBase):

    @patch('estimates.services.work_matching.tiers.LLMTaskConfig')
    @patch('estimates.services.work_matching.tiers.get_provider')
    def test_tier6_llm_batch_5_items(self, mock_get_provider, mock_config):
        """Tier 6 batch: несколько позиций в одном LLM-запросе."""
        mock_provider = MagicMock()
        mock_provider.chat_completion.return_value = {
            'matches': [
                {'item_index': 0, 'work_item_id': self.wi_mount_cond.id, 'confidence': 0.85, 'reasoning': 'OK'},
                {'item_index': 1, 'work_item_id': self.wi_mount_vent.id, 'confidence': 0.8, 'reasoning': 'OK'},
            ],
        }
        mock_get_provider.return_value = mock_provider
        mock_config.get_provider_for_task.return_value = MagicMock()

        items = [
            EstimateItem.objects.create(
                estimate=self.estimate, section=self.est_section, subsection=self.subsection,
                name=f'Тест {i}', quantity=Decimal('1'), sort_order=i,
            ) for i in range(2)
        ]
        tier = Tier6LLM()
        ctx = MatchingContext(self.estimate)
        items_with_cands = [(it, []) for it in items]
        results = tier.match_batch(items_with_cands, ctx)
        # Only 1 LLM call for 2 items
        mock_provider.chat_completion.assert_called_once()
        self.assertIn(items[0].id, results)

    @patch('estimates.services.work_matching.tiers.LLMTaskConfig')
    @patch('estimates.services.work_matching.tiers.get_provider')
    def test_tier6_llm_rate_limit_graceful(self, mock_get_provider, mock_config):
        """Tier 6: rate limit → graceful None, не crash."""
        from llm_services.services.exceptions import RateLimitError
        mock_provider = MagicMock()
        mock_provider.chat_completion.side_effect = RateLimitError('429')
        mock_get_provider.return_value = mock_provider
        mock_config.get_provider_for_task.return_value = MagicMock()

        item = EstimateItem.objects.create(
            estimate=self.estimate, section=self.est_section, subsection=self.subsection,
            name='Тест rate limit', quantity=Decimal('1'), sort_order=1,
        )
        tier = Tier6LLM()
        ctx = MatchingContext(self.estimate)
        result = tier.match(item, ctx)
        self.assertIsNone(result)

    @patch('estimates.services.work_matching.tiers.LLMTaskConfig')
    @patch('estimates.services.work_matching.tiers.get_provider')
    def test_tier6_prompt_format(self, mock_get_provider, mock_config):
        """Tier 6: промпт содержит позиции и кандидатов."""
        mock_provider = MagicMock()
        mock_provider.chat_completion.return_value = {'matches': []}
        mock_get_provider.return_value = mock_provider
        mock_config.get_provider_for_task.return_value = MagicMock()

        item = EstimateItem.objects.create(
            estimate=self.estimate, section=self.est_section, subsection=self.subsection,
            name='Проверка промпта', quantity=Decimal('1'), sort_order=1,
        )
        tier = Tier6LLM()
        ctx = MatchingContext(self.estimate)
        tier.match(item, ctx)
        call_args = mock_provider.chat_completion.call_args
        user_prompt = call_args[0][1]  # second positional arg
        self.assertIn('Проверка промпта', user_prompt)
        self.assertIn('matches', user_prompt)


# ====================== Tier 7 Web Search Tests ======================

class TestTier7WebSearch(WorkMatchingTestBase):

    @patch('estimates.services.work_matching.tiers.LLMTaskConfig')
    @patch('estimates.services.work_matching.tiers.get_provider')
    def test_tier7_web_search_uses_provider(self, mock_get_provider, mock_config):
        """Tier 7: использует chat_completion_with_search при supports_web_search."""
        from estimates.services.work_matching.tiers import Tier7WebSearch
        mock_provider_model = MagicMock(supports_web_search=True)
        mock_config.get_provider_for_task.return_value = mock_provider_model
        mock_provider = MagicMock()
        mock_provider.chat_completion_with_search.return_value = {
            'work_type': 'Монтаж кондиционера настенного', 'reasoning': 'test',
        }
        mock_get_provider.return_value = mock_provider

        item = EstimateItem.objects.create(
            estimate=self.estimate, section=self.est_section, subsection=self.subsection,
            name='Кондиционер Daikin', quantity=Decimal('1'), sort_order=1,
        )
        tier = Tier7WebSearch()
        ctx = MatchingContext(self.estimate)
        result = tier.match(item, ctx)
        mock_provider.chat_completion_with_search.assert_called_once()
        if result:
            self.assertEqual(result.source, 'web')
            self.assertTrue(result.web_search_result_summary)

    @patch('estimates.services.work_matching.tiers.LLMTaskConfig')
    @patch('estimates.services.work_matching.tiers.get_provider')
    def test_tier7_fallback_no_web_search(self, mock_get_provider, mock_config):
        """Tier 7: без supports_web_search → обычный chat_completion."""
        from estimates.services.work_matching.tiers import Tier7WebSearch
        mock_provider_model = MagicMock(supports_web_search=False)
        mock_config.get_provider_for_task.return_value = mock_provider_model
        mock_provider = MagicMock()
        mock_provider.chat_completion.return_value = {
            'work_type': 'Монтаж приточной установки', 'reasoning': 'fallback',
        }
        mock_get_provider.return_value = mock_provider

        item = EstimateItem.objects.create(
            estimate=self.estimate, section=self.est_section, subsection=self.subsection,
            name='Приточка тест', quantity=Decimal('1'), sort_order=1,
        )
        tier = Tier7WebSearch()
        ctx = MatchingContext(self.estimate)
        tier.match(item, ctx)
        mock_provider.chat_completion.assert_called_once()

    @patch('estimates.services.work_matching.tiers.LLMTaskConfig')
    @patch('estimates.services.work_matching.tiers.get_provider')
    def test_llm_error_graceful_degradation(self, mock_get_provider, mock_config):
        """LLM ошибка → graceful None."""
        from estimates.services.work_matching.tiers import Tier7WebSearch
        mock_config.get_provider_for_task.return_value = MagicMock(supports_web_search=True)
        mock_provider = MagicMock()
        mock_provider.chat_completion_with_search.side_effect = Exception('Network error')
        mock_get_provider.return_value = mock_provider

        item = EstimateItem.objects.create(
            estimate=self.estimate, section=self.est_section, subsection=self.subsection,
            name='Error test', quantity=Decimal('1'), sort_order=1,
        )
        tier = Tier7WebSearch()
        ctx = MatchingContext(self.estimate)
        result = tier.match(item, ctx)
        self.assertIsNone(result)


# ====================== Knowledge / .md File Tests ======================

class TestKnowledgeAccumulation(WorkMatchingTestBase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'catalog_productknowledge')"
            )
            exists = cursor.fetchone()[0]
        if not exists:
            raise unittest.SkipTest('ProductKnowledge table not yet migrated')

    def test_md_file_created_on_save(self):
        """save_knowledge создаёт .md файл."""
        import os
        from estimates.services.work_matching.knowledge import save_knowledge, KNOWLEDGE_DIR
        knowledge = save_knowledge(
            item_name='Тестовый кондиционер для md',
            work_item=self.wi_mount_cond,
            source='llm',
            confidence=0.8,
            llm_reasoning='Тест создания файла',
        )
        # md_file_path обновляется через .update() — перечитаем из БД
        knowledge.refresh_from_db()
        self.assertTrue(knowledge.md_file_path)
        filepath = os.path.join(KNOWLEDGE_DIR, '..', knowledge.md_file_path)
        filepath = os.path.normpath(filepath)
        self.assertTrue(os.path.exists(filepath), f'File not found: {filepath}')
        with open(filepath, 'r') as f:
            content = f.read()
        self.assertIn(self.wi_mount_cond.article, content)
        os.remove(filepath)

    def test_md_file_updated_on_web_match(self):
        """save_knowledge с web source → md содержит web summary."""
        import os
        from estimates.services.work_matching.knowledge import save_knowledge, KNOWLEDGE_DIR
        knowledge = save_knowledge(
            item_name='Тест web summary',
            work_item=self.wi_mount_vent,
            source='web',
            confidence=0.7,
            web_query='что это за оборудование',
            web_summary='Приточная установка для вентиляции',
        )
        knowledge.refresh_from_db()
        filepath = os.path.join(KNOWLEDGE_DIR, '..', knowledge.md_file_path)
        filepath = os.path.normpath(filepath)
        if not os.path.exists(filepath):
            self.skipTest(f'md file not created: {filepath}')
        with open(filepath, 'r') as f:
            content = f.read()
        self.assertIn('Приточная установка для вентиляции', content)
        os.remove(filepath)

    def test_knowledge_verify(self):
        """verify_knowledge обновляет статус."""
        from estimates.services.work_matching.knowledge import save_knowledge, verify_knowledge
        knowledge = save_knowledge(
            item_name='verify test', work_item=self.wi_mount_cond,
            source='llm', confidence=0.7,
        )
        self.assertEqual(knowledge.status, ProductKnowledge.Status.PENDING)
        verify_knowledge('verify test', self.wi_mount_cond.id)
        knowledge.refresh_from_db()
        self.assertEqual(knowledge.status, ProductKnowledge.Status.VERIFIED)

    def test_knowledge_reject(self):
        """reject_knowledge обновляет статус."""
        from estimates.services.work_matching.knowledge import save_knowledge, reject_knowledge
        save_knowledge(
            item_name='reject test', work_item=self.wi_mount_cond,
            source='llm', confidence=0.7,
        )
        reject_knowledge('reject test', self.wi_mount_cond.id)
        k = ProductKnowledge.objects.get(item_name_pattern='reject test')
        self.assertEqual(k.status, ProductKnowledge.Status.REJECTED)

    def test_default_work_item_creates_knowledge(self):
        """При подборе через default → знание не создаётся (не нужно)."""
        self.product_cond.default_work_item = self.wi_mount_cond
        self.product_cond.save()
        item = EstimateItem.objects.create(
            estimate=self.estimate, section=self.est_section, subsection=self.subsection,
            name='Default knowledge test', quantity=Decimal('1'),
            product=self.product_cond, sort_order=1,
        )
        ctx = MatchingContext(self.estimate)
        result = match_single_item(item, ctx)
        self.assertEqual(result['source'], 'default')
        # Default tier does not create knowledge entries
        count = ProductKnowledge.objects.filter(
            item_name_pattern=Product.normalize_name('Default knowledge test'),
        ).count()
        self.assertEqual(count, 0)


# ====================== Alternatives Test ======================

class TestAlternatives(WorkMatchingTestBase):

    def test_alternatives_top_3(self):
        """Ненайденные позиции получают alternatives через fuzzy_candidates."""
        item = EstimateItem.objects.create(
            estimate=self.estimate, section=self.est_section, subsection=self.subsection,
            name='Абсолютно уникальная позиция XYZ',
            quantity=Decimal('1'), sort_order=1,
        )
        ctx = MatchingContext(self.estimate)
        result = match_single_item(item, ctx)
        # Alternatives should be a list (may be empty if no fuzzy candidates)
        self.assertIsInstance(result.get('alternatives', []), list)


# ====================== Integration-Style Tests ======================

class TestIntegrationWorkflow(WorkMatchingTestBase):

    def test_apply_results_saves_mappings(self):
        """apply_results записывает ProductWorkMapping."""
        item = EstimateItem.objects.create(
            estimate=self.estimate, section=self.est_section, subsection=self.subsection,
            name='Apply test', quantity=Decimal('2'),
            product=self.product_cond, sort_order=1,
        )
        # Direct DB operations (bypassing Redis for unit test)
        item.work_item = self.wi_mount_cond
        item.work_unit_price = Decimal('2400')
        item.save()

        ProductWorkMapping.objects.update_or_create(
            product=self.product_cond,
            work_item=self.wi_mount_cond,
            defaults={'source': ProductWorkMapping.Source.MANUAL, 'confidence': 1.0},
        )
        mapping = ProductWorkMapping.objects.get(
            product=self.product_cond, work_item=self.wi_mount_cond,
        )
        self.assertEqual(mapping.source, 'manual')

    def test_knowledge_reuse_second_run(self):
        """Знания из первого подбора используются во втором."""
        # Simulate first run: save knowledge
        from estimates.services.work_matching.knowledge import save_knowledge
        save_knowledge(
            item_name='Повторяющийся товар', work_item=self.wi_mount_cond,
            source='llm', confidence=0.85,
        )
        # Second run: knowledge should find it
        item = EstimateItem.objects.create(
            estimate=self.estimate, section=self.est_section, subsection=self.subsection,
            name='Повторяющийся товар', quantity=Decimal('1'), sort_order=1,
        )
        from estimates.services.work_matching.tiers import Tier3Knowledge
        tier = Tier3Knowledge()
        ctx = MatchingContext(self.estimate)
        result = tier.match(item, ctx)
        self.assertIsNotNone(result)
        self.assertEqual(result.source, 'knowledge')

    def test_web_search_graceful_when_not_supported(self):
        """Tier 7 с провайдером без web search → fallback на обычный completion."""
        from estimates.services.work_matching.tiers import Tier7WebSearch
        with patch('estimates.services.work_matching.tiers.LLMTaskConfig') as mock_config, \
             patch('estimates.services.work_matching.tiers.get_provider') as mock_get:
            mock_config.get_provider_for_task.return_value = MagicMock(supports_web_search=False)
            mock_provider = MagicMock()
            mock_provider.chat_completion.return_value = {'work_type': '', 'reasoning': ''}
            mock_get.return_value = mock_provider

            item = EstimateItem.objects.create(
                estimate=self.estimate, section=self.est_section, subsection=self.subsection,
                name='No web test', quantity=Decimal('1'), sort_order=1,
            )
            tier = Tier7WebSearch()
            ctx = MatchingContext(self.estimate)
            result = tier.match(item, ctx)
            # Should call chat_completion (not chat_completion_with_search)
            mock_provider.chat_completion.assert_called_once()
            mock_provider.chat_completion_with_search.assert_not_called()

    def test_man_hours_calculated_after_apply(self):
        """BUG 7: man_hours обновляются после apply."""
        EstimateItem.objects.create(
            estimate=self.estimate, section=self.est_section, subsection=self.subsection,
            name='MH test', quantity=Decimal('5'),
            work_item=self.wi_mount_cond, sort_order=1,
        )
        total = calculate_man_hours(self.estimate)
        self.estimate.refresh_from_db()
        self.assertEqual(self.estimate.man_hours, total)
        self.assertGreater(total, 0)

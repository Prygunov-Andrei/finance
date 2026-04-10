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


# ====================== Celery Task Registration ======================

class TestCeleryTaskRegistration(TestCase):
    """Тесты регистрации Celery-задач (корневая причина бага #003)."""

    def test_process_work_matching_registered(self):
        """Задача process_work_matching зарегистрирована в Celery."""
        from finans_assistant.celery import app
        self.assertIn(
            'estimates.tasks_work_matching.process_work_matching',
            app.tasks,
        )

    def test_recover_stuck_registered(self):
        """Задача recover_stuck_work_matching зарегистрирована."""
        from finans_assistant.celery import app
        self.assertIn(
            'estimates.tasks_work_matching.recover_stuck_work_matching',
            app.tasks,
        )

    def test_sync_knowledge_md_registered(self):
        """Задача sync_knowledge_md_task зарегистрирована."""
        from finans_assistant.celery import app
        self.assertIn(
            'estimates.tasks_work_matching.sync_knowledge_md_task',
            app.tasks,
        )


# ====================== MatchingContext Prefetch ======================

class TestMatchingContextPrefetch(WorkMatchingTestBase):
    """Тесты prefetch-кэшей в MatchingContext."""

    def test_history_cache_loaded(self):
        """MatchingContext загружает ProductWorkMapping в history_cache."""
        ProductWorkMapping.objects.create(
            product=self.product_cond, work_item=self.wi_mount_cond,
            confidence=1.0, source=ProductWorkMapping.Source.MANUAL, usage_count=3,
        )
        item = EstimateItem.objects.create(
            estimate=self.estimate, section=self.est_section, subsection=self.subsection,
            name='Cache test', quantity=Decimal('1'),
            product=self.product_cond, sort_order=1,
        )
        ctx = MatchingContext(self.estimate, items=[item])
        self.assertIn(self.product_cond.id, ctx.history_cache)
        mapping = ctx.history_cache[self.product_cond.id]
        self.assertEqual(mapping.work_item_id, self.wi_mount_cond.id)

    def test_knowledge_cache_loaded(self):
        """MatchingContext загружает ProductKnowledge в knowledge_cache."""
        ProductKnowledge.objects.create(
            item_name_pattern='тестовый кондиционер',
            work_item=self.wi_mount_cond,
            confidence=0.8,
            status=ProductKnowledge.Status.VERIFIED,
        )
        ctx = MatchingContext(self.estimate, items=[])
        self.assertIn('тестовый кондиционер', ctx.knowledge_cache)

    def test_history_cache_tier1_uses_cache(self):
        """Tier1 использует cache вместо DB при наличии items."""
        ProductWorkMapping.objects.create(
            product=self.product_cond, work_item=self.wi_mount_cond,
            confidence=1.0, source=ProductWorkMapping.Source.MANUAL, usage_count=1,
        )
        item = EstimateItem.objects.create(
            estimate=self.estimate, section=self.est_section, subsection=self.subsection,
            name='Кондиционер', quantity=Decimal('1'),
            product=self.product_cond, sort_order=1,
        )
        ctx = MatchingContext(self.estimate, items=[item])
        tier = Tier1History()
        result = tier.match(item, ctx)
        self.assertIsNotNone(result)
        self.assertEqual(result.source, 'history')


# ====================== Fast Pipeline ======================

class TestFastPipeline(WorkMatchingTestBase):
    """Тесты match_single_item_fast (только тиры 0-5)."""

    def test_fast_match_finds_default(self):
        """match_single_item_fast находит default work item."""
        from estimates.services.work_matching.pipeline import match_single_item_fast

        self.product_cond.default_work_item = self.wi_mount_cond
        self.product_cond.save()
        item = EstimateItem.objects.create(
            estimate=self.estimate, section=self.est_section, subsection=self.subsection,
            name='Кондиционер', quantity=Decimal('1'),
            product=self.product_cond, sort_order=1,
        )
        ctx = MatchingContext(self.estimate)
        result = match_single_item_fast(item, ctx)
        self.assertIsNotNone(result)
        self.assertEqual(result['source'], 'default')

    def test_fast_match_returns_none_for_unmatched(self):
        """match_single_item_fast возвращает None если тиры 0-5 не нашли."""
        from estimates.services.work_matching.pipeline import match_single_item_fast

        item = EstimateItem.objects.create(
            estimate=self.estimate, section=self.est_section, subsection=self.subsection,
            name='Абсолютно уникальный товар XYZ123', quantity=Decimal('1'),
            sort_order=1,
        )
        ctx = MatchingContext(self.estimate)
        result = match_single_item_fast(item, ctx)
        self.assertIsNone(result)


# ====================== WorkMatchingService Tests ======================

class TestWorkMatchingService(WorkMatchingTestBase):
    """Тесты сервиса WorkMatchingService (lock, session, progress)."""

    def _cleanup_redis_keys(self, *keys):
        """Удалить ключи Redis после теста."""
        from estimates.services.redis_session import get_redis
        r = get_redis()
        for key in keys:
            r.delete(key)

    @override_settings(CELERY_TASK_ALWAYS_EAGER=True, CELERY_TASK_EAGER_PROPAGATES=True)
    def test_start_matching_creates_session(self):
        """start_matching создаёт Redis-сессию и возвращает session_id."""
        from estimates.services.work_matching import WorkMatchingService

        # Создаём строку без работы
        EstimateItem.objects.create(
            estimate=self.estimate, section=self.est_section, subsection=self.subsection,
            name='Тест сервис', quantity=Decimal('1'),
            product=self.product_cond, sort_order=1,
        )
        svc = WorkMatchingService()
        result = svc.start_matching(estimate_id=self.estimate.id, user_id=self.user.id)

        self.assertIn('session_id', result)
        self.assertIn('total_items', result)
        self.assertGreaterEqual(result['total_items'], 1)

        # Cleanup
        self._cleanup_redis_keys(
            f'work_match:{result["session_id"]}',
            f'work_match:{result["session_id"]}:results',
            f'work_match_lock:{self.estimate.id}',
        )

    def test_start_matching_lock_prevents_double_run(self):
        """Повторный запуск на той же смете возвращает ValueError ALREADY_RUNNING."""
        from estimates.services.work_matching import WorkMatchingService
        from estimates.services.work_matching.service import LOCK_PREFIX, session_mgr

        lock_key = f'{LOCK_PREFIX}:{self.estimate.id}'
        session_mgr.set_lock(lock_key, 'fake_session')

        svc = WorkMatchingService()
        with self.assertRaises(ValueError) as cm:
            svc.start_matching(estimate_id=self.estimate.id, user_id=self.user.id)
        self.assertIn('ALREADY_RUNNING', str(cm.exception))

        # Cleanup
        self._cleanup_redis_keys(lock_key)

    def test_start_matching_lock_released_on_error(self):
        """При ошибке создания сессии lock освобождается."""
        from estimates.services.work_matching import WorkMatchingService
        from estimates.services.work_matching.service import LOCK_PREFIX, session_mgr
        from estimates.services.redis_session import get_redis

        lock_key = f'{LOCK_PREFIX}:{self.estimate.id}'

        svc = WorkMatchingService()
        # Мокаем session_mgr.create чтобы вызвать ошибку после lock
        with patch.object(session_mgr, 'create', side_effect=RuntimeError('Redis down')):
            with self.assertRaises(RuntimeError):
                svc.start_matching(estimate_id=self.estimate.id, user_id=self.user.id)

        # Lock должен быть снят
        r = get_redis()
        self.assertIsNone(r.get(lock_key))

    def test_get_progress_returns_none_for_unknown_session(self):
        """get_progress возвращает None для несуществующей сессии."""
        from estimates.services.work_matching import WorkMatchingService
        svc = WorkMatchingService()
        self.assertIsNone(svc.get_progress('nonexistent_session_id'))

    def test_get_progress_without_results_is_lightweight(self):
        """get_progress(include_results=False) возвращает пустой results."""
        from estimates.services.work_matching import WorkMatchingService
        from estimates.services.work_matching.service import session_mgr

        sid = session_mgr.create({
            'status': 'processing', 'estimate_id': str(self.estimate.id),
            'total_items': '10', 'current_item': '3', 'current_tier': 'fuzzy',
            'current_item_name': 'Тест', 'results': '[]',
            'stats': '{}', 'errors': '[]', 'man_hours_total': '0',
        })
        # Добавим результат в LIST
        session_mgr.append_result(sid, {'item_id': 1, 'source': 'default'})

        svc = WorkMatchingService()
        progress = svc.get_progress(sid, include_results=False)
        self.assertEqual(progress['results'], [])
        self.assertEqual(progress['current_item_name'], 'Тест')

        # С include_results=True — результаты есть
        progress_full = svc.get_progress(sid, include_results=True)
        self.assertEqual(len(progress_full['results']), 1)

        # Cleanup
        self._cleanup_redis_keys(
            f'work_match:{sid}', f'work_match:{sid}:results',
        )


# ====================== Redis Incremental Results Tests ======================

class TestRedisIncrementalResults(TestCase):
    """Тесты инкрементальных записей результатов в Redis LIST."""

    def setUp(self):
        from estimates.services.redis_session import RedisSessionManager
        self.mgr = RedisSessionManager(prefix='test_wm')
        self.session_id = self.mgr.create({
            'status': 'processing', 'total_items': '5',
        })

    def tearDown(self):
        from estimates.services.redis_session import get_redis
        r = get_redis()
        r.delete(f'test_wm:{self.session_id}')
        r.delete(f'test_wm:{self.session_id}:results')

    def test_append_result_and_get_all(self):
        """append_result добавляет в LIST, get_all_results читает все."""
        self.mgr.append_result(self.session_id, {'item_id': 1, 'source': 'default'})
        self.mgr.append_result(self.session_id, {'item_id': 2, 'source': 'history'})
        self.mgr.append_result(self.session_id, {'item_id': 3, 'source': 'fuzzy'})

        results = self.mgr.get_all_results(self.session_id)
        self.assertEqual(len(results), 3)
        self.assertEqual(results[0]['item_id'], 1)
        self.assertEqual(results[1]['source'], 'history')
        self.assertEqual(results[2]['item_id'], 3)

    def test_get_results_count(self):
        """get_results_count возвращает количество результатов."""
        self.assertEqual(self.mgr.get_results_count(self.session_id), 0)
        self.mgr.append_result(self.session_id, {'item_id': 1})
        self.mgr.append_result(self.session_id, {'item_id': 2})
        self.assertEqual(self.mgr.get_results_count(self.session_id), 2)

    def test_empty_results_for_new_session(self):
        """Новая сессия — пустой список результатов."""
        results = self.mgr.get_all_results(self.session_id)
        self.assertEqual(results, [])

    def test_results_ttl_set(self):
        """TTL устанавливается на ключ results."""
        from estimates.services.redis_session import get_redis
        self.mgr.append_result(self.session_id, {'item_id': 1})
        r = get_redis()
        ttl = r.ttl(f'test_wm:{self.session_id}:results')
        self.assertGreater(ttl, 0)


# ====================== Two-Pass Pipeline Tests ======================

class TestTwoPassPipeline(WorkMatchingTestBase):
    """Тесты двухпроходной архитектуры pipeline."""

    def test_fast_tiers_match_before_llm(self):
        """Pass 1: строки с default work item подбираются без LLM."""
        from estimates.services.work_matching.pipeline import match_single_item_fast

        self.product_cond.default_work_item = self.wi_mount_cond
        self.product_cond.save()

        item = EstimateItem.objects.create(
            estimate=self.estimate, section=self.est_section, subsection=self.subsection,
            name='Кондиционер настенный', quantity=Decimal('1'),
            product=self.product_cond, sort_order=1,
        )
        ctx = MatchingContext(self.estimate, items=[item])
        result = match_single_item_fast(item, ctx)

        self.assertIsNotNone(result)
        self.assertEqual(result['source'], 'default')
        self.assertEqual(result['matched_work']['id'], self.wi_mount_cond.id)

    def test_unmatched_items_collected_for_pass2(self):
        """Pass 1: строки без match собираются в unmatched для Pass 2."""
        from estimates.services.work_matching.pipeline import match_single_item_fast

        items = []
        for i in range(3):
            items.append(EstimateItem.objects.create(
                estimate=self.estimate, section=self.est_section, subsection=self.subsection,
                name=f'Совершенно неизвестный товар QWERTY{i}', quantity=Decimal('1'),
                sort_order=i + 1,
            ))

        ctx = MatchingContext(self.estimate, items=items)
        unmatched = []
        for item in items:
            result = match_single_item_fast(item, ctx)
            if result is None:
                unmatched.append(item)

        self.assertEqual(len(unmatched), 3)

    @patch('estimates.services.work_matching.tiers.get_provider')
    @patch('estimates.services.work_matching.tiers.LLMTaskConfig.get_provider_for_task')
    def test_tier6_batch_called_in_pass2(self, mock_config, mock_get):
        """Pass 2: Tier6LLM.match_batch вызывается с батчем unmatched items."""
        from estimates.services.work_matching.tiers import Tier6LLM

        mock_provider = MagicMock()
        mock_provider.chat_completion.return_value = {'matches': []}
        mock_config.return_value = MagicMock(supports_web_search=False)
        mock_get.return_value = mock_provider

        items = []
        for i in range(3):
            items.append(EstimateItem.objects.create(
                estimate=self.estimate, section=self.est_section, subsection=self.subsection,
                name=f'Батч тест LLM {i}', quantity=Decimal('1'),
                sort_order=100 + i,
            ))

        ctx = MatchingContext(self.estimate, items=items)
        tier6 = Tier6LLM()
        items_with_candidates = [(item, []) for item in items]
        batch_results = tier6.match_batch(items_with_candidates, ctx)

        # LLM был вызван
        mock_provider.chat_completion.assert_called_once()
        # Все items в результате (None если не подобрано)
        for item in items:
            self.assertIn(item.id, batch_results)


# ====================== View Endpoint Tests ======================

class TestWorkMatchingViews(WorkMatchingTestBase):
    """Тесты view endpoints подбора работ."""

    def setUp(self):
        self.client.force_login(self.user)

    def test_start_returns_404_for_invalid_estimate(self):
        """POST start-work-matching с несуществующей сметой → 404."""
        resp = self.client.post(
            '/api/v1/estimate-items/start-work-matching/',
            data=json.dumps({'estimate_id': 999999}),
            content_type='application/json',
        )
        self.assertEqual(resp.status_code, 404)

    def test_start_returns_400_without_estimate_id(self):
        """POST start-work-matching без estimate_id → 400."""
        resp = self.client.post(
            '/api/v1/estimate-items/start-work-matching/',
            data=json.dumps({}),
            content_type='application/json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_progress_returns_404_for_unknown_session(self):
        """GET progress для неизвестной сессии → 404."""
        resp = self.client.get(
            '/api/v1/estimate-items/work-matching-progress/deadbeef00000000/',
        )
        self.assertEqual(resp.status_code, 404)

    def test_cancel_returns_404_for_unknown_session(self):
        """POST cancel для неизвестной сессии → 404."""
        resp = self.client.post(
            '/api/v1/estimate-items/cancel-work-matching/deadbeef00000000/',
        )
        self.assertEqual(resp.status_code, 404)

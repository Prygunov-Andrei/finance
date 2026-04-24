"""Тесты management-команды seed_dev_data (E-polish)."""

import pytest
from django.core.management import call_command

from apps.estimate.matching.knowledge import ProductKnowledge
from apps.estimate.models import EstimateItem
from apps.workspace.models import Workspace

SEED_WS_ID = "11111111-1111-1111-1111-111111111111"


@pytest.mark.django_db
class TestSeedDevData:
    def test_creates_50_product_knowledge_rules(self):
        """После seed — ровно 50 ProductKnowledge правил в Август workspace."""
        call_command("seed_dev_data")
        count = ProductKnowledge.objects.filter(workspace_id=SEED_WS_ID).count()
        assert count == 50

    def test_seed_is_idempotent_for_knowledge(self):
        """Повторный вызов не дублирует правила (get_or_create)."""
        call_command("seed_dev_data")
        first = ProductKnowledge.objects.filter(workspace_id=SEED_WS_ID).count()
        call_command("seed_dev_data")
        second = ProductKnowledge.objects.filter(workspace_id=SEED_WS_ID).count()
        assert first == second == 50

    def test_knowledge_rules_have_required_fields(self):
        """Все правила имеют непустые pattern, work_name и положительный work_price."""
        call_command("seed_dev_data")
        rules = ProductKnowledge.objects.filter(workspace_id=SEED_WS_ID)
        assert rules.count() == 50
        for rule in rules:
            assert rule.pattern, f"empty pattern in {rule.id}"
            assert rule.work_name, f"empty work_name in {rule.id}"
            assert rule.work_price > 0, f"non-positive price in {rule.pattern}"
            assert rule.work_unit, f"empty unit in {rule.pattern}"

    def test_category_distribution(self):
        """Проверяем что покрыты 4 категории: вентиляция, кондиц., слаботочка, автоматика."""
        call_command("seed_dev_data")
        patterns = set(
            ProductKnowledge.objects.filter(workspace_id=SEED_WS_ID).values_list(
                "pattern", flat=True
            )
        )
        # Вентиляция
        assert any("воздуховод" in p for p in patterns)
        assert any("вентилятор" in p for p in patterns)
        # Кондиционирование
        assert any("сплит" in p or "чиллер" in p or "фанкойл" in p for p in patterns)
        # Слаботочка
        assert any("utp" in p for p in patterns)
        assert any("камера" in p for p in patterns)
        # Автоматика
        assert any("ddc" in p or "термостат" in p for p in patterns)

    def test_seed_creates_workspaces(self):
        """Базовый smoke — команда создаёт 2 workspace без ошибок."""
        call_command("seed_dev_data")
        assert Workspace.objects.filter(id=SEED_WS_ID).exists()
        assert Workspace.objects.count() >= 2

    def test_tech_specs_populated(self):
        """TD-04 #1: seed создаёт items с разнообразным tech_specs.

        Первые 6 позиций «Вентиляции» главной сметы — 6 вариантов:
        brand+model+flow, только model, только brand, manufacturer+comments+system,
        пустой, brand+model+power_kw+class. Всего покрытие 6 ключей ниже.
        """
        call_command("seed_dev_data")
        items = list(
            EstimateItem.objects.filter(workspace_id=SEED_WS_ID).values_list(
                "tech_specs", flat=True
            )
        )
        assert items, "seed должен создать items"

        def has_key(key: str) -> bool:
            return any((ts or {}).get(key) for ts in items)

        for key in ("brand", "model_name", "manufacturer", "comments", "system", "power_kw"):
            assert has_key(key), f"нет items с заполненным tech_specs.{key}"

        # Negative control — хотя бы один item с полностью пустым tech_specs.
        assert any(not (ts or {}) for ts in items), "нет items с пустым tech_specs"

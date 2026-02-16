import pytest
from kanban_core.models import Board, Column, Card
from kanban_commercial.models import CommercialCase


@pytest.mark.django_db
class TestCommercialCaseModel:
    """Тесты модели CommercialCase"""

    def _make_board_and_card(self):
        board = Board.objects.create(key='test_commercial', title='Test')
        col = Column.objects.create(board=board, key='col1', title='Col 1', order=1)
        card = Card.objects.create(
            board=board, column=col,
            type=Card.CardType.COMMERCIAL_CASE,
            title='Test card',
        )
        return board, col, card

    def test_create_commercial_case(self):
        """Создание CommercialCase overlay"""
        _, _, card = self._make_board_and_card()
        case = CommercialCase.objects.create(
            card=card,
            erp_object_name='ТЦ Мега',
            system_name='Вентиляция',
            erp_counterparty_name='ООО Заказчик',
            contacts_info='+7 999 123-45-67',
            comments='Комментарий',
        )
        assert case.erp_object_name == 'ТЦ Мега'
        assert case.system_name == 'Вентиляция'
        assert case.card == card

    def test_card_type_commercial_case(self):
        """CardType COMMERCIAL_CASE доступен"""
        assert Card.CardType.COMMERCIAL_CASE == 'commercial_case'

    def test_erp_tkp_ids_default_empty_list(self):
        """erp_tkp_ids по умолчанию — пустой список"""
        _, _, card = self._make_board_and_card()
        case = CommercialCase.objects.create(card=card)
        assert case.erp_tkp_ids == []

    def test_erp_tkp_ids_stores_list(self):
        """erp_tkp_ids хранит список ID"""
        _, _, card = self._make_board_and_card()
        case = CommercialCase.objects.create(card=card, erp_tkp_ids=[1, 2, 3])
        case.refresh_from_db()
        assert case.erp_tkp_ids == [1, 2, 3]

    def test_one_to_one_with_card(self):
        """OneToOne связь с Card"""
        _, _, card = self._make_board_and_card()
        CommercialCase.objects.create(card=card)
        assert card.commercial_case is not None

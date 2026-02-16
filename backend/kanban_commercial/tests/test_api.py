import pytest
from rest_framework.test import APIClient
from kanban_core.models import Board, Column, Card
from kanban_commercial.models import CommercialCase


@pytest.fixture
def board_with_columns(db):
    board = Board.objects.create(key='commercial_pipeline', title='Коммерческий пайплайн')
    cols = []
    for i, (key, title) in enumerate([
        ('new_clients', 'Новые клиенты'),
        ('new_calculation', 'Новый расчет'),
        ('kp_prepared', 'Подготовлено КП'),
    ], start=1):
        cols.append(Column.objects.create(board=board, key=key, title=title, order=i))
    return board, cols


@pytest.fixture
def auth_client(db):
    from django.contrib.auth.models import User
    user = User.objects.create_user(username='test', password='test')
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.mark.django_db
class TestCommercialCaseAPI:
    """Тесты API CommercialCase"""

    def test_create_case(self, auth_client, board_with_columns):
        board, cols = board_with_columns
        card = Card.objects.create(
            board=board, column=cols[0],
            type='commercial_case', title='Тест',
        )
        data = {
            'card': str(card.id),
            'erp_object_name': 'ТЦ Мега',
            'system_name': 'Вентиляция',
            'erp_counterparty_name': 'ООО Клиент',
            'contacts_info': '+7 999 000-00-00',
        }
        resp = auth_client.post('/kanban-api/v1/commercial/cases/', data, format='json')
        assert resp.status_code == 201
        assert resp.data['erp_object_name'] == 'ТЦ Мега'

    def test_list_cases(self, auth_client, board_with_columns):
        board, cols = board_with_columns
        card = Card.objects.create(
            board=board, column=cols[0],
            type='commercial_case', title='Тест',
        )
        CommercialCase.objects.create(card=card, erp_object_name='Объект 1')
        resp = auth_client.get('/kanban-api/v1/commercial/cases/')
        assert resp.status_code == 200
        assert len(resp.data) == 1

    def test_update_case(self, auth_client, board_with_columns):
        board, cols = board_with_columns
        card = Card.objects.create(
            board=board, column=cols[0],
            type='commercial_case', title='Тест',
        )
        case = CommercialCase.objects.create(card=card, erp_object_name='Было')
        resp = auth_client.patch(
            f'/kanban-api/v1/commercial/cases/{case.id}/',
            {'erp_object_name': 'Стало'},
            format='json',
        )
        assert resp.status_code == 200
        assert resp.data['erp_object_name'] == 'Стало'

    def test_delete_case(self, auth_client, board_with_columns):
        board, cols = board_with_columns
        card = Card.objects.create(
            board=board, column=cols[0],
            type='commercial_case', title='Тест',
        )
        case = CommercialCase.objects.create(card=card)
        resp = auth_client.delete(f'/kanban-api/v1/commercial/cases/{case.id}/')
        assert resp.status_code == 204
        assert CommercialCase.objects.count() == 0

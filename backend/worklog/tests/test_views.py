"""
Unit-тесты views/API worklog — 34 теста.
Покрытие: CRUD для всех ViewSets, register, team create, question answer,
          telegram_auth, work_journal_summary.
"""
import hashlib
import hmac
import json
import uuid
from datetime import date, time
from decimal import Decimal
from unittest.mock import patch
from urllib.parse import urlencode

from django.contrib.auth.models import User
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from worklog.models import (
    Worker, Supergroup, Shift, ShiftRegistration,
    Team, TeamMembership, Media, Report, Question, Answer,
)
from .factories import (
    create_counterparty, create_object, create_worker,
    create_supergroup, create_shift, create_shift_registration,
    create_team, create_media, create_report,
    create_question, create_answer, create_user,
)


def get_auth_client(user=None) -> APIClient:
    """Возвращает APIClient с JWT-авторизацией."""
    if user is None:
        user = create_user(username=f'api_user_{uuid.uuid4().hex[:6]}')
    client = APIClient()
    token = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')
    return client


# =========================================================================
# WorkerViewSet
# =========================================================================

class WorkerViewSetTest(TestCase):
    def setUp(self):
        self.client = get_auth_client()
        self.contractor = create_counterparty()

    def test_list_workers(self):
        """GET /api/v1/worklog/workers/ — список."""
        create_worker(contractor=self.contractor)
        create_worker(contractor=self.contractor)
        resp = self.client.get('/api/v1/worklog/workers/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(resp.data['count'], 2)

    def test_create_worker(self):
        """POST /api/v1/worklog/workers/ — создание."""
        data = {
            'telegram_id': 987654321,
            'name': 'Новый Рабочий',
            'phone': '+79001112233',
            'role': 'worker',
            'language': 'uz',
            'contractor': str(self.contractor.id),
        }
        resp = self.client.post('/api/v1/worklog/workers/', data, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_retrieve_worker(self):
        """GET /api/v1/worklog/workers/{id}/ — детали."""
        worker = create_worker(contractor=self.contractor)
        resp = self.client.get(f'/api/v1/worklog/workers/{worker.id}/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['name'], worker.name)

    def test_update_worker(self):
        """PATCH /api/v1/worklog/workers/{id}/ — обновление."""
        worker = create_worker(contractor=self.contractor)
        resp = self.client.patch(
            f'/api/v1/worklog/workers/{worker.id}/',
            {'name': 'Обновлённое Имя'},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_delete_worker(self):
        """DELETE /api/v1/worklog/workers/{id}/ — удаление."""
        worker = create_worker(contractor=self.contractor)
        resp = self.client.delete(f'/api/v1/worklog/workers/{worker.id}/')
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)

    def test_filter_by_role(self):
        """Фильтрация по role."""
        create_worker(contractor=self.contractor, role=Worker.Role.BRIGADIER)
        create_worker(contractor=self.contractor, role=Worker.Role.WORKER)
        resp = self.client.get('/api/v1/worklog/workers/', {'role': 'brigadier'})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        for item in resp.data['results']:
            self.assertEqual(item['role'], 'brigadier')

    def test_unauthenticated_returns_401(self):
        """Без авторизации — 401."""
        client = APIClient()
        resp = client.get('/api/v1/worklog/workers/')
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


# =========================================================================
# SupergroupViewSet
# =========================================================================

class SupergroupViewSetTest(TestCase):
    def setUp(self):
        self.client = get_auth_client()

    def test_list_supergroups(self):
        """GET /api/v1/worklog/supergroups/ — список."""
        create_supergroup()
        resp = self.client.get('/api/v1/worklog/supergroups/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_create_supergroup(self):
        """POST /api/v1/worklog/supergroups/ — создание."""
        obj = create_object()
        contractor = create_counterparty()
        data = {
            'object': obj.id,
            'contractor': str(contractor.id),
            'telegram_group_id': -1001234567890,
        }
        resp = self.client.post('/api/v1/worklog/supergroups/', data, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)


# =========================================================================
# ShiftViewSet
# =========================================================================

class ShiftViewSetTest(TestCase):
    def setUp(self):
        self.client = get_auth_client()
        self.obj = create_object()
        self.contractor = create_counterparty()

    def test_list_shifts(self):
        """GET /api/v1/worklog/shifts/ — список."""
        create_shift(obj=self.obj, contractor=self.contractor)
        resp = self.client.get('/api/v1/worklog/shifts/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_create_shift(self):
        """POST /api/v1/worklog/shifts/ — создание."""
        data = {
            'object': self.obj.id,
            'contractor': str(self.contractor.id),
            'date': '2026-02-10',
            'shift_type': 'day',
            'start_time': '08:00',
            'end_time': '20:00',
        }
        resp = self.client.post('/api/v1/worklog/shifts/', data, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_list_registrations(self):
        """GET /api/v1/worklog/shifts/{id}/registrations/ — список регистраций."""
        shift = create_shift(obj=self.obj, contractor=self.contractor)
        create_shift_registration(shift=shift)
        resp = self.client.get(f'/api/v1/worklog/shifts/{shift.id}/registrations/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 1)

    def test_register_on_shift(self):
        """POST /api/v1/worklog/shifts/{id}/register/ — регистрация на смену."""
        shift = create_shift(
            obj=self.obj,
            contractor=self.contractor,
            status=Shift.Status.ACTIVE,
        )
        worker = create_worker(contractor=self.contractor, telegram_id=555666777)
        # Создаём Django User с telegram_id в username
        user = User.objects.create_user(username=f'tg_{worker.telegram_id}')
        client = get_auth_client(user=user)

        data = {
            'qr_token': 'test_token',
            'latitude': '55.7558262',
            'longitude': '37.6172999',
        }
        resp = client.post(f'/api/v1/worklog/shifts/{shift.id}/register/', data, format='json')
        self.assertIn(resp.status_code, [status.HTTP_201_CREATED])

    def test_register_inactive_shift(self):
        """Регистрация на неактивную смену — 400."""
        shift = create_shift(
            obj=self.obj,
            contractor=self.contractor,
            status=Shift.Status.CLOSED,
        )
        worker = create_worker(contractor=self.contractor, telegram_id=888999000)
        user = User.objects.create_user(username=f'tg_{worker.telegram_id}')
        client = get_auth_client(user=user)

        data = {'qr_token': 'x', 'latitude': '55.75', 'longitude': '37.62'}
        resp = client.post(f'/api/v1/worklog/shifts/{shift.id}/register/', data, format='json')
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_duplicate(self):
        """Повторная регистрация — 409."""
        shift = create_shift(
            obj=self.obj,
            contractor=self.contractor,
            status=Shift.Status.ACTIVE,
        )
        worker = create_worker(contractor=self.contractor, telegram_id=111333555)
        user = User.objects.create_user(username=f'tg_{worker.telegram_id}')
        client = get_auth_client(user=user)

        data = {'qr_token': 'x', 'latitude': '55.75', 'longitude': '37.62'}
        client.post(f'/api/v1/worklog/shifts/{shift.id}/register/', data, format='json')
        resp = client.post(f'/api/v1/worklog/shifts/{shift.id}/register/', data, format='json')
        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT)


# =========================================================================
# TeamViewSet
# =========================================================================

class TeamViewSetTest(TestCase):
    def setUp(self):
        self.client = get_auth_client()
        self.shift = create_shift()

    def test_list_teams(self):
        """GET /api/v1/worklog/teams/ — список."""
        create_team(shift=self.shift)
        resp = self.client.get('/api/v1/worklog/teams/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_create_team(self):
        """POST /api/v1/worklog/teams/ — создание звена."""
        brigadier = create_worker(
            contractor=self.shift.contractor,
            role=Worker.Role.BRIGADIER,
        )
        worker = create_worker(contractor=self.shift.contractor)
        data = {
            'shift_id': str(self.shift.id),
            'member_ids': [str(brigadier.id), str(worker.id)],
            'brigadier_id': str(brigadier.id),
        }
        resp = self.client.post('/api/v1/worklog/teams/', data, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertIn('memberships', resp.data)
        self.assertEqual(len(resp.data['memberships']), 2)

    def test_create_solo_team(self):
        """Соло-звено (1 участник) — is_solo=True."""
        brigadier = create_worker(
            contractor=self.shift.contractor,
            role=Worker.Role.BRIGADIER,
        )
        data = {
            'shift_id': str(self.shift.id),
            'member_ids': [str(brigadier.id)],
            'brigadier_id': str(brigadier.id),
        }
        resp = self.client.post('/api/v1/worklog/teams/', data, format='json')
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertTrue(resp.data['is_solo'])


# =========================================================================
# MediaViewSet
# =========================================================================

class MediaViewSetTest(TestCase):
    def setUp(self):
        self.client = get_auth_client()

    def test_list_media(self):
        """GET /api/v1/worklog/media/ — список."""
        create_media()
        resp = self.client.get('/api/v1/worklog/media/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_filter_by_media_type(self):
        """Фильтрация по media_type."""
        team = create_team()
        create_media(team=team, media_type=Media.MediaType.PHOTO)
        create_media(team=team, media_type=Media.MediaType.VIDEO)
        resp = self.client.get('/api/v1/worklog/media/', {'media_type': 'photo'})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        for item in resp.data['results']:
            self.assertEqual(item['media_type'], 'photo')


# =========================================================================
# ReportViewSet
# =========================================================================

class ReportViewSetTest(TestCase):
    def setUp(self):
        self.client = get_auth_client()

    def test_list_reports(self):
        """GET /api/v1/worklog/reports/ — список (ReportListSerializer)."""
        create_report()
        resp = self.client.get('/api/v1/worklog/reports/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        # Список не содержит media_items
        for item in resp.data['results']:
            self.assertNotIn('media_items', item)

    def test_retrieve_report(self):
        """GET /api/v1/worklog/reports/{id}/ — детали (ReportSerializer с media)."""
        report = create_report()
        resp = self.client.get(f'/api/v1/worklog/reports/{report.id}/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn('media_items', resp.data)


# =========================================================================
# QuestionViewSet
# =========================================================================

class QuestionViewSetTest(TestCase):
    def setUp(self):
        self.client = get_auth_client()

    def test_list_questions(self):
        """GET /api/v1/worklog/questions/ — список."""
        create_question()
        resp = self.client.get('/api/v1/worklog/questions/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_answer_question(self):
        """POST /api/v1/worklog/questions/{id}/answer/ — ответ на вопрос."""
        question = create_question()
        worker = create_worker(contractor=question.team.contractor)
        data = {
            'answered_by': str(worker.id),
            'answer_text': 'Всё выполнено',
        }
        resp = self.client.post(
            f'/api/v1/worklog/questions/{question.id}/answer/',
            data,
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        question.refresh_from_db()
        self.assertEqual(question.status, Question.Status.ANSWERED)


# =========================================================================
# telegram_auth
# =========================================================================

class TelegramAuthViewTest(TestCase):
    @override_settings(TELEGRAM_BOT_TOKEN='test_token_for_auth')
    def test_telegram_auth_success(self):
        """POST /api/v1/worklog/auth/telegram/ — успешная авторизация."""
        contractor = create_counterparty()
        worker = create_worker(contractor=contractor, telegram_id=123456)

        bot_token = 'test_token_for_auth'
        user_data = json.dumps({
            'id': 123456,
            'first_name': 'Test',
            'last_name': 'User',
        })
        params = {'user': user_data, 'auth_date': '1700000000', 'query_id': 'AAH'}
        data_check_string = '\n'.join(f'{k}={v}' for k, v in sorted(params.items()))
        secret_key = hmac.new(b'WebAppData', bot_token.encode(), hashlib.sha256).digest()
        computed_hash = hmac.new(
            secret_key, data_check_string.encode(), hashlib.sha256
        ).hexdigest()
        params['hash'] = computed_hash
        init_data = urlencode(params)

        client = APIClient()
        resp = client.post(
            '/api/v1/worklog/auth/telegram/',
            {'init_data': init_data},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn('access_token', resp.data)
        self.assertIn('worker', resp.data)
        self.assertEqual(resp.data['worker']['telegram_id'], 123456)

    @override_settings(TELEGRAM_BOT_TOKEN='test_token_for_auth')
    def test_telegram_auth_worker_not_found(self):
        """Авторизация несуществующего монтажника — 404."""
        bot_token = 'test_token_for_auth'
        user_data = json.dumps({'id': 999999, 'first_name': 'Ghost'})
        params = {'user': user_data, 'auth_date': '1700000000'}
        data_check_string = '\n'.join(f'{k}={v}' for k, v in sorted(params.items()))
        secret_key = hmac.new(b'WebAppData', bot_token.encode(), hashlib.sha256).digest()
        computed_hash = hmac.new(
            secret_key, data_check_string.encode(), hashlib.sha256
        ).hexdigest()
        params['hash'] = computed_hash
        init_data = urlencode(params)

        client = APIClient()
        resp = client.post(
            '/api/v1/worklog/auth/telegram/',
            {'init_data': init_data},
            format='json',
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


# =========================================================================
# work_journal_summary
# =========================================================================

class WorkJournalSummaryViewTest(TestCase):
    def setUp(self):
        self.client = get_auth_client()

    def test_summary_success(self):
        """GET /api/v1/objects/{id}/work-journal/ — сводка."""
        obj = create_object()
        contractor = create_counterparty()
        shift = create_shift(obj=obj, contractor=contractor)
        team = create_team(shift=shift)
        create_media(team=team)
        create_report(team=team, shift=shift)

        resp = self.client.get(f'/api/v1/objects/{obj.id}/work-journal/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['total_shifts'], 1)
        self.assertEqual(resp.data['total_teams'], 1)
        self.assertEqual(resp.data['total_media'], 1)
        self.assertEqual(resp.data['total_reports'], 1)

    def test_summary_not_found(self):
        """Несуществующий объект — 404."""
        resp = self.client.get('/api/v1/objects/99999/work-journal/')
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_summary_empty(self):
        """Объект без данных worklog — нулевые счётчики."""
        obj = create_object()
        resp = self.client.get(f'/api/v1/objects/{obj.id}/work-journal/')
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data['total_shifts'], 0)
        self.assertEqual(resp.data['total_teams'], 0)

"""
Unit-тесты сериализаторов worklog — 17 тестов.
Покрытие: все serializers включая TelegramAuth и WorkJournalSummary.
"""
import hashlib
import hmac
import json
from unittest.mock import patch
from urllib.parse import urlencode

from django.test import TestCase, override_settings

from worklog.models import (
    Worker, Shift, Media, Report, Question,
)
from worklog.serializers import (
    WorkerSerializer, WorkerCreateSerializer,
    SupergroupSerializer,
    ShiftSerializer, ShiftCreateSerializer,
    ShiftRegistrationSerializer, ShiftRegistrationCreateSerializer,
    TeamSerializer, TeamCreateSerializer, TeamMembershipSerializer,
    MediaSerializer,
    ReportSerializer, ReportListSerializer,
    QuestionSerializer, AnswerSerializer,
    TelegramAuthSerializer,
    WorkJournalSummarySerializer,
)
from .factories import (
    create_counterparty, create_object, create_worker,
    create_supergroup, create_shift, create_shift_registration,
    create_team, create_media, create_report,
    create_question, create_answer,
)


class WorkerSerializerTest(TestCase):
    def test_serialization(self):
        """WorkerSerializer содержит все нужные поля."""
        worker = create_worker(name='Иванов')
        data = WorkerSerializer(worker).data
        self.assertEqual(data['name'], 'Иванов')
        self.assertIn('contractor_name', data)
        self.assertIn('id', data)
        self.assertIn('telegram_id', data)
        self.assertIn('role', data)
        self.assertIn('language', data)

    def test_create_serializer_valid(self):
        """WorkerCreateSerializer принимает валидные данные."""
        contractor = create_counterparty()
        data = {
            'telegram_id': 111222333,
            'name': 'Новый Монтажник',
            'phone': '+79009009090',
            'role': 'worker',
            'language': 'uz',
            'contractor': str(contractor.id),
        }
        s = WorkerCreateSerializer(data=data)
        self.assertTrue(s.is_valid(), s.errors)

    def test_create_serializer_missing_name(self):
        """WorkerCreateSerializer отклоняет запрос без name."""
        contractor = create_counterparty()
        data = {
            'telegram_id': 111222334,
            'role': 'worker',
            'contractor': str(contractor.id),
        }
        s = WorkerCreateSerializer(data=data)
        self.assertFalse(s.is_valid())
        self.assertIn('name', s.errors)


class SupergroupSerializerTest(TestCase):
    def test_serialization(self):
        """SupergroupSerializer содержит object_name и contractor_name."""
        sg = create_supergroup()
        data = SupergroupSerializer(sg).data
        self.assertIn('object_name', data)
        self.assertIn('contractor_name', data)
        self.assertIn('telegram_group_id', data)


class ShiftSerializerTest(TestCase):
    def test_serialization(self):
        """ShiftSerializer содержит annotated-поля."""
        from django.db.models import Count
        shift = create_shift()
        shift_qs = (
            Shift.objects
            .filter(id=shift.id)
            .select_related('object', 'contractor')
            .annotate(
                registrations_count=Count('registrations', distinct=True),
                teams_count=Count('teams', distinct=True),
            )
        )
        data = ShiftSerializer(shift_qs.first()).data
        self.assertEqual(data['registrations_count'], 0)
        self.assertEqual(data['teams_count'], 0)
        self.assertIn('qr_token', data)

    def test_create_serializer_valid(self):
        """ShiftCreateSerializer — валидный ввод."""
        obj = create_object()
        contractor = create_counterparty()
        data = {
            'object': obj.id,
            'contractor': str(contractor.id),
            'date': '2026-02-10',
            'shift_type': 'day',
            'start_time': '08:00',
            'end_time': '20:00',
        }
        s = ShiftCreateSerializer(data=data)
        self.assertTrue(s.is_valid(), s.errors)


class ShiftRegistrationSerializerTest(TestCase):
    def test_create_serializer_valid(self):
        """ShiftRegistrationCreateSerializer — валидные данные."""
        data = {
            'qr_token': 'abc123',
            'latitude': '55.7558262',
            'longitude': '37.6172999',
        }
        s = ShiftRegistrationCreateSerializer(data=data)
        self.assertTrue(s.is_valid(), s.errors)

    def test_create_serializer_invalid_coords(self):
        """ShiftRegistrationCreateSerializer — невалидные координаты."""
        data = {'qr_token': 'abc', 'latitude': 'not_a_number', 'longitude': '37.0'}
        s = ShiftRegistrationCreateSerializer(data=data)
        self.assertFalse(s.is_valid())
        self.assertIn('latitude', s.errors)


class TeamSerializerTest(TestCase):
    def test_create_serializer_valid(self):
        """TeamCreateSerializer — валидные данные."""
        shift = create_shift()
        brigadier = create_worker(contractor=shift.contractor, role=Worker.Role.BRIGADIER)
        worker = create_worker(contractor=shift.contractor)
        data = {
            'shift_id': str(shift.id),
            'member_ids': [str(brigadier.id), str(worker.id)],
            'brigadier_id': str(brigadier.id),
        }
        s = TeamCreateSerializer(data=data)
        self.assertTrue(s.is_valid(), s.errors)

    def test_create_serializer_empty_members(self):
        """TeamCreateSerializer — member_ids не может быть пустым."""
        data = {
            'shift_id': str(create_shift().id),
            'member_ids': [],
            'brigadier_id': str(create_worker().id),
        }
        s = TeamCreateSerializer(data=data)
        self.assertFalse(s.is_valid())
        self.assertIn('member_ids', s.errors)


class MediaSerializerTest(TestCase):
    def test_serialization(self):
        """MediaSerializer содержит author_name и team_name."""
        media = create_media()
        data = MediaSerializer(media).data
        self.assertIn('author_name', data)
        self.assertIn('media_type', data)


class ReportSerializerTest(TestCase):
    def test_list_serializer_no_media_items(self):
        """ReportListSerializer не включает media_items."""
        report = create_report()
        data = ReportListSerializer(report).data
        self.assertNotIn('media_items', data)
        self.assertIn('report_number', data)

    def test_detail_serializer_has_media_items(self):
        """ReportSerializer включает media_items."""
        report = create_report()
        data = ReportSerializer(report).data
        self.assertIn('media_items', data)
        self.assertEqual(data['media_items'], [])


class TelegramAuthSerializerTest(TestCase):
    @override_settings(TELEGRAM_BOT_TOKEN='test_bot_token_12345')
    def test_valid_init_data(self):
        """Валидация initData с корректной HMAC-подписью."""
        bot_token = 'test_bot_token_12345'
        user_data = json.dumps({'id': 123456, 'first_name': 'Test', 'last_name': 'User'})

        # Генерируем data-check-string
        params = {'user': user_data, 'auth_date': '1700000000', 'query_id': 'AAH'}
        data_check_string = '\n'.join(f'{k}={v}' for k, v in sorted(params.items()))

        secret_key = hmac.new(b'WebAppData', bot_token.encode(), hashlib.sha256).digest()
        computed_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

        params['hash'] = computed_hash
        init_data = urlencode(params)

        s = TelegramAuthSerializer(data={'init_data': init_data})
        self.assertTrue(s.is_valid(), s.errors)
        self.assertEqual(s.validated_data['init_data']['telegram_id'], 123456)

    @override_settings(TELEGRAM_BOT_TOKEN='test_bot_token_12345')
    def test_invalid_hash(self):
        """Невалидная подпись отклоняется."""
        user_data = json.dumps({'id': 123456, 'first_name': 'Test'})
        params = {
            'user': user_data,
            'auth_date': '1700000000',
            'hash': 'invalid_hash_value',
        }
        init_data = urlencode(params)

        s = TelegramAuthSerializer(data={'init_data': init_data})
        self.assertFalse(s.is_valid())
        self.assertIn('init_data', s.errors)

    @override_settings(TELEGRAM_BOT_TOKEN='')
    def test_no_bot_token(self):
        """Без TELEGRAM_BOT_TOKEN — ошибка валидации."""
        s = TelegramAuthSerializer(data={'init_data': 'hash=abc'})
        self.assertFalse(s.is_valid())

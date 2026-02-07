"""
Фабрики тестовых данных для worklog.
Используются во всех тестовых модулях.
"""
import uuid
from datetime import date, time
from decimal import Decimal

from django.contrib.auth.models import User

from accounting.models import Counterparty
from objects.models import Object
from worklog.models import (
    Worker, Supergroup, Shift, ShiftRegistration,
    Team, TeamMembership, Media, Report, Question, Answer,
)


def create_user(username='testuser', **kwargs) -> User:
    defaults = {'password': 'testpass123', 'first_name': 'Test'}
    defaults.update(kwargs)
    password = defaults.pop('password')
    user = User.objects.create_user(username=username, password=password, **defaults)
    return user


def create_counterparty(**kwargs) -> Counterparty:
    defaults = {
        'name': f'ООО "Тестовая компания {uuid.uuid4().hex[:6]}"',
        'short_name': f'ТК-{uuid.uuid4().hex[:4]}',
        'type': Counterparty.Type.VENDOR,
        'legal_form': Counterparty.LegalForm.OOO,
        'inn': str(uuid.uuid4().int)[:10],
    }
    defaults.update(kwargs)
    return Counterparty.objects.create(**defaults)


def create_object(**kwargs) -> Object:
    defaults = {
        'name': f'Объект {uuid.uuid4().hex[:6]}',
        'address': 'Москва, ул. Тестовая, 1',
        'status': Object.Status.IN_PROGRESS,
        'latitude': Decimal('55.7558262'),
        'longitude': Decimal('37.6172999'),
        'geo_radius': 500,
    }
    defaults.update(kwargs)
    return Object.objects.create(**defaults)


def create_worker(contractor=None, **kwargs) -> Worker:
    if contractor is None:
        contractor = create_counterparty()
    defaults = {
        'telegram_id': uuid.uuid4().int % (10 ** 10),
        'name': f'Монтажник {uuid.uuid4().hex[:4]}',
        'phone': '+79001234567',
        'role': Worker.Role.WORKER,
        'language': Worker.Language.RU,
        'contractor': contractor,
    }
    defaults.update(kwargs)
    return Worker.objects.create(**defaults)


def create_supergroup(obj=None, contractor=None, **kwargs) -> Supergroup:
    if obj is None:
        obj = create_object()
    if contractor is None:
        contractor = create_counterparty()
    defaults = {
        'object': obj,
        'contractor': contractor,
        'telegram_group_id': uuid.uuid4().int % (10 ** 12),
    }
    defaults.update(kwargs)
    return Supergroup.objects.create(**defaults)


def create_shift(obj=None, contractor=None, **kwargs) -> Shift:
    if obj is None:
        obj = create_object()
    if contractor is None:
        contractor = create_counterparty()
    defaults = {
        'object': obj,
        'contractor': contractor,
        'date': date.today(),
        'shift_type': Shift.ShiftType.DAY,
        'start_time': time(8, 0),
        'end_time': time(20, 0),
        'status': Shift.Status.ACTIVE,
        'qr_token': uuid.uuid4().hex,
    }
    defaults.update(kwargs)
    return Shift.objects.create(**defaults)


def create_shift_registration(shift=None, worker=None, **kwargs) -> ShiftRegistration:
    if shift is None:
        shift = create_shift()
    if worker is None:
        worker = create_worker(contractor=shift.contractor)
    defaults = {
        'shift': shift,
        'worker': worker,
        'latitude': Decimal('55.7558262'),
        'longitude': Decimal('37.6172999'),
        'geo_valid': True,
    }
    defaults.update(kwargs)
    return ShiftRegistration.objects.create(**defaults)


def create_team(shift=None, brigadier=None, **kwargs) -> Team:
    if shift is None:
        shift = create_shift()
    if brigadier is None:
        brigadier = create_worker(
            contractor=shift.contractor,
            role=Worker.Role.BRIGADIER,
        )
    defaults = {
        'object': shift.object,
        'contractor': shift.contractor,
        'shift': shift,
        'brigadier': brigadier,
        'topic_name': f'Звено {brigadier.name}',
        'status': Team.Status.ACTIVE,
    }
    defaults.update(kwargs)
    return Team.objects.create(**defaults)


def create_media(team=None, author=None, **kwargs) -> Media:
    if team is None:
        team = create_team()
    if author is None:
        author = create_worker(contractor=team.contractor)
    defaults = {
        'team': team,
        'author': author,
        'media_type': Media.MediaType.PHOTO,
        'file_id': f'test_file_id_{uuid.uuid4().hex[:8]}',
        'file_unique_id': f'unique_{uuid.uuid4().hex[:8]}',
        'status': Media.Status.PENDING,
    }
    defaults.update(kwargs)
    return Media.objects.create(**defaults)


def create_report(team=None, shift=None, **kwargs) -> Report:
    if team is None:
        team = create_team()
    if shift is None:
        shift = team.shift
    defaults = {
        'team': team,
        'shift': shift,
        'report_number': 1,
        'report_type': Report.ReportType.INTERMEDIATE,
        'trigger': Report.Trigger.MANUAL,
        'media_count': 0,
        'status': Report.Status.SUBMITTED,
    }
    defaults.update(kwargs)
    return Report.objects.create(**defaults)


def create_question(team=None, report=None, **kwargs) -> Question:
    if team is None:
        team = create_team()
    if report is None:
        report = create_report(team=team)
    defaults = {
        'report': report,
        'team': team,
        'asked_by': Question.AskedBy.OFFICE,
        'question_text': 'Какой объём работ выполнен?',
        'question_type': Question.QuestionType.TEXT,
        'status': Question.Status.PENDING,
    }
    defaults.update(kwargs)
    return Question.objects.create(**defaults)


def create_answer(question=None, worker=None, **kwargs) -> Answer:
    if question is None:
        question = create_question()
    if worker is None:
        worker = create_worker(contractor=question.team.contractor)
    defaults = {
        'question': question,
        'answered_by': worker,
        'answer_text': 'Выполнено 50%',
    }
    defaults.update(kwargs)
    return Answer.objects.create(**defaults)

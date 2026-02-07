"""
Unit-тесты моделей worklog — 24 теста.
Покрытие: Worker, Supergroup, Shift, ShiftRegistration,
          Team, TeamMembership, Media, Report, Question, Answer.
"""
import uuid
from datetime import date, time, timedelta
from decimal import Decimal

from django.db import IntegrityError
from django.test import TestCase
from django.utils import timezone

from worklog.models import (
    Worker, Supergroup, Shift, ShiftRegistration,
    Team, TeamMembership, Media, Report, Question, Answer,
)
from .factories import (
    create_counterparty, create_object, create_worker,
    create_supergroup, create_shift, create_shift_registration,
    create_team, create_media, create_report,
    create_question, create_answer,
)


# =========================================================================
# Worker
# =========================================================================

class WorkerModelTest(TestCase):
    def test_create_worker(self):
        """Создание Worker с обязательными полями."""
        contractor = create_counterparty()
        worker = create_worker(
            contractor=contractor,
            telegram_id=123456789,
            name='Иванов Иван',
        )
        self.assertEqual(worker.name, 'Иванов Иван')
        self.assertEqual(worker.telegram_id, 123456789)
        self.assertEqual(worker.role, Worker.Role.WORKER)
        self.assertEqual(worker.language, Worker.Language.RU)
        self.assertFalse(worker.bot_started)
        self.assertIsNotNone(worker.id)

    def test_worker_str(self):
        """__str__ возвращает ФИО (Роль)."""
        worker = create_worker(name='Петров Пётр', role=Worker.Role.BRIGADIER)
        self.assertEqual(str(worker), 'Петров Пётр (Бригадир)')

    def test_worker_unique_telegram_id(self):
        """telegram_id уникален."""
        contractor = create_counterparty()
        create_worker(contractor=contractor, telegram_id=999)
        with self.assertRaises(IntegrityError):
            create_worker(contractor=contractor, telegram_id=999)

    def test_worker_ordering(self):
        """Монтажники сортируются по name."""
        c = create_counterparty()
        w_b = create_worker(contractor=c, name='Б Иванов')
        w_a = create_worker(contractor=c, name='А Петров')
        workers = list(Worker.objects.filter(contractor=c))
        self.assertEqual(workers[0].name, 'А Петров')
        self.assertEqual(workers[1].name, 'Б Иванов')


# =========================================================================
# Supergroup
# =========================================================================

class SupergroupModelTest(TestCase):
    def test_create_supergroup(self):
        """Создание Supergroup."""
        obj = create_object(name='Офис Центр')
        contractor = create_counterparty()
        sg = create_supergroup(obj=obj, contractor=contractor, telegram_group_id=-10012345)
        self.assertEqual(sg.object, obj)
        self.assertEqual(sg.telegram_group_id, -10012345)

    def test_supergroup_unique_object_contractor(self):
        """Пара (object, contractor) уникальна."""
        obj = create_object()
        contractor = create_counterparty()
        create_supergroup(obj=obj, contractor=contractor)
        with self.assertRaises(IntegrityError):
            create_supergroup(obj=obj, contractor=contractor)

    def test_supergroup_str(self):
        """__str__ возвращает «Object — Contractor»."""
        obj = create_object(name='Дом на холме')
        contractor = create_counterparty(short_name='СтройКо')
        sg = create_supergroup(obj=obj, contractor=contractor)
        self.assertIn('Дом на холме', str(sg))


# =========================================================================
# Shift
# =========================================================================

class ShiftModelTest(TestCase):
    def test_create_shift(self):
        """Создание смены с дефолтными значениями."""
        shift = create_shift()
        self.assertEqual(shift.status, Shift.Status.ACTIVE)
        self.assertEqual(shift.shift_type, Shift.ShiftType.DAY)
        self.assertIsNotNone(shift.id)

    def test_shift_str(self):
        """__str__ возвращает «Объект — Дата (Тип)»."""
        obj = create_object(name='Склад')
        shift = create_shift(obj=obj, date=date(2026, 2, 7))
        self.assertIn('Склад', str(shift))
        self.assertIn('2026-02-07', str(shift))
        self.assertIn('Дневная', str(shift))

    def test_shift_ordering(self):
        """Смены сортируются по -date, -start_time."""
        obj = create_object()
        c = create_counterparty()
        s1 = create_shift(obj=obj, contractor=c, date=date(2026, 1, 1))
        s2 = create_shift(obj=obj, contractor=c, date=date(2026, 2, 1))
        shifts = list(Shift.objects.filter(object=obj))
        self.assertEqual(shifts[0].date, date(2026, 2, 1))


# =========================================================================
# ShiftRegistration
# =========================================================================

class ShiftRegistrationModelTest(TestCase):
    def test_create_registration(self):
        """Создание регистрации на смену."""
        reg = create_shift_registration()
        self.assertTrue(reg.geo_valid)
        self.assertIsNotNone(reg.registered_at)

    def test_registration_unique_shift_worker(self):
        """(shift, worker) уникальны — нельзя зарегистрироваться дважды."""
        shift = create_shift()
        worker = create_worker(contractor=shift.contractor)
        create_shift_registration(shift=shift, worker=worker)
        with self.assertRaises(IntegrityError):
            create_shift_registration(shift=shift, worker=worker)


# =========================================================================
# Team
# =========================================================================

class TeamModelTest(TestCase):
    def test_create_team(self):
        """Создание звена."""
        shift = create_shift()
        team = create_team(shift=shift)
        self.assertEqual(team.status, Team.Status.ACTIVE)
        self.assertFalse(team.is_solo)
        self.assertIsNotNone(team.brigadier)

    def test_team_str_with_topic_name(self):
        """__str__ возвращает topic_name."""
        team = create_team()
        team.topic_name = 'Звено Альфа'
        self.assertEqual(str(team), 'Звено Альфа')

    def test_team_str_without_topic_name(self):
        """__str__ без topic_name — fallback."""
        team = create_team()
        team.topic_name = ''
        result = str(team)
        self.assertIn('Звено #', result)


# =========================================================================
# TeamMembership
# =========================================================================

class TeamMembershipModelTest(TestCase):
    def test_create_membership(self):
        """Добавление монтажника в звено."""
        team = create_team()
        worker = create_worker(contractor=team.contractor)
        tm = TeamMembership.objects.create(team=team, worker=worker)
        self.assertIsNotNone(tm.joined_at)
        self.assertIsNone(tm.left_at)

    def test_membership_str(self):
        """__str__ содержит имя монтажника."""
        team = create_team()
        worker = create_worker(contractor=team.contractor, name='Сидоров')
        tm = TeamMembership.objects.create(team=team, worker=worker)
        self.assertIn('Сидоров', str(tm))


# =========================================================================
# Media
# =========================================================================

class MediaModelTest(TestCase):
    def test_create_media(self):
        """Создание медиа с дефолтами."""
        media = create_media()
        self.assertEqual(media.media_type, Media.MediaType.PHOTO)
        self.assertEqual(media.tag, Media.Tag.NONE)
        self.assertEqual(media.status, Media.Status.PENDING)

    def test_media_str(self):
        """__str__ содержит тип и имя автора."""
        worker = create_worker(name='Козлов')
        team = create_team()
        media = create_media(team=team, author=worker)
        self.assertIn('Фото', str(media))
        self.assertIn('Козлов', str(media))


# =========================================================================
# Report
# =========================================================================

class ReportModelTest(TestCase):
    def test_create_report(self):
        """Создание отчёта."""
        report = create_report()
        self.assertEqual(report.report_number, 1)
        self.assertEqual(report.status, Report.Status.SUBMITTED)
        self.assertEqual(report.members_snapshot, [])

    def test_report_str(self):
        """__str__ содержит номер и тип."""
        report = create_report(report_number=3)
        result = str(report)
        self.assertIn('#3', result)
        self.assertIn('Промежуточный', result)


# =========================================================================
# Question
# =========================================================================

class QuestionModelTest(TestCase):
    def test_create_question(self):
        """Создание вопроса."""
        q = create_question()
        self.assertEqual(q.status, Question.Status.PENDING)
        self.assertEqual(q.question_type, Question.QuestionType.TEXT)

    def test_question_str(self):
        """__str__ содержит текст вопроса."""
        q = create_question(question_text='Сколько кабеля уложено?')
        self.assertIn('Сколько кабеля', str(q))


# =========================================================================
# Answer
# =========================================================================

class AnswerModelTest(TestCase):
    def test_create_answer(self):
        """Создание ответа."""
        a = create_answer()
        self.assertEqual(a.answer_text, 'Выполнено 50%')

    def test_answer_str(self):
        """__str__ содержит имя отвечающего."""
        worker = create_worker(name='Ахмедов')
        a = create_answer(worker=worker)
        self.assertIn('Ахмедов', str(a))

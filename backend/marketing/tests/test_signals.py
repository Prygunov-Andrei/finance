from unittest.mock import patch, MagicMock

import pytest
from django.contrib.auth.models import User

from marketing.models import AvitoConfig
from proposals.models import MountingProposal


@pytest.fixture
def mp_user(db):
    return User.objects.create_user(username='mp_test', password='test123')


@pytest.fixture
def mp_object(db):
    from objects.models import Object
    return Object.objects.create(name='Тестовый объект', address='Тест')


@pytest.fixture
def mounting_proposal(mp_user, mp_object):
    return MountingProposal.objects.create(
        name='МП Тест',
        date='2026-01-01',
        object=mp_object,
        status=MountingProposal.Status.DRAFT,
        created_by=mp_user,
    )


class TestAutoPublishSignal:
    @patch('marketing.tasks.publish_mp_to_avito.delay')
    def test_signal_fires_on_status_change_to_published(self, mock_delay, mounting_proposal):
        """Сигнал срабатывает при смене статуса на published."""
        config = AvitoConfig.get()
        config.is_active = True
        config.auto_publish_mp = True
        config.save()

        mounting_proposal.status = MountingProposal.Status.PUBLISHED
        mounting_proposal.save()

        mock_delay.assert_called_once_with(mounting_proposal.pk)

    @patch('marketing.tasks.publish_mp_to_avito.delay')
    def test_signal_does_not_fire_on_repeated_save(self, mock_delay, mounting_proposal):
        """Повторное сохранение published НЕ ставит задачу повторно."""
        config = AvitoConfig.get()
        config.is_active = True
        config.auto_publish_mp = True
        config.save()

        mounting_proposal.status = MountingProposal.Status.PUBLISHED
        mounting_proposal.save()
        mock_delay.reset_mock()

        # Повторное сохранение без смены статуса
        mounting_proposal.notes = 'Обновили заметки'
        mounting_proposal.save()

        mock_delay.assert_not_called()

    @patch('marketing.tasks.publish_mp_to_avito.delay')
    def test_signal_does_not_fire_when_auto_publish_disabled(self, mock_delay, mounting_proposal):
        """Сигнал НЕ срабатывает если auto_publish_mp выключен."""
        config = AvitoConfig.get()
        config.is_active = True
        config.auto_publish_mp = False
        config.save()

        mounting_proposal.status = MountingProposal.Status.PUBLISHED
        mounting_proposal.save()

        mock_delay.assert_not_called()

    @patch('marketing.tasks.publish_mp_to_avito.delay')
    def test_signal_does_not_fire_when_avito_inactive(self, mock_delay, mounting_proposal):
        """Сигнал НЕ срабатывает если Avito не активен."""
        config = AvitoConfig.get()
        config.is_active = False
        config.auto_publish_mp = True
        config.save()

        mounting_proposal.status = MountingProposal.Status.PUBLISHED
        mounting_proposal.save()

        mock_delay.assert_not_called()

    @patch('marketing.tasks.publish_mp_to_avito.delay')
    def test_signal_does_not_fire_on_other_status(self, mock_delay, mounting_proposal):
        """Сигнал НЕ срабатывает при смене на другой статус."""
        config = AvitoConfig.get()
        config.is_active = True
        config.auto_publish_mp = True
        config.save()

        mounting_proposal.status = MountingProposal.Status.SENT
        mounting_proposal.save()

        mock_delay.assert_not_called()

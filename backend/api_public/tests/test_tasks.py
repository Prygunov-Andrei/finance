"""Тесты Celery-задач и email-уведомлений — Заход 5."""
import pytest
from decimal import Decimal
from unittest.mock import patch, MagicMock, call

from api_public.models import (
    EstimateRequest, EstimateRequestFile, EstimateRequestVersion,
    PublicPortalConfig,
)
from api_public.tasks import (
    process_public_estimate_request, generate_and_deliver,
    _parse_all_files, _update_request_stats,
)
from api_public.emails import (
    send_request_accepted, send_estimate_ready, send_estimate_error,
    send_operator_new_request, send_operator_review_ready, send_operator_callback,
)
from api_public.tests.factories import (
    EstimateRequestFactory, EstimateRequestFileFactory, CallbackRequestFactory,
)
from estimates.models import SpecificationItem


@pytest.fixture
def portal_config(db):
    return PublicPortalConfig.objects.create(
        auto_approve=False,
        operator_emails='op@test.com',
    )


@pytest.fixture
def portal_config_auto(db):
    return PublicPortalConfig.objects.create(
        auto_approve=True,
        operator_emails='op@test.com',
    )


@pytest.fixture
def request_with_spec_items(db):
    """Запрос с SpecificationItem (имитация уже распарсенных данных)."""
    req = EstimateRequestFactory(total_files=1, status='uploaded')
    SpecificationItem.objects.create(
        request=req, name='Вентилятор ВКК-160',
        unit='шт', quantity=2, section_name='ОВ',
    )
    SpecificationItem.objects.create(
        request=req, name='Труба PPR', unit='м',
        quantity=10, section_name='ВК',
    )
    return req


# =========================================================================
# Email notifications
# =========================================================================

class TestEmails:

    @patch('api_public.emails.send_mail')
    def test_send_request_accepted(self, mock_mail, db):
        """Email клиенту: запрос принят."""
        req = EstimateRequestFactory(
            email='client@test.com', project_name='Тест', total_files=2,
        )
        send_request_accepted(req)
        mock_mail.assert_called_once()
        args = mock_mail.call_args
        assert 'client@test.com' in args[1]['recipient_list']
        assert 'принят' in args[1]['subject'].lower() or 'принят' in args[1]['message'].lower()

    @patch('api_public.emails.send_mail')
    def test_send_estimate_ready(self, mock_mail, db):
        """Email клиенту: смета готова."""
        req = EstimateRequestFactory(
            email='client@test.com', project_name='Тест',
            total_spec_items=10, matched_exact=7, matched_analog=2, unmatched=1,
        )
        send_estimate_ready(req)
        mock_mail.assert_called_once()
        args = mock_mail.call_args
        assert 'client@test.com' in args[1]['recipient_list']
        assert 'готова' in args[1]['subject'].lower()

    @patch('api_public.emails.send_mail')
    def test_send_estimate_ready_raises_on_smtp_error(self, mock_mail, db):
        """send_estimate_ready НЕ подавляет ошибки (для обработки в caller)."""
        mock_mail.side_effect = ConnectionError('SMTP down')
        req = EstimateRequestFactory()
        with pytest.raises(ConnectionError):
            send_estimate_ready(req)

    @patch('api_public.emails._safe_send')
    def test_send_estimate_error(self, mock_send, db):
        """Email клиенту: ошибка."""
        req = EstimateRequestFactory(email='client@test.com')
        send_estimate_error(req, 'LLM timeout')
        mock_send.assert_called_once()

    @patch('api_public.emails._safe_send')
    def test_send_operator_new_request(self, mock_send, db):
        """Email оператору: новый запрос."""
        PublicPortalConfig.objects.create(operator_emails='op@test.com')
        req = EstimateRequestFactory(company_name='ООО Тест', total_files=3)
        send_operator_new_request(req)
        mock_send.assert_called_once()
        args = mock_send.call_args
        assert 'op@test.com' in args[1]['recipient_list']
        assert 'ООО Тест' in args[1]['subject']

    @patch('api_public.emails._safe_send')
    def test_send_operator_no_emails_configured(self, mock_send, db):
        """Если нет operator_emails — ничего не отправляется."""
        PublicPortalConfig.objects.create(operator_emails='')
        req = EstimateRequestFactory()
        send_operator_new_request(req)
        mock_send.assert_not_called()

    @patch('api_public.emails._safe_send')
    def test_send_operator_review_ready(self, mock_send, db):
        """Email оператору: готов к проверке."""
        PublicPortalConfig.objects.create(operator_emails='op@test.com')
        req = EstimateRequestFactory(
            total_spec_items=20, matched_exact=15, matched_analog=3, unmatched=2,
        )
        send_operator_review_ready(req)
        mock_send.assert_called_once()

    @patch('api_public.emails._safe_send')
    def test_send_operator_callback(self, mock_send, db):
        """Email оператору: заявка на звонок."""
        PublicPortalConfig.objects.create(operator_emails='op@test.com')
        cb = CallbackRequestFactory(phone='+79001234567', comment='Перезвоните')
        send_operator_callback(cb)
        mock_send.assert_called_once()
        assert '+79001234567' in mock_send.call_args[1]['message']


# =========================================================================
# _update_request_stats
# =========================================================================

class TestUpdateRequestStats:

    def test_updates_stats(self, db):
        """Обновляет статистику по данным Estimate."""
        from objects.models import Object
        from accounting.models import LegalEntity, TaxSystem
        from django.contrib.auth.models import User
        from estimates.models import (
            Estimate, EstimateSection, EstimateSubsection, EstimateItem,
        )
        from catalog.models import Product, Category

        ts, _ = TaxSystem.objects.get_or_create(code='osno', defaults={'name': 'ОСНО'})
        le = LegalEntity.objects.create(name='Test', short_name='T', tax_system=ts)
        obj = Object.objects.create(name='Test obj')
        user = User.objects.create_user('stats_test')
        cat = Category.objects.create(name='Cat', code='cat')
        product = Product.objects.create(name='Prod', category=cat, normalized_name='prod')

        estimate = Estimate.objects.create(
            name='Test', object=obj, legal_entity=le, created_by=user,
        )
        section = EstimateSection.objects.create(estimate=estimate, name='S')
        sub = EstimateSubsection.objects.create(section=section, name='Sub')

        # Exact match
        EstimateItem.objects.create(
            estimate=estimate, section=section, subsection=sub,
            name='Item 1', product=product, material_unit_price=100,
        )
        # Analog
        EstimateItem.objects.create(
            estimate=estimate, section=section, subsection=sub,
            name='Item 2', product=product, is_analog=True,
            analog_reason='Другой типоразмер', material_unit_price=200,
        )
        # Unmatched
        EstimateItem.objects.create(
            estimate=estimate, section=section, subsection=sub,
            name='Item 3', material_unit_price=0,
        )

        req = EstimateRequestFactory(estimate=estimate)
        _update_request_stats(req)
        req.refresh_from_db()

        assert req.total_spec_items == 3
        assert req.matched_exact == 1
        assert req.matched_analog == 1
        assert req.unmatched == 1


# =========================================================================
# generate_and_deliver
# =========================================================================

class TestGenerateAndDeliver:

    @patch('api_public.tasks.send_estimate_ready')
    @patch('estimates.services.estimate_excel_exporter.EstimateExcelExporter')
    def test_happy_path(self, mock_exporter_cls, mock_email, db):
        """Excel генерируется, версия создаётся, email отправляется."""
        from io import BytesIO
        from objects.models import Object
        from accounting.models import LegalEntity, TaxSystem
        from django.contrib.auth.models import User
        from estimates.models import Estimate

        ts, _ = TaxSystem.objects.get_or_create(code='osno', defaults={'name': 'ОСНО'})
        le = LegalEntity.objects.create(name='Test', short_name='T', tax_system=ts)
        obj = Object.objects.create(name='Test obj')
        user = User.objects.create_user('deliver_test')
        estimate = Estimate.objects.create(
            name='Test', object=obj, legal_entity=le, created_by=user,
        )

        mock_exporter = MagicMock()
        mock_exporter.export_public.return_value = BytesIO(b'fake excel content')
        mock_exporter_cls.return_value = mock_exporter

        req = EstimateRequestFactory(estimate=estimate, status='review')

        from django.core.files.storage import FileSystemStorage, default_storage
        with patch.object(EstimateRequestVersion.excel_file.field, 'storage', default_storage):
            with patch.object(EstimateRequest.result_excel_file.field, 'storage', default_storage):
                generate_and_deliver(req)

        req.refresh_from_db()
        assert req.status == EstimateRequest.Status.DELIVERED
        assert req.notification_sent is True
        assert req.versions.count() == 1
        assert req.versions.first().version_number == 1
        mock_email.assert_called_once()

    @patch('api_public.tasks.send_estimate_ready', side_effect=ConnectionError('SMTP'))
    @patch('api_public.tasks.send_operator_error')
    @patch('estimates.services.estimate_excel_exporter.EstimateExcelExporter')
    def test_email_failure_keeps_ready(self, mock_exporter_cls, mock_op_error, mock_email, db):
        """SMTP-сбой → status остаётся 'ready', оператор уведомлён."""
        from io import BytesIO
        from objects.models import Object
        from accounting.models import LegalEntity, TaxSystem
        from django.contrib.auth.models import User
        from estimates.models import Estimate

        ts, _ = TaxSystem.objects.get_or_create(code='osno', defaults={'name': 'ОСНО'})
        le = LegalEntity.objects.create(name='Test', short_name='T', tax_system=ts)
        obj = Object.objects.create(name='Test obj')
        user = User.objects.create_user('deliver_test2')
        estimate = Estimate.objects.create(
            name='Test', object=obj, legal_entity=le, created_by=user,
        )

        mock_exporter = MagicMock()
        mock_exporter.export_public.return_value = BytesIO(b'fake')
        mock_exporter_cls.return_value = mock_exporter

        req = EstimateRequestFactory(estimate=estimate, status='review')

        from django.core.files.storage import default_storage
        with patch.object(EstimateRequestVersion.excel_file.field, 'storage', default_storage):
            with patch.object(EstimateRequest.result_excel_file.field, 'storage', default_storage):
                generate_and_deliver(req)

        req.refresh_from_db()
        assert req.status == EstimateRequest.Status.READY  # НЕ error!
        assert req.notification_sent is False
        mock_op_error.assert_called_once()

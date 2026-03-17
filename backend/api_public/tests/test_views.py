"""Тесты API views — Заход 4."""
import io
import pytest
from datetime import timedelta
from unittest.mock import patch, MagicMock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from api_public.models import EstimateRequest, EstimateRequestFile, CallbackRequest
from api_public.tests.factories import EstimateRequestFactory, CallbackRequestFactory


@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def portal_config(db):
    from api_public.models import PublicPortalConfig
    return PublicPortalConfig.objects.create(
        auto_approve=False,
        operator_emails='op@test.com',
        max_files_per_request=20,
        max_pages_per_request=100,
    )


@pytest.fixture
def delivered_request(db):
    """Запрос со статусом delivered и файлом."""
    return EstimateRequestFactory(status='delivered')


@pytest.fixture
def mock_redis():
    """Мок Redis для OTP."""
    with patch('api_public.otp._get_redis') as mock:
        r = MagicMock()
        r.get.return_value = None
        mock.return_value = r
        yield r


def _pdf_file(name='spec.pdf'):
    """Создаёт SimpleUploadedFile с PDF-подобным содержимым."""
    return SimpleUploadedFile(
        name=name,
        content=b'%PDF-1.4 fake pdf content' + b'\x00' * 100,
        content_type='application/pdf',
    )


# =========================================================================
# OTP views
# =========================================================================

class TestVerifyEmailSend:

    @patch('api_public.views.send_otp')
    def test_success(self, mock_send, client):
        """POST verify-email/ с валидным email → 200."""
        mock_send.return_value = {'ok': True}
        resp = client.post('/api/public/v1/verify-email/', {'email': 'test@example.com'})
        assert resp.status_code == 200
        mock_send.assert_called_once_with('test@example.com')

    @patch('api_public.views.send_otp')
    def test_error(self, mock_send, client):
        """Ошибка отправки → 400."""
        mock_send.return_value = {'error': 'Лимит превышен'}
        resp = client.post('/api/public/v1/verify-email/', {'email': 'test@example.com'})
        assert resp.status_code == 400

    def test_invalid_email(self, client):
        """Невалидный email → 400."""
        resp = client.post('/api/public/v1/verify-email/', {'email': 'not-an-email'})
        assert resp.status_code == 400


class TestVerifyEmailConfirm:

    @patch('api_public.views.verify_otp')
    def test_success(self, mock_verify, client):
        """Верный код → verification_token."""
        mock_verify.return_value = {'ok': True, 'verification_token': 'abc123'}
        resp = client.post('/api/public/v1/verify-email/confirm/', {
            'email': 'test@example.com',
            'code': '123456',
        })
        assert resp.status_code == 200
        assert resp.data['verification_token'] == 'abc123'

    @patch('api_public.views.verify_otp')
    def test_wrong_code(self, mock_verify, client):
        """Неверный код → 400."""
        mock_verify.return_value = {'error': 'Неверный код'}
        resp = client.post('/api/public/v1/verify-email/confirm/', {
            'email': 'test@example.com',
            'code': '000000',
        })
        assert resp.status_code == 400


# =========================================================================
# Create Estimate Request
# =========================================================================

class TestCreateEstimateRequest:

    @patch('api_public.views.check_verification_token')
    def test_success(self, mock_check, client, portal_config, tmp_path):
        """Создание запроса с файлом → 201."""
        from django.core.files.storage import FileSystemStorage
        fs = FileSystemStorage(location=str(tmp_path))
        mock_check.return_value = 'test@example.com'
        with patch.object(EstimateRequestFile.file.field, 'storage', fs):
            resp = client.post('/api/public/v1/estimate-requests/', {
                'verification_token': 'valid_token',
                'project_name': 'Тестовый проект',
                'files': [_pdf_file()],
            }, format='multipart')
        assert resp.status_code == 201
        assert 'access_token' in resp.data
        assert EstimateRequest.objects.count() == 1

    @patch('api_public.views.check_verification_token')
    def test_no_verification_token(self, mock_check, client, portal_config):
        """Без verification_token → 403."""
        mock_check.return_value = ''
        resp = client.post('/api/public/v1/estimate-requests/', {
            'verification_token': 'invalid',
            'project_name': 'Тест',
            'files': [_pdf_file()],
        }, format='multipart')
        assert resp.status_code == 403

    @patch('api_public.views.check_verification_token')
    def test_no_files(self, mock_check, client, portal_config):
        """Без файлов → 400."""
        mock_check.return_value = 'test@example.com'
        resp = client.post('/api/public/v1/estimate-requests/', {
            'verification_token': 'valid',
            'project_name': 'Тест',
        }, format='multipart')
        assert resp.status_code == 400

    @patch('api_public.views.check_verification_token')
    def test_honeypot_filled(self, mock_check, client, portal_config):
        """Honeypot заполнен → 400."""
        mock_check.return_value = 'test@example.com'
        resp = client.post('/api/public/v1/estimate-requests/', {
            'verification_token': 'valid',
            'project_name': 'Тест',
            'company_website': 'http://spam.com',
            'files': [_pdf_file()],
        }, format='multipart')
        assert resp.status_code == 400

    @patch('api_public.views.check_verification_token')
    def test_invalid_file_extension(self, mock_check, client, portal_config):
        """Файл с .exe → 400."""
        mock_check.return_value = 'test@example.com'
        exe_file = SimpleUploadedFile('malware.exe', b'MZ\x90\x00' + b'\x00' * 100)
        resp = client.post('/api/public/v1/estimate-requests/', {
            'verification_token': 'valid',
            'project_name': 'Тест',
            'files': [exe_file],
        }, format='multipart')
        assert resp.status_code == 400


# =========================================================================
# Status / Detail / Download / Callback
# =========================================================================

class TestEstimateRequestStatus:

    def test_valid_token(self, client, db):
        """Валидный access_token → 200 со статусом."""
        req = EstimateRequestFactory(status='parsing', total_files=3, processed_files=1)
        resp = client.get(f'/api/public/v1/estimate-requests/{req.access_token}/status/')
        assert resp.status_code == 200
        assert resp.data['status'] == 'parsing'
        assert 'progress_percent' in resp.data

    def test_invalid_token(self, client, db):
        """Невалидный access_token → 404."""
        resp = client.get('/api/public/v1/estimate-requests/invalid_token_123/status/')
        assert resp.status_code == 404

    def test_expired_token(self, client, db):
        """Просроченный access_token → 410."""
        req = EstimateRequestFactory(
            expires_at=timezone.now() - timedelta(days=1),
        )
        resp = client.get(f'/api/public/v1/estimate-requests/{req.access_token}/status/')
        assert resp.status_code == 410


class TestEstimateRequestDetail:

    def test_detail_returns_files(self, client, db):
        """Детальная страница возвращает файлы."""
        req = EstimateRequestFactory()
        from api_public.tests.factories import EstimateRequestFileFactory
        EstimateRequestFileFactory(request=req, original_filename='spec.pdf')
        resp = client.get(f'/api/public/v1/estimate-requests/{req.access_token}/')
        assert resp.status_code == 200
        assert len(resp.data['files']) == 1


class TestEstimateRequestDownload:

    def test_not_ready(self, client, db):
        """status != ready/delivered → 404."""
        req = EstimateRequestFactory(status='parsing')
        resp = client.get(f'/api/public/v1/estimate-requests/{req.access_token}/download/')
        assert resp.status_code == 404

    def test_no_file(self, client, db):
        """status=ready но нет файла → 404."""
        req = EstimateRequestFactory(status='ready')
        resp = client.get(f'/api/public/v1/estimate-requests/{req.access_token}/download/')
        assert resp.status_code == 404


class TestEstimateRequestCallback:

    def test_success(self, client, db):
        """Заявка на звонок → 201."""
        req = EstimateRequestFactory()
        resp = client.post(
            f'/api/public/v1/estimate-requests/{req.access_token}/callback/',
            {'phone': '+79001234567', 'comment': 'Перезвоните'},
        )
        assert resp.status_code == 201
        assert CallbackRequest.objects.count() == 1

    def test_no_phone(self, client, db):
        """Без телефона → 400."""
        req = EstimateRequestFactory()
        resp = client.post(
            f'/api/public/v1/estimate-requests/{req.access_token}/callback/',
            {'comment': 'Без телефона'},
        )
        assert resp.status_code == 400

    def test_invalid_token(self, client, db):
        """Невалидный access_token → 404."""
        resp = client.post(
            '/api/public/v1/estimate-requests/bad_token/callback/',
            {'phone': '+79001234567'},
        )
        assert resp.status_code == 404

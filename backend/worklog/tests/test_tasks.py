"""
Unit-тесты Celery tasks worklog — 13 тестов.
Покрытие: download_media_from_telegram, upload_media_to_s3,
          compute_phash, create_thumbnail, _guess_content_type.
"""
import io
import uuid
from unittest.mock import patch, MagicMock

from django.test import TestCase, override_settings

from worklog.models import Media
from worklog.tasks import (
    download_media_from_telegram,
    upload_media_to_s3,
    compute_phash,
    create_thumbnail,
    _guess_content_type,
)
from .factories import create_media, create_team


class GuessContentTypeTest(TestCase):
    def test_jpg(self):
        self.assertEqual(_guess_content_type('jpg'), 'image/jpeg')

    def test_mp4(self):
        self.assertEqual(_guess_content_type('mp4'), 'video/mp4')

    def test_ogg(self):
        self.assertEqual(_guess_content_type('ogg'), 'audio/ogg')

    def test_unknown(self):
        self.assertEqual(_guess_content_type('xyz'), 'application/octet-stream')

    def test_case_insensitive(self):
        self.assertEqual(_guess_content_type('JPG'), 'image/jpeg')


class DownloadMediaFromTelegramTest(TestCase):
    def test_media_not_found(self):
        """Несуществующий media_id — функция возвращает None."""
        result = download_media_from_telegram(str(uuid.uuid4()))
        self.assertIsNone(result)

    def test_no_file_id(self):
        """Медиа без file_id (тип text) — возврат без ошибки."""
        media = create_media(file_id='', media_type=Media.MediaType.TEXT)
        result = download_media_from_telegram(str(media.id))
        self.assertIsNone(result)

    @override_settings(TELEGRAM_BOT_TOKEN='')
    def test_no_bot_token(self):
        """Без бот-токена — return None."""
        media = create_media()
        result = download_media_from_telegram(str(media.id))
        self.assertIsNone(result)

    @override_settings(TELEGRAM_BOT_TOKEN='fake_token')
    @patch('worklog.tasks.upload_media_to_s3')
    @patch('httpx.Client')
    def test_successful_download(self, mock_client_cls, mock_upload):
        """Успешная загрузка — обновляет file_size, вызывает upload."""
        media = create_media(file_id='AgACTest123')

        mock_client = MagicMock()
        mock_client_cls.return_value.__enter__ = MagicMock(return_value=mock_client)
        mock_client_cls.return_value.__exit__ = MagicMock(return_value=False)

        # Мокаем getFile
        file_info_resp = MagicMock()
        file_info_resp.json.return_value = {
            'ok': True,
            'result': {'file_path': 'photos/file_0.jpg', 'file_size': 12345},
        }
        file_info_resp.raise_for_status = MagicMock()

        # Мокаем скачивание
        download_resp = MagicMock()
        download_resp.content = b'\x00' * 12345
        download_resp.raise_for_status = MagicMock()

        mock_client.get.side_effect = [file_info_resp, download_resp]

        download_media_from_telegram(str(media.id))

        media.refresh_from_db()
        self.assertEqual(media.file_size, 12345)
        mock_upload.delay.assert_called_once_with(str(media.id), 'photos/file_0.jpg')


class UploadMediaToS3Test(TestCase):
    @override_settings(TELEGRAM_BOT_TOKEN='fake_token')
    @patch('worklog.tasks.create_thumbnail')
    @patch('worklog.tasks.compute_phash')
    @patch('worklog.tasks._get_s3_client')
    @patch('httpx.Client')
    def test_successful_upload(self, mock_client_cls, mock_s3, mock_phash, mock_thumb):
        """Успешная загрузка в S3 — обновляет file_url и статус."""
        media = create_media(media_type=Media.MediaType.PHOTO)

        mock_client = MagicMock()
        mock_client_cls.return_value.__enter__ = MagicMock(return_value=mock_client)
        mock_client_cls.return_value.__exit__ = MagicMock(return_value=False)

        resp = MagicMock()
        resp.content = b'\xff\xd8\xff\xe0' + b'\x00' * 100
        resp.raise_for_status = MagicMock()
        mock_client.get.return_value = resp

        mock_s3_client = MagicMock()
        mock_s3.return_value = mock_s3_client

        upload_media_to_s3(str(media.id), 'photos/file_0.jpg')

        media.refresh_from_db()
        self.assertEqual(media.status, Media.Status.DOWNLOADED)
        self.assertIn('worklog-media', media.file_url)
        mock_s3_client.put_object.assert_called_once()
        mock_phash.delay.assert_called_once_with(str(media.id))
        mock_thumb.delay.assert_called_once_with(str(media.id))

    def test_media_not_found(self):
        """Несуществующий media_id."""
        result = upload_media_to_s3(str(uuid.uuid4()), 'path.jpg')
        self.assertIsNone(result)


class ComputePhashTest(TestCase):
    def test_media_not_found(self):
        """Несуществующий media_id."""
        result = compute_phash(str(uuid.uuid4()))
        self.assertIsNone(result)

    def test_no_file_url(self):
        """Медиа без file_url — пропускает."""
        media = create_media(file_id='test')
        # file_url по умолчанию пустой
        result = compute_phash(str(media.id))
        self.assertIsNone(result)


class CreateThumbnailTest(TestCase):
    def test_media_not_found(self):
        """Несуществующий media_id."""
        result = create_thumbnail(str(uuid.uuid4()))
        self.assertIsNone(result)

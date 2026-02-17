import io

from PIL import Image
from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile

from objects.models import Object

User = get_user_model()

OBJECTS_URL = '/api/v1/objects/'


def _detail_url(pk):
    return f'{OBJECTS_URL}{pk}/'


def _upload_photo_url(pk):
    return f'{OBJECTS_URL}{pk}/upload-photo/'


def _create_test_image(name='test.jpg', fmt='JPEG', size=(100, 100)):
    """Generate a minimal valid image file for upload tests."""
    buf = io.BytesIO()
    Image.new('RGB', size, color='red').save(buf, format=fmt)
    buf.seek(0)
    return SimpleUploadedFile(
        name=name,
        content=buf.read(),
        content_type=f'image/{fmt.lower()}',
    )


class ObjectAPITestCase(APITestCase):
    """Tests for /api/v1/objects/ endpoints."""

    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123',
        )
        self.client.force_authenticate(user=self.user)

    # ------------------------------------------------------------------ list
    def test_list_objects(self):
        """GET /api/v1/objects/ returns a list of objects."""
        Object.objects.create(name='Объект 1', address='Адрес 1')
        Object.objects.create(name='Объект 2', address='Адрес 2')

        response = self.client.get(OBJECTS_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 2)
        self.assertEqual(len(response.data['results']), 2)

    def test_list_objects_filter_by_status(self):
        """GET /api/v1/objects/?status=planned returns only planned objects."""
        Object.objects.create(
            name='Планируемый', address='Адрес 1', status='planned',
        )
        Object.objects.create(
            name='В работе', address='Адрес 2', status='in_progress',
        )

        response = self.client.get(OBJECTS_URL, {'status': 'planned'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(len(response.data['results']), 1)
        self.assertEqual(response.data['results'][0]['name'], 'Планируемый')

    # ---------------------------------------------------------------- create
    def test_create_object(self):
        """POST /api/v1/objects/ creates objects with every valid status."""
        valid_statuses = ['planned', 'in_progress', 'completed', 'suspended']

        for idx, obj_status in enumerate(valid_statuses):
            payload = {
                'name': f'Объект {obj_status}_{idx}',
                'address': f'Адрес {idx}',
                'status': obj_status,
            }
            response = self.client.post(OBJECTS_URL, payload, format='json')

            self.assertEqual(
                response.status_code,
                status.HTTP_201_CREATED,
                f'Failed to create object with status={obj_status}: {response.data}',
            )
            self.assertEqual(response.data['status'], obj_status)

        self.assertEqual(Object.objects.count(), len(valid_statuses))

    def test_create_object_with_in_progress_status(self):
        """POST /api/v1/objects/ with status='in_progress' works correctly."""
        payload = {
            'name': 'Объект в работе',
            'address': 'ул. Строителей, д. 5',
            'status': 'in_progress',
        }
        response = self.client.post(OBJECTS_URL, payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['status'], 'in_progress')
        self.assertEqual(response.data['name'], 'Объект в работе')

    # ---------------------------------------------------------------- update
    def test_update_object_status(self):
        """PATCH /api/v1/objects/{id}/ changes the status."""
        obj = Object.objects.create(
            name='Тестовый', address='Адрес', status='planned',
        )

        response = self.client.patch(
            _detail_url(obj.pk),
            {'status': 'in_progress'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'in_progress')
        obj.refresh_from_db()
        self.assertEqual(obj.status, 'in_progress')

    # ---------------------------------------------------------- upload photo
    def test_upload_photo(self):
        """PUT /api/v1/objects/{id}/upload-photo/ saves a valid image."""
        obj = Object.objects.create(name='Фото тест', address='Адрес')
        image = _create_test_image()

        response = self.client.put(
            _upload_photo_url(obj.pk),
            {'photo': image},
            format='multipart',
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        obj.refresh_from_db()
        self.assertTrue(obj.photo)
        self.assertIn('photo', response.data)

    def test_upload_photo_non_image(self):
        """PUT /api/v1/objects/{id}/upload-photo/ rejects non-image files."""
        obj = Object.objects.create(name='Non-image тест', address='Адрес')
        fake_file = SimpleUploadedFile(
            name='document.txt',
            content=b'plain text content',
            content_type='text/plain',
        )

        response = self.client.put(
            _upload_photo_url(obj.pk),
            {'photo': fake_file},
            format='multipart',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', response.data)

    def test_upload_photo_no_file(self):
        """PUT /api/v1/objects/{id}/upload-photo/ returns 400 without a file."""
        obj = Object.objects.create(name='Нет файла', address='Адрес')

        response = self.client.put(
            _upload_photo_url(obj.pk),
            {},
            format='multipart',
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', response.data)

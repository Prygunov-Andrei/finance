"""
Тесты для утилит импорта
"""
from django.contrib.auth.models import User
from django.test import TestCase
from .models import ImportLog
from .utils import (
    generate_import_batch_id,
    create_import_log,
    update_import_log_status,
)


class ImportUtilsTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )

    def test_generate_import_batch_id(self) -> None:
        """Тест генерации уникального идентификатора импорта"""
        batch_id1 = generate_import_batch_id()
        batch_id2 = generate_import_batch_id()
        
        self.assertTrue(batch_id1.startswith('IMPORT-'))
        self.assertTrue(batch_id2.startswith('IMPORT-'))
        self.assertNotEqual(batch_id1, batch_id2)
        self.assertIn('_', batch_id1)  # Должна быть дата с подчёркиванием

    def test_create_import_log(self) -> None:
        """Тест создания записи журнала импорта"""
        import_log = create_import_log(
            file_name='test.xlsx',
            file_type=ImportLog.FileType.PAYMENTS_ACTUAL,
            file_size=1024,
            file_path='/path/to/file.xlsx',
            user=self.user,
        )
        
        self.assertIsNotNone(import_log.import_batch_id)
        self.assertEqual(import_log.file_name, 'test.xlsx')
        self.assertEqual(import_log.file_type, ImportLog.FileType.PAYMENTS_ACTUAL)
        self.assertEqual(import_log.status, ImportLog.Status.PENDING)
        self.assertEqual(import_log.user, self.user)

    def test_create_import_log_with_custom_batch_id(self) -> None:
        """Тест создания записи с указанным идентификатором"""
        custom_id = 'CUSTOM-IMPORT-001'
        import_log = create_import_log(
            file_name='test.xlsx',
            file_type=ImportLog.FileType.PAYMENTS_ACTUAL,
            file_size=1024,
            import_batch_id=custom_id,
        )
        
        self.assertEqual(import_log.import_batch_id, custom_id)

    def test_create_import_log_without_user(self) -> None:
        """Тест создания записи без пользователя"""
        import_log = create_import_log(
            file_name='test.xlsx',
            file_type=ImportLog.FileType.PAYMENTS_ACTUAL,
            file_size=1024,
        )
        
        self.assertIsNone(import_log.user)
        self.assertIsNotNone(import_log.import_batch_id)

    def test_update_import_log_status(self) -> None:
        """Тест обновления статуса импорта"""
        import_log = create_import_log(
            file_name='test.xlsx',
            file_type=ImportLog.FileType.PAYMENTS_ACTUAL,
            file_size=1024,
        )
        
        updated_log = update_import_log_status(
            import_log,
            status=ImportLog.Status.SUCCESS,
            records_count=100,
            success_count=100,
            error_count=0,
        )
        
        self.assertEqual(updated_log.status, ImportLog.Status.SUCCESS)
        self.assertEqual(updated_log.records_count, 100)
        self.assertEqual(updated_log.success_count, 100)
        self.assertEqual(updated_log.error_count, 0)

    def test_update_import_log_status_with_errors(self) -> None:
        """Тест обновления статуса с ошибками"""
        import_log = create_import_log(
            file_name='test.xlsx',
            file_type=ImportLog.FileType.PAYMENTS_ACTUAL,
            file_size=1024,
        )
        
        error_message = 'Ошибка валидации в строке 5'
        updated_log = update_import_log_status(
            import_log,
            status=ImportLog.Status.PARTIAL,
            records_count=100,
            success_count=80,
            error_count=20,
            errors=error_message,
        )
        
        self.assertEqual(updated_log.status, ImportLog.Status.PARTIAL)
        self.assertEqual(updated_log.success_count, 80)
        self.assertEqual(updated_log.error_count, 20)
        self.assertEqual(updated_log.errors, error_message)


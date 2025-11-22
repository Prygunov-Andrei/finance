from django.contrib.auth.models import User
from django.test import TestCase
from django.utils import timezone
from .models import ImportLog


class ImportLogModelTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )

    def _create_import_log(self, **kwargs) -> ImportLog:
        defaults = {
            'import_batch_id': 'IMPORT-2024-001',
            'user': self.user,
            'file_name': 'payments_actual.xlsx',
            'file_type': ImportLog.FileType.PAYMENTS_ACTUAL,
            'file_size': 10240,
            'file_path': '/storage/raw/2024/payments_actual.xlsx',
            'status': ImportLog.Status.PENDING,
            'records_count': 100,
            'success_count': 0,
            'error_count': 0,
        }
        defaults.update(kwargs)
        return ImportLog.objects.create(**defaults)

    def test_create_import_log(self) -> None:
        """Тест создания записи журнала импорта"""
        import_log = self._create_import_log()
        self.assertEqual(ImportLog.objects.count(), 1)
        self.assertEqual(import_log.user, self.user)
        self.assertEqual(import_log.file_type, ImportLog.FileType.PAYMENTS_ACTUAL)
        self.assertEqual(import_log.status, ImportLog.Status.PENDING)

    def test_unique_import_batch_id(self) -> None:
        """Тест уникальности идентификатора импорта"""
        self._create_import_log()
        with self.assertRaises(Exception):  # IntegrityError
            self._create_import_log()

    def test_import_log_statuses(self) -> None:
        """Тест статусов импорта"""
        pending = self._create_import_log(status=ImportLog.Status.PENDING)
        success = self._create_import_log(
            import_batch_id='IMPORT-2024-002',
            status=ImportLog.Status.SUCCESS,
            success_count=100
        )
        failed = self._create_import_log(
            import_batch_id='IMPORT-2024-003',
            status=ImportLog.Status.FAILED,
            error_count=100
        )
        partial = self._create_import_log(
            import_batch_id='IMPORT-2024-004',
            status=ImportLog.Status.PARTIAL,
            success_count=80,
            error_count=20
        )

        self.assertEqual(pending.status, ImportLog.Status.PENDING)
        self.assertEqual(success.status, ImportLog.Status.SUCCESS)
        self.assertEqual(failed.status, ImportLog.Status.FAILED)
        self.assertEqual(partial.status, ImportLog.Status.PARTIAL)
        self.assertEqual(ImportLog.objects.count(), 4)

    def test_import_log_file_types(self) -> None:
        """Тест типов файлов"""
        payments_actual = self._create_import_log(
            file_type=ImportLog.FileType.PAYMENTS_ACTUAL
        )
        payments_plan = self._create_import_log(
            import_batch_id='IMPORT-2024-005',
            file_type=ImportLog.FileType.PAYMENTS_PLAN,
            file_name='payments_plan.xlsx'
        )
        incomes = self._create_import_log(
            import_batch_id='IMPORT-2024-006',
            file_type=ImportLog.FileType.INCOMES,
            file_name='incomes.xlsx'
        )
        balance = self._create_import_log(
            import_batch_id='IMPORT-2024-007',
            file_type=ImportLog.FileType.BALANCE,
            file_name='balance.xlsx'
        )

        self.assertEqual(payments_actual.file_type, ImportLog.FileType.PAYMENTS_ACTUAL)
        self.assertEqual(payments_plan.file_type, ImportLog.FileType.PAYMENTS_PLAN)
        self.assertEqual(incomes.file_type, ImportLog.FileType.INCOMES)
        self.assertEqual(balance.file_type, ImportLog.FileType.BALANCE)
        self.assertEqual(ImportLog.objects.count(), 4)

    def test_import_log_str_representation(self) -> None:
        """Тест строкового представления"""
        import_log = self._create_import_log()
        str_repr = str(import_log)
        self.assertIn('payments_actual.xlsx', str_repr)
        self.assertIn('Фактические платежи', str_repr)
        self.assertIn('В обработке', str_repr)

    def test_import_log_timestamps(self) -> None:
        """Тест автоматического заполнения временных меток"""
        import_log = self._create_import_log()
        self.assertIsNotNone(import_log.created_at)
        self.assertIsNotNone(import_log.updated_at)
        self.assertIsNotNone(import_log.import_date)

    def test_success_rate_property(self) -> None:
        """Тест вычисления процента успешных записей"""
        # Полностью успешный импорт
        success_log = self._create_import_log(
            import_batch_id='IMPORT-2024-008',
            records_count=100,
            success_count=100,
            error_count=0
        )
        self.assertEqual(success_log.success_rate, 100.0)

        # Частично успешный импорт
        partial_log = self._create_import_log(
            import_batch_id='IMPORT-2024-009',
            records_count=100,
            success_count=80,
            error_count=20
        )
        self.assertEqual(partial_log.success_rate, 80.0)

        # Неудачный импорт
        failed_log = self._create_import_log(
            import_batch_id='IMPORT-2024-010',
            records_count=100,
            success_count=0,
            error_count=100
        )
        self.assertEqual(failed_log.success_rate, 0.0)

        # Пустой импорт
        empty_log = self._create_import_log(
            import_batch_id='IMPORT-2024-011',
            records_count=0,
            success_count=0,
            error_count=0
        )
        self.assertEqual(empty_log.success_rate, 0.0)

    def test_import_log_without_user(self) -> None:
        """Тест импорта без указания пользователя"""
        import_log = self._create_import_log(
            import_batch_id='IMPORT-2024-012',
            user=None
        )
        self.assertIsNone(import_log.user)
        self.assertEqual(ImportLog.objects.count(), 1)

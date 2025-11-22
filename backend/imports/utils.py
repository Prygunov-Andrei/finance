"""
Утилиты для процессов импорта данных
"""
import uuid
from datetime import datetime
from typing import Optional
from django.contrib.auth.models import User
from .models import ImportLog


def generate_import_batch_id() -> str:
    """Генерирует уникальный идентификатор импорта"""
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    unique_id = str(uuid.uuid4())[:8].upper()
    return f'IMPORT-{timestamp}-{unique_id}'


def create_import_log(
    file_name: str,
    file_type: ImportLog.FileType,
    file_size: int,
    file_path: str = '',
    user: Optional[User] = None,
    import_batch_id: Optional[str] = None,
) -> ImportLog:
    """
    Создаёт запись в журнале импорта
    
    Args:
        file_name: Имя файла
        file_type: Тип файла
        file_size: Размер файла в байтах
        file_path: Путь к файлу
        user: Пользователь, выполняющий импорт
        import_batch_id: Идентификатор импорта (если не указан, генерируется автоматически)
    
    Returns:
        ImportLog: Созданная запись журнала
    """
    if import_batch_id is None:
        import_batch_id = generate_import_batch_id()
    
    return ImportLog.objects.create(
        import_batch_id=import_batch_id,
        user=user,
        file_name=file_name,
        file_type=file_type,
        file_size=file_size,
        file_path=file_path,
        status=ImportLog.Status.PENDING,
    )


def update_import_log_status(
    import_log: ImportLog,
    status: ImportLog.Status,
    records_count: int = 0,
    success_count: int = 0,
    error_count: int = 0,
    errors: str = '',
) -> ImportLog:
    """
    Обновляет статус и статистику импорта
    
    Args:
        import_log: Запись журнала импорта
        status: Новый статус
        records_count: Общее количество записей
        success_count: Количество успешно обработанных записей
        error_count: Количество ошибок
        errors: Описание ошибок
    
    Returns:
        ImportLog: Обновлённая запись журнала
    """
    import_log.status = status
    import_log.records_count = records_count
    import_log.success_count = success_count
    import_log.error_count = error_count
    if errors:
        import_log.errors = errors
    import_log.save()
    return import_log


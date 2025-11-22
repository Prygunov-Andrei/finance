"""
Базовые классы для парсеров файлов импорта
"""
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Tuple
from .models import ImportLog
from .validators import ValidationError


class BaseParser(ABC):
    """Базовый класс для парсеров файлов импорта"""
    
    def __init__(self, import_log: ImportLog):
        """
        Инициализация парсера
        
        Args:
            import_log: Запись журнала импорта
        """
        self.import_log = import_log
        self.errors: List[str] = []
        self.success_count = 0
        self.error_count = 0
    
    @abstractmethod
    def parse(self, file_path: str) -> Tuple[List[Dict[str, Any]], List[str]]:
        """
        Парсит файл и возвращает данные и ошибки
        
        Args:
            file_path: Путь к файлу
        
        Returns:
            Tuple[List[Dict[str, Any]], List[str]]: Список данных и список ошибок
        """
        pass
    
    @abstractmethod
    def validate_row(self, row: Dict[str, Any], row_number: int) -> Tuple[bool, List[str]]:
        """
        Валидирует строку данных
        
        Args:
            row: Словарь с данными строки
            row_number: Номер строки
        
        Returns:
            Tuple[bool, List[str]]: Успешность валидации и список ошибок
        """
        pass
    
    @abstractmethod
    def save_data(self, data: List[Dict[str, Any]]) -> int:
        """
        Сохраняет данные в базу
        
        Args:
            data: Список валидных данных
        
        Returns:
            int: Количество сохранённых записей
        """
        pass
    
    def process_file(self, file_path: str) -> Dict[str, Any]:
        """
        Обрабатывает файл: парсит, валидирует и сохраняет данные
        
        Args:
            file_path: Путь к файлу
        
        Returns:
            Dict[str, Any]: Результат обработки с статистикой
        """
        try:
            # Парсинг файла
            parsed_data, parse_errors = self.parse(file_path)
            self.errors.extend(parse_errors)
            
            if not parsed_data:
                self.import_log.status = ImportLog.Status.FAILED
                self.import_log.error_count = len(self.errors)
                self.import_log.errors = '\n'.join(self.errors)
                self.import_log.save()
                return {
                    'success': False,
                    'errors': self.errors,
                    'records_count': 0,
                    'success_count': 0,
                    'error_count': len(self.errors),
                }
            
            # Валидация данных
            valid_data = []
            for idx, row in enumerate(parsed_data, start=1):
                is_valid, validation_errors = self.validate_row(row, idx)
                if is_valid:
                    valid_data.append(row)
                else:
                    self.errors.extend(validation_errors)
                    self.error_count += 1
            
            # Сохранение данных
            if valid_data:
                saved_count = self.save_data(valid_data)
                self.success_count = saved_count
            else:
                self.success_count = 0
            
            # Обновление статуса импорта
            total_records = len(parsed_data)
            if self.error_count == 0:
                status = ImportLog.Status.SUCCESS
            elif self.success_count > 0:
                status = ImportLog.Status.PARTIAL
            else:
                status = ImportLog.Status.FAILED
            
            self.import_log.status = status
            self.import_log.records_count = total_records
            self.import_log.success_count = self.success_count
            self.import_log.error_count = self.error_count
            self.import_log.errors = '\n'.join(self.errors[:100])  # Ограничение длины
            self.import_log.save()
            
            return {
                'success': status != ImportLog.Status.FAILED,
                'status': status,
                'records_count': total_records,
                'success_count': self.success_count,
                'error_count': self.error_count,
                'errors': self.errors,
            }
            
        except Exception as e:
            error_message = f'Критическая ошибка при обработке файла: {str(e)}'
            self.errors.append(error_message)
            self.import_log.status = ImportLog.Status.FAILED
            self.import_log.error_count = len(self.errors)
            self.import_log.errors = '\n'.join(self.errors)
            self.import_log.save()
            
            return {
                'success': False,
                'errors': self.errors,
                'records_count': 0,
                'success_count': 0,
                'error_count': len(self.errors),
            }


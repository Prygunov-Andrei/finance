"""
Исключения для сервисов парсинга документов
"""


class RateLimitError(Exception):
    """Ошибка превышения лимита запросов к LLM API"""
    pass


class LLMServiceError(Exception):
    """Базовое исключение для ошибок LLM сервисов"""
    pass

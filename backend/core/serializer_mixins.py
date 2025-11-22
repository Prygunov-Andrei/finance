"""
Миксины для сериализаторов
"""
from rest_framework import serializers


class DisplayFieldMixin:
    """
    Миксин для добавления display полей (get_*_display) в сериализаторы
    """
    
    @staticmethod
    def get_display_field(field_name: str, source_method: str = None):
        """
        Создаёт поле для отображения значения choice поля
        
        Args:
            field_name: Имя поля (например, 'payment_type')
            source_method: Метод модели для получения display значения
                          (по умолчанию: get_{field_name}_display)
        
        Returns:
            CharField для отображения
        """
        if source_method is None:
            source_method = f'get_{field_name}_display'
        
        return serializers.CharField(
            source=source_method,
            read_only=True
        )


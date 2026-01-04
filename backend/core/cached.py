"""
Утилиты для кэширования вычисляемых свойств моделей.

Проблема:
    Стандартный @cached_property не сбрасывается при save() модели,
    что может привести к устаревшим данным.

Решение:
    1. CachedPropertyMixin — миксин, который сбрасывает все cached_property при save()
    2. invalidate_cached_properties() — функция для ручного сброса кэша

Использование:
    from core.cached import CachedPropertyMixin
    from functools import cached_property
    
    class MyModel(CachedPropertyMixin, models.Model):
        
        @cached_property
        def expensive_calculation(self):
            return self.related_objects.aggregate(...)
        
        def update_something(self):
            # Если нужно сбросить кэш вручную
            self.invalidate_cached_properties()
"""
from functools import cached_property
from typing import List


def get_cached_property_names(obj) -> List[str]:
    """
    Возвращает список имён всех cached_property объекта.
    """
    names = []
    for cls in type(obj).__mro__:
        for name, value in vars(cls).items():
            if isinstance(value, cached_property):
                names.append(name)
    return names


def invalidate_cached_properties(obj) -> None:
    """
    Сбрасывает все cached_property объекта.
    
    cached_property хранит результат в __dict__ объекта,
    поэтому для сброса достаточно удалить соответствующие ключи.
    """
    for name in get_cached_property_names(obj):
        if name in obj.__dict__:
            del obj.__dict__[name]


class CachedPropertyMixin:
    """
    Миксин для моделей с cached_property.
    
    Автоматически сбрасывает кэш при:
    - save()
    - refresh_from_db()
    
    Использование:
        class TechnicalProposal(CachedPropertyMixin, TimestampedModel):
            
            @cached_property
            def total_amount(self):
                return self.estimate_sections.aggregate(...)['total']
    """
    
    def save(self, *args, **kwargs):
        """Сбрасываем кэш перед сохранением"""
        invalidate_cached_properties(self)
        super().save(*args, **kwargs)
    
    def refresh_from_db(self, *args, **kwargs):
        """Сбрасываем кэш при обновлении из БД"""
        invalidate_cached_properties(self)
        super().refresh_from_db(*args, **kwargs)
    
    def invalidate_cached_properties(self) -> None:
        """Ручной сброс кэша"""
        invalidate_cached_properties(self)

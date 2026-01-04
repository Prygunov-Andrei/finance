from django.db import models
from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver
from typing import Optional, List, TYPE_CHECKING
from functools import cached_property

if TYPE_CHECKING:
    from django.db.models import QuerySet


class TimestampedModel(models.Model):
    """Абстрактная модель с полями created_at и updated_at"""
    
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name='Дата создания'
    )
    updated_at = models.DateTimeField(
        auto_now=True,
        verbose_name='Дата обновления'
    )

    class Meta:
        abstract = True


class VersionedModelMixin(models.Model):
    """
    Абстрактный миксин для моделей с версионированием.
    
    Добавляет поля:
        - parent_version: ссылка на предыдущую версию
        - version_number: номер версии (начиная с 1)
        - is_current: флаг актуальной версии
    
    Использование:
        class MyModel(VersionedModelMixin, TimestampedModel):
            # ... ваши поля ...
            
            parent_version = models.ForeignKey(
                'self',
                on_delete=models.SET_NULL,
                null=True,
                blank=True,
                related_name='child_versions',
                verbose_name='Предыдущая версия'
            )
    
    Примечание: Поле parent_version нужно объявлять в дочернем классе,
    так как Django не поддерживает ForeignKey('self') в абстрактных моделях.
    """
    
    version_number = models.PositiveIntegerField(
        default=1,
        verbose_name='Номер версии'
    )
    is_current = models.BooleanField(
        default=True,
        verbose_name='Актуальная версия'
    )
    
    class Meta:
        abstract = True
    
    def get_all_versions(self) -> List['VersionedModelMixin']:
        """
        Возвращает все версии объекта (включая текущую),
        отсортированные по номеру версии.
        """
        versions = []
        seen_ids = set()
        
        # Собираем родительские версии
        self._collect_parent_versions(versions, seen_ids)
        
        # Добавляем себя
        if self.pk not in seen_ids:
            versions.append(self)
            seen_ids.add(self.pk)
        
        # Собираем дочерние версии
        self._collect_child_versions(versions, seen_ids)
        
        # Сортируем по номеру версии
        versions.sort(key=lambda x: x.version_number)
        return versions
    
    def _collect_parent_versions(self, versions: list, seen_ids: set) -> None:
        """Рекурсивно собирает родительские версии"""
        parent = getattr(self, 'parent_version', None)
        if parent and parent.pk not in seen_ids:
            versions.append(parent)
            seen_ids.add(parent.pk)
            parent._collect_parent_versions(versions, seen_ids)
    
    def _collect_child_versions(self, versions: list, seen_ids: set) -> None:
        """Рекурсивно собирает дочерние версии"""
        children = getattr(self, 'child_versions', None)
        if children:
            for child in children.all():
                if child.pk not in seen_ids:
                    versions.append(child)
                    seen_ids.add(child.pk)
                    child._collect_child_versions(versions, seen_ids)
    
    def get_latest_version(self) -> 'VersionedModelMixin':
        """Возвращает последнюю (актуальную) версию объекта"""
        versions = self.get_all_versions()
        # Ищем версию с is_current=True или с максимальным version_number
        current = next((v for v in versions if v.is_current), None)
        return current or versions[-1] if versions else self
    
    def get_original_version(self) -> 'VersionedModelMixin':
        """Возвращает первую (оригинальную) версию объекта"""
        versions = self.get_all_versions()
        return versions[0] if versions else self
    
    def mark_as_outdated(self) -> None:
        """Помечает текущую версию как неактуальную"""
        self.is_current = False
        self.save(update_fields=['is_current'])
    
    def get_next_version_number(self) -> int:
        """Возвращает номер для следующей версии"""
        versions = self.get_all_versions()
        max_num = max(v.version_number for v in versions) if versions else 0
        return max_num + 1


def user_photo_upload_path(instance, filename):
    """Генерирует путь для загрузки фотографии пользователя"""
    ext = filename.split('.')[-1]
    filename = f'user_{instance.user.id}_photo.{ext}'
    return os.path.join('users', 'photos', filename)


class UserProfile(models.Model):
    """Профиль пользователя с дополнительными полями"""
    
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='profile',
        verbose_name='Пользователь'
    )
    photo = models.ImageField(
        upload_to=user_photo_upload_path,
        blank=True,
        null=True,
        verbose_name='Фотография'
    )

    class Meta:
        verbose_name = 'Профиль пользователя'
        verbose_name_plural = 'Профили пользователей'

    def __str__(self):
        return f'Профиль {self.user.username}'


@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    """Автоматически создаёт профиль при создании пользователя"""
    if created:
        UserProfile.objects.create(user=instance)


@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    """Автоматически сохраняет профиль при сохранении пользователя"""
    if hasattr(instance, 'profile'):
        instance.profile.save()


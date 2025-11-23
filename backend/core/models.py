from django.db import models
from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver
import os


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


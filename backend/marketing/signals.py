import logging

from django.db.models.signals import pre_save, post_save
from django.dispatch import receiver

from proposals.models import MountingProposal

logger = logging.getLogger(__name__)


@receiver(pre_save, sender=MountingProposal)
def _cache_mp_old_status(sender, instance, **kwargs):
    """Запоминаем старый статус для отслеживания перехода в published."""
    if instance.pk:
        try:
            instance._old_status = (
                sender.objects.values_list('status', flat=True).get(pk=instance.pk)
            )
        except sender.DoesNotExist:
            instance._old_status = None
    else:
        instance._old_status = None


@receiver(post_save, sender=MountingProposal)
def auto_publish_mp_to_avito(sender, instance, created, **kwargs):
    """Авто-публикация МП на Avito при смене статуса на published."""
    old_status = getattr(instance, '_old_status', None)
    if instance.status == MountingProposal.Status.PUBLISHED and old_status != 'published':
        from marketing.models import AvitoConfig

        config = AvitoConfig.get()
        if config.is_active and config.auto_publish_mp:
            from marketing.tasks import publish_mp_to_avito

            logger.info('Авто-публикация МП #%s на Avito', instance.pk)
            publish_mp_to_avito.delay(instance.pk)

"""
Сигналы для автоматического удаления файлов при удалении объектов.

Использование:
    В apps.py каждого приложения добавить импорт:
    
    def ready(self):
        from core.file_signals import register_file_cleanup
        from .models import MyModel
        register_file_cleanup(MyModel, ['file', 'scan_file'])
"""
from django.db.models.signals import post_delete, pre_save
from django.dispatch import receiver
from typing import List, Type
from django.db import models


def delete_file_if_exists(file_field):
    """Безопасно удаляет файл если он существует"""
    if file_field:
        try:
            # Не удаляем файл из storage если он используется другими объектами
            # (актуально для версионирования)
            file_field.delete(save=False)
        except Exception:
            # Игнорируем ошибки удаления (файл может не существовать)
            pass


def register_file_cleanup(model_class: Type[models.Model], file_fields: List[str]):
    """
    Регистрирует сигналы для автоматического удаления файлов.
    
    Args:
        model_class: Класс модели Django
        file_fields: Список имён полей с файлами
    
    Example:
        register_file_cleanup(Contract, ['file'])
        register_file_cleanup(Payment, ['scan_file'])
    """
    
    def cleanup_files_on_delete(sender, instance, **kwargs):
        """Удаляет файлы при удалении объекта"""
        for field_name in file_fields:
            file_field = getattr(instance, field_name, None)
            delete_file_if_exists(file_field)
    
    def cleanup_old_file_on_change(sender, instance, **kwargs):
        """Удаляет старый файл при замене на новый"""
        if not instance.pk:
            return
        
        try:
            old_instance = sender.objects.get(pk=instance.pk)
        except sender.DoesNotExist:
            return
        
        for field_name in file_fields:
            old_file = getattr(old_instance, field_name, None)
            new_file = getattr(instance, field_name, None)
            
            if old_file and old_file != new_file:
                delete_file_if_exists(old_file)
    
    # Регистрируем сигналы
    post_delete.connect(
        cleanup_files_on_delete,
        sender=model_class,
        weak=False,
        dispatch_uid=f'{model_class.__name__}_file_cleanup_delete'
    )
    
    pre_save.connect(
        cleanup_old_file_on_change,
        sender=model_class,
        weak=False,
        dispatch_uid=f'{model_class.__name__}_file_cleanup_change'
    )


# Список моделей с файлами для регистрации
# Вызывается из core/apps.py
def register_all_file_cleanups():
    """Регистрирует очистку файлов для всех моделей"""
    
    # contracts
    from contracts.models import Contract, ContractAmendment, Act, FrameworkContract
    register_file_cleanup(Contract, ['file'])
    register_file_cleanup(ContractAmendment, ['file'])
    register_file_cleanup(Act, ['file'])
    register_file_cleanup(FrameworkContract, ['file'])
    
    # payments
    from payments.models import Payment, PaymentRegistry
    register_file_cleanup(Payment, ['scan_file'])
    register_file_cleanup(PaymentRegistry, ['invoice_file'])
    
    # communications
    from communications.models import Correspondence
    register_file_cleanup(Correspondence, ['file'])
    
    # estimates
    from estimates.models import Project, Estimate, MountingEstimate
    register_file_cleanup(Project, ['file', 'production_approval_file'])
    register_file_cleanup(Estimate, ['file'])
    register_file_cleanup(MountingEstimate, ['file'])
    
    # proposals
    from proposals.models import TechnicalProposal, MountingProposal
    register_file_cleanup(TechnicalProposal, ['file'])
    register_file_cleanup(MountingProposal, ['file'])
    
    # llm_services
    from llm_services.models import ParsedDocument
    register_file_cleanup(ParsedDocument, ['file'])
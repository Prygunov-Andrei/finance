"""
Миксин для версионирования объектов в ViewSets.

Добавляет endpoints:
    - GET /api/<resource>/{id}/versions/ — список всех версий
    - POST /api/<resource>/{id}/create-version/ — создать новую версию

Требования к модели:
    - Поле parent_version (ForeignKey to self)
    - Поле version_number (PositiveIntegerField)
    - Поле is_current (BooleanField)
    - related_name='child_versions' на parent_version
    - Метод create_new_version() -> Model
"""
from typing import List, Set, Optional, Type, Any, TYPE_CHECKING
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.request import Request
from rest_framework import status as http_status
from django.db import models

if TYPE_CHECKING:
    from rest_framework.serializers import Serializer


class VersioningMixin:
    """
    Миксин для добавления функционала версионирования в ViewSet.
    
    Использование:
        class EstimateViewSet(VersioningMixin, viewsets.ModelViewSet):
            queryset = Estimate.objects.all()
            serializer_class = EstimateSerializer
            version_list_serializer_class = EstimateListSerializer  # опционально
    
    Attributes:
        version_list_serializer_class: Сериализатор для списка версий (опционально).
            Если не указан, используется стандартный serializer_class ViewSet.
    """
    
    version_list_serializer_class: Optional[Type['Serializer']] = None
    
    @action(detail=True, methods=['get'])
    def versions(self, request: Request, pk: Optional[str] = None) -> Response:
        """
        Возвращает список всех версий объекта.
        
        GET /api/<resource>/{id}/versions/
        
        Args:
            request: HTTP запрос
            pk: Первичный ключ объекта
        
        Returns:
            Response со списком версий, отсортированных по version_number
        """
        obj = self.get_object()
        versions = self._collect_all_versions(obj)
        
        # Сортировка по номеру версии
        versions.sort(key=lambda x: x.version_number)
        
        # Используем list сериализатор если указан, иначе стандартный
        serializer_class = self.version_list_serializer_class or self.get_serializer_class()
        serializer = serializer_class(versions, many=True, context={'request': request})
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'], url_path='create-version')
    def create_version(self, request: Request, pk: Optional[str] = None) -> Response:
        """
        Создаёт новую версию объекта.
        
        POST /api/<resource>/{id}/create-version/
        
        Args:
            request: HTTP запрос
            pk: Первичный ключ объекта
        
        Returns:
            Response с данными новой версии (201 Created)
        
        Raises:
            AttributeError: Если модель не имеет метода create_new_version()
        """
        obj = self.get_object()
        new_version = obj.create_new_version()
        serializer = self.get_serializer(new_version)
        return Response(serializer.data, status=http_status.HTTP_201_CREATED)
    
    def _collect_all_versions(self, obj: models.Model) -> List[models.Model]:
        """
        Собирает все версии объекта (родительские и дочерние).
        
        Args:
            obj: Исходный объект
        
        Returns:
            Список уникальных версий объекта
        """
        versions: List[models.Model] = [obj]
        seen_ids: Set[int] = {obj.pk}
        
        # Собираем родительские версии
        self._collect_parent_versions(obj, versions, seen_ids)
        
        # Собираем дочерние версии
        self._collect_child_versions(obj, versions, seen_ids)
        
        return versions
    
    def _collect_parent_versions(
        self,
        obj: models.Model,
        versions: List[models.Model],
        seen_ids: Set[int]
    ) -> None:
        """
        Итеративно собирает родительские версии.
        
        Args:
            obj: Текущий объект
            versions: Список для накопления версий (модифицируется in-place)
            seen_ids: Множество уже обработанных ID (модифицируется in-place)
        """
        parent = getattr(obj, 'parent_version', None)
        while parent and parent.pk not in seen_ids:
            versions.insert(0, parent)
            seen_ids.add(parent.pk)
            parent = getattr(parent, 'parent_version', None)
    
    def _collect_child_versions(
        self,
        obj: models.Model,
        versions: List[models.Model],
        seen_ids: Set[int]
    ) -> None:
        """
        Рекурсивно собирает дочерние версии.
        
        Args:
            obj: Текущий объект
            versions: Список для накопления версий (модифицируется in-place)
            seen_ids: Множество уже обработанных ID (модифицируется in-place)
        """
        child_versions_attr = getattr(obj, 'child_versions', None)
        if child_versions_attr is None:
            return
        
        for child in child_versions_attr.all():
            if child.pk not in seen_ids:
                versions.append(child)
                seen_ids.add(child.pk)
                self._collect_child_versions(child, versions, seen_ids)

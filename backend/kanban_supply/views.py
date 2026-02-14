from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from kanban_supply.models import SupplyCase, InvoiceRef, DeliveryBatch
from kanban_supply.serializers import SupplyCaseSerializer, InvoiceRefSerializer, DeliveryBatchSerializer
from kanban_service.permissions import RolePermission


class SupplyCaseViewSet(viewsets.ModelViewSet):
    queryset = SupplyCase.objects.select_related('card').all()
    serializer_class = SupplyCaseSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), RolePermission('supply_operator')]
        return super().get_permissions()


class InvoiceRefViewSet(viewsets.ModelViewSet):
    queryset = InvoiceRef.objects.select_related('supply_case').all()
    serializer_class = InvoiceRefSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), RolePermission('supply_operator')]
        return super().get_permissions()


class DeliveryBatchViewSet(viewsets.ModelViewSet):
    queryset = DeliveryBatch.objects.select_related('supply_case', 'invoice_ref').all()
    serializer_class = DeliveryBatchSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), RolePermission('supply_operator')]
        return super().get_permissions()


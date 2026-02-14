from decimal import Decimal

from django.db.models import Sum
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from kanban_service.permissions import RolePermission
from kanban_warehouse.models import StockLocation, StockMove, StockMoveLine
from kanban_warehouse.serializers import StockLocationSerializer, StockMoveSerializer


class StockLocationViewSet(viewsets.ModelViewSet):
    queryset = StockLocation.objects.all()
    serializer_class = StockLocationSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            return [IsAuthenticated(), RolePermission('warehouse')]
        return super().get_permissions()


class StockMoveViewSet(viewsets.ModelViewSet):
    queryset = StockMove.objects.select_related('from_location', 'to_location', 'card').prefetch_related('lines').all()
    serializer_class = StockMoveSerializer
    permission_classes = [IsAuthenticated, RolePermission.required('warehouse')]

    @action(detail=False, methods=['get'])
    def balances(self, request):
        """
        Расчет остатков по ledger.
        Query params:
          location_id (optional)
        """
        location_id = request.query_params.get('location_id')
        qs = StockMoveLine.objects.select_related('move')

        if location_id:
            qs = qs.filter(
                move__from_location_id=location_id
            ) | qs.filter(
                move__to_location_id=location_id
            )

        # Баланс считаем как:
        # - IN: +qty в to_location
        # - OUT: -qty из from_location
        # - ADJUST: если to_location задана — +qty в неё, если from_location — -qty из неё (allow both)
        # Для простоты V1: агрегируем отдельно in/out на указанную локацию.

        balances = {}

        def add(pid, name, unit, delta):
            key = (pid, name, unit)
            balances[key] = balances.get(key, Decimal('0')) + delta

        for line in qs:
            move = line.move
            pid = line.erp_product_id
            name = line.product_name
            unit = line.unit
            qty = Decimal(line.qty)

            if location_id:
                if move.to_location_id and str(move.to_location_id) == str(location_id):
                    add(pid, name, unit, qty)
                if move.from_location_id and str(move.from_location_id) == str(location_id):
                    add(pid, name, unit, -qty)
            else:
                # Если локация не указана — return error, т.к. V1 UI всегда смотрит конкретную локацию.
                return Response({'error': 'location_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        result = []
        for (pid, name, unit), qty in balances.items():
            result.append({
                'erp_product_id': pid,
                'product_name': name,
                'unit': unit,
                'qty': str(qty),
                'ahhtung': qty < 0,
            })

        result.sort(key=lambda x: (x['product_name'] or ''))
        return Response({'results': result})


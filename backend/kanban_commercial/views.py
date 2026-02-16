from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from kanban_commercial.models import CommercialCase
from kanban_commercial.serializers import CommercialCaseSerializer


class CommercialCaseViewSet(viewsets.ModelViewSet):
    queryset = CommercialCase.objects.select_related('card').all()
    serializer_class = CommercialCaseSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        card_id = self.request.query_params.get('card')
        if card_id:
            qs = qs.filter(card_id=card_id)
        return qs

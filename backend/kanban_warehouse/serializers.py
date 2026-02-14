from rest_framework import serializers

from kanban_warehouse.models import StockLocation, StockMove, StockMoveLine


class StockLocationSerializer(serializers.ModelSerializer):
    erp_object_id = serializers.IntegerField(required=False, allow_null=True)

    class Meta:
        model = StockLocation
        fields = ['id', 'kind', 'title', 'erp_object_id', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']
        validators = []  # уникальность/required контролируем вручную, иначе DRF требует erp_object_id всегда

    def validate(self, attrs):
        kind = attrs.get('kind') or getattr(self.instance, 'kind', None)
        erp_object_id = attrs.get('erp_object_id') if 'erp_object_id' in attrs else getattr(self.instance, 'erp_object_id', None)

        if kind == StockLocation.Kind.OBJECT and not erp_object_id:
            raise serializers.ValidationError({'erp_object_id': 'Обязательное поле для kind=object'})
        if kind == StockLocation.Kind.WAREHOUSE:
            attrs['erp_object_id'] = None
        return attrs


class StockMoveLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = StockMoveLine
        fields = ['id', 'erp_product_id', 'product_name', 'unit', 'qty']
        read_only_fields = ['id']


class StockMoveSerializer(serializers.ModelSerializer):
    lines = StockMoveLineSerializer(many=True)

    class Meta:
        model = StockMove
        fields = [
            'id', 'move_type',
            'from_location', 'to_location',
            'card', 'delivery_batch_id',
            'reason',
            'lines',
            'created_by_user_id', 'created_by_username',
            'created_at',
        ]
        read_only_fields = ['id', 'created_by_user_id', 'created_by_username', 'created_at']

    def create(self, validated_data):
        lines = validated_data.pop('lines', [])
        request = self.context.get('request')
        actor = getattr(request, 'user', None)

        move = StockMove.objects.create(
            **validated_data,
            created_by_user_id=getattr(actor, 'user_id', None),
            created_by_username=getattr(actor, 'username', '') or '',
        )
        for line in lines:
            StockMoveLine.objects.create(move=move, **line)
        return move


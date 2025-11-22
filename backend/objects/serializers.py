from rest_framework import serializers
from .models import Object


class ObjectSerializer(serializers.ModelSerializer):
    """Сериализатор для модели Object"""
    
    class Meta:
        model = Object
        fields = [
            'id',
            'name',
            'address',
            'description',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class ObjectListSerializer(serializers.ModelSerializer):
    """Упрощённый сериализатор для списка объектов"""
    
    contracts_count = serializers.IntegerField(read_only=True)
    
    class Meta:
        model = Object
        fields = [
            'id',
            'name',
            'address',
            'contracts_count',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']


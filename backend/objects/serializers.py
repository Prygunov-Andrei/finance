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
            'start_date',
            'end_date',
            'status',
            'photo',
            'latitude',
            'longitude',
            'geo_radius',
            'allow_geo_bypass',
            'registration_window_minutes',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'photo']


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
            'start_date',
            'end_date',
            'status',
            'photo',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']


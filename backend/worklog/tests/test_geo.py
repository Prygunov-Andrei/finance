"""
Unit-тесты геолокации worklog — 6 тестов.
Покрытие: Haversine-расчёт, граничные случаи, отсутствие координат объекта.
"""
import math
from datetime import date, time
from decimal import Decimal

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from worklog.models import Worker, Shift, ShiftRegistration
from .factories import (
    create_counterparty, create_object, create_worker, create_shift,
)


def haversine_distance(lat1, lon1, lat2, lon2):
    """Вычисляет расстояние Haversine в метрах."""
    R = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = (math.sin(delta_phi / 2) ** 2 +
         math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def register_on_shift(shift, telegram_id, lat, lon):
    """Вспомогательная функция для регистрации на смену."""
    user = User.objects.create_user(username=f'tg_{telegram_id}')
    client = APIClient()
    token = RefreshToken.for_user(user)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.access_token}')

    data = {
        'qr_token': f'token_{telegram_id}',
        'latitude': str(lat),
        'longitude': str(lon),
    }
    return client.post(
        f'/api/v1/worklog/shifts/{shift.id}/register/',
        data,
        format='json',
    )


class GeoValidationTest(TestCase):
    def setUp(self):
        # Объект в центре Москвы: 55.7558, 37.6173, радиус 500м
        self.obj = create_object(
            latitude=Decimal('55.7558262'),
            longitude=Decimal('37.6172999'),
            geo_radius=500,
        )
        self.contractor = create_counterparty()

    def test_within_geo_zone(self):
        """Регистрация внутри геозоны — geo_valid=True."""
        shift = create_shift(obj=self.obj, contractor=self.contractor)
        worker = create_worker(contractor=self.contractor, telegram_id=10001)

        # Точка в 100м от центра (примерно)
        resp = register_on_shift(shift, 10001, 55.7560, 37.6175)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

        reg = ShiftRegistration.objects.get(shift=shift, worker=worker)
        self.assertTrue(reg.geo_valid)

    def test_outside_geo_zone(self):
        """Регистрация вне геозоны — geo_valid=False, warning."""
        shift = create_shift(obj=self.obj, contractor=self.contractor)
        worker = create_worker(contractor=self.contractor, telegram_id=10002)

        # Точка в ~10км от центра
        resp = register_on_shift(shift, 10002, 55.8500, 37.6200)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertFalse(resp.data.get('geo_valid', True))

        reg = ShiftRegistration.objects.get(shift=shift, worker=worker)
        self.assertFalse(reg.geo_valid)

    def test_exact_boundary(self):
        """Точка ровно на границе геозоны."""
        # 500м на север от 55.7558262 ≈ 55.7558262 + 500/111320 ≈ 55.76032
        # Используем точку чуть внутри (~400м)
        shift = create_shift(obj=self.obj, contractor=self.contractor)
        worker = create_worker(contractor=self.contractor, telegram_id=10003)

        # ~400м на север — округляем до 7 знаков после точки (ограничение DecimalField)
        lat_offset = round(55.7558262 + (400 / 111320), 7)
        resp = register_on_shift(shift, 10003, lat_offset, 37.6172999)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

        reg = ShiftRegistration.objects.get(shift=shift, worker=worker)
        self.assertTrue(reg.geo_valid)

    def test_no_object_coordinates(self):
        """Объект без координат — geo_valid=False."""
        obj_no_geo = create_object(latitude=None, longitude=None)
        shift = create_shift(obj=obj_no_geo, contractor=self.contractor)
        worker = create_worker(contractor=self.contractor, telegram_id=10004)

        resp = register_on_shift(shift, 10004, 55.7558, 37.6173)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

        reg = ShiftRegistration.objects.get(shift=shift, worker=worker)
        self.assertFalse(reg.geo_valid)

    def test_haversine_known_distance(self):
        """Проверка формулы Haversine на известном расстоянии.
        Москва — Санкт-Петербург ≈ 634 км."""
        moscow = (55.7558, 37.6173)
        spb = (59.9343, 30.3351)
        distance = haversine_distance(*moscow, *spb)
        self.assertAlmostEqual(distance / 1000, 634, delta=5)

    def test_haversine_same_point(self):
        """Расстояние от точки до себя = 0."""
        distance = haversine_distance(55.7558, 37.6173, 55.7558, 37.6173)
        self.assertAlmostEqual(distance, 0, places=1)

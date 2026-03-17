"""
Admin API для операторов ERP — управление порталом смет.

Все эндпоинты требуют JWT-аутентификации.
Подключаются под /api/v1/portal/.
"""
from django.urls import path

from . import admin_views

urlpatterns = [
    # Запросы смет
    path('requests/', admin_views.request_list, name='portal-request-list'),
    path('requests/<int:pk>/', admin_views.request_detail, name='portal-request-detail'),
    path('requests/<int:pk>/approve/', admin_views.request_approve, name='portal-request-approve'),
    path('requests/<int:pk>/reject/', admin_views.request_reject, name='portal-request-reject'),

    # Настройки
    path('config/', admin_views.portal_config, name='portal-config'),
    path('pricing/', admin_views.pricing_config_list, name='portal-pricing-list'),
    path('pricing/<int:pk>/', admin_views.pricing_config_detail, name='portal-pricing-detail'),

    # Заявки на звонок
    path('callbacks/', admin_views.callback_list, name='portal-callback-list'),
    path('callbacks/<int:pk>/', admin_views.callback_update_status, name='portal-callback-update'),

    # Статистика
    path('stats/', admin_views.portal_stats, name='portal-stats'),
]

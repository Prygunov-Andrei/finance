"""
Публичное API v1 — портал расчёта смет.

Все эндпоинты не требуют JWT-аутентификации.
Доступ к запросам — по access_token в URL.
"""
from django.urls import path

from . import views

app_name = 'api_public'

urlpatterns = [
    # OTP-верификация email
    path('verify-email/', views.verify_email_send, name='verify-email-send'),
    path('verify-email/confirm/', views.verify_email_confirm, name='verify-email-confirm'),

    # Запросы смет
    path('estimate-requests/', views.create_estimate_request, name='create-estimate-request'),
    path(
        'estimate-requests/<str:access_token>/',
        views.estimate_request_detail,
        name='estimate-request-detail',
    ),
    path(
        'estimate-requests/<str:access_token>/status/',
        views.estimate_request_status,
        name='estimate-request-status',
    ),
    path(
        'estimate-requests/<str:access_token>/download/',
        views.estimate_request_download,
        name='estimate-request-download',
    ),
    path(
        'estimate-requests/<str:access_token>/callback/',
        views.estimate_request_callback,
        name='estimate-request-callback',
    ),

    # Work Matching
    path(
        'estimate-requests/<str:access_token>/match-works/',
        views.public_start_work_matching,
        name='public-start-work-matching',
    ),
    path(
        'estimate-requests/<str:access_token>/match-progress/<str:session_id>/',
        views.public_work_matching_progress,
        name='public-work-matching-progress',
    ),
    path(
        'estimate-requests/<str:access_token>/apply-works/',
        views.public_apply_work_matching,
        name='public-apply-work-matching',
    ),
]

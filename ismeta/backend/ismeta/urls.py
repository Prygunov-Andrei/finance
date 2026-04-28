"""Корневые URL ISMeta.

Эндпоинты наполняются по мере реализации эпиков.
Health-check по трём уровням — см. docs/SLO.md §7.1.
"""

from django.contrib import admin
from django.db import connection
from django.http import JsonResponse
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView


def health_liveness(_request):
    """Процесс жив. Не проверяет зависимости."""
    return JsonResponse({"status": "ok", "service": "ismeta"})


def health_readiness(_request):
    """Готов обслуживать запросы? Проверяет БД и Redis."""
    checks = {"db": False, "redis": False}
    status_code = 200

    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        checks["db"] = True
    except Exception:
        status_code = 503

    try:
        import redis
        from django.conf import settings

        r = redis.from_url(settings.CELERY_BROKER_URL)
        r.ping()
        checks["redis"] = True
    except Exception:
        status_code = 503

    return JsonResponse(
        {"status": "ok" if status_code == 200 else "degraded", "checks": checks}, status=status_code
    )


def health_deps(_request):
    """Расширенная проверка всех зависимостей. Может быть медленной, не для k8s readiness probe."""
    import httpx
    from django.conf import settings

    deps = {}

    # DB
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT version()")
            deps["db"] = {"status": "ok", "info": cursor.fetchone()[0][:50]}
    except Exception as e:
        deps["db"] = {"status": "error", "error": str(e)[:200]}

    # Redis
    try:
        import redis

        r = redis.from_url(settings.CELERY_BROKER_URL)
        deps["redis"] = {"status": "ok", "info": f"ping={r.ping()}"}
    except Exception as e:
        deps["redis"] = {"status": "error", "error": str(e)[:200]}

    # ERP catalog
    try:
        with httpx.Client(timeout=2.0) as client:
            resp = client.get(f"{settings.ISMETA_ERP_BASE_URL}/api/erp-catalog/v1/health")
            deps["erp_catalog"] = {
                "status": "ok" if resp.status_code == 200 else "degraded",
                "http_status": resp.status_code,
            }
    except Exception as e:
        deps["erp_catalog"] = {"status": "error", "error": str(e)[:200]}

    overall = "ok" if all(d.get("status") == "ok" for d in deps.values()) else "degraded"
    return JsonResponse({"status": overall, "deps": deps}, status=200 if overall == "ok" else 503)


urlpatterns = [
    path("admin/", admin.site.urls),
    # Health-checks — см. docs/SLO.md
    path("health", health_liveness, name="health-liveness-short"),
    path("api/v1/health", health_liveness, name="health-liveness"),
    path("api/v1/health/ready", health_readiness, name="health-readiness"),
    path("api/v1/health/deps", health_deps, name="health-deps"),
    # OpenAPI schema + UI
    path("api/v1/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/v1/schema/swagger/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger"
    ),
    # ISMeta endpoints
    path("api/v1/", include("apps.estimate.urls")),
    path("api/v1/", include("apps.agent.urls")),
    path("api/v1/", include("apps.integration.urls")),
    path("api/v1/", include("apps.recognition_jobs.urls")),
    path("api/v1/", include("apps.llm_profiles.urls")),
    # path("api/v1/workspaces/", include("apps.workspace.urls")),
]

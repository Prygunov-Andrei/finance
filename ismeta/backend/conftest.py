"""Корневой conftest для pytest-django."""

import django
from django.conf import settings

# pytest-django ожидает DJANGO_SETTINGS_MODULE
django_settings_module = "ismeta.settings"


def pytest_configure(config):
    settings.DJANGO_SETTINGS_MODULE = django_settings_module
    django.setup()

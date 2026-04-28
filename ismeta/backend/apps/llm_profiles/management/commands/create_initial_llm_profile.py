"""Создаёт начальный LLMProfile из env vars (E18-2).

Используется при первом setup'е ismeta — чтобы UI не показывал пустой
список и существующий PDF-импорт продолжал работать с теми же defaults
(до миграции на профили api_key брался из LLM_API_KEY/OPENAI_API_KEY env).

Idempotent: если профиль с заданным name уже есть — ничего не делает.
Если LLM_API_KEY (или fallback OPENAI_API_KEY) не задан — выходит с
warning'ом, не падает.

Usage:
    python manage.py create_initial_llm_profile
    python manage.py create_initial_llm_profile --name "Custom" --extract-model gpt-4o
"""

from __future__ import annotations

import os

from django.core.management.base import BaseCommand

from apps.llm_profiles.models import LLMProfile


class Command(BaseCommand):
    help = "Создать default LLMProfile из env vars если его ещё нет."

    def add_arguments(self, parser):
        parser.add_argument(
            "--name", default="Default", help="Имя профиля (default: Default)"
        )
        parser.add_argument("--base-url", default=None)
        parser.add_argument("--extract-model", default=None)
        parser.add_argument("--multimodal-model", default=None)
        parser.add_argument("--classify-model", default=None)
        parser.add_argument("--vision-supported", default=None)

    def handle(self, *args, **opts):
        name = opts["name"]
        api_key = os.environ.get("LLM_API_KEY") or os.environ.get("OPENAI_API_KEY") or ""
        if not api_key:
            self.stdout.write(
                self.style.WARNING(
                    "LLM_API_KEY/OPENAI_API_KEY не задан — initial profile не создан. "
                    "Создайте профиль через UI /settings/llm."
                )
            )
            return

        if LLMProfile.objects.filter(name=name).exists():
            self.stdout.write(
                self.style.NOTICE(f"Профиль {name!r} уже существует — пропуск.")
            )
            return

        base_url = opts["base_url"] or os.environ.get(
            "OPENAI_API_BASE", "https://api.openai.com"
        )
        extract = opts["extract_model"] or os.environ.get(
            "LLM_EXTRACT_MODEL", "gpt-4o-mini"
        )
        multimodal = opts["multimodal_model"] or os.environ.get(
            "LLM_MULTIMODAL_MODEL", ""
        )
        classify = opts["classify_model"] or os.environ.get(
            "LLM_CLASSIFY_MODEL", ""
        )
        vision_raw = opts["vision_supported"]
        if vision_raw is None:
            vision_raw = os.environ.get("LLM_VISION_COUNTER_ENABLED", "true")
        vision = str(vision_raw).strip().lower() in ("true", "1", "yes", "on")

        is_default = not LLMProfile.objects.exists()
        profile = LLMProfile(
            name=name,
            base_url=base_url,
            extract_model=extract,
            multimodal_model=multimodal,
            classify_model=classify,
            vision_supported=vision,
            is_default=is_default,
        )
        profile.set_api_key(api_key)
        profile.save()
        self.stdout.write(
            self.style.SUCCESS(
                f"Создан LLMProfile id={profile.id} name={profile.name!r} "
                f"base_url={base_url} extract={extract} default={is_default}"
            )
        )

"""Wave 13: переименовать картинки новостей в SEO-friendly semantic slug'и через LLM.

После Wave 11 файлы автоматически транслитерируются (``snimok_ehkrana_*.png``).
PO попросил семантические имена («novyi-kompressor-danfoss.jpg») для лучшего
ранжирования в Google/Яндекс Images.

Запуск:
    python manage.py semantic_rename_images                       # dry-run
    python manage.py semantic_rename_images --execute             # реально (после backup!)
    python manage.py semantic_rename_images --post-id 5346        # только один пост (для теста)
    python manage.py semantic_rename_images --limit 10            # первые N постов (по pub_date desc)
    python manage.py semantic_rename_images --force               # переименовывать даже выглядящие semantic
    python manage.py semantic_rename_images --only-published      # только status='published'
    python manage.py semantic_rename_images --sleep 0.5           # пауза между LLM вызовами

⚠ ПЕРЕД --execute на проде: backup БД (pg_dump) + media volume tar.
"""
from __future__ import annotations

import os
import time

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand, CommandError

from news.models import NewsPost
from news.services_semantic_naming import (
    HTML_FIELDS_DUP_GROUP,
    HTML_FIELDS_POST,
    collect_post_images,
    generate_slug,
    is_auto_generated_basename,
    make_llm_client,
    plan_new_storage_name,
    replace_basename_in_html,
)


_PROVIDER_KEY_SETTING = {
    "gemini": "GEMINI_API_KEY",
    "grok": "XAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "openai": "TRANSLATION_API_KEY",
}


class Command(BaseCommand):
    help = (
        "Wave 13: переименовать картинки новостей в SEO-friendly semantic slug'и "
        "через Gemini. Без --execute — dry-run."
    )

    def add_arguments(self, parser):
        parser.add_argument("--execute", action="store_true",
                            help="Реально переименовывать (без флага — dry-run).")
        parser.add_argument("--post-id", type=int, dest="post_id",
                            help="Обработать только один NewsPost (для теста).")
        parser.add_argument("--limit", type=int,
                            help="Лимит количества обрабатываемых постов (по pub_date desc).")
        parser.add_argument("--force", action="store_true",
                            help="Переименовывать даже файлы с уже-семантическими basename.")
        parser.add_argument("--only-published", action="store_true",
                            help="Только новости со status='published'.")
        parser.add_argument("--sleep", type=float, default=0.4,
                            help="Пауза между LLM-вызовами в секундах (default: 0.4).")
        parser.add_argument("--gemini-model", type=str, default="gemini-2.0-flash-exp",
                            help="Модель Gemini (default: gemini-2.0-flash-exp).")
        parser.add_argument("--provider", type=str, default="gemini",
                            choices=list(_PROVIDER_KEY_SETTING.keys()),
                            help=("LLM-провайдер (default: gemini — выбор PO для Wave 13). "
                                  "Если GEMINI_API_KEY ещё не добавлен — можно временно "
                                  "сделать dry-run на grok для демо."))
        parser.add_argument("--llm-model", type=str, default=None,
                            help="Override модели LLM (default — defaults NewsLLMClient).")

    # ------------------------------------------------------------------
    def handle(self, *args, **opts):
        execute: bool = opts["execute"]
        post_id: int | None = opts.get("post_id")
        limit: int | None = opts.get("limit")
        force: bool = opts["force"]
        only_published: bool = opts["only_published"]
        sleep_sec: float = opts["sleep"]
        provider: str = opts["provider"]
        llm_model: str | None = opts["llm_model"] or (
            opts["gemini_model"] if provider == "gemini" else None
        )

        if not execute:
            self.stdout.write(self.style.WARNING(
                "DRY RUN — без --execute файлы не переименовываются и БД не меняется"
            ))

        from django.conf import settings as dj_settings  # noqa
        key_setting = _PROVIDER_KEY_SETTING[provider]
        if not getattr(dj_settings, key_setting, ""):
            raise CommandError(
                f"{key_setting} не задан в settings/env. Без него LLM не сработает. "
                f"Можно сменить провайдера: --provider grok|anthropic|openai."
            )
        self.stdout.write(f"LLM provider: {provider}" + (f" ({llm_model})" if llm_model else ""))

        client = make_llm_client(provider=provider, model=llm_model)

        qs = NewsPost.objects.all().order_by("-pub_date")
        if only_published:
            qs = qs.filter(status="published")
        if post_id:
            qs = qs.filter(id=post_id)
        if limit:
            qs = qs[:limit]

        stats = {
            "posts_seen": 0,
            "images_seen": 0,
            "renamed": 0,
            "skipped_already_semantic": 0,
            "skipped_already_renamed": 0,
            "skipped_missing_file": 0,
            "llm_failed": 0,
            "html_replacements": 0,
        }
        # storage_name -> new_storage_name (за весь run, для дедупликации
        # между постами одной duplicate_group и при шаринге картинок).
        rename_map: dict[str, str] = {}
        # Имена, которые уже зарезервированы под new_path в этом run
        # (но физически файл ещё не создан — для коллизий внутри dry-run).
        planned_paths: set[str] = set()
        # storage_name'ы для которых rename файла на диске уже выполнен в этом
        # запуске команды. Нужен чтобы при шаринге картинок между постами
        # (одна и та же storage_name приходит дважды) мы не пытались дважды
        # копировать файл. Локально к запуску, чтобы не было stale state
        # между call_command() вызовами в тестах.
        executed_renames: set[str] = set()

        for post in qs.iterator():
            stats["posts_seen"] += 1
            refs = collect_post_images(post)
            if not refs:
                continue

            self.stdout.write(
                f"\n— NewsPost id={post.id} «{(post.title or '')[:60]}» "
                f"({len(refs)} картинок)"
            )

            post_html_changes: dict[str, str] = {}
            group_html_changes: dict[str, str] = {}

            for ref in refs:
                stats["images_seen"] += 1
                old_basename = os.path.basename(ref.storage_name)

                # 1. Уже переименовано в этом run-е — берём из rename_map.
                if ref.storage_name in rename_map:
                    new_storage = rename_map[ref.storage_name]
                    stats["skipped_already_renamed"] += 1
                else:
                    # 2. basename уже семантический — пропускаем (если не --force).
                    if not force and not is_auto_generated_basename(old_basename):
                        self.stdout.write(
                            f"  · skip already-semantic: {old_basename}"
                        )
                        stats["skipped_already_semantic"] += 1
                        continue

                    # 3. Запрашиваем slug у LLM.
                    slug = generate_slug(post, ref, client)
                    if sleep_sec:
                        time.sleep(sleep_sec)
                    if not slug:
                        self.stdout.write(self.style.WARNING(
                            f"  · LLM-fail: {old_basename} — пропускаем"
                        ))
                        stats["llm_failed"] += 1
                        continue

                    new_storage = plan_new_storage_name(
                        ref.storage_name, slug, default_storage,
                        extra_taken=planned_paths,
                    )
                    new_basename = os.path.basename(new_storage)
                    if new_storage == ref.storage_name:
                        self.stdout.write(
                            f"  · slug совпал с текущим: {old_basename}"
                        )
                        stats["skipped_already_semantic"] += 1
                        continue

                    self.stdout.write(
                        f"  · {old_basename} → {new_basename}"
                    )

                    rename_map[ref.storage_name] = new_storage
                    planned_paths.add(new_storage)

                # 4. Файл-операции (только в --execute).
                if execute and ref.storage_name not in executed_renames:
                    if default_storage.exists(ref.storage_name):
                        with default_storage.open(ref.storage_name, "rb") as src:
                            data = src.read()
                        actual = default_storage.save(new_storage, ContentFile(data))
                        if actual != new_storage:
                            # FileSystemStorage добавил суффикс — TOCTOU race
                            # между exists() и save(). Перепланируем.
                            new_storage = actual
                            rename_map[ref.storage_name] = new_storage
                        default_storage.delete(ref.storage_name)
                        stats["renamed"] += 1
                        executed_renames.add(ref.storage_name)
                    else:
                        self.stdout.write(self.style.WARNING(
                            f"    ! файл на диске не найден: {ref.storage_name}"
                        ))
                        stats["skipped_missing_file"] += 1
                        # rename_map уже хранит замену — обновим только БД/HTML.
                # Пересчитываем new_basename ПОСЛЕ возможной TOCTOU-перепланировки.
                new_basename = os.path.basename(new_storage)

                # 5. Обновляем file поле у всех владельцев (NewsMedia, MediaUpload).
                if execute:
                    for owner in ref.file_field_owners:
                        if owner.file and owner.file.name == ref.storage_name:
                            owner.file.name = new_storage
                            owner.save(update_fields=["file"])

                # 6. Планируем замены basename в HTML.
                for field_name in HTML_FIELDS_POST:
                    current = post_html_changes.get(
                        field_name, getattr(post, field_name, "") or ""
                    )
                    new_html, n = replace_basename_in_html(
                        current, os.path.basename(ref.storage_name), new_basename
                    )
                    if n > 0:
                        post_html_changes[field_name] = new_html
                        stats["html_replacements"] += n

                if post.duplicate_group_id:
                    group = post.duplicate_group
                    for field_name in HTML_FIELDS_DUP_GROUP:
                        current = group_html_changes.get(
                            field_name, getattr(group, field_name, "") or ""
                        )
                        new_html, n = replace_basename_in_html(
                            current, os.path.basename(ref.storage_name), new_basename
                        )
                        if n > 0:
                            group_html_changes[field_name] = new_html
                            stats["html_replacements"] += n

            # Сохраняем накопленные HTML-изменения одним save() на пост/группу.
            if execute and post_html_changes:
                for f, v in post_html_changes.items():
                    setattr(post, f, v)
                post.save(update_fields=list(post_html_changes.keys()))
            if execute and group_html_changes:
                group = post.duplicate_group
                for f, v in group_html_changes.items():
                    setattr(group, f, v)
                group.save(update_fields=list(group_html_changes.keys()))

        self.stdout.write(self.style.SUCCESS(
            "\n=== ИТОГО ===\n"
            f"  Постов просмотрено:        {stats['posts_seen']}\n"
            f"  Картинок встретили:        {stats['images_seen']}\n"
            f"  Уже семантических (skip):  {stats['skipped_already_semantic']}\n"
            f"  Уже переимен. в этом run:  {stats['skipped_already_renamed']}\n"
            f"  LLM-fail (skip):           {stats['llm_failed']}\n"
            f"  Файлов на диске не было:   {stats['skipped_missing_file']}\n"
            f"  Файлов переименовано:      {stats['renamed']}\n"
            f"  HTML-замен (basename):     {stats['html_replacements']}\n"
        ))
        if not execute:
            self.stdout.write(
                "Это был dry-run. Для реального переименования: --execute "
                "(и сделай backup БД и media заранее)."
            )



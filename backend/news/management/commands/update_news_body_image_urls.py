"""Wave 11 critical hotfix: после rename_legacy_filenames переименовали
файлы на диске (Wave 10.3 + 11), но inline `<img src=...>` внутри
NewsPost.body / lede / merged_body / rating_explanation остались с
кириллическими именами → 115+ ошибок 404 на главной.

Эта команда проходит по всем NewsPost, regex-replace inline image URLs
со старыми кириллическими именами на slugified эквивалент.

Запуск:
    python manage.py update_news_body_image_urls               # dry-run
    python manage.py update_news_body_image_urls --execute     # реально
"""
from __future__ import annotations

import os
import re
from urllib.parse import unquote

from django.core.management.base import BaseCommand

from core.file_utils import slugify_filename
from news.models import NewsPost


# Поля NewsPost которые могут содержать inline <img src=...>.
HTML_FIELDS = ("body", "lede", "merged_body", "rating_explanation")

# URL-prefixы откуда могут грузиться inline-картинки на проде.
URL_PREFIXES = ("/media/", "/hvac-media/")

# Регулярка: src URL внутри атрибута. Захватывает src в одинарных или двойных
# кавычках. Расширения ограничиваем чтобы не зацепить случайно non-image.
SRC_PATTERN = re.compile(
    r'(?P<attr>src\s*=\s*)(?P<quote>["\'])'
    r'(?P<url>(?:/(?:media|hvac-media)/[^"\']+\.(?:png|jpg|jpeg|webp|gif|svg)))'
    r'(?P=quote)',
    re.IGNORECASE,
)


def _slugify_url_filename(url: str) -> str:
    """Берёт URL-путь, slugify только basename, склеивает обратно."""
    # URL может содержать %D0%XX percent-encoding — декодируем для slugify
    decoded = unquote(url)
    dirname = os.path.dirname(decoded)
    basename = os.path.basename(decoded)
    new_basename = slugify_filename(basename)
    if new_basename == basename:
        return url  # уже latin
    return os.path.join(dirname, new_basename) if dirname else new_basename


def _replace_in_text(text: str) -> tuple[str, int]:
    """Заменяет URL'ы в тексте, возвращает (новый_текст, количество_замен)."""
    count = 0

    def _replace(m):
        nonlocal count
        orig_url = m.group("url")
        new_url = _slugify_url_filename(orig_url)
        if new_url == orig_url:
            return m.group(0)
        count += 1
        return f'{m.group("attr")}{m.group("quote")}{new_url}{m.group("quote")}'

    new_text = SRC_PATTERN.sub(_replace, text)
    return new_text, count


class Command(BaseCommand):
    help = (
        'Wave 11 hotfix: обновить URL inline-картинок в NewsPost.body et al. '
        'после переименования файлов на диске.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--execute',
            action='store_true',
            help='Реально сохранять изменения (без флага — dry-run).',
        )

    def handle(self, *args, **options):
        execute = options['execute']
        if not execute:
            self.stdout.write(self.style.WARNING(
                'DRY RUN — без --execute изменения не сохраняются'
            ))

        total_posts = 0
        changed_posts = 0
        total_replacements = 0

        for post in NewsPost.objects.all().iterator():
            total_posts += 1
            updates = {}
            for field in HTML_FIELDS:
                value = getattr(post, field, None) or ''
                if not value:
                    continue
                new_value, count = _replace_in_text(value)
                if count > 0:
                    updates[field] = new_value
                    total_replacements += count

            if updates:
                changed_posts += 1
                self.stdout.write(
                    f'  NewsPost id={post.id} title="{post.title[:50]}..." '
                    f'fields={list(updates.keys())} replacements={sum(1 for f in updates if f in HTML_FIELDS)}'
                )
                if execute:
                    for field, new_value in updates.items():
                        setattr(post, field, new_value)
                    post.save(update_fields=list(updates.keys()))

        self.stdout.write(self.style.SUCCESS(
            f'\n--- ИТОГО ---\n'
            f'  Просмотрено постов: {total_posts}\n'
            f'  С URL-заменами: {changed_posts}\n'
            f'  Всего замен URL: {total_replacements}\n'
            f'  Сохранено: {changed_posts if execute else 0}\n'
        ))
        if not execute:
            self.stdout.write(
                'Запусти с --execute для реального сохранения.'
            )

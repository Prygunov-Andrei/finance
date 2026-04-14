"""Создаёт или обновляет запись Release по git-тегу.

Использование (из deploy/deploy.sh):
    python manage.py generate_changelog --tag v1.2.3 --sha $(git rev-parse HEAD)

Если --tag не указан — берётся тег, указывающий на HEAD.
Parser работает с Conventional Commits (feat/fix/refactor/...); коммиты без
префикса попадают в группу `other`.
"""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from core.models import Release


CONVENTIONAL_RE = re.compile(
    r'^(?P<type>feat|fix|refactor|docs|chore|test|perf|build|ci|style|revert)'
    r'(\((?P<scope>[^)]+)\))?'
    r'(?P<breaking>!)?'
    r':\s*(?P<subject>.+)$'
)

# Порядок важен: deploy.sh передаёт tag как "vX.Y.Z"; в ответе храним именно так.


def _git(args: list[str], cwd: Path) -> str:
    """Выполняет git-команду и возвращает stdout.

    Raises CommandError с понятным текстом, если git упал.
    """
    try:
        result = subprocess.run(
            ['git', *args],
            cwd=cwd,
            capture_output=True,
            text=True,
            check=True,
        )
    except FileNotFoundError as exc:
        raise CommandError('git не найден в PATH контейнера') from exc
    except subprocess.CalledProcessError as exc:
        raise CommandError(
            f'git {" ".join(args)} завершился с кодом {exc.returncode}: '
            f'{exc.stderr.strip() or exc.stdout.strip()}'
        ) from exc
    return result.stdout


def _parse_commit_line(line: str) -> dict | None:
    """Парсит строку "sha|author|subject" → dict или None если пустая."""
    if not line.strip():
        return None
    parts = line.split('|', 2)
    if len(parts) != 3:
        return None
    sha, author, subject = parts
    subject = subject.strip()
    match = CONVENTIONAL_RE.match(subject)
    if match:
        commit_type = match.group('type')
        scope = match.group('scope') or ''
        body = match.group('subject').strip()
        breaking = bool(match.group('breaking'))
    else:
        commit_type = 'other'
        scope = ''
        body = subject
        breaking = False
    return {
        'sha': sha.strip()[:7],
        'author': author.strip(),
        'type': commit_type,
        'scope': scope,
        'subject': body,
        'breaking': breaking,
    }


def parse_git_log(log_output: str) -> list[dict]:
    """Разбирает многострочный git-log вывод в список коммитов."""
    return [c for c in (_parse_commit_line(line) for line in log_output.splitlines()) if c]


class Command(BaseCommand):
    help = 'Создаёт/обновляет запись Release по git-тегу (вызывается из deploy.sh)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--tag', type=str, default='',
            help='Новый git-тег (например v1.2.3). Если пусто — берётся тег на HEAD.',
        )
        parser.add_argument(
            '--sha', type=str, default='',
            help='SHA коммита HEAD. Если пусто — вычисляется через `git rev-parse HEAD`.',
        )
        parser.add_argument(
            '--repo', type=str, default='',
            help='Путь к git-репозиторию. По умолчанию BASE_DIR (или её родитель).',
        )

    def _resolve_repo(self, explicit: str) -> Path:
        if explicit:
            return Path(explicit)
        base = Path(settings.BASE_DIR)
        # BASE_DIR обычно `.../backend`, репо на уровень выше.
        if (base / '.git').is_dir():
            return base
        if (base.parent / '.git').is_dir():
            return base.parent
        return base

    def handle(self, *args, **options):
        repo = self._resolve_repo(options['repo'])

        tag = options['tag'].strip()
        if not tag:
            tag = _git(['tag', '--points-at', 'HEAD'], cwd=repo).strip().splitlines()[:1]
            tag = tag[0] if tag else ''
            if not tag:
                raise CommandError(
                    'Не передан --tag и на HEAD нет тега. '
                    'Укажите версию явно: --tag vX.Y.Z'
                )

        sha = options['sha'].strip() or _git(['rev-parse', 'HEAD'], cwd=repo).strip()

        prev_release = Release.objects.order_by('-released_at').exclude(version=tag).first()
        prev_version = prev_release.version if prev_release else ''

        if prev_version:
            log_range = f'{prev_version}..{tag}'
        else:
            # Первый релиз — ограничимся последними 50 коммитами до тега,
            # чтобы не тащить всю историю репозитория в JSON.
            log_range = f'{tag}~50..{tag}'

        try:
            log_output = _git(
                ['log', log_range, '--pretty=format:%H|%an|%s'],
                cwd=repo,
            )
        except CommandError:
            # Если prev_version недоступен (например, был удалён) —
            # пробуем взять последние 50 коммитов до тега.
            log_output = _git(
                ['log', f'{tag}~50..{tag}', '--pretty=format:%H|%an|%s'],
                cwd=repo,
            )

        commits = parse_git_log(log_output)

        release, created = Release.objects.update_or_create(
            version=tag,
            defaults={
                'git_sha': sha,
                'prev_version': prev_version,
                'commits': commits,
            },
        )

        action = 'Создан' if created else 'Обновлён'
        self.stdout.write(self.style.SUCCESS(
            f'{action} релиз {release.version} ({len(commits)} коммитов, '
            f'prev={prev_version or "—"})'
        ))

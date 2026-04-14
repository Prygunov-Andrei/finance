"""API-ручка /api/v1/version/ — текущая версия и история релизов."""
from __future__ import annotations

import os

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from core.models import Release


GROUP_BY_TYPE = {
    'feat': 'features',
    'fix': 'fixes',
    'refactor': 'refactors',
    'perf': 'refactors',
    'revert': 'fixes',
}

EMPTY_GROUPS = {'features': [], 'fixes': [], 'refactors': [], 'other': []}

MAX_RELEASES = 20


def _group_commits(commits: list[dict]) -> dict[str, list[dict]]:
    groups: dict[str, list[dict]] = {k: [] for k in EMPTY_GROUPS}
    for commit in commits or []:
        bucket = GROUP_BY_TYPE.get(commit.get('type'), 'other')
        groups[bucket].append({
            'scope': commit.get('scope') or '',
            'subject': commit.get('subject') or '',
            'sha': commit.get('sha') or '',
            'author': commit.get('author') or '',
            'breaking': bool(commit.get('breaking')),
        })
    return groups


def _serialize_release(release: Release) -> dict:
    return {
        'version': release.version,
        'released_at': release.released_at.isoformat() if release.released_at else None,
        'git_sha': release.git_sha,
        'description': release.description or '',
        'groups': _group_commits(release.commits or []),
    }


@api_view(['GET'])
@permission_classes([AllowAny])
def version_info(request):
    """Возвращает текущую версию и последние релизы.

    `current` берётся из ENV `APP_VERSION` (проставляется deploy.sh).
    Если ENV нет — падаем на версию последнего опубликованного релиза,
    а если и её нет — отдаём строку 'dev'.
    """
    releases_qs = (
        Release.objects
        .filter(is_published=True)
        .order_by('-released_at')[:MAX_RELEASES]
    )
    releases = [_serialize_release(r) for r in releases_qs]

    current = os.environ.get('APP_VERSION') or (releases[0]['version'] if releases else 'dev')

    return Response({
        'current': current,
        'releases': releases,
    })

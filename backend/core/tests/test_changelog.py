"""Тесты парсера Conventional Commits и команды generate_changelog."""
from __future__ import annotations

from io import StringIO
from unittest.mock import patch

import pytest
from django.core.management import call_command

from core.management.commands.generate_changelog import (
    _parse_commit_line,
    parse_git_log,
)
from core.models import Release
from core.version_views import _group_commits, _serialize_release


# ---------------------------------------------------------------------------
# Парсер одной строки лога "sha|author|subject"
# ---------------------------------------------------------------------------

class TestParseCommitLine:
    def test_feat_with_scope(self):
        line = 'abc1234567890|Andrei|feat(banking): интеграция Tinkoff API'
        commit = _parse_commit_line(line)
        assert commit == {
            'sha': 'abc1234',
            'author': 'Andrei',
            'type': 'feat',
            'scope': 'banking',
            'subject': 'интеграция Tinkoff API',
            'breaking': False,
        }

    def test_fix_without_scope(self):
        line = 'def9876543210|Ivan|fix: пересчёт НДС'
        commit = _parse_commit_line(line)
        assert commit['type'] == 'fix'
        assert commit['scope'] == ''
        assert commit['subject'] == 'пересчёт НДС'
        assert commit['breaking'] is False

    def test_breaking_change_marker(self):
        line = 'aaaaaaabbbbbbb|Dev|feat(auth)!: drop legacy sessions'
        commit = _parse_commit_line(line)
        assert commit['type'] == 'feat'
        assert commit['scope'] == 'auth'
        assert commit['breaking'] is True
        assert commit['subject'] == 'drop legacy sessions'

    def test_no_prefix_falls_to_other(self):
        line = '1111222233334444|Someone|update README with screenshots'
        commit = _parse_commit_line(line)
        assert commit['type'] == 'other'
        assert commit['scope'] == ''
        assert commit['subject'] == 'update README with screenshots'

    def test_refactor_recognized(self):
        line = 'bbbbbbbcccccccddddd|A|refactor(estimates): вынести сервис'
        assert _parse_commit_line(line)['type'] == 'refactor'

    def test_empty_line_returns_none(self):
        assert _parse_commit_line('') is None
        assert _parse_commit_line('   ') is None

    def test_malformed_line_returns_none(self):
        assert _parse_commit_line('just one part') is None
        assert _parse_commit_line('sha|author') is None

    def test_sha_truncated_to_7(self):
        line = 'a' * 40 + '|Dev|fix: bug'
        commit = _parse_commit_line(line)
        assert len(commit['sha']) == 7
        assert commit['sha'] == 'a' * 7


# ---------------------------------------------------------------------------
# Парсер многострочного вывода git log
# ---------------------------------------------------------------------------

class TestParseGitLog:
    def test_multiple_commits(self):
        output = (
            'sha1aaaabbbbccccd|Andrei|feat: новое\n'
            'sha2aaaabbbbccccd|Andrei|fix(bug): мелочь\n'
            'sha3aaaabbbbccccd|Andrei|chore: bump deps\n'
        )
        commits = parse_git_log(output)
        assert len(commits) == 3
        assert [c['type'] for c in commits] == ['feat', 'fix', 'chore']

    def test_skips_empty_lines(self):
        output = '\nsha1aaaabbbbccccd|Andrei|feat: a\n\n\nsha2aaaabbbbccccd|Andrei|fix: b\n\n'
        commits = parse_git_log(output)
        assert len(commits) == 2

    def test_empty_output(self):
        assert parse_git_log('') == []


# ---------------------------------------------------------------------------
# Группировка коммитов для API-ответа
# ---------------------------------------------------------------------------

class TestGroupCommits:
    def test_groups_by_type(self):
        commits = [
            {'type': 'feat', 'scope': 'a', 'subject': 's1', 'sha': 'x', 'author': 'A'},
            {'type': 'fix', 'scope': '', 'subject': 's2', 'sha': 'y', 'author': 'A'},
            {'type': 'refactor', 'scope': 'b', 'subject': 's3', 'sha': 'z', 'author': 'A'},
            {'type': 'chore', 'scope': '', 'subject': 's4', 'sha': 'w', 'author': 'A'},
            {'type': 'other', 'scope': '', 'subject': 's5', 'sha': 'v', 'author': 'A'},
        ]
        groups = _group_commits(commits)
        assert len(groups['features']) == 1
        assert len(groups['fixes']) == 1
        assert len(groups['refactors']) == 1
        # chore и other → other
        assert len(groups['other']) == 2

    def test_perf_goes_to_refactors(self):
        groups = _group_commits([
            {'type': 'perf', 'scope': '', 'subject': 'x', 'sha': 'a', 'author': 'b'},
        ])
        assert len(groups['refactors']) == 1

    def test_empty(self):
        groups = _group_commits([])
        assert groups == {'features': [], 'fixes': [], 'refactors': [], 'other': []}


# ---------------------------------------------------------------------------
# Интеграция: generate_changelog создаёт и обновляет Release
# ---------------------------------------------------------------------------

GIT_LOG_FIXTURE = (
    'aaaaaaaaaaaaaaaa|Andrei|feat(banking): интеграция Tinkoff\n'
    'bbbbbbbbbbbbbbbb|Ivan|fix(supply): пересчёт остатков\n'
    'ccccccccccccccccc|Andrei|refactor(core): упрощение\n'
    'dddddddddddddddd|Dev|update docs\n'
)


def _fake_git(args, cwd=None, capture_output=True, text=True, check=True):
    """Заменяет subprocess.run для git-команд в тестах."""
    import subprocess as _sp
    command = args[1] if len(args) > 1 else ''
    # args here is ['git', ...] since _git passes ['git', *real_args]
    if 'rev-parse' in args:
        return _sp.CompletedProcess(args, 0, stdout='headsha1234567890\n', stderr='')
    if 'tag' in args and '--points-at' in args:
        return _sp.CompletedProcess(args, 0, stdout='v1.0.0\n', stderr='')
    if 'log' in args:
        return _sp.CompletedProcess(args, 0, stdout=GIT_LOG_FIXTURE, stderr='')
    return _sp.CompletedProcess(args, 0, stdout='', stderr='')


@pytest.mark.django_db
class TestGenerateChangelogCommand:
    def test_creates_new_release(self, tmp_path):
        (tmp_path / '.git').mkdir()
        with patch('core.management.commands.generate_changelog.subprocess.run', side_effect=_fake_git):
            out = StringIO()
            call_command(
                'generate_changelog',
                '--tag', 'v1.0.1',
                '--sha', 'deadbeefcafef00d',
                '--repo', str(tmp_path),
                stdout=out,
            )
        release = Release.objects.get(version='v1.0.1')
        assert release.git_sha == 'deadbeefcafef00d'
        assert len(release.commits) == 4
        assert {'feat', 'fix', 'refactor', 'other'} == {c['type'] for c in release.commits}
        assert 'Создан релиз v1.0.1' in out.getvalue()

    def test_updates_existing_release_idempotent(self, tmp_path):
        (tmp_path / '.git').mkdir()
        Release.objects.create(version='v1.0.1', git_sha='old', commits=[])
        with patch('core.management.commands.generate_changelog.subprocess.run', side_effect=_fake_git):
            call_command(
                'generate_changelog',
                '--tag', 'v1.0.1',
                '--sha', 'newsha',
                '--repo', str(tmp_path),
                stdout=StringIO(),
            )
        assert Release.objects.filter(version='v1.0.1').count() == 1
        release = Release.objects.get(version='v1.0.1')
        assert release.git_sha == 'newsha'
        assert len(release.commits) == 4


# ---------------------------------------------------------------------------
# Сериализация Release для API-ответа
# ---------------------------------------------------------------------------

@pytest.mark.django_db
class TestSerializeRelease:
    def test_serialize_contains_groups(self):
        release = Release.objects.create(
            version='v1.2.3',
            git_sha='abc1234',
            description='Человеческое описание',
            commits=[
                {'type': 'feat', 'scope': 'a', 'subject': 's', 'sha': 'x', 'author': 'A', 'breaking': False},
                {'type': 'fix', 'scope': '', 'subject': 's', 'sha': 'y', 'author': 'A', 'breaking': False},
            ],
        )
        data = _serialize_release(release)
        assert data['version'] == 'v1.2.3'
        assert data['git_sha'] == 'abc1234'
        assert data['description'] == 'Человеческое описание'
        assert len(data['groups']['features']) == 1
        assert len(data['groups']['fixes']) == 1
        assert data['groups']['refactors'] == []
        assert data['groups']['other'] == []

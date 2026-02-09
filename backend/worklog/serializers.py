import hashlib
import hmac
import json
from urllib.parse import parse_qs

from django.conf import settings
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken

from .models import (
    Worker, Supergroup, Shift, ShiftRegistration,
    Team, TeamMembership, Media, Report, Question, Answer,
    InviteToken,
)


# =============================================================================
# Worker
# =============================================================================

class WorkerSerializer(serializers.ModelSerializer):
    contractor_name = serializers.CharField(source='contractor.short_name', read_only=True)

    class Meta:
        model = Worker
        fields = [
            'id', 'telegram_id', 'name', 'phone', 'photo_url',
            'role', 'language', 'contractor', 'contractor_name',
            'bot_started', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class WorkerCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Worker
        fields = ['telegram_id', 'name', 'phone', 'role', 'language', 'contractor']


# =============================================================================
# Supergroup
# =============================================================================

class SupergroupSerializer(serializers.ModelSerializer):
    object_name = serializers.CharField(source='object.name', read_only=True)
    contractor_name = serializers.CharField(source='contractor.short_name', read_only=True)

    class Meta:
        model = Supergroup
        fields = [
            'id', 'object', 'object_name', 'contractor', 'contractor_name',
            'telegram_group_id', 'invite_link', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']


# =============================================================================
# Shift
# =============================================================================

class ShiftSerializer(serializers.ModelSerializer):
    object_name = serializers.CharField(source='object.name', read_only=True)
    contractor_name = serializers.CharField(source='contractor.short_name', read_only=True)
    contract_number = serializers.CharField(source='contract.number', read_only=True, default=None)
    contract_name = serializers.CharField(source='contract.name', read_only=True, default=None)
    registrations_count = serializers.IntegerField(read_only=True, default=0)
    teams_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Shift
        fields = [
            'id', 'contract', 'contract_number', 'contract_name',
            'object', 'object_name', 'contractor', 'contractor_name',
            'date', 'shift_type', 'start_time', 'end_time',
            'qr_code', 'qr_token', 'status', 'extended_until',
            'registrations_count', 'teams_count',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'object', 'contractor', 'qr_code', 'qr_token', 'created_at', 'updated_at']


class ShiftCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Shift
        fields = ['contract', 'date', 'shift_type', 'start_time', 'end_time']


# =============================================================================
# ShiftRegistration
# =============================================================================

class ShiftRegistrationSerializer(serializers.ModelSerializer):
    worker_name = serializers.CharField(source='worker.name', read_only=True)

    class Meta:
        model = ShiftRegistration
        fields = [
            'id', 'shift', 'worker', 'worker_name',
            'registered_at', 'registered_by',
            'latitude', 'longitude', 'geo_valid',
        ]
        read_only_fields = ['id', 'registered_at', 'geo_valid']


class ShiftRegistrationCreateSerializer(serializers.Serializer):
    """Регистрация на смену через QR-код (из Mini App)."""
    qr_token = serializers.CharField()
    latitude = serializers.FloatField()
    longitude = serializers.FloatField()


# =============================================================================
# Team
# =============================================================================

class TeamMembershipSerializer(serializers.ModelSerializer):
    worker_name = serializers.CharField(source='worker.name', read_only=True)
    worker_role = serializers.CharField(source='worker.role', read_only=True)
    worker_photo = serializers.CharField(source='worker.photo_url', read_only=True)

    class Meta:
        model = TeamMembership
        fields = [
            'id', 'worker', 'worker_name', 'worker_role', 'worker_photo',
            'joined_at', 'left_at',
        ]


class TeamSerializer(serializers.ModelSerializer):
    object_name = serializers.CharField(source='object.name', read_only=True)
    brigadier_name = serializers.CharField(source='brigadier.name', read_only=True, default=None)
    memberships = TeamMembershipSerializer(many=True, read_only=True)
    media_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Team
        fields = [
            'id', 'object', 'object_name', 'contractor', 'shift',
            'topic_id', 'topic_name', 'brigadier', 'brigadier_name',
            'status', 'is_solo', 'previous_team',
            'memberships', 'media_count',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'topic_id', 'created_at', 'updated_at']


class TeamCreateSerializer(serializers.Serializer):
    """Создание звена бригадиром/исполнителем."""
    shift_id = serializers.UUIDField()
    member_ids = serializers.ListField(child=serializers.UUIDField(), min_length=1)
    brigadier_id = serializers.UUIDField()


# =============================================================================
# Media
# =============================================================================

class MediaSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source='author.name', read_only=True)
    team_name = serializers.CharField(source='team.topic_name', read_only=True, default=None)

    class Meta:
        model = Media
        fields = [
            'id', 'team', 'team_name', 'report', 'author', 'author_name',
            'message_id', 'media_type', 'tag', 'tag_source',
            'file_id', 'file_unique_id', 'file_url', 'file_size',
            'duration', 'thumbnail_url', 'text_content',
            'exif_date', 'phash', 'status',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']


# =============================================================================
# Report
# =============================================================================

class ReportSerializer(serializers.ModelSerializer):
    team_name = serializers.CharField(source='team.topic_name', read_only=True, default=None)
    media_items = MediaSerializer(source='media', many=True, read_only=True)

    class Meta:
        model = Report
        fields = [
            'id', 'team', 'team_name', 'shift',
            'parent_report', 'report_number', 'report_type', 'trigger',
            'created_by', 'media_count', 'members_snapshot',
            'divider_message_id', 'first_message_id', 'last_message_id',
            'status', 'media_items',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class ReportListSerializer(serializers.ModelSerializer):
    """Облегчённый сериализатор для списка (без вложенных медиа)."""
    team_name = serializers.CharField(source='team.topic_name', read_only=True, default=None)

    class Meta:
        model = Report
        fields = [
            'id', 'team', 'team_name', 'shift',
            'report_number', 'report_type', 'trigger',
            'media_count', 'status',
            'created_at',
        ]


# =============================================================================
# Question / Answer
# =============================================================================

class AnswerSerializer(serializers.ModelSerializer):
    answered_by_name = serializers.CharField(source='answered_by.name', read_only=True)

    class Meta:
        model = Answer
        fields = [
            'id', 'question', 'answered_by', 'answered_by_name',
            'answer_text', 'answer_media', 'message_id',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class QuestionSerializer(serializers.ModelSerializer):
    answers = AnswerSerializer(many=True, read_only=True)
    target_user_name = serializers.CharField(source='target_user.name', read_only=True, default=None)

    class Meta:
        model = Question
        fields = [
            'id', 'report', 'team', 'asked_by', 'asked_by_user',
            'target_user', 'target_user_name',
            'question_text', 'question_type', 'choices',
            'message_id', 'status', 'answers',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']


# =============================================================================
# InviteToken
# =============================================================================

class InviteTokenSerializer(serializers.ModelSerializer):
    contractor_name = serializers.CharField(source='contractor.short_name', read_only=True)
    created_by_username = serializers.CharField(source='created_by.username', read_only=True, default=None)
    used_by_name = serializers.CharField(source='used_by.name', read_only=True, default=None)
    bot_link = serializers.CharField(read_only=True)
    is_valid = serializers.BooleanField(read_only=True)

    class Meta:
        model = InviteToken
        fields = [
            'id', 'code', 'contractor', 'contractor_name',
            'created_by', 'created_by_username',
            'role', 'expires_at',
            'used', 'used_by', 'used_by_name', 'used_at',
            'bot_link', 'is_valid',
            'created_at',
        ]
        read_only_fields = [
            'id', 'code', 'created_by', 'used', 'used_by', 'used_at', 'created_at',
        ]


class InviteTokenCreateSerializer(serializers.Serializer):
    contractor = serializers.IntegerField(help_text='ID контрагента (Counterparty)')
    role = serializers.ChoiceField(
        choices=Worker.Role.choices,
        default=Worker.Role.WORKER,
        help_text='Роль приглашённого (worker/brigadier)',
    )


class InviteAcceptSerializer(serializers.Serializer):
    """Принятие invite-токена ботом: создание Worker."""
    telegram_id = serializers.IntegerField()
    name = serializers.CharField(max_length=255)
    language = serializers.ChoiceField(
        choices=Worker.Language.choices,
        default=Worker.Language.RU,
    )


# =============================================================================
# Telegram Mini App Auth
# =============================================================================

class TelegramAuthSerializer(serializers.Serializer):
    """Аутентификация через Telegram initData."""
    init_data = serializers.CharField(help_text='Raw initData string from Telegram WebApp')

    def validate_init_data(self, value):
        """Валидация HMAC-SHA256 подписи от Telegram."""
        bot_token = settings.TELEGRAM_BOT_TOKEN
        if not bot_token:
            raise serializers.ValidationError('Telegram bot token not configured')

        parsed = parse_qs(value)
        received_hash = parsed.get('hash', [None])[0]
        if not received_hash:
            raise serializers.ValidationError('Missing hash in initData')

        # Собираем data-check-string
        data_pairs = []
        for key, val_list in sorted(parsed.items()):
            if key != 'hash':
                data_pairs.append(f"{key}={val_list[0]}")
        data_check_string = '\n'.join(data_pairs)

        # HMAC-SHA256 валидация
        secret_key = hmac.new(b'WebAppData', bot_token.encode(), hashlib.sha256).digest()
        computed_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

        if computed_hash != received_hash:
            raise serializers.ValidationError('Invalid initData signature')

        # Достаём данные пользователя
        user_data_raw = parsed.get('user', [None])[0]
        if not user_data_raw:
            raise serializers.ValidationError('Missing user data in initData')

        try:
            user_data = json.loads(user_data_raw)
        except json.JSONDecodeError:
            raise serializers.ValidationError('Invalid user data JSON')

        return {
            'telegram_id': user_data.get('id'),
            'first_name': user_data.get('first_name', ''),
            'last_name': user_data.get('last_name', ''),
            'username': user_data.get('username', ''),
            'language_code': user_data.get('language_code', 'ru'),
        }


class TelegramAuthResponseSerializer(serializers.Serializer):
    access_token = serializers.CharField()
    refresh_token = serializers.CharField()
    worker = WorkerSerializer()


# =============================================================================
# Work Journal summary (for Object detail)
# =============================================================================

class WorkJournalSummarySerializer(serializers.Serializer):
    """Сводка по журналу работ для объекта."""
    total_shifts = serializers.IntegerField()
    active_shifts = serializers.IntegerField()
    total_teams = serializers.IntegerField()
    total_media = serializers.IntegerField()
    total_reports = serializers.IntegerField()
    total_workers = serializers.IntegerField()
    recent_shifts = ShiftSerializer(many=True)

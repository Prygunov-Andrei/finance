from django.db.models import Count, Prefetch
from django.core.cache import cache
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from django_filters.rest_framework import DjangoFilterBackend

from django.utils import timezone

from .models import (
    Worker, Supergroup, Shift, ShiftRegistration,
    Team, TeamMembership, Media, Report, Question, Answer,
    InviteToken,
)
from .serializers import (
    WorkerSerializer, WorkerCreateSerializer,
    SupergroupSerializer,
    ShiftSerializer, ShiftCreateSerializer,
    ShiftRegistrationSerializer, ShiftRegistrationCreateSerializer,
    TeamSerializer, TeamCreateSerializer,
    MediaSerializer,
    ReportSerializer, ReportListSerializer,
    QuestionSerializer, AnswerSerializer,
    TelegramAuthSerializer, TelegramAuthResponseSerializer,
    WorkJournalSummarySerializer,
    InviteTokenSerializer, InviteTokenCreateSerializer, InviteAcceptSerializer,
)


# =============================================================================
# Telegram Mini App Auth
# =============================================================================

@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def telegram_auth(request):
    """
    Аутентификация через Telegram initData.
    Принимает raw initData, валидирует подпись, возвращает JWT + данные worker.
    """
    serializer = TelegramAuthSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    user_data = serializer.validated_data['init_data']
    telegram_id = user_data['telegram_id']

    try:
        worker = Worker.objects.select_related('contractor').get(telegram_id=telegram_id)
    except Worker.DoesNotExist:
        return Response(
            {'error': 'Worker not found. Contact your contractor to register.'},
            status=status.HTTP_404_NOT_FOUND,
        )

    # Генерируем JWT-токен через simplejwt
    # Создаём или берём Django User для JWT (связка через telegram_id)
    from django.contrib.auth.models import User
    django_user, _ = User.objects.get_or_create(
        username=f'tg_{telegram_id}',
        defaults={'first_name': worker.name[:30]},
    )

    refresh = RefreshToken.for_user(django_user)
    # Добавляем worker_id в claims
    refresh['worker_id'] = str(worker.id)
    refresh['worker_role'] = worker.role
    refresh['contractor_id'] = worker.contractor_id

    # Проверяем, является ли пользователь «исполнителем» (контрагентом)
    # Исполнитель — Worker, являющийся director контрагента
    is_contractor = False
    if hasattr(worker.contractor, 'director') and worker.contractor.director == django_user:
        is_contractor = True
    refresh['is_contractor'] = is_contractor

    response_data = {
        'access_token': str(refresh.access_token),
        'refresh_token': str(refresh),
        'worker': WorkerSerializer(worker).data,
        'is_contractor': is_contractor,
    }

    return Response(response_data, status=status.HTTP_200_OK)


# =============================================================================
# Worker ViewSet
# =============================================================================

class WorkerViewSet(viewsets.ModelViewSet):
    queryset = Worker.objects.select_related('contractor').all()
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['role', 'language', 'contractor', 'bot_started']
    search_fields = ['name', 'phone']

    def get_serializer_class(self):
        if self.action == 'create':
            return WorkerCreateSerializer
        return WorkerSerializer


# =============================================================================
# Supergroup ViewSet
# =============================================================================

class SupergroupViewSet(viewsets.ModelViewSet):
    queryset = Supergroup.objects.select_related('object', 'contractor').all()
    serializer_class = SupergroupSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['object', 'contractor']


# =============================================================================
# Shift ViewSet
# =============================================================================

class ShiftViewSet(viewsets.ModelViewSet):
    queryset = (
        Shift.objects
        .select_related('object', 'contractor', 'contract')
        .annotate(
            registrations_count=Count('registrations', distinct=True),
            teams_count=Count('teams', distinct=True),
        )
    )
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['object', 'contractor', 'contract', 'status', 'date', 'shift_type']
    search_fields = ['object__name']

    def get_serializer_class(self):
        if self.action == 'create':
            return ShiftCreateSerializer
        return ShiftSerializer

    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """Ручная активация запланированной смены."""
        shift = self.get_object()
        if shift.status != Shift.Status.SCHEDULED:
            return Response(
                {'error': f'Смена не может быть активирована (текущий статус: {shift.get_status_display()})'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        shift.status = Shift.Status.ACTIVE
        shift.save(update_fields=['status', 'updated_at'])
        return Response(ShiftSerializer(shift).data)

    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        """Ручное закрытие активной смены."""
        shift = self.get_object()
        if shift.status != Shift.Status.ACTIVE:
            return Response(
                {'error': f'Смена не может быть закрыта (текущий статус: {shift.get_status_display()})'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        shift.status = Shift.Status.CLOSED
        shift.save(update_fields=['status', 'updated_at'])
        return Response(ShiftSerializer(shift).data)

    @action(detail=True, methods=['get'])
    def registrations(self, request, pk=None):
        """Список регистраций на смену."""
        shift = self.get_object()
        registrations = ShiftRegistration.objects.filter(
            shift=shift
        ).select_related('worker')
        serializer = ShiftRegistrationSerializer(registrations, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def register(self, request, pk=None):
        """Регистрация монтажника на смену (из Mini App)."""
        serializer = ShiftRegistrationCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        shift = self.get_object()
        if shift.status != Shift.Status.ACTIVE:
            return Response(
                {'error': 'Shift is not active'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Получаем worker по текущему пользователю
        try:
            worker = Worker.objects.get(
                telegram_id=int(request.user.username.replace('tg_', ''))
            )
        except (Worker.DoesNotExist, ValueError):
            return Response(
                {'error': 'Worker not found'},
                status=status.HTTP_404_NOT_FOUND,
            )

        # ─── Защита 1: Запрет одновременных (пересекающихся) смен ───
        from datetime import datetime, timedelta

        def _shift_to_dt_range(s):
            """Нормализует start/end смены в datetime с учётом ночных смен."""
            start_dt = datetime.combine(s.date, s.start_time)
            end_dt = datetime.combine(s.date, s.end_time)
            if s.end_time <= s.start_time:
                end_dt += timedelta(days=1)
            return start_dt, end_dt

        current_start, current_end = _shift_to_dt_range(shift)

        overlapping_regs = ShiftRegistration.objects.filter(
            worker=worker,
            shift__status=Shift.Status.ACTIVE,
        ).exclude(
            shift=shift,
        ).select_related('shift')

        for reg in overlapping_regs:
            other = reg.shift
            other_start, other_end = _shift_to_dt_range(other)
            if current_start < other_end and current_end > other_start:
                return Response(
                    {
                        'error': (
                            f'Вы уже зарегистрированы на пересекающуюся смену '
                            f'({other.object.name}, '
                            f'{other.start_time.strftime("%H:%M")}–{other.end_time.strftime("%H:%M")})'
                        ),
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

        # ─── Защита 2: Проверка временного окна регистрации ───
        obj = shift.object
        if obj.registration_window_minutes > 0:
            now = timezone.localtime()
            shift_start_dt = datetime.combine(shift.date, shift.start_time, tzinfo=now.tzinfo)
            shift_end_dt = datetime.combine(shift.date, shift.end_time, tzinfo=now.tzinfo)
            if shift.end_time <= shift.start_time:
                shift_end_dt += timedelta(days=1)
            window = timedelta(minutes=obj.registration_window_minutes)
            window_open = shift_start_dt - window
            window_close = shift_end_dt + window
            if not (window_open <= now <= window_close):
                return Response(
                    {
                        'error': (
                            f'Регистрация доступна с '
                            f'{window_open.strftime("%H:%M")} до {window_close.strftime("%H:%M")}'
                        ),
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

        # ─── Проверка геозоны ───
        from decimal import Decimal
        import math

        lat = float(serializer.validated_data['latitude'])
        lon = float(serializer.validated_data['longitude'])

        geo_valid = False
        distance = None
        if obj.latitude and obj.longitude:
            # Haversine distance
            R = 6371000  # metres
            phi1 = math.radians(float(obj.latitude))
            phi2 = math.radians(lat)
            delta_phi = math.radians(lat - float(obj.latitude))
            delta_lambda = math.radians(lon - float(obj.longitude))
            a = (math.sin(delta_phi / 2) ** 2 +
                 math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2)
            c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
            distance = R * c
            geo_valid = distance <= obj.geo_radius

        # Вне геозоны: не блокируем регистрацию (V1), но помечаем geo_valid=False.
        # Строгий режим можно включать позже как отдельную политику.

        registration, created = ShiftRegistration.objects.get_or_create(
            shift=shift,
            worker=worker,
            defaults={
                'latitude': serializer.validated_data['latitude'],
                'longitude': serializer.validated_data['longitude'],
                'geo_valid': geo_valid,
            },
        )

        if not created:
            return Response(
                {'error': 'Already registered for this shift'},
                status=status.HTTP_409_CONFLICT,
            )

        if not geo_valid:
            return Response(
                {
                    'warning': 'Зарегистрировано, но вы вне геозоны объекта',
                    'geo_valid': False,
                    'distance': round(distance) if distance is not None else None,
                    'geo_radius': obj.geo_radius,
                    'registration': ShiftRegistrationSerializer(registration).data,
                },
                status=status.HTTP_201_CREATED,
            )

        return Response(
            ShiftRegistrationSerializer(registration).data,
            status=status.HTTP_201_CREATED,
        )


# =============================================================================
# Team ViewSet
# =============================================================================

class TeamViewSet(viewsets.ModelViewSet):
    queryset = (
        Team.objects
        .select_related('object', 'contractor', 'shift', 'brigadier')
        .prefetch_related('memberships__worker')
        .annotate(media_count=Count('media', distinct=True))
    )
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['object', 'shift', 'status', 'is_solo', 'contractor']

    def get_serializer_class(self):
        if self.action == 'create':
            return TeamCreateSerializer
        return TeamSerializer

    def create(self, request, *args, **kwargs):
        """Создание звена с автоматическим созданием топика в Telegram."""
        serializer = TeamCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        shift = Shift.objects.get(id=serializer.validated_data['shift_id'])
        brigadier = Worker.objects.get(id=serializer.validated_data['brigadier_id'])
        member_ids = serializer.validated_data['member_ids']
        members = Worker.objects.filter(id__in=member_ids)

        team = Team.objects.create(
            object=shift.object,
            contractor=shift.contractor,
            shift=shift,
            brigadier=brigadier,
            created_by=brigadier,
            is_solo=len(member_ids) == 1,
            topic_name=f"Звено {brigadier.name}",
        )

        for worker in members:
            TeamMembership.objects.create(team=team, worker=worker)

        # T8.2: Автоматическое создание топика в Telegram-супергруппе
        from worklog.tasks import create_team_forum_topic
        create_team_forum_topic.delay(str(team.id))

        team = (
            Team.objects
            .select_related('object', 'contractor', 'shift', 'brigadier')
            .prefetch_related('memberships__worker')
            .annotate(media_count=Count('media', distinct=True))
            .get(id=team.id)
        )

        return Response(TeamSerializer(team).data, status=status.HTTP_201_CREATED)


# =============================================================================
# Media ViewSet
# =============================================================================

class MediaViewSet(viewsets.ModelViewSet):
    queryset = Media.objects.select_related('author', 'team', 'report').all()
    serializer_class = MediaSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['team', 'report', 'author', 'media_type', 'tag', 'status']
    search_fields = ['text_content']


# =============================================================================
# Report ViewSet
# =============================================================================

class ReportViewSet(viewsets.ModelViewSet):
    queryset = (
        Report.objects
        .select_related('team', 'shift', 'created_by')
        .prefetch_related(
            'media__author',
            Prefetch(
                'questions',
                queryset=Question.objects.select_related('target_user').prefetch_related('answers__answered_by'),
            ),
        )
    )
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['team', 'shift', 'report_type', 'trigger', 'status']

    def get_serializer_class(self):
        if self.action == 'list':
            return ReportListSerializer
        return ReportSerializer


# =============================================================================
# Question ViewSet
# =============================================================================

class QuestionViewSet(viewsets.ModelViewSet):
    queryset = (
        Question.objects
        .select_related('report', 'team', 'target_user', 'asked_by_user')
        .prefetch_related('answers__answered_by')
    )
    serializer_class = QuestionSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['team', 'report', 'asked_by', 'question_type', 'status']

    @action(detail=True, methods=['post'])
    def answer(self, request, pk=None):
        """Ответить на вопрос."""
        question = self.get_object()
        serializer = AnswerSerializer(data={**request.data, 'question': question.id})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        question.status = Question.Status.ANSWERED
        question.save(update_fields=['status'])
        return Response(serializer.data, status=status.HTTP_201_CREATED)


# =============================================================================
# InviteToken ViewSet
# =============================================================================

class InviteTokenViewSet(viewsets.ModelViewSet):
    """
    CRUD для invite-токенов.
    - POST /invites/           — создать invite
    - GET  /invites/           — список invite-ов
    - GET  /invites/{code}/validate/ — проверить токен (для бота)
    - POST /invites/{code}/accept/   — принять invite, создать Worker (бот вызывает)
    """
    queryset = InviteToken.objects.select_related('contractor', 'created_by', 'used_by').all()
    serializer_class = InviteTokenSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['contractor', 'used', 'role']
    lookup_field = 'code'

    def create(self, request, *args, **kwargs):
        """Создание invite-токена (из ERP Frontend)."""
        serializer = InviteTokenCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        from accounting.models import Counterparty
        try:
            contractor = Counterparty.objects.get(id=serializer.validated_data['contractor'])
        except Counterparty.DoesNotExist:
            return Response(
                {'error': 'Контрагент не найден'},
                status=status.HTTP_404_NOT_FOUND,
            )

        invite = InviteToken.objects.create(
            contractor=contractor,
            role=serializer.validated_data.get('role', 'worker'),
            created_by=request.user if request.user.is_authenticated else None,
        )

        return Response(
            InviteTokenSerializer(invite).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['get'], url_path='validate', permission_classes=[permissions.AllowAny])
    def validate_token(self, request, code=None):
        """Валидация invite-токена (бот вызывает перед началом регистрации)."""
        try:
            invite = InviteToken.objects.select_related('contractor').get(code=code)
        except InviteToken.DoesNotExist:
            return Response(
                {'valid': False, 'error': 'Токен не найден'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if invite.used:
            return Response(
                {'valid': False, 'error': 'Токен уже использован'},
                status=status.HTTP_410_GONE,
            )

        if invite.expires_at <= timezone.now():
            return Response(
                {'valid': False, 'error': 'Токен истёк'},
                status=status.HTTP_410_GONE,
            )

        return Response({
            'valid': True,
            'contractor_id': invite.contractor_id,
            'contractor_name': invite.contractor.short_name,
            'role': invite.role,
        })

    @action(detail=True, methods=['post'], url_path='accept', permission_classes=[permissions.AllowAny])
    def accept_token(self, request, code=None):
        """
        Принятие invite-токена: создание Worker.
        Бот вызывает после сбора ФИО и языка.
        """
        serializer = InviteAcceptSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        telegram_id = serializer.validated_data['telegram_id']

        # Проверяем: может, монтажник уже есть
        existing_worker = Worker.objects.filter(telegram_id=telegram_id).first()
        if existing_worker:
            return Response({
                'status': 'already_registered',
                'worker': WorkerSerializer(existing_worker).data,
            }, status=status.HTTP_200_OK)

        # Валидируем invite
        try:
            invite = InviteToken.objects.select_related('contractor').get(code=code)
        except InviteToken.DoesNotExist:
            return Response(
                {'error': 'Токен не найден'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if invite.used:
            return Response(
                {'error': 'Токен уже использован'},
                status=status.HTTP_410_GONE,
            )

        if invite.expires_at <= timezone.now():
            return Response(
                {'error': 'Токен истёк'},
                status=status.HTTP_410_GONE,
            )

        # Создаём Worker
        worker = Worker.objects.create(
            telegram_id=telegram_id,
            name=serializer.validated_data['name'],
            language=serializer.validated_data.get('language', 'ru'),
            role=invite.role,
            contractor=invite.contractor,
            bot_started=True,
        )

        # Помечаем invite как использованный
        invite.used = True
        invite.used_by = worker
        invite.used_at = timezone.now()
        invite.save(update_fields=['used', 'used_by', 'used_at'])

        return Response({
            'status': 'created',
            'worker': WorkerSerializer(worker).data,
        }, status=status.HTTP_201_CREATED)


# =============================================================================
# Work Journal (for Object detail page)
# =============================================================================

@api_view(['GET'])
def work_journal_summary(request, object_id):
    """
    Сводка по журналу работ для объекта (для ERP-фронтенда).

    Кэширование: 60 секунд (для снижения нагрузки при частых обновлениях страницы).
    """
    from objects.models import Object

    try:
        obj = Object.objects.get(id=object_id)
    except Object.DoesNotExist:
        return Response({'error': 'Object not found'}, status=status.HTTP_404_NOT_FOUND)

    # Кэш: сводка объекта (инвалидируется каждые 60 секунд)
    cache_key = f'work_journal_summary_{object_id}'
    cached_data = cache.get(cache_key)
    if cached_data is not None:
        return Response(cached_data)

    # Оптимизация: один запрос для агрегатов по сменам
    from django.db.models import Q, Sum

    shift_stats = Shift.objects.filter(object=obj).aggregate(
        total_shifts=Count('id'),
        active_shifts=Count('id', filter=Q(status=Shift.Status.ACTIVE)),
    )

    total_teams = Team.objects.filter(object=obj).count()
    total_media = Media.objects.filter(team__object=obj).count()
    total_reports = Report.objects.filter(team__object=obj).count()
    total_workers = (
        Worker.objects
        .filter(shift_registrations__shift__object=obj)
        .distinct()
        .count()
    )

    # Оптимизация: один запрос для recent_shifts с аннотациями
    recent_shifts = (
        Shift.objects
        .filter(object=obj)
        .select_related('object', 'contractor')
        .annotate(
            registrations_count=Count('registrations', distinct=True),
            teams_count=Count('teams', distinct=True),
        )
        .order_by('-date')[:10]
    )

    data = {
        'total_shifts': shift_stats['total_shifts'],
        'active_shifts': shift_stats['active_shifts'],
        'total_teams': total_teams,
        'total_media': total_media,
        'total_reports': total_reports,
        'total_workers': total_workers,
        'recent_shifts': ShiftSerializer(recent_shifts, many=True).data,
    }

    cache.set(cache_key, data, timeout=60)

    return Response(data)

from rest_framework import viewsets, status, permissions, serializers as drf_serializers
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from drf_spectacular.utils import extend_schema, extend_schema_view
from django.contrib.auth.models import User
from .serializers import (
    UserSerializer,
    RegisterSerializer,
    ChangePasswordSerializer,
)
from .models import Notification, NotificationService
from .service_permissions import IsServiceToken


@extend_schema_view(
    list=extend_schema(
        summary='Список пользователей',
        description='Получить список пользователей (только для администраторов)',
        tags=['Пользователи'],
    ),
    retrieve=extend_schema(
        summary='Детали пользователя',
        description='Получить информацию о пользователе',
        tags=['Пользователи'],
    ),
    me=extend_schema(
        summary='Текущий пользователь',
        description='Получить информацию о текущем аутентифицированном пользователе',
        tags=['Пользователи'],
    ),
    register=extend_schema(
        summary='Регистрация',
        description='Зарегистрировать нового пользователя. Возвращает JWT токены для автоматического входа.',
        tags=['Аутентификация'],
    ),
    change_password=extend_schema(
        summary='Смена пароля',
        description='Изменить пароль текущего пользователя',
        tags=['Пользователи'],
    ),
    update_photo=extend_schema(
        summary='Обновить фотографию',
        description='Загрузить или обновить фотографию текущего пользователя',
        tags=['Пользователи'],
    ),
    update_profile=extend_schema(
        summary='Обновить профиль',
        description='Обновить профиль текущего пользователя (фотографию и другие поля)',
        tags=['Пользователи'],
    ),
)
class UserViewSet(viewsets.ModelViewSet):
    """
    ViewSet для управления пользователями
    
    list: Получить список пользователей (только для администраторов)
    retrieve: Получить информацию о пользователе
    me: Получить информацию о текущем пользователе
    register: Регистрация нового пользователя
    change_password: Смена пароля
    """
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_permissions(self):
        """
        Разрешения:
        - register: доступно всем
        - me, change_password: только аутентифицированным
        - list, create, update, destroy: только администраторам
        """
        if self.action == 'register':
            return [permissions.AllowAny()]
        elif self.action in ['me', 'change_password']:
            return [permissions.IsAuthenticated()]
        return [permissions.IsAdminUser()]
    
    def get_queryset(self):
        """Обычные пользователи видят только себя"""
        if self.request.user.is_staff:
            return User.objects.select_related('profile').all()
        return User.objects.select_related('profile').filter(id=self.request.user.id)
    
    def get_serializer_context(self):
        """Добавляем request в контекст сериализатора"""
        context = super().get_serializer_context()
        context['request'] = self.request
        return context
    
    @action(detail=False, methods=['post'], permission_classes=[permissions.AllowAny])
    def register(self, request):
        """Регистрация нового пользователя"""
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            refresh = RefreshToken.for_user(user)
            return Response({
                'user': UserSerializer(user, context={'request': request}).data,
                'refresh': str(refresh),
                'access': str(refresh.access_token),
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def me(self, request):
        """Получить информацию о текущем пользователе"""
        serializer = self.get_serializer(request.user, context={'request': request})
        return Response(serializer.data)
    
    @action(
        detail=False,
        methods=['put', 'patch'],
        permission_classes=[permissions.IsAuthenticated],
        parser_classes=[MultiPartParser, FormParser]
    )
    def update_photo(self, request):
        """Обновить фотографию текущего пользователя"""
        user = request.user
        if not hasattr(user, 'profile'):
            from core.models import UserProfile
            UserProfile.objects.create(user=user)
        
        photo = request.FILES.get('photo')
        if not photo:
            return Response({'error': 'Фотография не предоставлена'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Проверка типа файла
        if not photo.content_type.startswith('image/'):
            return Response({'error': 'Файл должен быть изображением'}, status=status.HTTP_400_BAD_REQUEST)
        
        user.profile.photo = photo
        user.profile.save()
        
        serializer = self.get_serializer(user, context={'request': request})
        return Response(serializer.data)
    
    @action(
        detail=False,
        methods=['put', 'patch'],
        permission_classes=[permissions.IsAuthenticated],
        parser_classes=[MultiPartParser, FormParser, JSONParser]
    )
    def update_profile(self, request):
        """Обновить профиль текущего пользователя"""
        user = request.user
        if not hasattr(user, 'profile'):
            from core.models import UserProfile
            UserProfile.objects.create(user=user)
        
        # Обновление фотографии, если предоставлена (только для multipart/form-data)
        photo = request.FILES.get('photo')
        if photo:
            # Проверка типа файла
            if not photo.content_type.startswith('image/'):
                return Response({'error': 'Файл должен быть изображением'}, status=status.HTTP_400_BAD_REQUEST)
            user.profile.photo = photo
        
        # Обновление полей пользователя, если предоставлены
        # Работает и для JSON, и для multipart/form-data
        if 'first_name' in request.data:
            user.first_name = request.data['first_name']
        if 'last_name' in request.data:
            user.last_name = request.data['last_name']
        if 'email' in request.data:
            user.email = request.data['email']
        
        user.save()
        if photo:
            user.profile.save()
        
        serializer = self.get_serializer(user, context={'request': request})
        return Response(serializer.data)
    
    @action(detail=False, methods=['post'], permission_classes=[permissions.IsAuthenticated])
    def change_password(self, request):
        """Смена пароля текущего пользователя"""
        serializer = ChangePasswordSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            user = request.user
            user.set_password(serializer.validated_data['new_password'])
            user.save()
            return Response({'message': 'Пароль успешно изменён'}, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# =============================================================================
# Notification — API уведомлений
# =============================================================================

class NotificationSerializer(drf_serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = [
            'id', 'notification_type', 'title', 'message',
            'data', 'is_read', 'created_at',
        ]
        read_only_fields = ['id', 'notification_type', 'title', 'message', 'data', 'created_at']


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API уведомлений пользователя.

    GET /api/v1/notifications/ — список уведомлений
    GET /api/v1/notifications/unread_count/ — количество непрочитанных
    POST /api/v1/notifications/{id}/mark_read/ — отметить как прочитанное
    POST /api/v1/notifications/mark_all_read/ — отметить все как прочитанные
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = NotificationSerializer

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user)

    @action(detail=False, methods=['get'])
    def unread_count(self, request):
        count = Notification.objects.filter(user=request.user, is_read=False).count()
        return Response({'count': count})

    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        notification.is_read = True
        notification.save(update_fields=['is_read'])
        return Response(NotificationSerializer(notification).data)

    @action(detail=False, methods=['post'])
    def mark_all_read(self, request):
        Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)
        return Response({'status': 'ok'})


class SystemNotificationCreateView(APIView):
    """
    Системный endpoint для межсервисных уведомлений (kanban -> ERP).
    Требует X-Service-Token.
    """

    permission_classes = [IsServiceToken]
    authentication_classes = []

    def post(self, request):
        user_id = request.data.get('user_id')
        notification_type = request.data.get('notification_type', Notification.NotificationType.GENERAL)
        title = request.data.get('title', '')
        message = request.data.get('message', '')
        data = request.data.get('data', None)

        if not user_id:
            return Response({'error': 'user_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        if not title:
            return Response({'error': 'title is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user = User.objects.get(id=int(user_id))
        except (User.DoesNotExist, ValueError):
            return Response({'error': 'user not found'}, status=status.HTTP_404_NOT_FOUND)

        n = NotificationService.create(
            user=user,
            notification_type=notification_type,
            title=title,
            message=message,
            data=data,
        )

        return Response({'id': n.id, 'status': 'ok'}, status=status.HTTP_201_CREATED)

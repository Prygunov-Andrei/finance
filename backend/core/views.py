from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from drf_spectacular.utils import extend_schema, extend_schema_view
from django.contrib.auth.models import User
from .serializers import (
    UserSerializer,
    RegisterSerializer,
    ChangePasswordSerializer,
)


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
            return User.objects.all()
        return User.objects.filter(id=self.request.user.id)
    
    @action(detail=False, methods=['post'], permission_classes=[permissions.AllowAny])
    def register(self, request):
        """Регистрация нового пользователя"""
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            refresh = RefreshToken.for_user(user)
            return Response({
                'user': UserSerializer(user).data,
                'refresh': str(refresh),
                'access': str(refresh.access_token),
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def me(self, request):
        """Получить информацию о текущем пользователе"""
        serializer = self.get_serializer(request.user)
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


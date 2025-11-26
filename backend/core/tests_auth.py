from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken


class AuthenticationTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()
        self.user_data = {
            'username': 'testuser',
            'email': 'test@example.com',
            'password': 'testpass123',
            'password_confirm': 'testpass123',
            'first_name': 'Test',
            'last_name': 'User',
        }

    def test_register_user(self) -> None:
        """Тест регистрации нового пользователя"""
        response = self.client.post('/api/v1/users/register/', self.user_data)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('user', response.data)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)
        self.assertEqual(response.data['user']['username'], 'testuser')
        
        # Проверяем, что пользователь создан
        self.assertTrue(User.objects.filter(username='testuser').exists())

    def test_register_user_password_mismatch(self) -> None:
        """Тест регистрации с несовпадающими паролями"""
        data = self.user_data.copy()
        data['password_confirm'] = 'different_password'
        response = self.client.post('/api/v1/users/register/', data)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password', response.data)

    def test_login(self) -> None:
        """Тест логина пользователя"""
        # Создаём пользователя
        user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        
        # Логинимся
        response = self.client.post('/api/v1/auth/login/', {
            'username': 'testuser',
            'password': 'testpass123'
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)

    def test_login_invalid_credentials(self) -> None:
        """Тест логина с неверными данными"""
        response = self.client.post('/api/v1/auth/login/', {
            'username': 'testuser',
            'password': 'wrongpassword'
        })
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_refresh_token(self) -> None:
        """Тест обновления токена"""
        user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )
        refresh = RefreshToken.for_user(user)
        
        response = self.client.post('/api/v1/auth/refresh/', {
            'refresh': str(refresh)
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)

    def test_get_current_user(self) -> None:
        """Тест получения информации о текущем пользователе"""
        user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        refresh = RefreshToken.for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
        
        response = self.client.get('/api/v1/users/me/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['username'], 'testuser')
        self.assertEqual(response.data['email'], 'test@example.com')

    def test_change_password(self) -> None:
        """Тест смены пароля"""
        user = User.objects.create_user(
            username='testuser',
            password='oldpass123'
        )
        refresh = RefreshToken.for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
        
        response = self.client.post('/api/v1/users/change_password/', {
            'old_password': 'oldpass123',
            'new_password': 'newpass123',
            'new_password_confirm': 'newpass123'
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Проверяем, что пароль изменился
        user.refresh_from_db()
        self.assertTrue(user.check_password('newpass123'))

    def test_change_password_wrong_old_password(self) -> None:
        """Тест смены пароля с неверным старым паролем"""
        user = User.objects.create_user(
            username='testuser',
            password='oldpass123'
        )
        refresh = RefreshToken.for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
        
        response = self.client.post('/api/v1/users/change_password/', {
            'old_password': 'wrongpass',
            'new_password': 'newpass123',
            'new_password_confirm': 'newpass123'
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class ProtectedEndpointsTests(TestCase):
    """Тесты доступа к защищённым endpoints"""
    
    def setUp(self) -> None:
        self.client = APIClient()
        self.user = User.objects.create_user(
            username='testuser',
            password='testpass123'
        )

    def test_objects_list_requires_auth(self) -> None:
        """Тест что список объектов требует авторизации"""
        response = self.client.get('/api/v1/objects/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_objects_list_with_auth(self) -> None:
        """Тест доступа к списку объектов с авторизацией"""
        refresh = RefreshToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')
        
        response = self.client.get('/api/v1/objects/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_contracts_list_requires_auth(self) -> None:
        """Тест что список договоров требует авторизации"""
        response = self.client.get('/api/v1/contracts/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_payments_list_requires_auth(self) -> None:
        """Тест что список платежей требует авторизации"""
        response = self.client.get('/api/v1/payments/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

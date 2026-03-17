import React from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Avatar, AvatarFallback } from '../components/ui/avatar';
import { Separator } from '../components/ui/separator';
import { LogOut, User, Mail, Calendar } from 'lucide-react';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const getInitials = () => {
    if (!user) return 'U';
    const firstName = user.first_name || '';
    const lastName = user.last_name || '';
    if (!firstName && !lastName) return 'U';
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'Неизвестно';
    try {
      return new Date(dateString).toLocaleDateString('ru-RU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch (error) {
      console.error('Ошибка форматирования даты:', error);
      return 'Неизвестно';
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-12 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1>Личный кабинет</h1>
            <p className="text-muted-foreground mt-1">
              Управление вашим профилем
            </p>
          </div>
          <Button
            variant="outline"
            onClick={handleLogout}
            className="gap-2"
          >
            <LogOut className="w-4 h-4" />
            Выйти
          </Button>
        </div>

        <Card className="p-8">
          <div className="flex items-start gap-6">
            <Avatar className="w-20 h-20">
              <AvatarFallback className="text-2xl">
                {getInitials()}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 space-y-6">
              <div>
                <h2>
                  Привет, {user.first_name}!
                </h2>
                <p className="text-muted-foreground mt-1">
                  Добро пожаловать на платформу HVAC News
                </p>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <User className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Полное имя</p>
                    <p>
                      {user.first_name} {user.last_name}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <Mail className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p>{user.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Дата регистрации
                    </p>
                    <p>{formatDate(user.date_joined)}</p>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="flex items-center gap-4">
                <div className="px-3 py-1.5 rounded-full bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-sm">
                  {user.is_active ? 'Активен' : 'Неактивен'}
                </div>
                {user.is_staff && (
                  <div className="px-3 py-1.5 rounded-full bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 text-sm">
                    Администратор
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="mb-4">Быстрые действия</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button variant="outline" className="justify-start h-auto py-4" onClick={() => navigate('/')}>
              <div className="text-left">
                <p>Главная страница</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Перейти к новостям
                </p>
              </div>
            </Button>
            <Button variant="outline" className="justify-start h-auto py-4" disabled>
              <div className="text-left">
                <p>Избранное</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Скоро доступно
                </p>
              </div>
            </Button>
            <Button variant="outline" className="justify-start h-auto py-4" disabled>
              <div className="text-left">
                <p>Настройки</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Скоро доступно
                </p>
              </div>
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
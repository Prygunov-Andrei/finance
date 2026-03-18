/**
 * Адаптер авторизации для hvac-admin страниц.
 * Вместо hvac-info AuthContext используем ERP-авторизацию.
 * Все hvac-admin страницы уже внутри ERP ProtectedRoute,
 * поэтому пользователь всегда авторизован.
 */

export interface HvacUser {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  is_staff: boolean;
}

export function useHvacAuth() {
  // В ERP все пользователи авторизованы (ProtectedRoute)
  // Для hvac-admin is_staff = true (доступ контролируется через ERP permissions)
  const user: HvacUser = {
    id: 1,
    email: '',
    first_name: 'ERP',
    last_name: 'User',
    is_staff: true,
  };

  return {
    user,
    isAuthenticated: true,
    isLoading: false,
    login: async () => {},
    logout: () => {},
    refreshUser: async () => {},
  };
}

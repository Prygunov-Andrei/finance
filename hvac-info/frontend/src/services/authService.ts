import apiClient from './apiClient';

interface LoginResponse {
  access: string;
  refresh: string;
}

interface RegisterData {
  email: string;
  first_name: string;
  last_name: string;
  password: string;
  password_confirm: string;
}

interface UserData {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  is_staff: boolean;
  date_joined: string;
}

export const authService = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await apiClient.post('/auth/jwt/create/', { email, password });
    return response.data;
  },

  async register(data: RegisterData): Promise<UserData> {
    const response = await apiClient.post('/auth/users/', data);
    return response.data;
  },

  async getCurrentUser(): Promise<UserData> {
    const response = await apiClient.get('/auth/users/me/');
    return response.data;
  },

  async refreshToken(refreshToken: string): Promise<{ access: string }> {
    const response = await apiClient.post('/auth/jwt/refresh/', {
      refresh: refreshToken,
    });
    return response.data;
  },
};

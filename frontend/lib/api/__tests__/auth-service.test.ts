import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAuthService } from '../services/auth';

describe('AuthService', () => {
  const mockRequest = vi.fn();
  const service = createAuthService(mockRequest);

  // Mock localStorage
  const storage: Record<string, string> = {};
  const localStorageMock = {
    getItem: vi.fn((key: string) => storage[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { storage[key] = value; }),
    removeItem: vi.fn((key: string) => { delete storage[key]; }),
  };

  beforeEach(() => {
    mockRequest.mockReset();
    vi.stubGlobal('localStorage', localStorageMock);
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    localStorageMock.removeItem.mockClear();
    Object.keys(storage).forEach(k => delete storage[k]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // ── login ─────────────────────────────────────────────────────────

  describe('login', () => {
    it('sends POST to /api/v1/auth/login/ and stores tokens', async () => {
      const responseData = { access: 'access-token-123', refresh: 'refresh-token-456' };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      }));

      const result = await service.login('admin', 'password');

      expect(fetch).toHaveBeenCalledWith('/api/erp/auth/login/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'password' }),
      });
      expect(result).toEqual(responseData);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('access_token', 'access-token-123');
      expect(localStorageMock.setItem).toHaveBeenCalledWith('refresh_token', 'refresh-token-456');
    });

    it('throws on failed login', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ detail: 'Invalid credentials' }),
      }));

      await expect(service.login('bad', 'creds')).rejects.toThrow('Invalid credentials');
    });

    it('throws default message when error response has no detail', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.reject(new Error('parse error')),
      }));

      await expect(service.login('bad', 'creds')).rejects.toThrow('Неверные учётные данные');
    });
  });

  // ── refreshToken ──────────────────────────────────────────────────

  describe('refreshToken', () => {
    it('returns false when no refresh_token in storage', async () => {
      const result = await service.refreshToken();
      expect(result).toBe(false);
    });

    it('sends POST to /api/v1/auth/refresh/ and updates access_token', async () => {
      storage['refresh_token'] = 'old-refresh';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ access: 'new-access-token' }),
      }));

      const result = await service.refreshToken();

      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith('/api/erp/auth/refresh/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh: 'old-refresh' }),
      });
      expect(localStorageMock.setItem).toHaveBeenCalledWith('access_token', 'new-access-token');
    });

    it('returns false when refresh endpoint returns non-ok', async () => {
      storage['refresh_token'] = 'expired-refresh';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({}),
      }));

      const result = await service.refreshToken();
      expect(result).toBe(false);
    });

    it('returns false when fetch throws', async () => {
      storage['refresh_token'] = 'some-refresh';
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

      const result = await service.refreshToken();
      expect(result).toBe(false);
    });
  });

  // ── logout ────────────────────────────────────────────────────────

  describe('logout', () => {
    it('removes both tokens from localStorage', () => {
      storage['access_token'] = 'a';
      storage['refresh_token'] = 'r';

      service.logout();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('access_token');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('refresh_token');
    });
  });

  // ── getCurrentUser ────────────────────────────────────────────────

  it('getCurrentUser calls request with /users/me/', async () => {
    mockRequest.mockResolvedValue({ id: 1, username: 'admin' });
    await service.getCurrentUser();
    expect(mockRequest).toHaveBeenCalledWith('/users/me/');
  });

  // ── getUsers ──────────────────────────────────────────────────────

  describe('getUsers', () => {
    it('calls /users/ and returns paginated response', async () => {
      const paginatedResponse = { results: [{ id: 1 }], count: 1, next: null, previous: null };
      mockRequest.mockResolvedValue(paginatedResponse);
      const result = await service.getUsers();
      expect(mockRequest).toHaveBeenCalledWith('/users/');
      expect(result).toEqual(paginatedResponse);
    });

    it('normalises plain array into paginated shape', async () => {
      const users = [{ id: 1, username: 'a' }, { id: 2, username: 'b' }];
      mockRequest.mockResolvedValue(users);
      const result = await service.getUsers();
      expect(result).toEqual({ results: users, count: 2, next: null, previous: null });
    });
  });
});

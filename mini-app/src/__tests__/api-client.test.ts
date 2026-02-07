/**
 * Unit-тесты API-клиента — 8 тестов.
 * Покрытие: setAccessToken, getAccessToken, request, authenticateWithTelegram,
 *           getShifts, createTeam, error handling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  setAccessToken,
  getAccessToken,
  authenticateWithTelegram,
  getShifts,
  createTeam,
  getWorkers,
  createWorker,
  getMedia,
} from '@/api/client';

// Мок fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockClear();
  setAccessToken('');
});

describe('setAccessToken / getAccessToken', () => {
  it('T3-h-6: устанавливает и возвращает токен', () => {
    setAccessToken('test-jwt-token');
    expect(getAccessToken()).toBe('test-jwt-token');
  });

  it('T3-h-8: без токена — запрос без Authorization', async () => {
    setAccessToken('');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    await getShifts();
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers['Authorization']).toBeUndefined();
  });
});

describe('request с авторизацией', () => {
  it('T3-h-6: с токеном — заголовок Authorization присутствует', async () => {
    setAccessToken('jwt-abc');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    await getWorkers();
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers['Authorization']).toBe('Bearer jwt-abc');
  });
});

describe('error handling', () => {
  it('T3-h-7: 400 → Error с detail', async () => {
    setAccessToken('token');
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: 'Validation error' }),
    });

    await expect(getShifts()).rejects.toThrow('Validation error');
  });

  it('T3-h-7: 500 → Error с statusText fallback', async () => {
    setAccessToken('token');
    mockFetch.mockResolvedValueOnce({
      ok: false,
      statusText: 'Internal Server Error',
      json: async () => { throw new Error(); },
    });

    await expect(getShifts()).rejects.toThrow('Internal Server Error');
  });
});

describe('authenticateWithTelegram', () => {
  it('отправляет initData в body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'jwt-new',
        refresh_token: 'refresh',
        worker: { id: '1', name: 'Test', role: 'worker' },
      }),
    });

    const result = await authenticateWithTelegram('raw_init_data');
    expect(result.access_token).toBe('jwt-new');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.init_data).toBe('raw_init_data');
  });
});

describe('createTeam', () => {
  it('отправляет shift_id, member_ids, brigadier_id', async () => {
    setAccessToken('jwt');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'team-1', memberships: [] }),
    });

    await createTeam({
      shift_id: 'shift-1',
      member_ids: ['w1', 'w2'],
      brigadier_id: 'w1',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.shift_id).toBe('shift-1');
    expect(body.member_ids).toEqual(['w1', 'w2']);
  });
});

describe('getMedia', () => {
  it('фильтрация по параметрам', async () => {
    setAccessToken('jwt');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    });

    await getMedia({ team: 'team-1', media_type: 'photo' });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('team=team-1');
    expect(url).toContain('media_type=photo');
  });
});

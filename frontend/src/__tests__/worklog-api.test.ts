import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock fetch globally ──
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Динамический импорт, чтобы fetch был подменён до инициализации модуля
let api: any;

beforeEach(async () => {
  vi.resetModules();
  mockFetch.mockReset();
  const mod = await import('../lib/api');
  api = mod.api;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Хелпер для мока успешного ответа ──
const mockSuccess = (data: any) => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => data,
    text: async () => JSON.stringify(data),
  });
};

const mockError = (status: number, detail: string) => {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    statusText: 'Error',
    text: async () => JSON.stringify({ detail }),
  });
};

// =============================================================================
// T4-a-1: getWorkJournalSummary
// =============================================================================

describe('getWorkJournalSummary', () => {
  it('T4-a-1: returns summary with correct fields', async () => {
    const mockSummary = {
      total_shifts: 10,
      active_shifts: 2,
      total_teams: 5,
      total_media: 150,
      total_reports: 8,
      total_workers: 20,
      recent_shifts: [
        {
          id: 'shift-1',
          object: 1,
          object_name: 'Объект 1',
          contractor: 1,
          contractor_name: 'Исполнитель 1',
          date: '2026-02-07',
          shift_type: 'day',
          start_time: '08:00:00',
          end_time: '17:00:00',
          status: 'active',
          registrations_count: 5,
          teams_count: 2,
        },
      ],
    };

    mockSuccess(mockSummary);

    const result = await api.getWorkJournalSummary(42);
    expect(result).toEqual(mockSummary);
    expect(result.total_shifts).toBe(10);
    expect(result.active_shifts).toBe(2);
    expect(result.recent_shifts).toHaveLength(1);
    expect(result.recent_shifts[0].status).toBe('active');

    // Проверяем URL
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/objects/42/work-journal/');
  });
});

// =============================================================================
// T4-a-2: getWorklogShifts — пагинированный ответ
// =============================================================================

describe('getWorklogShifts', () => {
  it('T4-a-2: returns paginated shifts with filters', async () => {
    const mockResponse = {
      count: 25,
      next: 'http://localhost/api/v1/worklog/shifts/?page=2',
      previous: null,
      results: [
        {
          id: 'shift-1',
          object: 1,
          object_name: 'Объект 1',
          contractor: 1,
          contractor_name: 'ООО Рога',
          date: '2026-02-07',
          shift_type: 'day',
          start_time: '08:00:00',
          end_time: '17:00:00',
          status: 'active',
          registrations_count: 3,
          teams_count: 1,
        },
      ],
    };

    mockSuccess(mockResponse);

    const result = await api.getWorklogShifts({
      object: 1,
      status: 'active',
      page: 1,
      page_size: 10,
    });

    expect(result.count).toBe(25);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].shift_type).toBe('day');

    // Проверяем query params
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('object=1');
    expect(url).toContain('status=active');
    expect(url).toContain('page=1');
    expect(url).toContain('page_size=10');
  });

  it('T4-a-2b: sends no query params when called without args', async () => {
    mockSuccess({ count: 0, next: null, previous: null, results: [] });

    await api.getWorklogShifts();

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/worklog/shifts/');
    expect(url).not.toContain('?');
  });
});

// =============================================================================
// T4-a-3: getWorklogMedia — фильтрация по team, tag
// =============================================================================

describe('getWorklogMedia', () => {
  it('T4-a-3: returns media filtered by team and tag', async () => {
    const mockResponse = {
      count: 5,
      next: null,
      previous: null,
      results: [
        {
          id: 'media-1',
          team: 'team-abc',
          team_name: 'Звено 1',
          author_name: 'Иванов',
          media_type: 'photo',
          tag: 'problem',
          file_url: 'https://minio/photo.jpg',
          thumbnail_url: 'https://minio/thumb.jpg',
          text_content: 'Трещина',
          status: 'downloaded',
          created_at: '2026-02-07T10:30:00Z',
        },
      ],
    };

    mockSuccess(mockResponse);

    const result = await api.getWorklogMedia({
      team: 'team-abc',
      tag: 'problem',
      media_type: 'photo',
      page: 1,
      page_size: 12,
    });

    expect(result.count).toBe(5);
    expect(result.results[0].tag).toBe('problem');
    expect(result.results[0].media_type).toBe('photo');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('team=team-abc');
    expect(url).toContain('tag=problem');
    expect(url).toContain('media_type=photo');
  });
});

// =============================================================================
// Дополнительные API тесты
// =============================================================================

describe('getWorklogReports', () => {
  it('returns reports filtered by type', async () => {
    mockSuccess({
      count: 3,
      next: null,
      previous: null,
      results: [
        {
          id: 'report-1',
          team: 'team-1',
          team_name: 'Звено 1',
          shift: 'shift-1',
          report_number: 1,
          report_type: 'final',
          media_count: 10,
          status: 'completed',
          created_at: '2026-02-07T16:00:00Z',
        },
      ],
    });

    const result = await api.getWorklogReports({ report_type: 'final' });
    expect(result.results[0].report_type).toBe('final');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('report_type=final');
  });
});

describe('getWorklogReportDetail', () => {
  it('returns full report with media and questions', async () => {
    const detail = {
      id: 'report-1',
      team: 'team-1',
      team_name: 'Звено 1',
      shift: 'shift-1',
      report_number: 1,
      report_type: 'intermediate',
      media_count: 2,
      status: 'completed',
      created_at: '2026-02-07T16:00:00Z',
      trigger: 'manual',
      media_items: [
        { id: 'm1', media_type: 'photo', author_name: 'Петров', tag: 'progress', file_url: '', thumbnail_url: '', text_content: '', status: 'downloaded', team: 'team-1', team_name: 'Звено 1', created_at: '2026-02-07T10:00:00Z' },
      ],
      questions: [
        { id: 'q1', report: 'report-1', author: 'user-1', author_name: 'Офис', text: 'Что за трещина?', status: 'answered', created_at: '2026-02-07T17:00:00Z', answers: [
          { id: 'a1', question: 'q1', author: 'user-2', author_name: 'Бригадир', text: 'Усадочная, некритичная', created_at: '2026-02-07T17:30:00Z' },
        ]},
      ],
    };

    mockSuccess(detail);

    const result = await api.getWorklogReportDetail('report-1');
    expect(result.media_items).toHaveLength(1);
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].answers).toHaveLength(1);
    expect(result.questions[0].status).toBe('answered');

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/worklog/reports/report-1/');
  });
});

describe('createWorklogQuestion', () => {
  it('sends POST with report_id and text', async () => {
    mockSuccess({ id: 'q-new', report: 'r1', author: 'u1', author_name: 'Офис', text: 'Вопрос?', status: 'pending', created_at: '2026-02-07T18:00:00Z', answers: [] });

    const result = await api.createWorklogQuestion({ report_id: 'r1', text: 'Вопрос?' });
    expect(result.status).toBe('pending');
    expect(result.text).toBe('Вопрос?');

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/worklog/questions/');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.report_id).toBe('r1');
    expect(body.text).toBe('Вопрос?');
  });
});

describe('answerWorklogQuestion', () => {
  it('sends POST answer to specific question', async () => {
    mockSuccess({ id: 'a-new', question: 'q1', author: 'u2', author_name: 'Бригадир', text: 'Ответ!', created_at: '2026-02-07T18:30:00Z' });

    const result = await api.answerWorklogQuestion('q1', { text: 'Ответ!' });
    expect(result.text).toBe('Ответ!');

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/worklog/questions/q1/answer/');
    expect(opts.method).toBe('POST');
  });
});

describe('updateObjectGeo', () => {
  it('sends PATCH with geo coordinates', async () => {
    mockSuccess({ id: 42, name: 'Объект', latitude: '55.7558', longitude: '37.6173', geo_radius: 300 });

    await api.updateObjectGeo(42, { latitude: '55.7558', longitude: '37.6173', geo_radius: 300 });

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('/objects/42/');
    expect(opts.method).toBe('PATCH');
    const body = JSON.parse(opts.body);
    expect(body.latitude).toBe('55.7558');
    expect(body.geo_radius).toBe(300);
  });
});

describe('getWorklogSupergroups', () => {
  it('returns supergroups filtered by object', async () => {
    mockSuccess({
      count: 1,
      next: null,
      previous: null,
      results: [{
        id: 'sg-1',
        object: 42,
        object_name: 'Объект 1',
        contractor: 1,
        contractor_name: 'ООО Монтаж',
        telegram_chat_id: -1001234567890,
        chat_title: 'Объект 1 — Рабочий чат',
        invite_link: 'https://t.me/+abc123',
        is_active: true,
        created_at: '2026-02-01T08:00:00Z',
      }],
    });

    const result = await api.getWorklogSupergroups({ object: 42 });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].is_active).toBe(true);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('object=42');
  });
});

describe('API error handling', () => {
  it('throws error with detail on 400', async () => {
    mockError(400, 'Некорректные данные');

    // API клиент формирует ошибку через Object.entries → "detail: Некорректные данные"
    await expect(api.getWorkJournalSummary(1)).rejects.toThrow('detail: Некорректные данные');
  });
});

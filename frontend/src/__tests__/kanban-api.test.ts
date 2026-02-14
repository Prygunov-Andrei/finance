import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

let kanbanApi: any;

beforeEach(async () => {
  vi.resetModules();
  mockFetch.mockReset();
  const mod = await import('../lib/kanbanApi');
  kanbanApi = mod.kanbanApi;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const mockSuccess = (data: any) => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => data,
    text: async () => JSON.stringify(data),
  });
};

describe('kanbanApi.listBoards', () => {
  it('calls GET /kanban-api/v1/boards/', async () => {
    mockSuccess([{ id: 'b1', key: 'supply', title: 'Supply' }]);
    const result = await kanbanApi.listBoards();
    expect(result).toHaveLength(1);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/kanban-api/v1/boards/');
  });
});


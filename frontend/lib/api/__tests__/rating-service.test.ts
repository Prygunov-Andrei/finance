import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRatingModels } from '../services/rating';

describe('getRatingModels', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('без opts — запрашивает /models/ без query', async () => {
    await getRatingModels();
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toMatch(/\/api\/public\/v1\/rating\/models\/$/);
  });

  it('с priceMax — добавляет ?price_max=', async () => {
    await getRatingModels({ priceMax: 30000 });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/models/?price_max=30000');
  });

  it('priceMax=0 трактуется как «нет фильтра» (== null check)', async () => {
    // Защита от случайного «бесплатного бюджета».
    await getRatingModels({ priceMax: undefined });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).not.toContain('price_max');
  });
});

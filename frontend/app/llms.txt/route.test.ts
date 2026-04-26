import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('GET /llms.txt', () => {
  it('возвращает markdown с описанием сайта и ключевыми ссылками', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/text\/markdown/);
    expect(res.headers.get('Cache-Control')).toMatch(/max-age=3600/);

    const body = await res.text();
    expect(body).toMatch(/# HVAC Info/);
    expect(body).toContain('https://hvac-info.com/rating-split-system');
    expect(body).toContain('https://hvac-info.com/quiet');
    expect(body).toContain('https://hvac-info.com/price/do-20000-rub');
    expect(body).toContain('https://hvac-info.com/llms-full.txt');
    expect(body).toContain('Максим Савинов');
    expect(body).toContain('Август-климат');
  });
});

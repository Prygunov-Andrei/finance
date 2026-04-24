import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const revalidatePathMock = vi.fn();

vi.mock('next/cache', () => ({
  revalidatePath: (p: string) => revalidatePathMock(p),
}));

import { POST } from './route';

const mkReq = (url: string) => new NextRequest(new URL(url));

describe('POST /api/revalidate', () => {
  const ORIGINAL_SECRET = process.env.REVALIDATE_SECRET;

  beforeEach(() => {
    revalidatePathMock.mockReset();
  });

  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) {
      delete process.env.REVALIDATE_SECRET;
    } else {
      process.env.REVALIDATE_SECRET = ORIGINAL_SECRET;
    }
  });

  it('возвращает 500 если REVALIDATE_SECRET не задан', async () => {
    delete process.env.REVALIDATE_SECRET;

    const res = await POST(mkReq('http://localhost/api/revalidate?secret=x&path=/'));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/not configured/i);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('без secret в query — 401', async () => {
    process.env.REVALIDATE_SECRET = 'topsecret';

    const res = await POST(mkReq('http://localhost/api/revalidate?path=/'));

    expect(res.status).toBe(401);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('с неверным secret — 401', async () => {
    process.env.REVALIDATE_SECRET = 'topsecret';

    const res = await POST(
      mkReq('http://localhost/api/revalidate?secret=wrong&path=/'),
    );

    expect(res.status).toBe(401);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('с правильным secret — 200 и revalidatePath вызван для /', async () => {
    process.env.REVALIDATE_SECRET = 'topsecret';

    const res = await POST(
      mkReq('http://localhost/api/revalidate?secret=topsecret&path=/'),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.revalidated).toBe(true);
    expect(body.path).toBe('/');
    expect(typeof body.at).toBe('string');
    expect(revalidatePathMock).toHaveBeenCalledWith('/');
  });

  it('с правильным secret и кастомным path — ревалидирует его', async () => {
    process.env.REVALIDATE_SECRET = 'topsecret';

    const res = await POST(
      mkReq('http://localhost/api/revalidate?secret=topsecret&path=/ratings/'),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.path).toBe('/ratings/');
    expect(revalidatePathMock).toHaveBeenCalledWith('/ratings/');
  });

  it('без path — по умолчанию "/"', async () => {
    process.env.REVALIDATE_SECRET = 'topsecret';

    const res = await POST(mkReq('http://localhost/api/revalidate?secret=topsecret'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.path).toBe('/');
    expect(revalidatePathMock).toHaveBeenCalledWith('/');
  });
});

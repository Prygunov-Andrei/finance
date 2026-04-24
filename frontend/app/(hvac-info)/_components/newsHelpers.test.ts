import { describe, expect, it } from 'vitest';
import type { HvacNews } from '@/lib/api/types/hvac';
import {
  formatNewsDate,
  formatNewsDateShort,
  getNewsCategoryLabel,
  getNewsHeroImage,
  getNewsLede,
  prevNextFromIndex,
} from './newsHelpers';

const mk = (partial: Partial<HvacNews>): HvacNews => ({
  id: 1,
  title: 'Test',
  body: '',
  pub_date: '2026-04-21T10:00:00Z',
  ...partial,
});

describe('formatNewsDate', () => {
  it('форматирует дату в ru-RU "21 апреля 2026 г." (допускаем суффикс)', () => {
    const out = formatNewsDate('2026-04-21T10:00:00Z');
    expect(out).toMatch(/21\s*апреля\s*2026/);
  });

  it('возвращает пустую строку для пустого/битого значения', () => {
    expect(formatNewsDate('')).toBe('');
    expect(formatNewsDate(null)).toBe('');
    expect(formatNewsDate('not-a-date')).toBe('');
  });
});

describe('formatNewsDateShort', () => {
  it('короткий формат "21 апр."', () => {
    expect(formatNewsDateShort('2026-04-21T10:00:00Z')).toMatch(/21\s*апр/);
  });
  it('пусто для null', () => {
    expect(formatNewsDateShort(undefined)).toBe('');
  });
});

describe('getNewsCategoryLabel', () => {
  it('берёт category_display если есть', () => {
    expect(getNewsCategoryLabel(mk({ category_display: 'Деловые', category: 'business' }))).toBe('Деловые');
  });
  it('fallback на category если нет display', () => {
    expect(getNewsCategoryLabel(mk({ category: 'business' }))).toBe('business');
  });
  it('fallback на "Новости" если оба пусты (graceful до M5)', () => {
    expect(getNewsCategoryLabel(mk({}))).toBe('Новости');
  });
});

describe('getNewsLede', () => {
  it('использует M5 lede если заполнен', () => {
    expect(getNewsLede(mk({ lede: 'Короткий лид' }))).toBe('Короткий лид');
  });
  it('truncate body до maxChars с многоточием', () => {
    const long = 'a'.repeat(250);
    const out = getNewsLede(mk({ body: long }), 100);
    expect(out.length).toBeLessThanOrEqual(101);
    expect(out.endsWith('…')).toBe(true);
  });
  it('очищает HTML из body', () => {
    expect(getNewsLede(mk({ body: '<p>Hello <b>world</b></p>' }))).toBe('Hello world');
  });
});

describe('getNewsHeroImage', () => {
  it('берёт первый image из media', () => {
    const n = mk({
      media: [
        { id: 1, file: '/m/a.jpg', media_type: 'image' },
        { id: 2, file: '/m/b.jpg', media_type: 'image' },
      ],
    });
    expect(getNewsHeroImage(n)).toBe('/m/a.jpg');
  });
  it('пропускает не-image media', () => {
    const n = mk({
      media: [
        { id: 1, file: '/m/v.mp4', media_type: 'video' },
        { id: 2, file: '/m/a.jpg', media_type: 'image' },
      ],
    });
    expect(getNewsHeroImage(n)).toBe('/m/a.jpg');
  });
  it('null если media пусто и body пуст', () => {
    expect(getNewsHeroImage(mk({}))).toBeNull();
  });

  it('media пусто + body с <img src="/media/..."> → возвращает /media/...', () => {
    const n = mk({
      body: '<p>Текст</p><img class="editor-image" src="/media/news/uploads/photo.jpg"><p>Ещё.</p>',
    });
    expect(getNewsHeroImage(n)).toBe('/media/news/uploads/photo.jpg');
  });

  it('media пусто + body без <img> → null', () => {
    expect(getNewsHeroImage(mk({ body: '<p>Только текст без картинок.</p>' }))).toBeNull();
  });

  it('media есть → игнорирует body (приоритет за media[])', () => {
    const n = mk({
      media: [{ id: 1, file: '/m/from-media.jpg', media_type: 'image' }],
      body: '<img src="/m/from-body.jpg">',
    });
    expect(getNewsHeroImage(n)).toBe('/m/from-media.jpg');
  });

  it('body с absolute URL → возвращает как есть', () => {
    const n = mk({ body: '<img src="https://cdn.example.com/a.jpg" alt="x">' });
    expect(getNewsHeroImage(n)).toBe('https://cdn.example.com/a.jpg');
  });

  it('декодирует &amp; → & в src', () => {
    const n = mk({ body: '<img src="/media/news/a.jpg?w=100&amp;h=200">' });
    expect(getNewsHeroImage(n)).toBe('/media/news/a.jpg?w=100&h=200');
  });

  it('предпочитает body_ru если задан', () => {
    const n = mk({
      body: '<img src="/m/en.jpg">',
      body_ru: '<img src="/m/ru.jpg">',
    });
    expect(getNewsHeroImage(n)).toBe('/m/ru.jpg');
  });
});

describe('prevNextFromIndex', () => {
  const list = [{ id: 10 }, { id: 20 }, { id: 30 }];

  it('середина: prev + next', () => {
    expect(prevNextFromIndex(list, 20)).toEqual({ prev: { id: 10 }, next: { id: 30 } });
  });
  it('первый: prev=null, next есть', () => {
    expect(prevNextFromIndex(list, 10)).toEqual({ prev: null, next: { id: 20 } });
  });
  it('последний: prev есть, next=null', () => {
    expect(prevNextFromIndex(list, 30)).toEqual({ prev: { id: 20 }, next: null });
  });
  it('id отсутствует в списке: оба null', () => {
    expect(prevNextFromIndex(list, 999)).toEqual({ prev: null, next: null });
  });
  it('пустой список', () => {
    expect(prevNextFromIndex([], 1)).toEqual({ prev: null, next: null });
  });
});

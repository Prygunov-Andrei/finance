import { describe, expect, it } from 'vitest';
import type { RatingModelDetail } from '@/lib/api/types/rating';
import {
  fallbackLede,
  formatNominalCapacity,
  minSupplierPrice,
  parsePoints,
  parseRutubeId,
  parseVkVideo,
  parseYoutubeId,
  rankLabel,
} from './detailHelpers';

describe('parsePoints', () => {
  it('парсит «заголовок — описание» и одиночные заголовки', () => {
    const text = 'Тихий — не мешает спать\nБольшой теплообменник\n';
    expect(parsePoints(text)).toEqual([
      { title: 'Тихий', body: 'не мешает спать' },
      { title: 'Большой теплообменник' },
    ]);
  });

  it('поддерживает дефис, эм-даш, en-dash', () => {
    const text = 'A - один\nB — два\nC – три';
    expect(parsePoints(text)).toEqual([
      { title: 'A', body: 'один' },
      { title: 'B', body: 'два' },
      { title: 'C', body: 'три' },
    ]);
  });

  it('пропускает пустые строки', () => {
    expect(parsePoints('  \n\n\n').length).toBe(0);
    expect(parsePoints('').length).toBe(0);
  });
});

describe('parseYoutubeId', () => {
  it.each([
    ['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ])('распознаёт %s', (url, id) => {
    expect(parseYoutubeId(url)).toBe(id);
  });

  it('возвращает null для пустой и битой строки', () => {
    expect(parseYoutubeId('')).toBeNull();
    expect(parseYoutubeId('https://example.com/video')).toBeNull();
  });
});

describe('parseVkVideo', () => {
  it('парсит публичный и отрицательный oid', () => {
    expect(parseVkVideo('https://vk.com/video-123_456')).toEqual({
      oid: '-123',
      id: '456',
    });
    expect(parseVkVideo('https://vk.com/video7777_88')).toEqual({
      oid: '7777',
      id: '88',
    });
  });

  it('возвращает null для плохого формата', () => {
    expect(parseVkVideo('https://vk.com/wall-123')).toBeNull();
    expect(parseVkVideo('')).toBeNull();
  });
});

describe('parseRutubeId', () => {
  it('парсит classic и embed-ссылки', () => {
    expect(parseRutubeId('https://rutube.ru/video/abc123def/')).toBe('abc123def');
    expect(parseRutubeId('https://rutube.ru/play/embed/9999aaaa')).toBe('9999aaaa');
  });

  it('null для пустой', () => {
    expect(parseRutubeId('')).toBeNull();
  });
});

describe('rankLabel', () => {
  it('покрывает ключевые пороги', () => {
    expect(rankLabel(1)).toBe('лидер');
    expect(rankLabel(5)).toBe('в топ-5');
    expect(rankLabel(6)).toBe('в топ-10');
    expect(rankLabel(10)).toBe('в топ-10');
    expect(rankLabel(11)).toBe('среди');
    expect(rankLabel(null)).toBe('среди');
  });
});

describe('minSupplierPrice', () => {
  const mk = (price: string | null) => ({
    id: 1,
    name: 'S',
    url: '',
    order: 0,
    price,
    city: '',
    rating: null,
    availability: 'unknown' as const,
    availability_display: 'Не известно',
    note: '',
  });

  it('находит минимум среди валидных цен', () => {
    expect(
      minSupplierPrice([mk('155000'), mk('149000'), mk(null), mk('160000')]),
    ).toBe(149000);
  });

  it('возвращает null если все цены null или invalid', () => {
    expect(minSupplierPrice([mk(null), mk('abc')])).toBeNull();
    expect(minSupplierPrice([])).toBeNull();
  });
});

describe('formatNominalCapacity', () => {
  // Intl.NumberFormat('ru-RU') разделяет тысячи non-breaking space (\u00A0 / \u202F),
  // не обычным. Сверяем по regex с \s.
  it('API отдаёт ватты — не умножать на 1000 (регрессия: раньше рендерило «2 800 000 Вт»)', () => {
    expect(formatNominalCapacity(2800)).toMatch(/^2\s800 Вт$/);
    expect(formatNominalCapacity(3500)).toMatch(/^3\s500 Вт$/);
  });

  it('округляет дробные до ближайшего ватта', () => {
    expect(formatNominalCapacity(2800.4)).toMatch(/^2\s800 Вт$/);
    expect(formatNominalCapacity(2800.6)).toMatch(/^2\s801 Вт$/);
  });

  it('возвращает «—» для null', () => {
    expect(formatNominalCapacity(null)).toBe('—');
  });
});

describe('fallbackLede', () => {
  it('использует rank если есть', () => {
    const d = {
      brand: { name: 'CASARTE' },
      inner_unit: 'CAS-35',
      rank: 3,
      total_index: 78.5,
    } as RatingModelDetail;
    expect(fallbackLede(d)).toContain('№3 в рейтинге');
    expect(fallbackLede(d)).toContain('78.5');
  });

  it('fallback при null rank', () => {
    const d = {
      brand: { name: 'X' },
      inner_unit: 'Y',
      rank: null,
      total_index: 50,
    } as RatingModelDetail;
    expect(fallbackLede(d)).not.toContain('№');
    expect(fallbackLede(d)).toContain('в рейтинге');
  });
});

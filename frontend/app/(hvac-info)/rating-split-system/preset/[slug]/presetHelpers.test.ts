import { describe, expect, it } from 'vitest';
import type { RatingMethodologyPreset } from '@/lib/api/types/rating';
import { findPublishablePreset, publishablePresets } from './presetHelpers';

const preset = (
  partial: Partial<RatingMethodologyPreset> & { id: number; slug: string },
): RatingMethodologyPreset => ({
  label: partial.slug,
  order: 0,
  description: '',
  is_all_selected: false,
  criteria_codes: [],
  ...partial,
});

describe('publishablePresets', () => {
  it('исключает is_all_selected (это главная страница рейтинга)', () => {
    const all = [
      preset({ id: 1, slug: 'avgust', is_all_selected: true }),
      preset({ id: 2, slug: 'silence' }),
      preset({ id: 3, slug: 'budget' }),
    ];
    expect(publishablePresets(all).map((p) => p.slug)).toEqual(['silence', 'budget']);
  });

  it('пустой вход → пустой выход', () => {
    expect(publishablePresets([])).toEqual([]);
  });
});

describe('findPublishablePreset', () => {
  const presets = [
    preset({ id: 1, slug: 'avgust', is_all_selected: true }),
    preset({ id: 2, slug: 'silence' }),
  ];

  it('находит обычный пресет', () => {
    expect(findPublishablePreset(presets, 'silence')?.id).toBe(2);
  });

  it('возвращает undefined для is_all_selected — он не публикуется как URL', () => {
    expect(findPublishablePreset(presets, 'avgust')).toBeUndefined();
  });

  it('возвращает undefined для несуществующего slug', () => {
    expect(findPublishablePreset(presets, 'no-such-thing')).toBeUndefined();
  });
});

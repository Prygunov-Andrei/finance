import type { RatingMethodologyPreset } from '@/lib/api/types/rating';

/**
 * Возвращает только пресеты, которые имеют смысл публиковать как отдельные
 * SEO-URL: пропускаем `is_all_selected` (это и есть главная страница рейтинга).
 */
export function publishablePresets(
  presets: RatingMethodologyPreset[],
): RatingMethodologyPreset[] {
  return presets.filter((p) => !p.is_all_selected);
}

export function findPublishablePreset(
  presets: RatingMethodologyPreset[],
  slug: string,
): RatingMethodologyPreset | undefined {
  return presets.find((p) => p.slug === slug && !p.is_all_selected);
}

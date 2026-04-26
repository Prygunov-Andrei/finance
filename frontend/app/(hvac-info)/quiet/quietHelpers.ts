import type { RatingModelListItem } from '@/lib/api/types/rating';

/**
 * Готовит набор моделей для страницы /quiet.
 *
 * Берём только опубликованные модели, для которых есть лабораторный замер
 * шума (`has_noise_measurement` + ненулевой `noise_score`). Сортируем по
 * убыванию `noise_score` — это нормализованный балл «Август-климат» (0–100),
 * больше = тише, поэтому DESC = «самые тихие первые».
 */
export function filterQuietModels(
  models: RatingModelListItem[],
): RatingModelListItem[] {
  return models
    .filter((m) => m.publish_status === 'published')
    .filter((m) => m.has_noise_measurement && m.noise_score != null)
    .sort((a, b) => (b.noise_score ?? 0) - (a.noise_score ?? 0));
}

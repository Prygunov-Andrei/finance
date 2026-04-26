import type { RatingModelListItem } from '@/lib/api/types/rating';

export interface PriceSlugDef {
  slug: string;
  priceMax: number;
  label: string;
}

export const PRICE_SLUGS: readonly PriceSlugDef[] = [
  { slug: 'do-20000-rub', priceMax: 20000, label: 'до 20 000 ₽' },
  { slug: 'do-25000-rub', priceMax: 25000, label: 'до 25 000 ₽' },
  { slug: 'do-30000-rub', priceMax: 30000, label: 'до 30 000 ₽' },
  { slug: 'do-35000-rub', priceMax: 35000, label: 'до 35 000 ₽' },
  { slug: 'do-40000-rub', priceMax: 40000, label: 'до 40 000 ₽' },
  { slug: 'do-50000-rub', priceMax: 50000, label: 'до 50 000 ₽' },
  { slug: 'do-60000-rub', priceMax: 60000, label: 'до 60 000 ₽' },
] as const;

export function findPriceSlug(slug: string): PriceSlugDef | undefined {
  return PRICE_SLUGS.find((p) => p.slug === slug);
}

/**
 * Защитная клиентская фильтрация по бюджету.
 *
 * Backend AC-Пети поддерживает `?price_max=` — серверный фильтр приходит
 * заранее. Эта функция страхует на случай если backend ещё не смержен или
 * пропустил параметр: оставляем модели с `price ≤ priceMax` плюс модели
 * без указанной цены (редакция могла ещё не озвучить — отсекать жёстко
 * нельзя).
 */
export function filterByBudget(
  models: RatingModelListItem[],
  priceMax: number,
): RatingModelListItem[] {
  return models
    .filter((m) => m.publish_status === 'published')
    .filter((m) => {
      if (m.price == null) return true;
      const n = Number(m.price);
      if (!Number.isFinite(n)) return true;
      return n <= priceMax;
    });
}

import type { RatingModelSupplier } from '@/lib/api/types/rating';

export interface PriceStats {
  min: number;
  median: number;
  avg: number;
  max: number;
  count: number;
  minSupplier: RatingModelSupplier | null;
  maxSupplier: RatingModelSupplier | null;
}

export function toNumber(p: string | null | undefined): number | null {
  if (p == null || p === '') return null;
  const n = Number(p);
  return Number.isFinite(n) ? n : null;
}

export function computePriceStats(
  suppliers: RatingModelSupplier[],
): PriceStats {
  const withPrice = suppliers
    .map((s) => ({ s, n: toNumber(s.price) }))
    .filter((x): x is { s: RatingModelSupplier; n: number } => x.n != null);
  const count = withPrice.length;
  if (count === 0) {
    return {
      min: 0,
      median: 0,
      avg: 0,
      max: 0,
      count: 0,
      minSupplier: null,
      maxSupplier: null,
    };
  }
  const sorted = [...withPrice].sort((a, b) => a.n - b.n);
  const prices = sorted.map((x) => x.n);
  const min = prices[0];
  const max = prices[prices.length - 1];
  const sum = prices.reduce((s, p) => s + p, 0);
  const avg = sum / count;
  const mid = Math.floor(count / 2);
  const median = count % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid];
  return {
    min,
    median,
    avg,
    max,
    count,
    minSupplier: sorted[0].s,
    maxSupplier: sorted[sorted.length - 1].s,
  };
}

export interface CityCount {
  city: string;
  count: number;
}

export function cityCounts(suppliers: RatingModelSupplier[]): CityCount[] {
  const map = new Map<string, number>();
  for (const s of suppliers) {
    const city = (s.city ?? '').trim();
    if (!city) continue;
    map.set(city, (map.get(city) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city, 'ru'));
}

export function filterSuppliers(
  suppliers: RatingModelSupplier[],
  opts: { city?: string | null },
): RatingModelSupplier[] {
  const city = (opts.city ?? '').trim();
  if (!city) return suppliers;
  return suppliers.filter((s) => (s.city ?? '').trim() === city);
}

export function sortByPriceAsc(
  suppliers: RatingModelSupplier[],
): RatingModelSupplier[] {
  return [...suppliers].sort((a, b) => {
    const pa = toNumber(a.price);
    const pb = toNumber(b.price);
    if (pa == null && pb == null) return a.order - b.order;
    if (pa == null) return 1;
    if (pb == null) return -1;
    return pa - pb;
  });
}

export function availabilityDotColor(
  availability: RatingModelSupplier['availability'],
): string {
  switch (availability) {
    case 'in_stock':
      return '#1f8f4c';
    case 'low_stock':
      return '#c9821c';
    case 'out_of_stock':
      return '#b24a3b';
    default:
      return 'hsl(var(--rt-ink-40))';
  }
}

export function formatPriceShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}k`;
  return String(Math.round(n));
}

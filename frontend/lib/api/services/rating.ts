import type {
  RatingModelListItem,
  RatingModelDetail,
  RatingMethodology,
  RatingBrandOption,
} from '../types/rating';

function resolveBase(): string {
  if (typeof window === 'undefined') {
    return (process.env.BACKEND_API_URL || 'http://backend:8000').replace(/\/$/, '');
  }
  return (process.env.NEXT_PUBLIC_BACKEND_URL ?? '').replace(/\/$/, '');
}

async function ratingFetch<T>(path: string): Promise<T> {
  const url = `${resolveBase()}/api/public/v1/rating${path}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) {
    throw new Error(`Rating API ${res.status}: ${url}`);
  }
  return res.json() as Promise<T>;
}

export function getRatingModels(): Promise<RatingModelListItem[]> {
  return ratingFetch<RatingModelListItem[]>('/models/');
}

export function getRatingModelBySlug(slug: string): Promise<RatingModelDetail> {
  return ratingFetch<RatingModelDetail>(`/models/by-slug/${slug}/`);
}

export async function getRatingMethodology(): Promise<RatingMethodology> {
  // ВРЕМЕННЫЙ defaulting: backend Polish-3 (AC-Петя) пока не смержен,
  // поле `presets` в ответе может отсутствовать. После мержа backend защита
  // безопасна (?? [] на существующем массиве) и её можно оставить как
  // graceful fallback. Типы считают поле обязательным, чтобы потребители
  // не забывали его учитывать.
  const raw = await ratingFetch<Partial<RatingMethodology> & Omit<RatingMethodology, 'presets'>>(
    '/methodology/',
  );
  return { ...raw, presets: raw.presets ?? [] } as RatingMethodology;
}

export function getRatingArchiveModels(): Promise<RatingModelListItem[]> {
  return ratingFetch<RatingModelListItem[]>('/models/archive/');
}

export function getRatingBrands(): Promise<RatingBrandOption[]> {
  return ratingFetch<RatingBrandOption[]>('/brands/');
}

import type {
  RatingModelListItem,
  RatingModelDetail,
  RatingMethodology,
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

export function getRatingMethodology(): Promise<RatingMethodology> {
  return ratingFetch<RatingMethodology>('/methodology/');
}

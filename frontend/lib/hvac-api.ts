/**
 * Серверный API-клиент для hvac-info backend.
 * Используется в Server Components для SSR.
 */

const HVAC_API_URL = process.env.HVAC_API_URL || 'http://hvac-backend:8001';

interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface NewsItem {
  id: number;
  title: string;
  title_ru: string;
  title_en: string;
  title_de: string;
  title_pt: string;
  body: string;
  body_ru: string;
  body_en: string;
  body_de: string;
  body_pt: string;
  pub_date: string;
  status: 'draft' | 'scheduled' | 'published';
  source_url: string;
  source_language: string;
  created_at: string;
  updated_at: string;
  media: NewsMedia[];
  manufacturer: ManufacturerRef | null;
  is_no_news_found: boolean;
}

export interface NewsMedia {
  id: number;
  file: string;
  media_type: string;
  caption: string;
}

export interface ManufacturerRef {
  id: number;
  name: string;
}

export interface Manufacturer {
  id: number;
  name: string;
  name_ru: string;
  name_en: string;
  website: string;
  logo: string;
  description: string;
  description_ru: string;
  description_en: string;
  country: string;
  region: string;
  news_count: number;
  brands_count: number;
}

export interface Brand {
  id: number;
  name: string;
  name_ru: string;
  name_en: string;
  manufacturer: ManufacturerRef;
  description: string;
}

export interface Resource {
  id: number;
  name: string;
  url: string;
  description: string;
  is_active: boolean;
}

async function fetchApi<T>(endpoint: string, options?: { revalidate?: number }): Promise<T> {
  const url = `${HVAC_API_URL}/api/hvac${endpoint}`;
  const res = await fetch(url, {
    next: { revalidate: options?.revalidate ?? 300 },
    headers: { 'Accept': 'application/json', 'Host': 'hvac-info.com' },
  });

  if (!res.ok) {
    throw new Error(`HVAC API error: ${res.status} ${res.statusText} for ${url}`);
  }

  return res.json();
}

// --- Публичные методы ---

export async function getNews(page = 1): Promise<PaginatedResponse<NewsItem>> {
  return fetchApi(`/news/?page=${page}`, { revalidate: 300 });
}

export async function getNewsById(id: number): Promise<NewsItem> {
  return fetchApi(`/news/${id}/`, { revalidate: 600 });
}

export async function getAllNews(): Promise<NewsItem[]> {
  // Для sitemap/RSS — получаем все новости
  const items: NewsItem[] = [];
  let page = 1;
  let hasNext = true;

  while (hasNext) {
    const data = await fetchApi<PaginatedResponse<NewsItem>>(`/news/?page=${page}&page_size=100`, { revalidate: 3600 });
    items.push(...data.results);
    hasNext = !!data.next;
    page++;
  }

  return items;
}

export async function getManufacturers(): Promise<Manufacturer[]> {
  return fetchApi('/references/manufacturers/', { revalidate: 3600 });
}

export async function getBrands(): Promise<Brand[]> {
  return fetchApi('/references/brands/', { revalidate: 3600 });
}

export async function getResources(): Promise<Resource[]> {
  return fetchApi('/references/resources/', { revalidate: 3600 });
}

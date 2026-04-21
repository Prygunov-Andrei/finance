import type { RatingModelDetail } from '@/lib/api/types/rating';

export interface ProsConsPoint {
  title: string;
  body?: string;
}

export function parsePoints(text: string): ProsConsPoint[] {
  if (!text) return [];
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [title, ...rest] = line.split(/[—–-]\s+/);
      const body = rest.join(' ').trim();
      return body ? { title: title.trim(), body } : { title: title.trim() };
    });
}

export function parseYoutubeId(url: string): string | null {
  if (!url) return null;
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

export interface VkVideoRef {
  oid: string;
  id: string;
}

export function parseVkVideo(url: string): VkVideoRef | null {
  if (!url) return null;
  const m = url.match(/video(-?\d+)_(\d+)/);
  return m ? { oid: m[1], id: m[2] } : null;
}

export function parseRutubeId(url: string): string | null {
  if (!url) return null;
  const m = url.match(/(?:video|play\/embed)\/([a-z0-9]+)/i);
  return m ? m[1] : null;
}

export function fallbackLede(d: RatingModelDetail): string {
  const rankPart = d.rank ? `№${d.rank} в рейтинге` : 'в рейтинге';
  return `${d.brand.name} ${d.inner_unit} — ${rankPart} с индексом ${d.total_index.toFixed(1)}. Редакторский обзор готовится.`;
}

export function rankLabel(rank: number | null): string {
  if (rank == null) return 'среди';
  if (rank === 1) return 'лидер';
  if (rank <= 5) return 'в топ-5';
  if (rank <= 10) return 'в топ-10';
  return 'среди';
}

export function formatNominalCapacity(capacity: number | null): string {
  if (capacity == null) return '—';
  return `${new Intl.NumberFormat('ru-RU').format(Math.round(capacity))} Вт`;
}

export function minSupplierPrice(
  suppliers: RatingModelDetail['suppliers'],
): number | null {
  const prices = suppliers
    .map((s) => (s.price ? Number(s.price) : NaN))
    .filter((n) => Number.isFinite(n));
  if (prices.length === 0) return null;
  return Math.min(...prices);
}

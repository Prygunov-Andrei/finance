import type { RatingModelListItem } from '@/lib/api/types/rating';

export function pickRelated(
  all: RatingModelListItem[],
  currentId: number,
  currentRank: number | null,
  limit = 4,
): RatingModelListItem[] {
  if (currentRank == null) return [];
  return all
    .filter(
      (m) =>
        m.id !== currentId &&
        m.rank != null &&
        m.publish_status === 'published',
    )
    .sort(
      (a, b) =>
        Math.abs((a.rank as number) - currentRank) -
        Math.abs((b.rank as number) - currentRank),
    )
    .slice(0, limit);
}

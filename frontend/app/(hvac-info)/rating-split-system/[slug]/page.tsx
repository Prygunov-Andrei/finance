import { notFound, permanentRedirect } from 'next/navigation';
import { getRatingModelBySlug } from '@/lib/api/services/rating';
import type { RatingModelDetail } from '@/lib/api/types/rating';

// Wave 11 hotfix: 308 redirect старых URL карточек на /konditsioner/[slug].
// Через page.tsx (а не next.config.js redirects), потому что path-to-regexp
// :slug([A-Z][^/]+) ловил и подпути methodology/archive/submit. Здесь же
// Next.js routing приоритизирует более специфичные роуты (methodology/page.tsx,
// archive/page.tsx, submit/page.tsx, preset/[slug]/page.tsx) перед catch-all
// [slug]/page.tsx — поэтому статичные подпути работают как раньше.
//
// Wave 12: резолвим старый slug в новый канонический через backend (by-slug
// ищет по slug ИЛИ legacy_slug). Один прямой 308 на /konditsioner/<lower>,
// без промежуточного /konditsioner/<old> (которое в Wave 12 само редиректило бы).

type Props = { params: Promise<{ slug: string }> };

export default async function LegacyRatingSlugRedirect({ params }: Props) {
  const { slug } = await params;

  let detail: RatingModelDetail;
  try {
    detail = await getRatingModelBySlug(slug);
  } catch {
    notFound();
  }

  permanentRedirect(`/konditsioner/${detail.slug}`);
}

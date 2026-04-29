import { permanentRedirect } from 'next/navigation';

// Wave 11 hotfix: 308 redirect старых URL карточек на /konditsioner/[slug].
// Через page.tsx (а не next.config.js redirects), потому что path-to-regexp
// :slug([A-Z][^/]+) ловил и подпути methodology/archive/submit. Здесь же
// Next.js routing приоритизирует более специфичные роуты (methodology/page.tsx,
// archive/page.tsx, submit/page.tsx, preset/[slug]/page.tsx) перед catch-all
// [slug]/page.tsx — поэтому статичные подпути работают как раньше.

type Props = { params: Promise<{ slug: string }> };

export default async function LegacyRatingSlugRedirect({ params }: Props) {
  const { slug } = await params;
  permanentRedirect(`/konditsioner/${slug}`);
}

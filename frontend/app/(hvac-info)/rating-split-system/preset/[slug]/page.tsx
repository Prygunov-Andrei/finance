import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  getRatingMethodology,
  getRatingModels,
} from '@/lib/api/services/rating';
import RatingPageContent from '../../_components/RatingPageContent';
import { findPublishablePreset, publishablePresets } from './presetHelpers';

// Wave 10.2 hotfix: force-dynamic чтобы Suspense внутри RatingPageContent
// (HeroBlock с h1) попадал в initial SSR HTML, а не приходил через streaming.
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  try {
    const methodology = await getRatingMethodology();
    return publishablePresets(methodology.presets).map((p) => ({ slug: p.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  let methodology: Awaited<ReturnType<typeof getRatingMethodology>> | null = null;
  try {
    methodology = await getRatingMethodology();
  } catch {
    // Метаданные fallback ниже
  }
  const preset = methodology
    ? findPublishablePreset(methodology.presets, slug)
    : undefined;
  if (!preset) return { title: 'Пресет не найден' };
  const title = `Рейтинг ${preset.label} — Август-климат`;
  const description =
    preset.description?.trim() ||
    `Рейтинг кондиционеров под приоритет «${preset.label}» — собран по выборке критериев методики «Август-климат».`;
  return {
    title,
    description,
    alternates: { canonical: `/rating-split-system/preset/${preset.slug}` },
    robots: { index: true, follow: true },
  };
}

export default async function PresetRatingPage({ params }: Props) {
  const { slug } = await params;

  let models: Awaited<ReturnType<typeof getRatingModels>> = [];
  let methodology: Awaited<ReturnType<typeof getRatingMethodology>> = {
    version: '',
    name: '',
    criteria: [],
    stats: { total_models: 0, active_criteria_count: 0, median_total_index: 0 },
    presets: [],
  };
  try {
    [models, methodology] = await Promise.all([
      getRatingModels(),
      getRatingMethodology(),
    ]);
  } catch (e) {
    console.error('[ratings-preset] fetch failed:', e);
  }

  const preset = findPublishablePreset(methodology.presets, slug);
  if (!preset) notFound();

  const published = models.filter((m) => m.publish_status === 'published');
  const heroTitle = `Рейтинг кондиционеров: ${preset.label} — Август-климат`;
  const heroIntro =
    preset.description?.trim() ||
    `Кондиционеры, отобранные под приоритет «${preset.label}» — рейтинг пересчитан только по релевантным критериям методики «Август-климат».`;

  return (
    <RatingPageContent
      models={published}
      methodology={methodology}
      defaultTab="custom"
      initialPresetSlug={preset.slug}
      hero={{
        title: heroTitle,
        eyebrow: `Пресет «${preset.label}» · 04.2026`,
        intro: heroIntro,
      }}
      mobileHero={{
        title: heroTitle,
        eyebrow: `${preset.label} · 04.2026`,
      }}
    />
  );
}

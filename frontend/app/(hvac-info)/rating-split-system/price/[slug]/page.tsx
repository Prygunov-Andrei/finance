import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  getRatingMethodology,
  getRatingModels,
} from '@/lib/api/services/rating';
import RatingPageContent from '../../_components/RatingPageContent';
import { PRICE_SLUGS, filterByBudget, findPriceSlug } from './priceHelpers';

export const revalidate = 3600;

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return PRICE_SLUGS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const def = findPriceSlug(slug);
  if (!def) return { title: 'Страница не найдена' };
  const title = `Кондиционеры ${def.label} — рейтинг | HVAC Info`;
  const description = `Лучшие кондиционеры стоимостью ${def.label} — рейтинг по интегральному индексу «Август-климат». Сравнение по характеристикам, шуму, энергоэффективности.`;
  return {
    title,
    description,
    alternates: { canonical: `/rating-split-system/price/${def.slug}` },
    robots: { index: true, follow: true },
  };
}

export default async function PriceRatingPage({ params }: Props) {
  const { slug } = await params;
  const def = findPriceSlug(slug);
  if (!def) notFound();

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
      getRatingModels({ priceMax: def.priceMax }),
      getRatingMethodology(),
    ]);
  } catch (e) {
    console.error('[ratings-price] fetch failed, rendering empty:', e);
  }

  const inBudget = filterByBudget(models, def.priceMax);

  const heroTitle = `Кондиционеры ${def.label} — рейтинг`;
  const heroIntro = `Сплит-системы стоимостью ${def.label}, отсортированные по интегральному индексу «Август-климат». Сравнение по уровню шума, энергоэффективности и качеству комплектующих — все модели проверены по единой методике.`;

  return (
    <RatingPageContent
      models={inBudget}
      methodology={methodology}
      hero={{
        title: heroTitle,
        eyebrow: `Бюджет ${def.label} · 04.2026`,
        intro: heroIntro,
      }}
      mobileHero={{
        title: heroTitle,
        eyebrow: `${def.label} · 04.2026`,
      }}
    />
  );
}

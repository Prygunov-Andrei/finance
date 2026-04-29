import type { Metadata } from 'next';
import {
  getRatingMethodology,
  getRatingModels,
} from '@/lib/api/services/rating';
import RatingPageContent from '../rating-split-system/_components/RatingPageContent';
import { filterQuietModels } from './quietHelpers';

// Wave 10.2 hotfix: force-dynamic чтобы Suspense внутри RatingPageContent
// (DesktopListing/MobileListing с HeroBlock h1) полностью попадал в SSR HTML.
// Без этого initial HTML отдаёт fallback={null}, h1 приходит только через
// streaming RSC payload — SEO-боты на initial-HTML видят 0 H1.
export const dynamic = 'force-dynamic';

const PAGE_TITLE = 'Самые тихие кондиционеры — рейтинг по уровню шума';
const PAGE_INTRO =
  'Сплит-системы 2,5–4,5 кВт с самым низким шумом внутреннего блока. Каждая модель прошла лабораторный замер на минимальной скорости вентилятора по единой методике «Август-климат» — поэтому числа в дБ(А) сопоставимы между производителями.';

export const metadata: Metadata = {
  title: 'Самые тихие кондиционеры — рейтинг по уровню шума',
  description:
    'Кондиционеры с самым низким уровнем шума — лабораторные замеры внутреннего блока на минимальной скорости. Топ моделей сплит-систем 2,5–4,5 кВт.',
  alternates: { canonical: '/rating-split-system/quiet' },
  robots: { index: true, follow: true },
};

export default async function QuietRatingPage() {
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
    console.error('[ratings-quiet] fetch failed, rendering empty:', e);
  }

  const measured = filterQuietModels(models);

  return (
    <RatingPageContent
      models={measured}
      methodology={methodology}
      defaultTab="silence"
      hero={{
        title: PAGE_TITLE,
        eyebrow: 'Лабораторные замеры шума · 04.2026',
        intro: PAGE_INTRO,
      }}
      mobileHero={{
        title: PAGE_TITLE,
        eyebrow: 'Самые тихие · 04.2026',
      }}
    />
  );
}

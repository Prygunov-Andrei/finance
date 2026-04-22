import type { Metadata } from 'next';

import HvacInfoHeader from '@/components/hvac-info/HvacInfoHeader';
import { getRatingMethodology } from '@/lib/api/services/rating';
import BackToRating from '../_components/BackToRating';
import SectionFooter from '../_components/SectionFooter';
import StickyCollapseHero from '../_components/StickyCollapseHero';

import MethodologyHero, { MethodologyHeroCollapsed } from './MethodologyHero';
import MethodologyTable from './MethodologyTable';

export const metadata: Metadata = {
  title: 'Методика рейтинга',
  description:
    'Методика расчёта индекса «Август-климат»: 30 параметров, веса, шкалы.',
};

// force-dynamic — иначе build-time SSG может захватить пустой API (см. /ratings/ урок)
export const dynamic = 'force-dynamic';

export default async function RatingMethodologyPage() {
  let methodology: Awaited<ReturnType<typeof getRatingMethodology>> = {
    version: '',
    name: '',
    criteria: [],
    stats: { total_models: 0, active_criteria_count: 0, median_total_index: 0 },
  };
  try {
    methodology = await getRatingMethodology();
  } catch (e) {
    console.error('[methodology] fetch failed, rendering empty:', e);
  }
  const weightSum = methodology.criteria.reduce(
    (sum, c) => sum + (c.weight ?? 0),
    0,
  );
  return (
    <>
      <HvacInfoHeader />
      <main className="hvac-content">
        <BackToRating />
      </main>
      <StickyCollapseHero
        full={
          <MethodologyHero
            stats={methodology.stats}
            criteriaCount={methodology.criteria.length}
            version={methodology.version}
            weightSum={weightSum}
          />
        }
        collapsed={
          <MethodologyHeroCollapsed
            stats={methodology.stats}
            criteriaCount={methodology.criteria.length}
            version={methodology.version}
            weightSum={weightSum}
          />
        }
      />
      <main className="hvac-content">
        <MethodologyTable criteria={methodology.criteria} />
      </main>
      <SectionFooter />
    </>
  );
}

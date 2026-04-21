import type { Metadata } from 'next';

import HvacInfoHeader from '@/components/hvac-info/HvacInfoHeader';
import { getRatingMethodology } from '@/lib/api/services/rating';

import MethodologyHero from './MethodologyHero';
import MethodologyTable from './MethodologyTable';

export const metadata: Metadata = {
  title: 'Методика рейтинга',
  description:
    'Методика расчёта индекса «Август-климат»: 30 параметров, веса, шкалы.',
};

export const revalidate = 3600;

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
      <MethodologyHero
        stats={methodology.stats}
        criteriaCount={methodology.criteria.length}
        version={methodology.version}
        weightSum={weightSum}
      />
      <MethodologyTable criteria={methodology.criteria} />
    </>
  );
}

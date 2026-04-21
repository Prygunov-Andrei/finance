import type { Metadata } from 'next';

import RatingHeader from '../_components/RatingHeader';
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
  const methodology = await getRatingMethodology();
  const weightSum = methodology.criteria.reduce(
    (sum, c) => sum + (c.weight ?? 0),
    0,
  );
  return (
    <>
      <RatingHeader />
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

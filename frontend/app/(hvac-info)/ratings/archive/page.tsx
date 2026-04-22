import type { Metadata } from 'next';

import HvacInfoHeader from '@/components/hvac-info/HvacInfoHeader';
import { getRatingArchiveModels } from '@/lib/api/services/rating';
import BackToRating from '../_components/BackToRating';

import ArchiveHero from './ArchiveHero';
import ArchiveTable from './ArchiveTable';

export const metadata: Metadata = {
  title: 'Архив моделей',
  description:
    'Модели кондиционеров, выбывшие из рейтинга: снятые с производства, ушедшие с рынка РФ.',
};

export const dynamic = 'force-dynamic';

export default async function RatingArchivePage() {
  let models: Awaited<ReturnType<typeof getRatingArchiveModels>> = [];
  try {
    models = await getRatingArchiveModels();
  } catch (e) {
    console.error('[archive] fetch failed, rendering empty:', e);
  }
  return (
    <>
      <HvacInfoHeader />
      <main className="hvac-content">
        <BackToRating />
        <ArchiveHero count={models.length} />
        <ArchiveTable models={models} />
      </main>
    </>
  );
}

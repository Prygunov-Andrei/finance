import type { Metadata } from 'next';

import HvacInfoHeader from '@/components/hvac-info/HvacInfoHeader';
import { getRatingArchiveModels } from '@/lib/api/services/rating';

import ArchiveHero from './ArchiveHero';
import ArchiveTable from './ArchiveTable';

export const metadata: Metadata = {
  title: 'Архив моделей',
  description:
    'Модели кондиционеров, выбывшие из рейтинга: снятые с производства, ушедшие с рынка РФ.',
};

export const revalidate = 3600;

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
      <ArchiveHero count={models.length} />
      <ArchiveTable models={models} />
    </>
  );
}

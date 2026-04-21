import type { Metadata } from 'next';

import RatingHeader from '../_components/RatingHeader';
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
  const models = await getRatingArchiveModels();
  return (
    <>
      <RatingHeader />
      <ArchiveHero count={models.length} />
      <ArchiveTable models={models} />
    </>
  );
}

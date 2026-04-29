import type { Metadata } from 'next';

import HvacInfoHeader from '@/components/hvac-info/HvacInfoHeader';
import { getRatingBrands, getRatingMethodology } from '@/lib/api/services/rating';
import type { RatingMethodology } from '@/lib/api/types/rating';
import BackToRating from '../_components/BackToRating';
import SectionFooter from '../../_components/SectionFooter';

import SubmitForm from './SubmitForm';

export const metadata: Metadata = {
  title: 'Добавить модель в рейтинг',
  description:
    'Форма заявки на добавление кондиционера в рейтинг Август-климат: замеры, фото, контакты.',
  robots: { index: false, follow: true },
};

export const dynamic = 'force-dynamic';

export default async function RatingSubmitPage() {
  // Brands и methodology грузим параллельно. Если methodology упала —
  // форма рендерится без tooltip-подсказок (SubmitForm принимает null),
  // пользователь всё равно может отправить заявку.
  const [brands, methodology] = await Promise.all([
    getRatingBrands().catch((e) => {
      console.error('[submit] brands fetch failed, rendering empty list:', e);
      return [] as Awaited<ReturnType<typeof getRatingBrands>>;
    }),
    getRatingMethodology().catch((e) => {
      console.error(
        '[submit] methodology fetch failed, rendering form without tooltips:',
        e,
      );
      return null as RatingMethodology | null;
    }),
  ]);

  return (
    <>
      <HvacInfoHeader />
      <main className="hvac-content">
        <BackToRating />
      </main>
      <SubmitForm brands={brands} methodology={methodology} />
      <SectionFooter />
    </>
  );
}

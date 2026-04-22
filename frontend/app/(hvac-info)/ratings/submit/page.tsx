import type { Metadata } from 'next';

import HvacInfoHeader from '@/components/hvac-info/HvacInfoHeader';
import { getRatingBrands } from '@/lib/api/services/rating';
import BackToRating from '../_components/BackToRating';
import SectionFooter from '../_components/SectionFooter';

import SubmitForm from './SubmitForm';
import SubmitHero from './SubmitHero';

export const metadata: Metadata = {
  title: 'Добавить модель в рейтинг',
  description:
    'Форма заявки на добавление кондиционера в рейтинг Август-климат: замеры, фото, контакты.',
};

export const dynamic = 'force-dynamic';

export default async function RatingSubmitPage() {
  let brands: Awaited<ReturnType<typeof getRatingBrands>> = [];
  try {
    brands = await getRatingBrands();
  } catch (e) {
    console.error('[submit] brands fetch failed, rendering empty list:', e);
  }
  return (
    <>
      <HvacInfoHeader />
      <main className="hvac-content">
        <BackToRating />
      </main>
      <SubmitHero />
      <main className="hvac-content">
        <SubmitForm brands={brands} />
      </main>
      <SectionFooter />
    </>
  );
}

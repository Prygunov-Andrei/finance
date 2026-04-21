import type { Metadata } from 'next';

import HvacInfoHeader from '@/components/hvac-info/HvacInfoHeader';
import { getRatingBrands } from '@/lib/api/services/rating';

import SubmitForm from './SubmitForm';

export const metadata: Metadata = {
  title: 'Добавить модель в рейтинг',
  description:
    'Форма заявки на добавление кондиционера в рейтинг Август-климат: замеры, фото, контакты.',
};

export const revalidate = 3600;

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
      <SubmitForm brands={brands} />
    </>
  );
}

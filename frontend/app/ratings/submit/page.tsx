import type { Metadata } from 'next';

import RatingHeader from '../_components/RatingHeader';
import { getRatingBrands } from '@/lib/api/services/rating';

import SubmitForm from './SubmitForm';

export const metadata: Metadata = {
  title: 'Добавить модель в рейтинг',
  description:
    'Форма заявки на добавление кондиционера в рейтинг Август-климат: замеры, фото, контакты.',
};

export const revalidate = 3600;

export default async function RatingSubmitPage() {
  const brands = await getRatingBrands();
  return (
    <>
      <RatingHeader />
      <SubmitForm brands={brands} />
    </>
  );
}

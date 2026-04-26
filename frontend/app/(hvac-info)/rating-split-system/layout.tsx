import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    default: 'Рейтинг кондиционеров — hvac-info.com',
    template: '%s | Рейтинг кондиционеров',
  },
  description:
    'Независимый рейтинг бытовых кондиционеров: методика, параметры, отзывы, сравнение моделей.',
};

export default function RatingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

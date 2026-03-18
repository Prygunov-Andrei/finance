import type { Metadata } from 'next';
import { PublicLayout } from '@/components/public/PublicLayout';

export const metadata: Metadata = {
  title: 'Рейтинг кондиционеров',
  description: 'Рейтинг лучших кондиционеров и сплит-систем для дома и офиса',
};

export default function RatingsPage() {
  return (
    <PublicLayout>
      <section className="max-w-2xl mx-auto text-center py-16">
        <div className="text-6xl mb-6">❄️</div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
          Рейтинг кондиционеров
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          Раздел в разработке. Скоро здесь появится независимый рейтинг
          кондиционеров и сплит-систем с отзывами и сравнениями.
        </p>
        <div className="inline-flex items-center px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-full text-sm">
          Ожидайте обновления
        </div>
      </section>
    </PublicLayout>
  );
}

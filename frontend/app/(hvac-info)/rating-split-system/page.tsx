import type { Metadata } from 'next';
import {
  getRatingMethodology,
  getRatingModels,
} from '@/lib/api/services/rating';
import RatingPageContent from './_components/RatingPageContent';
import RatingItemListJsonLd from './_components/RatingItemListJsonLd';

// SSR каждый запрос — ISR snapshot при первом deploy ловит пустой backend
// (Docker build context не видит compose-сервисы). Для 27 моделей overhead ~50ms.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  description:
    'Рейтинг кондиционеров по интегральному индексу «Август-климат»: оценка бытовых сплит-систем по 30+ параметрам на основе реальных измерений. Обновлено 04.2026.',
  alternates: { canonical: '/rating-split-system' },
};

export default async function RatingHomePage() {
  let models: Awaited<ReturnType<typeof getRatingModels>> = [];
  let methodology: Awaited<ReturnType<typeof getRatingMethodology>> = {
    version: '',
    name: '',
    criteria: [],
    stats: { total_models: 0, active_criteria_count: 0, median_total_index: 0 },
    presets: [],
  };
  try {
    [models, methodology] = await Promise.all([
      getRatingModels(),
      getRatingMethodology(),
    ]);
  } catch (e) {
    console.error('[ratings-home] fetch failed, rendering empty:', e);
  }
  const publishedModels = models.filter((m) => m.publish_status === 'published');

  return (
    <>
      <RatingItemListJsonLd models={publishedModels} />
      <RatingPageContent models={publishedModels} methodology={methodology} />
    </>
  );
}

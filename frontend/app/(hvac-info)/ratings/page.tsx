import { Suspense } from 'react';
import {
  getRatingMethodology,
  getRatingModels,
} from '@/lib/api/services/rating';
import HvacInfoHeader from '@/components/hvac-info/HvacInfoHeader';
import HeroBlock from './_components/HeroBlock';
import DesktopListing from './_components/DesktopListing';
import MobileListing from './_components/MobileListing';
import SeoBlock from './_components/SeoBlock';
import SectionFooter from './_components/SectionFooter';

export default async function RatingHomePage() {
  let models: Awaited<ReturnType<typeof getRatingModels>> = [];
  let methodology: Awaited<ReturnType<typeof getRatingMethodology>> = {
    version: '',
    name: '',
    criteria: [],
    stats: { total_models: 0, active_criteria_count: 0, median_total_index: 0 },
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
      <HvacInfoHeader />
      <Suspense fallback={null}>
        <div className="hidden md:block">
          <HeroBlock stats={methodology.stats} />
          <DesktopListing models={publishedModels} methodology={methodology} />
        </div>
        <div className="md:hidden">
          <MobileListing models={publishedModels} methodology={methodology} />
        </div>
      </Suspense>
      <SeoBlock />
      <SectionFooter />
    </>
  );
}

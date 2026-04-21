import { Suspense } from 'react';
import {
  getRatingMethodology,
  getRatingModels,
} from '@/lib/api/services/rating';
import RatingHeader from './_components/RatingHeader';
import HeroBlock from './_components/HeroBlock';
import DesktopListing from './_components/DesktopListing';
import MobileListing from './_components/MobileListing';
import SeoBlock from './_components/SeoBlock';
import SectionFooter from './_components/SectionFooter';

export default async function RatingHomePage() {
  const [models, methodology] = await Promise.all([
    getRatingModels(),
    getRatingMethodology(),
  ]);
  const publishedModels = models.filter((m) => m.publish_status === 'published');

  return (
    <>
      <RatingHeader />
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

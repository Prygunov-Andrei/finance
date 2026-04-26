import { Suspense, type ReactNode } from 'react';
import type { RatingMethodology, RatingModelListItem } from '@/lib/api/types/rating';
import HvacInfoHeader from '@/components/hvac-info/HvacInfoHeader';
import HeroBlock, { HeroBlockCollapsed } from './HeroBlock';
import DesktopListing from './DesktopListing';
import MobileListing, { MobileHero } from './MobileListing';
import SeoBlock from './SeoBlock';
import SectionFooter from '../../_components/SectionFooter';
import type { RatingTabId } from './RatingTabs';

export interface RatingHeroContent {
  title: string;
  eyebrow?: string;
  intro?: string;
}

interface RatingPageContentProps {
  models: RatingModelListItem[];
  methodology: RatingMethodology;
  /** Кастомный hero для desktop. Если не задан — HeroBlock с дефолтами. */
  hero?: RatingHeroContent;
  /** Кастомный mobile hero (H1). Если не задан — стандартный MobileHero. */
  mobileHero?: RatingHeroContent;
  /** Дефолтный таб когда в URL нет ?tab=. */
  defaultTab?: RatingTabId;
  /** Slug пресета для предвыбора в табе «Свой рейтинг». */
  initialPresetSlug?: string;
  /** SEO-блок под таблицей. По умолчанию — общий SeoBlock. null — выключить. */
  seo?: ReactNode | null;
}

export default function RatingPageContent({
  models,
  methodology,
  hero,
  mobileHero,
  defaultTab,
  initialPresetSlug,
  seo,
}: RatingPageContentProps) {
  const desktopHero = (
    <HeroBlock
      stats={methodology.stats}
      {...(hero?.title ? { title: hero.title } : {})}
      {...(hero?.eyebrow ? { eyebrow: hero.eyebrow } : {})}
      {...(hero?.intro ? { intro: hero.intro } : {})}
    />
  );
  const desktopHeroCollapsed = <HeroBlockCollapsed stats={methodology.stats} />;
  const mobileHeroNode = mobileHero ? (
    <MobileHero
      stats={methodology.stats}
      {...(mobileHero.title ? { title: mobileHero.title } : {})}
      {...(mobileHero.eyebrow ? { eyebrow: mobileHero.eyebrow } : {})}
    />
  ) : undefined;

  return (
    <>
      <HvacInfoHeader />
      <Suspense fallback={null}>
        <div className="hidden md:block">
          <DesktopListing
            models={models}
            methodology={methodology}
            hero={desktopHero}
            heroCollapsed={desktopHeroCollapsed}
            defaultTab={defaultTab}
            initialPresetSlug={initialPresetSlug}
          />
        </div>
        <div className="md:hidden">
          <MobileListing
            models={models}
            methodology={methodology}
            hero={mobileHeroNode}
            defaultTab={defaultTab}
            initialPresetSlug={initialPresetSlug}
          />
        </div>
      </Suspense>
      {seo !== null && (
        <main className="hvac-content">{seo ?? <SeoBlock />}</main>
      )}
      <SectionFooter />
    </>
  );
}

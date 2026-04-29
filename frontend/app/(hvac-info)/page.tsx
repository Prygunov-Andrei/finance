import { Suspense } from 'react';
import type { Metadata } from 'next';
import { unstable_noStore as noStore } from 'next/cache';
import HvacInfoHeader from '@/components/hvac-info/HvacInfoHeader';
import { getFeaturedNews, getNews, type FeaturedNewsResponse } from '@/lib/hvac-api';
import NewsFeedHero from './_components/NewsFeedHero';
import NewsCategoryFilter from './_components/NewsCategoryFilter';
import NewsFeedList from './_components/NewsFeedList';
import NewsViewSwitcher from './_components/NewsViewSwitcher';
import SectionFooter from './_components/SectionFooter';
import { loadFirstPage } from './loadFirstPage';
import { buildFeaturedFeed } from './buildFeaturedFeed';

export const revalidate = 300;

export const metadata: Metadata = {
  // absolute, чтобы template `%s | HVAC Info` из (hvac-info)/layout.tsx
  // не дублировал суффикс на главной.
  title: { absolute: 'HVAC Info — независимый портал о кондиционерах' },
  description:
    'Независимый портал о кондиционерах: рейтинг бытовых сплит-систем по индексу «Август-климат», обзоры моделей и новости HVAC-отрасли.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'HVAC Info — независимый портал о кондиционерах',
    description:
      'Независимый портал о кондиционерах: рейтинг бытовых сплит-систем по индексу «Август-климат», обзоры моделей и новости HVAC-отрасли.',
    type: 'website',
    url: 'https://hvac-info.com/',
    images: [{ url: 'https://hvac-info.com/rating-hero/ac-unit-illustration.webp' }],
  },
};

export default async function NewsFeedPage() {
  const [{ page: firstPage, empty }, featured] = await Promise.all([
    loadFirstPage(() => getNews(1)),
    getFeaturedNews().catch((e): FeaturedNewsResponse => {
      console.error('[featured-news] fetch failed', e);
      return { post: null, category: null };
    }),
  ]);

  const items = firstPage.results ?? [];

  // Критично: если после ретраев пусто — не даём Next.js писать пустой
  // массив в fetch-cache (иначе stale empty переживёт deploy).
  if (empty) {
    noStore();
  }

  // Safety: featured-news endpoint не фильтрует по star_rating, тогда как
  // публичный list/detail для не-админов отдают только 5★. Если featured.post
  // не виден в публичном списке — значит и /news/<id>/ ответит 404 (битая
  // ссылка в hero). В этом случае фолбэчимся на null.
  const featuredVisible =
    featured.post && items.some((n) => n.id === featured.post!.id)
      ? featured.post
      : null;

  const { hero, feed } = buildFeaturedFeed(items, featuredVisible);

  return (
    <>
      <HvacInfoHeader />
      <main className="hvac-content">
        <NewsFeedHero items={hero} />
        <div className="rt-feed-controls-row">
          <Suspense fallback={null}>
            <NewsCategoryFilter items={items} />
          </Suspense>
          <Suspense fallback={null}>
            <NewsViewSwitcher />
          </Suspense>
          <style>{`
            .rt-feed-controls-row {
              display: flex;
              flex-direction: row;
              align-items: center;
              justify-content: space-between;
              gap: 12px;
              padding-right: 40px;
            }
            .rt-feed-controls-row > nav { flex: 1; min-width: 0; }
            @media (max-width: 1023px) {
              .rt-feed-controls-row {
                flex-direction: column;
                align-items: stretch;
                padding-right: 12px;
                gap: 8px;
              }
              .rt-feed-controls-row > div[role="tablist"] {
                align-self: flex-end;
                margin-right: 12px;
              }
            }
          `}</style>
        </div>
        <Suspense fallback={null}>
          <NewsFeedList
            items={feed}
            hasMore={!!firstPage.next}
            totalCount={firstPage.count ?? feed.length}
            skipFirst={5}
          />
        </Suspense>
      </main>
      <SectionFooter />
    </>
  );
}

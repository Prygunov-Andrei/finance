import { Suspense } from 'react';
import HvacInfoHeader from '@/components/hvac-info/HvacInfoHeader';
import { getNews } from '@/lib/hvac-api';
import NewsFeedHero from './_components/NewsFeedHero';
import NewsCategoryFilter from './_components/NewsCategoryFilter';
import NewsFeedList from './_components/NewsFeedList';

export const revalidate = 300;

export default async function NewsFeedPage() {
  let firstPage: Awaited<ReturnType<typeof getNews>> = {
    results: [],
    count: 0,
    next: null,
    previous: null,
  };
  try {
    firstPage = await getNews(1);
  } catch (e) {
    console.error('[news-feed] getNews failed, rendering empty:', e);
  }
  const items = firstPage.results ?? [];

  return (
    <>
      <HvacInfoHeader />
      <main>
        <NewsFeedHero items={items} />
        <Suspense fallback={null}>
          <NewsCategoryFilter />
        </Suspense>
        <Suspense fallback={null}>
          <NewsFeedList
            items={items}
            hasMore={!!firstPage.next}
            totalCount={firstPage.count ?? items.length}
            skipFirst={5}
          />
        </Suspense>
      </main>
    </>
  );
}

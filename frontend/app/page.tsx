export const dynamic = "force-dynamic";
import { PublicLayout } from '@/components/public/PublicLayout';
import { LoadMoreNews } from '@/components/public/LoadMoreNews';
import { getNews } from '@/lib/hvac-api';

export default async function HomePage() {
  const data = await getNews(1);

  return (
    <PublicLayout>
      <section>
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          Новости HVAC-индустрии
        </h1>
        <LoadMoreNews
          initialNews={data.results}
          hasMore={!!data.next}
          totalCount={data.count}
        />
      </section>
    </PublicLayout>
  );
}

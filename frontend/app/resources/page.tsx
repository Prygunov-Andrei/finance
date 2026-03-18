export const dynamic = "force-dynamic";
import type { Metadata } from 'next';
import { PublicLayout } from '@/components/public/PublicLayout';
import { getResources } from '@/lib/hvac-api';

export const metadata: Metadata = {
  title: 'Ресурсы и источники',
  description: 'Полезные ресурсы и источники новостей HVAC-индустрии',
};

export default async function ResourcesPage() {
  const data = await getResources();

  return (
    <PublicLayout>
      <section>
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          Ресурсы и источники
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.map((resource) => (
            <article
              key={resource.id}
              className="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-md transition-shadow"
            >
              <h2 className="text-lg font-semibold text-gray-900">
                {resource.name}
              </h2>
              {resource.description && (
                <p className="mt-2 text-sm text-gray-600">
                  {resource.description}
                </p>
              )}
              {resource.url && (
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block text-sm text-blue-600 hover:underline"
                >
                  Перейти на сайт &rarr;
                </a>
              )}
            </article>
          ))}
        </div>
      </section>
    </PublicLayout>
  );
}

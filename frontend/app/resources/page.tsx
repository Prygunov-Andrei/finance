export const dynamic = "force-dynamic";
import type { Metadata } from 'next';
import { PublicLayout } from '@/components/public/PublicLayout';
import { getResources } from '@/lib/hvac-api';

export const metadata: Metadata = {
  title: 'Ресурсы и источники',
  description: 'Полезные ресурсы и источники новостей HVAC-индустрии',
  alternates: { canonical: '/resources' },
};

export default async function ResourcesPage() {
  const data = await getResources();

  return (
    <PublicLayout>
      <section>
        <h1 className="mb-8 text-3xl font-bold text-foreground">
          Ресурсы и источники
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.map((resource) => (
            <article
              key={resource.id}
              className="rounded-lg border border-border bg-card p-5 text-card-foreground transition-shadow hover:shadow-md"
            >
              <h2 className="text-lg font-semibold text-card-foreground">
                {resource.name}
              </h2>
              {resource.description && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {resource.description}
                </p>
              )}
              {resource.url && (
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block text-sm text-primary hover:underline"
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

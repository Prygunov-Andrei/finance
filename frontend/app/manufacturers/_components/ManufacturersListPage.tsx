import { PublicLayout } from '@/components/public/PublicLayout';
import type { ManufacturersPageData } from '../_helpers';
import { PAGE_SIZE } from '../_helpers';
import ManufacturersPagination from './ManufacturersPagination';

export default function ManufacturersListPage({ data }: { data: ManufacturersPageData }) {
  const { items, totalCount, currentPage, totalPages } = data;
  const startPosition = (currentPage - 1) * PAGE_SIZE + 1;

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Производители HVAC-оборудования',
    numberOfItems: totalCount,
    itemListElement: items.map((m, i) => ({
      '@type': 'ListItem',
      position: startPosition + i,
      item: {
        '@type': 'Organization',
        name: m.name,
        url: m.website || undefined,
        description: m.description || undefined,
      },
    })),
  };

  return (
    <PublicLayout>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />

      <section>
        <h1 className="mb-2 text-3xl font-bold text-foreground">
          Производители HVAC-оборудования
          {currentPage > 1 ? ` — страница ${currentPage}` : ''}
        </h1>
        <p className="mb-8 text-muted-foreground">
          {totalCount} производителей в каталоге
          {totalPages > 1 ? ` · страница ${currentPage} из ${totalPages}` : ''}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((manufacturer) => (
            <article
              key={manufacturer.id}
              className="rounded-lg border border-border bg-card p-5 text-card-foreground transition-shadow hover:shadow-md"
            >
              <div className="flex items-start gap-4">
                {manufacturer.logo && (
                  <img
                    src={manufacturer.logo}
                    alt={manufacturer.name}
                    className="w-12 h-12 object-contain rounded"
                    loading="lazy"
                  />
                )}
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-card-foreground">
                    {manufacturer.name}
                  </h2>
                  {manufacturer.country && (
                    <p className="text-sm text-muted-foreground">{manufacturer.country}</p>
                  )}
                  {manufacturer.description && (
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                      {manufacturer.description}
                    </p>
                  )}
                  <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                    {manufacturer.news_count > 0 && (
                      <span>{manufacturer.news_count} новостей</span>
                    )}
                    {manufacturer.brands_count > 0 && (
                      <span>{manufacturer.brands_count} брендов</span>
                    )}
                    {manufacturer.website && (
                      <a
                        href={manufacturer.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        Сайт
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>

        <ManufacturersPagination currentPage={currentPage} totalPages={totalPages} />
      </section>
    </PublicLayout>
  );
}

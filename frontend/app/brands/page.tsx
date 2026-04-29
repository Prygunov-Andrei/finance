export const dynamic = "force-dynamic";
import type { Metadata } from 'next';
import { PublicLayout } from '@/components/public/PublicLayout';
import { getBrands } from '@/lib/hvac-api';

export const metadata: Metadata = {
  title: 'Бренды HVAC-оборудования',
  description: 'Каталог брендов оборудования для отопления, вентиляции и кондиционирования',
  alternates: { canonical: '/brands' },
};

export default async function BrandsPage() {
  const data = await getBrands();

  return (
    <PublicLayout>
      <section>
        <h1 className="mb-2 text-3xl font-bold text-foreground">
          Бренды HVAC-оборудования
        </h1>
        <p className="mb-8 text-muted-foreground">
          {data.length} брендов в каталоге
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((brand) => (
            <article
              key={brand.id}
              className="rounded-lg border border-border bg-card p-5 text-card-foreground transition-shadow hover:shadow-md"
            >
              <h2 className="text-lg font-semibold text-card-foreground">
                {brand.name}
              </h2>
              {brand.manufacturer && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {brand.manufacturer.name}
                </p>
              )}
              {brand.description && (
                <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                  {brand.description}
                </p>
              )}
            </article>
          ))}
        </div>
      </section>
    </PublicLayout>
  );
}

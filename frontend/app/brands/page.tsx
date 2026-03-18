export const dynamic = "force-dynamic";
import type { Metadata } from 'next';
import { PublicLayout } from '@/components/public/PublicLayout';
import { getBrands } from '@/lib/hvac-api';

export const metadata: Metadata = {
  title: 'Бренды HVAC-оборудования',
  description: 'Каталог брендов оборудования для отопления, вентиляции и кондиционирования',
};

export default async function BrandsPage() {
  const data = await getBrands();

  return (
    <PublicLayout>
      <section>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Бренды HVAC-оборудования
        </h1>
        <p className="text-gray-500 mb-8">
          {data.length} брендов в каталоге
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((brand) => (
            <article
              key={brand.id}
              className="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-md transition-shadow"
            >
              <h2 className="text-lg font-semibold text-gray-900">
                {brand.name}
              </h2>
              {brand.manufacturer && (
                <p className="text-sm text-gray-500 mt-1">
                  {brand.manufacturer.name}
                </p>
              )}
              {brand.description && (
                <p className="mt-2 text-sm text-gray-600 line-clamp-3">
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

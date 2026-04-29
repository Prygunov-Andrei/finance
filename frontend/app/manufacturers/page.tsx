import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ManufacturersListPage from './_components/ManufacturersListPage';
import { loadManufacturersPage } from './_helpers';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Производители HVAC-оборудования',
  description:
    'Каталог производителей оборудования для отопления, вентиляции и кондиционирования',
  alternates: { canonical: '/manufacturers' },
};

export default async function ManufacturersPage() {
  const data = await loadManufacturersPage(1);
  if (!data) notFound();
  return <ManufacturersListPage data={data} />;
}

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ManufacturersListPage from '../../_components/ManufacturersListPage';
import { loadManufacturersPage } from '../../_helpers';

export const dynamic = 'force-dynamic';

// 515 manufacturers / 50 per page = 11 pages. Page 1 — это /manufacturers.
// TODO: увеличить когда manufacturers > 550.
export async function generateStaticParams() {
  return Array.from({ length: 10 }, (_, i) => ({ n: String(i + 2) }));
}

type Props = { params: Promise<{ n: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { n } = await params;
  const page = parseInt(n, 10);
  if (Number.isNaN(page) || page < 2) {
    return { title: 'Страница не найдена' };
  }
  return {
    title: `Производители HVAC-оборудования — страница ${page}`,
    description: `Каталог производителей оборудования для отопления, вентиляции и кондиционирования. Страница ${page}.`,
    alternates: { canonical: `/manufacturers/page/${page}` },
    robots: { index: true, follow: true },
  };
}

export default async function ManufacturersPaginatedPage({ params }: Props) {
  const { n } = await params;
  const page = parseInt(n, 10);
  if (Number.isNaN(page) || page < 2) notFound();
  const data = await loadManufacturersPage(page);
  if (!data) notFound();
  return <ManufacturersListPage data={data} />;
}

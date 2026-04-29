import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getManufacturers } from '@/lib/hvac-api';
import ManufacturersListPage from '../../_components/ManufacturersListPage';
import { loadManufacturersPage, PAGE_SIZE } from '../../_helpers';

export const dynamic = 'force-dynamic';

// Wave 11: динамическое число страниц по реальному count.
// Page 1 = /manufacturers (без префикса), генерируем 2..N.
export async function generateStaticParams() {
  try {
    const all = await getManufacturers();
    const totalPages = Math.ceil(all.length / PAGE_SIZE);
    return Array.from(
      { length: Math.max(0, totalPages - 1) },
      (_, i) => ({ n: String(i + 2) }),
    );
  } catch {
    return [];
  }
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

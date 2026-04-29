import { getManufacturers, type Manufacturer } from '@/lib/hvac-api';

export const PAGE_SIZE = 50;

export interface ManufacturersPageData {
  items: Manufacturer[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
}

export async function loadManufacturersPage(
  page: number,
): Promise<ManufacturersPageData | null> {
  const all = await getManufacturers();
  const totalCount = all.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  if (page < 1 || page > totalPages) return null;
  const start = (page - 1) * PAGE_SIZE;
  return {
    items: all.slice(start, start + PAGE_SIZE),
    totalCount,
    currentPage: page,
    totalPages,
  };
}

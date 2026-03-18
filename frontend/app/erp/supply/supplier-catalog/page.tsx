'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SupplySupplierCatalogPageRedirectPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/erp/catalog/products'); }, [router]);
  return null;
}

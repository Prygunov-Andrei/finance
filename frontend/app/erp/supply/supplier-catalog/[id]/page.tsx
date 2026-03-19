'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function SupplierCatalogDetailPage() {
  const router = useRouter();
  const params = useParams();

  useEffect(() => {
    router.replace(`/erp/catalog/products/${params.id}`);
  }, [router, params.id]);

  return null;
}

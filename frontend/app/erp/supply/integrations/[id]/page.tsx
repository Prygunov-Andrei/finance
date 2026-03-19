'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function SupplyIntegrationDetailPage() {
  const router = useRouter();
  const params = useParams();

  useEffect(() => {
    router.replace(`/erp/settings/integrations/${params.id}`);
  }, [router, params.id]);

  return null;
}

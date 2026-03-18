'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SupplyIntegrationsPageRedirectPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/erp/settings/integrations'); }, [router]);
  return null;
}

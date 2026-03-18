'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function EstimatesInvoicesPageRedirectPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/erp/estimates/estimates'); }, [router]);
  return null;
}

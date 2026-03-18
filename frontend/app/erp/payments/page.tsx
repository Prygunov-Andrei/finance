'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PaymentsPageRedirectPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/erp/finance/payments?tab=invoices'); }, [router]);
  return null;
}

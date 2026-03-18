'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PaymentRegistryPageRedirectPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/erp/finance/payments?tab=registry'); }, [router]);
  return null;
}

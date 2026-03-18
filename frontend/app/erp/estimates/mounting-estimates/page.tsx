'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function EstimatesMountingEstimatesPageRedirectPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/erp/estimates/estimates?tab=mounting'); }, [router]);
  return null;
}

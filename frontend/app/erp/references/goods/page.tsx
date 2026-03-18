'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ReferencesGoodsPageRedirectPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/erp/catalog/products'); }, [router]);
  return null;
}

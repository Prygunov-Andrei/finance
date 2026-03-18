'use client';

import dynamic from 'next/dynamic';

const ERPApp = dynamic(() => import('@/components/erp/App'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
        <p className="mt-4 text-sm text-gray-500">Загрузка ERP...</p>
      </div>
    </div>
  ),
});

export default function ERPCatchAll() {
  return <ERPApp />;
}

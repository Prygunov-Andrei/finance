'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePermissions } from '@/hooks/usePermissions';

const SECTION_PATHS: Record<string, string> = {
  dashboard: '/erp/dashboard',
  commercial: '/erp/proposals/technical-proposals',
  objects: '/erp/objects',
  finance: '/erp/finance/dashboard',
  contracts: '/erp/contracts',
  supply: '/erp/supply/invoices',
  pto: '/erp/pto/production-docs',
  marketing: '/erp/marketing/objects',
  communications: '/erp/communications',
  settings: '/erp/settings',
  help: '/erp/help',
};

const SECTION_ORDER = [
  'dashboard', 'commercial', 'objects', 'finance', 'contracts',
  'supply', 'pto', 'marketing', 'communications', 'settings', 'help',
];

export default function ERPRootPage() {
  const router = useRouter();
  const { hasAccess } = usePermissions();

  useEffect(() => {
    for (const section of SECTION_ORDER) {
      if (hasAccess(section)) {
        router.replace(SECTION_PATHS[section]);
        return;
      }
    }
    router.replace('/erp/help');
  }, [router, hasAccess]);

  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );
}

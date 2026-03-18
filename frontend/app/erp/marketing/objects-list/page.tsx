'use client';
import { ConstructionObjects } from '@/components/erp/components/ConstructionObjects';

export default function MarketingObjectsListPage() {
  return (
    <ConstructionObjects
      pageTitle="Объекты (Маркетинг)"
      defaultStatusFilter="planned"
      defaultCreateStatus="planned"
    />
  );
}

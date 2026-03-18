'use client';
import { Counterparties } from '@/components/erp/components/Counterparties';

export default function MarketingPotentialCustomersPage() {
  return (
    <Counterparties
      lockedFilter="potential_customer"
      lockedCreateType="potential_customer"
      pageTitle="Потенциальные заказчики"
    />
  );
}

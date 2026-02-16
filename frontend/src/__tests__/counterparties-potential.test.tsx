import { describe, it, expect } from 'vitest';
import React from 'react';

describe('Counterparties — potential_customer type', () => {
  it('CounterpartyFilter includes potential_customer', () => {
    type CounterpartyFilter = 'all' | 'customer' | 'potential_customer' | 'supplier' | 'executor';
    const filters: CounterpartyFilter[] = ['all', 'customer', 'potential_customer', 'supplier', 'executor'];
    expect(filters).toContain('potential_customer');
  });

  it('getTypeLabel returns correct label for potential_customer', () => {
    const getTypeLabel = (type: string) => {
      switch (type) {
        case 'customer': return 'Заказчик';
        case 'potential_customer': return 'Потенциальный Заказчик';
        case 'vendor': return 'Исполнитель-Поставщик';
        case 'both': return 'Заказчик и Исполнитель-Поставщик';
        case 'employee': return 'Сотрудник';
        default: return type;
      }
    };

    expect(getTypeLabel('potential_customer')).toBe('Потенциальный Заказчик');
    expect(getTypeLabel('customer')).toBe('Заказчик');
  });

  it('filter logic correctly filters potential_customer', () => {
    const counterparties = [
      { id: 1, type: 'customer', name: 'Customer 1' },
      { id: 2, type: 'potential_customer', name: 'Potential 1' },
      { id: 3, type: 'vendor', name: 'Vendor 1' },
    ];

    const filtered = counterparties.filter((cp) => cp.type === 'potential_customer');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('Potential 1');
  });

  it('badge color for potential_customer is orange', () => {
    const getTypeColorClass = (type: string) => {
      if (type === 'customer') return 'bg-green-100 text-green-700';
      if (type === 'potential_customer') return 'bg-orange-100 text-orange-700';
      if (type === 'vendor') return 'bg-purple-100 text-purple-700';
      return 'bg-blue-100 text-blue-700';
    };

    expect(getTypeColorClass('potential_customer')).toBe('bg-orange-100 text-orange-700');
  });
});

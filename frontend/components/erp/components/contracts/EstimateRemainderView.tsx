import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { api, type EstimateRemainderRow } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { CONSTANTS } from '../../constants';
import { DataTable } from '../ui/data-table';
import { Loader2 } from 'lucide-react';

type EstimateRemainderViewProps = {
  contractId: number;
};

export const EstimateRemainderView: React.FC<EstimateRemainderViewProps> = ({ contractId }) => {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['estimate-remainder', contractId],
    queryFn: () => api.getEstimateRemainder(contractId),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const columns: ColumnDef<EstimateRemainderRow, any>[] = useMemo(
    () => [
      { accessorKey: 'item_number', header: '№', size: 50 },
      { accessorKey: 'name', header: 'Наименование', size: 300 },
      { accessorKey: 'unit', header: 'Ед.', size: 60 },
      {
        accessorKey: 'estimate_quantity',
        header: 'Сметное кол-во',
        size: 120,
        cell: ({ getValue }) => parseFloat(getValue() as string).toLocaleString('ru-RU'),
      },
      {
        accessorKey: 'remaining_quantity',
        header: 'Остаток',
        size: 100,
        cell: ({ getValue }) => {
          const v = parseFloat(getValue() as string);
          return <span className={v > 0 ? 'text-amber-600 font-medium' : 'text-green-600'}>{v.toLocaleString('ru-RU')}</span>;
        },
      },
      {
        accessorKey: 'remaining_amount',
        header: 'Сумма остатка',
        size: 130,
        cell: ({ getValue }) => formatCurrency(getValue() as string),
      },
    ],
    [],
  );

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const nonZero = rows.filter((r) => parseFloat(r.remaining_quantity) > 0);

  return (
    <DataTable
      columns={columns}
      data={nonZero}
      enableSorting
      enableFiltering
      enableVirtualization={nonZero.length > 200}
      emptyMessage="Все позиции закуплены"
    />
  );
};

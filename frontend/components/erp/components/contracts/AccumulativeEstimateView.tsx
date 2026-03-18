import React, { useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { api, type AccumulativeEstimateRow } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { CONSTANTS } from '../../constants';
import { DataTable } from '../ui/data-table';
import { Button } from '../ui/button';
import { Loader2, Download } from 'lucide-react';
import { toast } from 'sonner';

type AccumulativeEstimateViewProps = {
  contractId: number;
};

export const AccumulativeEstimateView: React.FC<AccumulativeEstimateViewProps> = ({ contractId }) => {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['accumulative-estimate', contractId],
    queryFn: () => api.getAccumulativeEstimate(contractId),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const handleExport = useCallback(async () => {
    try {
      const blob = await api.exportAccumulativeEstimate(contractId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `accumulative_estimate_${contractId}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Файл скачан');
    } catch (error) {
      toast.error('Ошибка экспорта');
    }
  }, [contractId]);

  const columns: ColumnDef<AccumulativeEstimateRow, any>[] = useMemo(
    () => [
      { accessorKey: 'item_number', header: '№', size: 50 },
      { accessorKey: 'name', header: 'Наименование', size: 250 },
      { accessorKey: 'unit', header: 'Ед.', size: 60 },
      {
        accessorKey: 'estimate_quantity',
        header: 'Сметное кол-во',
        size: 110,
        cell: ({ getValue }) => parseFloat(getValue() as string).toLocaleString('ru-RU'),
      },
      {
        accessorKey: 'estimate_material_price',
        header: 'Сметная цена',
        size: 110,
        cell: ({ getValue }) => formatCurrency(getValue() as string),
      },
      {
        accessorKey: 'purchased_quantity',
        header: 'Закуплено',
        size: 100,
        cell: ({ getValue }) => parseFloat(getValue() as string).toLocaleString('ru-RU'),
      },
      {
        accessorKey: 'purchased_amount',
        header: 'Сумма закупки',
        size: 120,
        cell: ({ getValue }) => formatCurrency(getValue() as string),
      },
      {
        id: 'remaining',
        header: 'Остаток',
        size: 100,
        cell: ({ row }) => {
          const est = parseFloat(row.original.estimate_quantity) || 0;
          const purch = parseFloat(row.original.purchased_quantity) || 0;
          const remaining = est - purch;
          return (
            <span className={remaining > 0 ? 'text-amber-600' : remaining === 0 ? 'text-green-600' : 'text-red-600'}>
              {remaining.toLocaleString('ru-RU')}
            </span>
          );
        },
      },
    ],
    [],
  );

  const rowClassName = useCallback((row: any) => {
    const est = parseFloat(row.original.estimate_quantity) || 0;
    const purch = parseFloat(row.original.purchased_quantity) || 0;
    if (purch >= est && purch > 0) return 'bg-green-50';
    if (purch > 0) return 'bg-amber-50';
    return undefined;
  }, []);

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={handleExport}>
          <Download className="h-4 w-4 mr-1" />
          Экспорт в Excel
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={rows}
        enableSorting
        enableFiltering
        enableVirtualization={rows.length > 200}
        rowClassName={rowClassName}
        emptyMessage="Нет данных по накопительной смете"
      />
    </div>
  );
};

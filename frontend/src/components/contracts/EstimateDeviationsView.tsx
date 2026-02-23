import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { api, type EstimateDeviationRow } from '../../lib/api';
import { CONSTANTS } from '../../constants';
import { DataTable } from '../ui/data-table';
import { Badge } from '../ui/badge';
import { Loader2 } from 'lucide-react';

type EstimateDeviationsViewProps = {
  contractId: number;
};

const DEVIATION_LABELS: Record<string, { label: string; color: string }> = {
  analog: { label: 'Аналог', color: 'bg-blue-100 text-blue-800' },
  price_exceeds: { label: 'Превышение цены', color: 'bg-red-100 text-red-800' },
  quantity_exceeds: { label: 'Превышение кол-ва', color: 'bg-orange-100 text-orange-800' },
  additional: { label: 'Допработы', color: 'bg-purple-100 text-purple-800' },
};

export const EstimateDeviationsView: React.FC<EstimateDeviationsViewProps> = ({ contractId }) => {
  const [filterType, setFilterType] = useState<string>('');

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['estimate-deviations', contractId],
    queryFn: () => api.getEstimateDeviations(contractId),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const filteredRows = useMemo(
    () => (filterType ? rows.filter((r) => r.deviation_type === filterType) : rows),
    [rows, filterType],
  );

  const columns: ColumnDef<EstimateDeviationRow, any>[] = useMemo(
    () => [
      { accessorKey: 'item_number', header: '№', size: 50 },
      { accessorKey: 'name', header: 'Наименование', size: 250 },
      {
        accessorKey: 'deviation_type',
        header: 'Тип',
        size: 140,
        cell: ({ getValue }) => {
          const info = DEVIATION_LABELS[getValue() as string];
          return info ? <Badge className={info.color}>{info.label}</Badge> : getValue();
        },
      },
      { accessorKey: 'estimate_value', header: 'По смете', size: 120 },
      { accessorKey: 'actual_value', header: 'Фактически', size: 120 },
      {
        accessorKey: 'reason',
        header: 'Обоснование',
        size: 300,
        cell: ({ getValue }) => (
          <span className="text-sm text-muted-foreground">{getValue() as string || '—'}</span>
        ),
      },
    ],
    [],
  );

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <select
          className="border rounded-md px-3 py-1.5 text-sm bg-background"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="">Все типы</option>
          {Object.entries(DEVIATION_LABELS).map(([key, info]) => (
            <option key={key} value={key}>{info.label}</option>
          ))}
        </select>
        <Badge variant="secondary">{filteredRows.length} отклонений</Badge>
      </div>
      <DataTable
        columns={columns}
        data={filteredRows}
        enableSorting
        enableFiltering
        emptyMessage="Отклонений не обнаружено"
      />
    </div>
  );
};

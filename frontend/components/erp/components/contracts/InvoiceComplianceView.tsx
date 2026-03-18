import React, { useMemo, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { api, type InvoiceComplianceResult } from '../../lib/api';
import { DataTable } from '../ui/data-table';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Loader2, LinkIcon, Wand2 } from 'lucide-react';
import { toast } from 'sonner';

type ComplianceItem = InvoiceComplianceResult['items'][number];

type InvoiceComplianceViewProps = {
  invoiceId: number;
  onLinkManual?: (invoiceItemId: number) => void;
};

const STATUS_BADGES: Record<string, { label: string; color: string }> = {
  matched: { label: 'Совпадает', color: 'bg-green-100 text-green-800' },
  unmatched: { label: 'Не найдено', color: 'bg-red-100 text-red-800' },
  exceeds: { label: 'Превышение', color: 'bg-orange-100 text-orange-800' },
  analog_candidate: { label: 'Возможный аналог', color: 'bg-blue-100 text-blue-800' },
};

export const InvoiceComplianceView: React.FC<InvoiceComplianceViewProps> = ({
  invoiceId,
  onLinkManual,
}) => {
  const queryClient = useQueryClient();
  const [result, setResult] = React.useState<InvoiceComplianceResult | null>(null);

  const checkMutation = useMutation({
    mutationFn: () => api.checkInvoiceCompliance(invoiceId),
    onSuccess: (data) => setResult(data),
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Ошибка'),
  });

  const autoLinkMutation = useMutation({
    mutationFn: () => api.autoLinkInvoice(invoiceId),
    onSuccess: (data) => {
      setResult(data);
      toast.success('Авто-сопоставление выполнено');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Ошибка'),
  });

  React.useEffect(() => {
    checkMutation.mutate();
  }, [invoiceId]);

  const columns: ColumnDef<ComplianceItem, any>[] = useMemo(
    () => [
      { accessorKey: 'invoice_item_name', header: 'Позиция счёта', size: 250 },
      {
        accessorKey: 'status',
        header: 'Статус',
        size: 130,
        cell: ({ getValue }) => {
          const info = STATUS_BADGES[getValue() as string];
          return info ? <Badge className={info.color}>{info.label}</Badge> : getValue();
        },
      },
      {
        accessorKey: 'contract_estimate_item_name',
        header: 'Позиция сметы',
        size: 250,
        cell: ({ getValue }) => getValue() || '—',
      },
      {
        id: 'flags',
        header: 'Флаги',
        size: 150,
        cell: ({ row }) => (
          <div className="flex gap-1">
            {row.original.quantity_exceeds && (
              <Badge variant="destructive" className="text-xs">Кол-во↑</Badge>
            )}
            {row.original.price_exceeds && (
              <Badge variant="destructive" className="text-xs">Цена↑</Badge>
            )}
          </div>
        ),
      },
      { accessorKey: 'details', header: 'Детали', size: 200 },
      {
        id: 'actions',
        header: '',
        size: 80,
        cell: ({ row }) => {
          if (row.original.status === 'unmatched' && onLinkManual) {
            return (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onLinkManual(row.original.invoice_item_id)}
              >
                <LinkIcon className="h-3.5 w-3.5 mr-1" />
                Связать
              </Button>
            );
          }
          return null;
        },
      },
    ],
    [onLinkManual],
  );

  if (checkMutation.isPending) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  if (!result) return null;

  const matchedCount = result.items.filter((i) => i.status === 'matched').length;
  const unmatchedCount = result.items.filter((i) => i.status === 'unmatched').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Badge className="bg-green-100 text-green-800">{matchedCount} совпадений</Badge>
        {unmatchedCount > 0 && (
          <Badge variant="destructive">{unmatchedCount} не найдено</Badge>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => autoLinkMutation.mutate()}
          disabled={autoLinkMutation.isPending}
        >
          {autoLinkMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Wand2 className="h-4 w-4 mr-1" />
          )}
          Авто-сопоставление
        </Button>
      </div>
      <DataTable
        columns={columns}
        data={result.items}
        enableSorting
        emptyMessage="Нет позиций для проверки"
      />
    </div>
  );
};

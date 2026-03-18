import React, { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { api, type Act, type ActItem } from '../../lib/api';
import { formatCurrency, formatDate } from '../../lib/utils';
import { CONSTANTS } from '../../constants';
import { DataTable } from '../ui/data-table';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { ArrowLeft, Loader2, CheckCircle, FileSignature } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: 'Черновик', color: 'bg-gray-100 text-gray-800' },
  agreed: { label: 'Согласован', color: 'bg-blue-100 text-blue-800' },
  signed: { label: 'Подписан', color: 'bg-green-100 text-green-800' },
  cancelled: { label: 'Отменён', color: 'bg-red-100 text-red-800' },
};

const ACT_TYPE_MAP: Record<string, string> = {
  ks2: 'КС-2',
  ks3: 'КС-3 (справка)',
  simple: 'Простой',
};

export const ActDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: act, isLoading } = useQuery({
    queryKey: ['act', id],
    queryFn: () => api.getActDetail(Number(id)),
    enabled: !!id,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const agreeMutation = useMutation({
    mutationFn: () => api.agreeAct(Number(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['act', id] });
      toast.success('Акт согласован');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Ошибка'),
  });

  const signMutation = useMutation({
    mutationFn: () => api.signAct(Number(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['act', id] });
      toast.success('Акт подписан');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Ошибка'),
  });

  const itemColumns: ColumnDef<ActItem, any>[] = useMemo(
    () => [
      { accessorKey: 'sort_order', header: '№', size: 50 },
      { accessorKey: 'name', header: 'Наименование', size: 300 },
      { accessorKey: 'unit', header: 'Ед.', size: 60 },
      {
        accessorKey: 'quantity',
        header: 'Кол-во',
        size: 80,
        cell: ({ getValue }) => parseFloat(getValue() as string).toLocaleString('ru-RU'),
      },
      {
        accessorKey: 'unit_price',
        header: 'Цена',
        size: 110,
        cell: ({ getValue }) => formatCurrency(getValue() as string),
      },
      {
        accessorKey: 'amount',
        header: 'Сумма',
        size: 130,
        cell: ({ getValue }) => (
          <span className="font-medium">{formatCurrency(getValue() as string)}</span>
        ),
      },
    ],
    [],
  );

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (!act) {
    return <div className="text-center py-12 text-muted-foreground">Акт не найден</div>;
  }

  const statusInfo = STATUS_MAP[act.status] || STATUS_MAP.draft;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Назад
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">
            Акт {act.number} — {ACT_TYPE_MAP[act.act_type] || act.act_type}
          </h1>
          <div className="flex items-center gap-3 mt-1">
            <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
            <span className="text-sm text-muted-foreground">
              от {formatDate(act.date)}
              {act.period_start && act.period_end && ` (${formatDate(act.period_start)} — ${formatDate(act.period_end)})`}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Сумма с НДС</div>
          <div className="text-xl font-bold">{formatCurrency(act.amount_gross)}</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">НДС</div>
          <div className="text-xl font-bold">{formatCurrency(act.vat_amount)}</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Неоплачено</div>
          <div className="text-xl font-bold text-amber-600">{formatCurrency(act.unpaid_amount)}</div>
        </div>
      </div>

      {act.description && (
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-muted-foreground mb-1">Описание</div>
          <p>{act.description}</p>
        </div>
      )}

      <div className="flex items-center gap-2">
        {act.status === 'draft' && (
          <Button size="sm" onClick={() => agreeMutation.mutate()} disabled={agreeMutation.isPending}>
            <CheckCircle className="h-4 w-4 mr-1" />
            Согласовать
          </Button>
        )}
        {act.status === 'agreed' && (
          <Button size="sm" onClick={() => signMutation.mutate()} disabled={signMutation.isPending}>
            <FileSignature className="h-4 w-4 mr-1" />
            Подписать
          </Button>
        )}
      </div>

      {act.act_items && act.act_items.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Позиции акта</h2>
          <DataTable
            columns={itemColumns}
            data={act.act_items}
            enableSorting
            emptyMessage="Нет позиций"
          />
        </div>
      )}
    </div>
  );
};

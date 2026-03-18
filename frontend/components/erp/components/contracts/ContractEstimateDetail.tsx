import React, { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from '@/hooks/erp-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import {
  api,
  type ContractEstimateItem,
  type ContractEstimateListItem,
  type ContractEstimateSection,
} from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { CONSTANTS } from '../../constants';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Loader2, Download, Upload, Copy, Scissors, CheckCircle, FileSignature } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: 'Черновик', color: 'bg-gray-100 text-gray-800' },
  agreed: { label: 'Согласована', color: 'bg-blue-100 text-blue-800' },
  signed: { label: 'Подписана', color: 'bg-green-100 text-green-800' },
};

export const ContractEstimateDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isVersionDialogOpen, setVersionDialogOpen] = useState(false);
  const [versionAmendmentId, setVersionAmendmentId] = useState<number | undefined>();

  const { data: estimate, isLoading } = useQuery({
    queryKey: ['contract-estimate', id],
    queryFn: () => api.getContractEstimateDetail(Number(id)),
    enabled: !!id,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const { data: items = [] } = useQuery({
    queryKey: ['contract-estimate-items', id],
    queryFn: () => api.getContractEstimateItems(Number(id)),
    enabled: !!id,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const { data: sections = [] } = useQuery({
    queryKey: ['contract-estimate-sections', id],
    queryFn: () => api.getContractEstimateSections(Number(id)),
    enabled: !!id,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const agreeMutation = useMutation({
    mutationFn: () => api.updateContractEstimate(Number(id), { status: 'agreed' } as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-estimate', id] });
      toast.success('Смета согласована');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Ошибка'),
  });

  const signMutation = useMutation({
    mutationFn: () => api.updateContractEstimate(Number(id), { status: 'signed' } as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-estimate', id] });
      toast.success('Смета подписана');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Ошибка'),
  });

  const createVersionMutation = useMutation({
    mutationFn: () => api.createContractEstimateVersion(Number(id), versionAmendmentId),
    onSuccess: (data) => {
      setVersionDialogOpen(false);
      toast.success(`Создана версия ${data.version_number}`);
      navigate(`/contracts/estimates/${data.id}`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Ошибка'),
  });

  const sectionMap = useMemo(() => {
    const map: Record<number, string> = {};
    sections.forEach((s: ContractEstimateSection) => (map[s.id] = s.name));
    return map;
  }, [sections]);

  const columns: ColumnDef<ContractEstimateItem, any>[] = useMemo(
    () => [
      { accessorKey: 'item_number', header: '№', size: 50 },
      { accessorKey: 'name', header: 'Наименование', size: 250 },
      { accessorKey: 'model_name', header: 'Модель', size: 150 },
      { accessorKey: 'unit', header: 'Ед.', size: 60 },
      {
        accessorKey: 'quantity',
        header: 'Кол-во',
        size: 80,
        cell: ({ getValue }) => parseFloat(getValue() as string).toLocaleString('ru-RU'),
      },
      {
        accessorKey: 'material_unit_price',
        header: 'Цена мат.',
        size: 100,
        cell: ({ getValue }) => formatCurrency(getValue() as string),
      },
      {
        accessorKey: 'work_unit_price',
        header: 'Цена раб.',
        size: 100,
        cell: ({ getValue }) => formatCurrency(getValue() as string),
      },
      {
        accessorKey: 'material_total',
        header: 'Итого мат.',
        size: 110,
        cell: ({ getValue }) => formatCurrency(getValue() as string),
      },
      {
        accessorKey: 'work_total',
        header: 'Итого раб.',
        size: 110,
        cell: ({ getValue }) => formatCurrency(getValue() as string),
      },
      {
        accessorKey: 'line_total',
        header: 'Итого',
        size: 120,
        cell: ({ getValue }) => (
          <span className="font-medium">{formatCurrency(getValue() as string)}</span>
        ),
      },
      {
        accessorKey: 'section',
        header: 'Раздел',
        size: 140,
        cell: ({ getValue }) => sectionMap[getValue() as number] || '—',
      },
    ],
    [sectionMap],
  );

  const totals = useMemo(() => {
    let materials = 0, works = 0, total = 0;
    items.forEach((item: ContractEstimateItem) => {
      materials += parseFloat(item.material_total) || 0;
      works += parseFloat(item.work_total) || 0;
      total += parseFloat(item.line_total) || 0;
    });
    return { materials, works, total };
  }, [items]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!estimate) {
    return <div className="text-center py-12 text-muted-foreground">Смета к договору не найдена</div>;
  }

  const statusInfo = STATUS_MAP[estimate.status] || STATUS_MAP.draft;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Назад
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">
            Смета к договору: {estimate.number} — {estimate.name}
          </h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
            <span>Версия: {estimate.version_number}</span>
            {estimate.signed_date && <span>Подписана: {formatDate(estimate.signed_date)}</span>}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Материалы</div>
          <div className="text-xl font-bold">{formatCurrency(totals.materials)}</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Работы</div>
          <div className="text-xl font-bold">{formatCurrency(totals.works)}</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Всего</div>
          <div className="text-2xl font-bold text-primary">{formatCurrency(totals.total)}</div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {estimate.status === 'draft' && (
          <Button size="sm" onClick={() => agreeMutation.mutate()} disabled={agreeMutation.isPending}>
            <CheckCircle className="h-4 w-4 mr-1" />
            Согласовать
          </Button>
        )}
        {estimate.status === 'agreed' && (
          <Button size="sm" onClick={() => signMutation.mutate()} disabled={signMutation.isPending}>
            <FileSignature className="h-4 w-4 mr-1" />
            Подписать
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setVersionDialogOpen(true)}>
          <Copy className="h-4 w-4 mr-1" />
          Новая версия
        </Button>
        {estimate.file && (
          <Button size="sm" variant="outline" asChild>
            <a href={estimate.file} target="_blank" rel="noopener noreferrer">
              <Download className="h-4 w-4 mr-1" />
              Скачать файл
            </a>
          </Button>
        )}
      </div>

      {/* Items Table */}
      <DataTable
        columns={columns}
        data={items}
        enableSorting
        enableFiltering
        enableVirtualization={items.length > 200}
        emptyMessage="Нет строк в смете к договору"
        footerContent={
          <div className="flex items-center gap-6 py-2 font-medium">
            <span>Материалы: {formatCurrency(totals.materials)}</span>
            <span>Работы: {formatCurrency(totals.works)}</span>
            <span className="text-lg">Всего: {formatCurrency(totals.total)}</span>
          </div>
        }
      />

      {/* Create Version Dialog */}
      <Dialog open={isVersionDialogOpen} onOpenChange={setVersionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Создать новую версию</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Будет создана копия текущей сметы как новая версия.
            </p>
            <div>
              <Label>ДОП-соглашение (опционально)</Label>
              <Input
                type="number"
                placeholder="ID допсоглашения"
                value={versionAmendmentId || ''}
                onChange={(e) => setVersionAmendmentId(e.target.value ? Number(e.target.value) : undefined)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVersionDialogOpen(false)}>Отмена</Button>
            <Button onClick={() => createVersionMutation.mutate()} disabled={createVersionMutation.isPending}>
              {createVersionMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Создать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

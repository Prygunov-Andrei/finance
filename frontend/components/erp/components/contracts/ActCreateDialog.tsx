import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { type ColumnDef, type RowSelectionState } from '@tanstack/react-table';
import {
  api,
  type AccumulativeEstimateRow,
  type ContractEstimateListItem,
  type CreateActData,
} from '@/lib/api';
import { DataTable, createSelectColumn } from '@/components/ui/data-table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';

type ActCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: number;
};

export const ActCreateDialog: React.FC<ActCreateDialogProps> = ({
  open,
  onOpenChange,
  contractId,
}) => {
  const queryClient = useQueryClient();
  const [actType, setActType] = useState<'ks2' | 'ks3' | 'simple'>('ks2');
  const [form, setForm] = useState({
    number: '',
    date: new Date().toISOString().slice(0, 10),
    period_start: '',
    period_end: '',
    description: '',
    amount_gross: '',
  });
  const [selectedCE, setSelectedCE] = useState<number | null>(null);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const { data: contractEstimates = [] } = useQuery({
    queryKey: ['contract-estimates-for-act', contractId],
    queryFn: () => api.getContractEstimates(contractId),
    enabled: open && actType !== 'simple',
  });

  const { data: accRows = [] } = useQuery({
    queryKey: ['accumulative-for-act', contractId],
    queryFn: () => api.getAccumulativeEstimate(contractId),
    enabled: open && actType === 'ks2' && !!selectedCE,
  });

  const signedEstimates = useMemo(
    () => contractEstimates.filter((ce: ContractEstimateListItem) => ce.status === 'signed'),
    [contractEstimates],
  );

  const accColumns: ColumnDef<AccumulativeEstimateRow, any>[] = useMemo(
    () => [
      createSelectColumn<AccumulativeEstimateRow>(),
      { accessorKey: 'item_number', header: '№', size: 50 },
      { accessorKey: 'name', header: 'Наименование', size: 250 },
      { accessorKey: 'unit', header: 'Ед.', size: 60 },
      {
        accessorKey: 'estimate_quantity',
        header: 'По смете',
        size: 90,
        cell: ({ getValue }) => parseFloat(getValue() as string).toLocaleString('ru-RU'),
      },
      {
        accessorKey: 'purchased_quantity',
        header: 'Закуплено',
        size: 90,
        cell: ({ getValue }) => parseFloat(getValue() as string).toLocaleString('ru-RU'),
      },
      {
        accessorKey: 'estimate_total',
        header: 'Сумма',
        size: 110,
        cell: ({ getValue }) => formatCurrency(getValue() as string),
      },
    ],
    [],
  );

  const selectedTotal = useMemo(() => {
    return Object.keys(rowSelection)
      .filter((k) => rowSelection[k])
      .reduce((sum, k) => sum + (parseFloat(accRows[Number(k)]?.estimate_total) || 0), 0);
  }, [rowSelection, accRows]);

  const createActMutation = useMutation({
    mutationFn: async () => {
      if (actType === 'ks2' && selectedCE) {
        const selectedItems = Object.keys(rowSelection)
          .filter((k) => rowSelection[k])
          .map((k) => ({
            contract_estimate_item_id: accRows[Number(k)]?.item_id,
          }));
        return api.createActFromAccumulative({
          contract_estimate_id: selectedCE,
          number: form.number,
          date: form.date,
          period_start: form.period_start || undefined,
          period_end: form.period_end || undefined,
          items: selectedItems,
        });
      }
      const data: CreateActData = {
        contract: contractId,
        number: form.number,
        date: form.date,
        period_start: form.period_start,
        period_end: form.period_end,
        amount_gross: form.amount_gross || '0',
        amount_net: '0',
        vat_amount: '0',
        act_type: actType,
        description: form.description,
        contract_estimate: selectedCE || undefined,
      };
      return api.createAct(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['acts'] });
      toast.success('Акт создан');
      onOpenChange(false);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Ошибка'),
  });

  const handleSubmit = useCallback(() => {
    if (!form.number.trim()) {
      toast.error('Введите номер акта');
      return;
    }
    createActMutation.mutate();
  }, [form, createActMutation]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Создать акт</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Тип акта</Label>
            <select
              className="w-full border rounded-md px-3 py-2 text-sm bg-background mt-1"
              value={actType}
              onChange={(e) => setActType(e.target.value as typeof actType)}
            >
              <option value="ks2">КС-2</option>
              <option value="ks3">КС-3 (справка)</option>
              <option value="simple">Простой</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Номер акта *</Label>
              <Input
                value={form.number}
                onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
              />
            </div>
            <div>
              <Label>Дата</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Период с</Label>
              <Input
                type="date"
                value={form.period_start}
                onChange={(e) => setForm((f) => ({ ...f, period_start: e.target.value }))}
              />
            </div>
            <div>
              <Label>Период по</Label>
              <Input
                type="date"
                value={form.period_end}
                onChange={(e) => setForm((f) => ({ ...f, period_end: e.target.value }))}
              />
            </div>
          </div>

          {actType !== 'simple' && (
            <div>
              <Label>Смета к договору (подписанная)</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background mt-1"
                value={selectedCE || ''}
                onChange={(e) => setSelectedCE(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Выберите смету</option>
                {signedEstimates.map((ce: ContractEstimateListItem) => (
                  <option key={ce.id} value={ce.id}>
                    {ce.number} — {ce.name} (v{ce.version_number})
                  </option>
                ))}
              </select>
            </div>
          )}

          {actType === 'ks2' && selectedCE && accRows.length > 0 && (
            <div className="space-y-2">
              <Label>Выберите строки для включения в акт</Label>
              <DataTable
                columns={accColumns}
                data={accRows}
                enableRowSelection
                enableSorting
                onRowSelectionChange={setRowSelection}
                getRowId={(row) => String(row.item_id)}
              />
              <div className="text-right font-medium">
                Сумма выбранных: {formatCurrency(selectedTotal)}
              </div>
            </div>
          )}

          {actType === 'simple' && (
            <>
              <div>
                <Label>Описание работ</Label>
                <textarea
                  className="w-full border rounded-md p-3 text-sm bg-background resize-none h-24"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div>
                <Label>Сумма</Label>
                <Input
                  type="number"
                  value={form.amount_gross}
                  onChange={(e) => setForm((f) => ({ ...f, amount_gross: e.target.value }))}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={handleSubmit} disabled={createActMutation.isPending}>
            {createActMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Создать акт
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

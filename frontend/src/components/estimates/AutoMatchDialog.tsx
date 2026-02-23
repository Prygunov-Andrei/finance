import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { api, type AutoMatchResult, type PriceListList } from '../../lib/api';
import { DataTable } from '../ui/data-table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { Loader2, Wand2, Check, X } from 'lucide-react';
import { toast } from 'sonner';

type AutoMatchDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estimateId: number;
};

type MatchRow = AutoMatchResult & { accepted: boolean };

const confidenceBadge = (value: number) => {
  if (value >= 0.8) return <Badge className="bg-green-100 text-green-800">{Math.round(value * 100)}%</Badge>;
  if (value >= 0.5) return <Badge className="bg-yellow-100 text-yellow-800">{Math.round(value * 100)}%</Badge>;
  return <Badge variant="destructive">{Math.round(value * 100)}%</Badge>;
};

export const AutoMatchDialog: React.FC<AutoMatchDialogProps> = ({
  open,
  onOpenChange,
  estimateId,
}) => {
  const queryClient = useQueryClient();
  const [selectedPriceList, setSelectedPriceList] = useState<number | undefined>();
  const [results, setResults] = useState<MatchRow[]>([]);
  const [step, setStep] = useState<'config' | 'results'>('config');

  const { data: priceLists = [] } = useQuery({
    queryKey: ['price-lists'],
    queryFn: () => api.getPriceLists(),
    staleTime: 60000,
    enabled: open,
  });

  const matchMutation = useMutation({
    mutationFn: () => api.autoMatchEstimateItems(estimateId, selectedPriceList),
    onSuccess: (data) => {
      const rows = (data || []).map((r) => ({ ...r, accepted: r.product_confidence >= 0.8 || r.work_confidence >= 0.8 }));
      setResults(rows);
      setStep('results');
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const handleApply = useCallback(async () => {
    const accepted = results.filter((r) => r.accepted);
    if (accepted.length === 0) {
      toast.error('Не выбрано ни одной строки');
      return;
    }

    const updates = accepted.map((r) => ({
      id: r.item_id,
      ...(r.matched_product ? {
        product: r.matched_product.id,
        material_unit_price: r.matched_product.price,
      } : {}),
      ...(r.matched_work ? {
        work_item: r.matched_work.id,
        work_unit_price: r.matched_work.cost,
      } : {}),
    }));

    try {
      await api.bulkUpdateEstimateItems(updates);
      queryClient.invalidateQueries({ queryKey: ['estimate-items', estimateId] });
      toast.success(`Применено ${accepted.length} совпадений`);
      onOpenChange(false);
    } catch (error) {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    }
  }, [results, estimateId, queryClient, onOpenChange]);

  const handleToggle = useCallback((idx: number) => {
    setResults((prev) => prev.map((r, i) => i === idx ? { ...r, accepted: !r.accepted } : r));
  }, []);

  const handleAcceptAll = useCallback(() => {
    setResults((prev) => prev.map((r) => ({
      ...r,
      accepted: r.product_confidence >= 0.8 || r.work_confidence >= 0.8,
    })));
  }, []);

  const columns: ColumnDef<MatchRow, any>[] = [
    {
      id: 'accepted',
      header: '',
      size: 40,
      cell: ({ row }) => (
        <button
          onClick={() => handleToggle(row.index)}
          className={`w-6 h-6 rounded flex items-center justify-center ${
            row.original.accepted ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
          }`}
          aria-label={row.original.accepted ? 'Отклонить' : 'Принять'}
        >
          {row.original.accepted ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
        </button>
      ),
    },
    { accessorKey: 'name', header: 'Строка сметы', size: 200 },
    {
      id: 'product',
      header: 'Товар из каталога',
      size: 200,
      cell: ({ row }) => row.original.matched_product?.name || '—',
    },
    {
      id: 'product_price',
      header: 'Цена мат.',
      size: 100,
      cell: ({ row }) => row.original.matched_product?.price || '—',
    },
    {
      id: 'product_conf',
      header: 'Увер.',
      size: 70,
      cell: ({ row }) => confidenceBadge(row.original.product_confidence),
    },
    {
      id: 'work',
      header: 'Работа',
      size: 200,
      cell: ({ row }) => row.original.matched_work?.name || '—',
    },
    {
      id: 'work_price',
      header: 'Цена раб.',
      size: 100,
      cell: ({ row }) => row.original.matched_work?.cost || '—',
    },
    {
      id: 'work_conf',
      header: 'Увер.',
      size: 70,
      cell: ({ row }) => confidenceBadge(row.original.work_confidence),
    },
  ];

  const handleClose = useCallback(() => {
    setStep('config');
    setResults([]);
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <Wand2 className="inline h-5 w-5 mr-2" />
            Автоподбор цен и работ
          </DialogTitle>
        </DialogHeader>

        {step === 'config' && (
          <div className="space-y-4">
            <div>
              <Label>Прайс-лист (опционально)</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background mt-1"
                value={selectedPriceList || ''}
                onChange={(e) => setSelectedPriceList(e.target.value ? Number(e.target.value) : undefined)}
              >
                <option value="">Без привязки к прайс-листу</option>
                {priceLists.map((pl: PriceListList) => (
                  <option key={pl.id} value={pl.id}>
                    {pl.number} — {pl.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-sm text-muted-foreground">
              Система подберёт товары из каталога и работы из прайс-листа для каждой строки сметы.
              Вы сможете принять или отклонить каждое совпадение перед применением.
            </p>
          </div>
        )}

        {step === 'results' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Badge variant="secondary">{results.length} строк</Badge>
              <Badge className="bg-green-100 text-green-800">
                {results.filter((r) => r.accepted).length} принято
              </Badge>
              <Button size="sm" variant="outline" onClick={handleAcceptAll}>
                Принять все {'>'}80%
              </Button>
            </div>
            <DataTable
              columns={columns}
              data={results}
              enableSorting
              enableVirtualization={results.length > 100}
              emptyMessage="Совпадения не найдены"
            />
          </div>
        )}

        <DialogFooter>
          {step === 'config' && (
            <>
              <Button variant="outline" onClick={handleClose}>Отмена</Button>
              <Button onClick={() => matchMutation.mutate()} disabled={matchMutation.isPending}>
                {matchMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Запустить подбор
              </Button>
            </>
          )}
          {step === 'results' && (
            <>
              <Button variant="outline" onClick={handleClose}>Отмена</Button>
              <Button onClick={handleApply}>
                Применить ({results.filter((r) => r.accepted).length})
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

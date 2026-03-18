import React, { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { api, type WorkMatchResult } from '../../lib/api';
import { DataTable } from '../ui/data-table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Loader2, Hammer, Check, X } from 'lucide-react';
import { toast } from 'sonner';

type AutoMatchWorksDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estimateId: number;
};

type MatchRow = WorkMatchResult & { accepted: boolean };

const confidenceBadge = (value: number) => {
  if (value >= 0.8) return <Badge className="bg-green-100 text-green-800">{Math.round(value * 100)}%</Badge>;
  if (value >= 0.6) return <Badge className="bg-yellow-100 text-yellow-800">{Math.round(value * 100)}%</Badge>;
  return <Badge variant="destructive">{Math.round(value * 100)}%</Badge>;
};

const sourceBadge = (source: string) => {
  switch (source) {
    case 'history':
      return <Badge className="bg-green-100 text-green-800">история</Badge>;
    case 'rule':
      return <Badge className="bg-yellow-100 text-yellow-800">правило</Badge>;
    case 'llm':
      return <Badge className="bg-orange-100 text-orange-800">LLM</Badge>;
    default:
      return <Badge variant="secondary">{source}</Badge>;
  }
};

export const AutoMatchWorksDialog: React.FC<AutoMatchWorksDialogProps> = ({
  open,
  onOpenChange,
  estimateId,
}) => {
  const queryClient = useQueryClient();
  const [results, setResults] = useState<MatchRow[]>([]);
  const [step, setStep] = useState<'config' | 'results'>('config');

  const matchMutation = useMutation({
    mutationFn: () => api.autoMatchWorksForEstimate(estimateId),
    onSuccess: (data) => {
      const rows = (data || []).map((r) => ({
        ...r,
        accepted: r.work_confidence >= 0.7,
      }));
      setResults(rows);
      setStep('results');
      if (rows.length === 0) {
        toast.info('Совпадений не найдено. Убедитесь, что товары уже подобраны (кнопка «Подобрать цены»).');
      }
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const handleApply = useCallback(async () => {
    const accepted = results.filter((r) => r.accepted && r.matched_work);
    if (accepted.length === 0) {
      toast.error('Не выбрано ни одной строки');
      return;
    }

    const items = accepted.map((r) => ({
      item_id: r.item_id,
      work_item_id: r.matched_work!.id,
      ...(r.work_price ? { work_price: r.work_price } : {}),
    }));

    try {
      const result = await api.applyMatchedWorks(items);
      queryClient.invalidateQueries({ queryKey: ['estimate-items', estimateId] });
      toast.success(`Применено ${result.applied} работ`);
      onOpenChange(false);
    } catch (error) {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    }
  }, [results, estimateId, queryClient, onOpenChange]);

  const handleToggle = useCallback((idx: number) => {
    setResults((prev) => prev.map((r, i) => i === idx ? { ...r, accepted: !r.accepted } : r));
  }, []);

  const handleAcceptGood = useCallback(() => {
    setResults((prev) => prev.map((r) => ({
      ...r,
      accepted: r.work_confidence >= 0.7,
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
    { accessorKey: 'name', header: 'Строка сметы', size: 180 },
    {
      id: 'work_name',
      header: 'Работа',
      size: 200,
      cell: ({ row }) => row.original.matched_work?.name || '—',
    },
    {
      id: 'article',
      header: 'Артикул',
      size: 80,
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.matched_work?.article || '—'}</span>
      ),
    },
    {
      id: 'section',
      header: 'Раздел',
      size: 120,
      cell: ({ row }) => row.original.matched_work?.section_name || '—',
    },
    {
      id: 'hours',
      header: 'Часы',
      size: 60,
      cell: ({ row }) => row.original.matched_work?.hours || '—',
    },
    {
      id: 'grade',
      header: 'Разряд',
      size: 60,
      cell: ({ row }) => row.original.matched_work?.required_grade || '—',
    },
    {
      id: 'source',
      header: 'Способ',
      size: 90,
      cell: ({ row }) => sourceBadge(row.original.source),
    },
    {
      id: 'confidence',
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
      <DialogContent className="max-w-6xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <Hammer className="inline h-5 w-5 mr-2" />
            Подобрать работы из прайс-листа
          </DialogTitle>
        </DialogHeader>

        {step === 'config' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Система подберёт работы из прайс-листа для строк сметы, у которых уже определён товар.
              Используются три стратегии: история предыдущих сопоставлений, правила по категориям и нечёткий поиск.
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
              <Button size="sm" variant="outline" onClick={handleAcceptGood}>
                Принять все {'>'}70%
              </Button>
            </div>
            <DataTable
              columns={columns}
              data={results}
              enableSorting
              enableVirtualization={results.length > 100}
              emptyMessage="Совпадения не найдены. Убедитесь, что товары подобраны (кнопка «Подобрать цены»)."
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

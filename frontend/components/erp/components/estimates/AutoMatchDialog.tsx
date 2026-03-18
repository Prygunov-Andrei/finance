import React, { useState, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { api, type AutoMatchResult, type AutoMatchOffer } from '../../lib/api';
import { DataTable } from '../ui/data-table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Label } from '../ui/label';
import { Loader2, Wand2, Check, X, Package, FileText, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { CONSTANTS } from '../../constants';

type AutoMatchDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estimateId: number;
};

type MatchRow = AutoMatchResult & { accepted: boolean; selectedOffer: AutoMatchOffer | null };

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
  const [results, setResults] = useState<MatchRow[]>([]);
  const [step, setStep] = useState<'config' | 'results'>('config');
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<number[]>([]);
  const [priceStrategy, setPriceStrategy] = useState<string>('cheapest');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  // Загрузка поставщиков
  const { data: suppliers } = useQuery({
    queryKey: ['counterparties-vendors'],
    queryFn: () => api.getCounterparties({ type: 'vendor' }),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
    enabled: open,
  });

  const matchMutation = useMutation({
    mutationFn: () =>
      api.autoMatchEstimateItems(estimateId, {
        supplierIds: selectedSupplierIds.length > 0 ? selectedSupplierIds : undefined,
        priceStrategy,
      }),
    onSuccess: (data) => {
      const rows = (data || []).map((r) => ({
        ...r,
        accepted: r.product_confidence >= 0.8 && r.best_offer !== null,
        selectedOffer: r.best_offer,
      }));
      setResults(rows);
      setStep('results');
      if (rows.length === 0) {
        toast.info('Совпадений не найдено.');
      }
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const handleApply = useCallback(async () => {
    const accepted = results.filter((r) => r.accepted && r.selectedOffer);
    if (accepted.length === 0) {
      toast.error('Не выбрано ни одной строки');
      return;
    }

    const updates = accepted.map((r) => ({
      id: r.item_id,
      ...(r.matched_product ? { product: r.matched_product.id } : {}),
      ...(r.selectedOffer ? { material_unit_price: r.selectedOffer.price } : {}),
      ...(r.selectedOffer?.supplier_product_id
        ? { supplier_product: r.selectedOffer.supplier_product_id }
        : {}),
      ...(r.selectedOffer?.source_price_history_id
        ? { source_price_history: r.selectedOffer.source_price_history_id }
        : {}),
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

  const handleSelectOffer = useCallback((rowIdx: number, offer: AutoMatchOffer) => {
    setResults((prev) =>
      prev.map((r, i) => i === rowIdx ? { ...r, selectedOffer: offer, accepted: true } : r)
    );
  }, []);

  const handleAcceptAll = useCallback(() => {
    setResults((prev) => prev.map((r) => ({
      ...r,
      accepted: r.product_confidence >= 0.8 && r.best_offer !== null,
    })));
  }, []);

  const toggleSupplier = useCallback((id: number) => {
    setSelectedSupplierIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
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
      size: 180,
      cell: ({ row }) => row.original.matched_product?.name || '—',
    },
    {
      id: 'product_price',
      header: 'Цена',
      size: 100,
      cell: ({ row }) => {
        const offer = row.original.selectedOffer;
        if (!offer) return '—';
        return Number(offer.price).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' \u20BD';
      },
    },
    {
      id: 'source',
      header: 'Источник',
      size: 220,
      cell: ({ row }) => {
        const offer = row.original.selectedOffer;
        if (!offer) return <span className="text-muted-foreground">Нет данных</span>;
        return (
          <div className="text-xs leading-tight">
            <div className="flex items-center gap-1 font-medium">
              {offer.source_type === 'supplier_catalog' ? (
                <Package className="w-3 h-3 text-blue-500" />
              ) : (
                <FileText className="w-3 h-3 text-orange-500" />
              )}
              {offer.counterparty_name || 'Неизвестный'}
            </div>
            <div className="text-muted-foreground">
              {offer.source_type === 'supplier_catalog'
                ? 'Каталог поставщика'
                : `Счёт ${offer.invoice_number || '—'} от ${
                    offer.invoice_date
                      ? new Date(offer.invoice_date).toLocaleDateString('ru-RU')
                      : '—'
                  }`}
            </div>
          </div>
        );
      },
    },
    {
      id: 'offers_count',
      header: 'Предл.',
      size: 60,
      cell: ({ row }) => {
        const count = row.original.all_offers?.length || 0;
        if (count <= 1) return <span className="text-gray-400">{count}</span>;
        return (
          <button
            onClick={() => setExpandedRow(expandedRow === row.index ? null : row.index)}
            className="text-blue-600 hover:underline text-sm flex items-center gap-0.5"
          >
            {count}
            {expandedRow === row.index
              ? <ChevronDown className="w-3 h-3" />
              : <ChevronRight className="w-3 h-3" />}
          </button>
        );
      },
    },
    {
      id: 'confidence',
      header: 'Увер.',
      size: 70,
      cell: ({ row }) => confidenceBadge(row.original.product_confidence),
    },
  ];

  const handleClose = useCallback(() => {
    setStep('config');
    setResults([]);
    setExpandedRow(null);
    onOpenChange(false);
  }, [onOpenChange]);

  const supplierList = suppliers?.results || [];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <Wand2 className="inline h-5 w-5 mr-2" />
            Подобрать цены
          </DialogTitle>
        </DialogHeader>

        {step === 'config' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Система найдёт совпадения между строками сметы и товарами из каталогов поставщиков
              и загруженных счетов. Вы сможете принять или отклонить каждое совпадение.
            </p>

            {supplierList.length > 0 && (
              <div>
                <Label className="mb-2 block">Поставщики</Label>
                <div className="flex flex-wrap gap-2">
                  {supplierList.map((s: any) => (
                    <button
                      key={s.id}
                      onClick={() => toggleSupplier(s.id)}
                      className={`px-3 py-1.5 rounded-md text-sm border transition ${
                        selectedSupplierIds.includes(s.id)
                          ? 'bg-blue-50 border-blue-300 text-blue-700'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
                {selectedSupplierIds.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Не выбрано — будут использованы все поставщики
                  </p>
                )}
              </div>
            )}

            <div>
              <Label className="mb-2 block">Стратегия подбора цены</Label>
              <Select value={priceStrategy} onValueChange={setPriceStrategy}>
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cheapest">Самая дешёвая цена</SelectItem>
                  <SelectItem value="latest">Последняя из счетов</SelectItem>
                </SelectContent>
              </Select>
            </div>
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

            <div className="space-y-0">
              <DataTable
                columns={columns}
                data={results}
                enableSorting
                enableVirtualization={results.length > 100}
                emptyMessage="Совпадения не найдены."
              />

              {/* Расширенная строка с предложениями */}
              {expandedRow !== null && results[expandedRow]?.all_offers?.length > 1 && (
                <div className="border rounded-lg p-3 bg-gray-50 mt-2">
                  <h4 className="text-sm font-medium mb-2">
                    Все предложения для &laquo;{results[expandedRow].name}&raquo;
                  </h4>
                  <div className="space-y-1">
                    {results[expandedRow].all_offers.map((offer, i) => {
                      const isSelected =
                        results[expandedRow].selectedOffer?.price === offer.price &&
                        results[expandedRow].selectedOffer?.counterparty_name === offer.counterparty_name;
                      return (
                        <button
                          key={i}
                          onClick={() => handleSelectOffer(expandedRow, offer)}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded text-sm transition ${
                            isSelected
                              ? 'bg-blue-50 border border-blue-300'
                              : 'bg-white border border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {offer.source_type === 'supplier_catalog' ? (
                              <Package className="w-3.5 h-3.5 text-blue-500" />
                            ) : (
                              <FileText className="w-3.5 h-3.5 text-orange-500" />
                            )}
                            <span>{offer.counterparty_name || 'Неизвестный'}</span>
                            <span className="text-muted-foreground text-xs">
                              {offer.source_type === 'supplier_catalog'
                                ? 'Каталог'
                                : `Счёт ${offer.invoice_number || ''}`}
                            </span>
                          </div>
                          <span className="font-medium">
                            {Number(offer.price).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} {'\u20BD'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
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

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { IncomeRecord } from '../../types/supply';
import {
  Loader2, Plus, TrendingUp, Pencil, Trash2, Search,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../ui/dialog';
import { toast } from 'sonner';
import { formatDate, formatAmount } from '../../lib/utils';
import { CONSTANTS } from '../../constants';

export function IncomeRecordsPage() {
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(25);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    account: '',
    contract: '',
    category: '',
    legal_entity: '',
    counterparty: '',
    amount: '',
    payment_date: '',
    description: '',
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const buildParams = (): string => {
    const params = new URLSearchParams();
    params.set('page', String(currentPage));
    params.set('page_size', String(pageSize));
    if (searchQuery) params.set('search', searchQuery);
    return params.toString();
  };

  const { data: response, isLoading } = useQuery({
    queryKey: ['income-records', searchQuery, currentPage, pageSize],
    queryFn: () => (api as any).getIncomeRecords(buildParams()),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const records: IncomeRecord[] = response?.results || [];
  const totalCount = response?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => (api as any).deleteIncomeRecord(id),
    onSuccess: () => {
      toast.success('Запись дохода удалена');
      queryClient.invalidateQueries({ queryKey: ['income-records'] });
    },
    onError: () => toast.error('Ошибка при удалении'),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => (api as any).createIncomeRecord(data),
    onSuccess: () => {
      toast.success('Доход записан');
      setIsCreateOpen(false);
      handleResetForm();
      queryClient.invalidateQueries({ queryKey: ['income-records'] });
    },
    onError: () => toast.error('Ошибка при создании'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      (api as any).updateIncomeRecord(id, data),
    onSuccess: () => {
      toast.success('Запись обновлена');
      setEditId(null);
      setIsCreateOpen(false);
      handleResetForm();
      queryClient.invalidateQueries({ queryKey: ['income-records'] });
    },
    onError: () => toast.error('Ошибка при обновлении'),
  });

  const handleResetForm = () => {
    setFormData({
      account: '',
      contract: '',
      category: '',
      legal_entity: '',
      counterparty: '',
      amount: '',
      payment_date: '',
      description: '',
    });
  };

  const handleEdit = (r: IncomeRecord) => {
    setEditId(r.id);
    setFormData({
      account: String(r.account),
      contract: r.contract ? String(r.contract) : '',
      category: String(r.category),
      legal_entity: String(r.legal_entity),
      counterparty: r.counterparty ? String(r.counterparty) : '',
      amount: r.amount,
      payment_date: r.payment_date,
      description: r.description,
    });
    setIsCreateOpen(true);
  };

  const handleSubmit = () => {
    const payload: any = {
      account: parseInt(formData.account),
      category: parseInt(formData.category),
      legal_entity: parseInt(formData.legal_entity),
      amount: formData.amount,
      payment_date: formData.payment_date,
      description: formData.description,
    };
    if (formData.contract) payload.contract = parseInt(formData.contract);
    if (formData.counterparty) payload.counterparty = parseInt(formData.counterparty);

    if (editId) {
      updateMutation.mutate({ id: editId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleConfirmDelete = (id: number) => {
    if (window.confirm('Удалить запись дохода?')) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Доходы</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Учёт поступлений. Всего: {totalCount}
          </p>
        </div>
        <Button onClick={() => { handleResetForm(); setEditId(null); setIsCreateOpen(true); }} size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Новая запись
        </Button>
      </div>

      {/* Search */}
      <Card className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по описанию, контрагенту..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </Card>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : records.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg font-medium">Записей нет</p>
          <p className="text-sm mt-1">Создайте первую запись о доходе</p>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Дата</th>
                  <th className="text-left p-3 font-medium">Контрагент</th>
                  <th className="text-left p-3 font-medium">Счёт</th>
                  <th className="text-left p-3 font-medium">Категория</th>
                  <th className="text-right p-3 font-medium">Сумма</th>
                  <th className="text-left p-3 font-medium">Описание</th>
                  <th className="text-center p-3 font-medium">Действия</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="p-3 text-xs whitespace-nowrap">{formatDate(r.payment_date)}</td>
                    <td className="p-3">{r.counterparty_name || '—'}</td>
                    <td className="p-3 text-muted-foreground">{r.account_name || '—'}</td>
                    <td className="p-3 text-muted-foreground">{r.category_name || '—'}</td>
                    <td className="p-3 text-right font-medium text-green-700 whitespace-nowrap">
                      +{formatAmount(r.amount)}
                    </td>
                    <td className="p-3 max-w-[200px] truncate text-muted-foreground">
                      {r.description || '—'}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleEdit(r)}
                          aria-label="Редактировать"
                          tabIndex={0}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-600"
                          onClick={() => handleConfirmDelete(r.id)}
                          aria-label="Удалить"
                          tabIndex={0}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t">
              <p className="text-sm text-muted-foreground">
                {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, totalCount)} из {totalCount}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm">{currentPage} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={(open) => {
        if (!open) { setIsCreateOpen(false); setEditId(null); handleResetForm(); }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? 'Редактировать' : 'Новая запись'} дохода</DialogTitle>
            <DialogDescription>Заполните данные поступления</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Дата *</Label>
                <Input
                  type="date"
                  value={formData.payment_date}
                  onChange={(e) => setFormData((p) => ({ ...p, payment_date: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Сумма *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData((p) => ({ ...p, amount: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>ID счёта *</Label>
                <Input
                  type="number"
                  value={formData.account}
                  onChange={(e) => setFormData((p) => ({ ...p, account: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>ID категории *</Label>
                <Input
                  type="number"
                  value={formData.category}
                  onChange={(e) => setFormData((p) => ({ ...p, category: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>ID юрлица *</Label>
                <Input
                  type="number"
                  value={formData.legal_entity}
                  onChange={(e) => setFormData((p) => ({ ...p, legal_entity: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>ID контрагента</Label>
                <Input
                  type="number"
                  value={formData.counterparty}
                  onChange={(e) => setFormData((p) => ({ ...p, counterparty: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label>ID договора</Label>
              <Input
                type="number"
                value={formData.contract}
                onChange={(e) => setFormData((p) => ({ ...p, contract: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Описание</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                rows={2}
                className="mt-1"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => { setIsCreateOpen(false); setEditId(null); handleResetForm(); }}>
              Отмена
            </Button>
            <Button
              disabled={!formData.amount || !formData.payment_date || !formData.account || createMutation.isPending || updateMutation.isPending}
              onClick={handleSubmit}
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {editId ? 'Сохранить' : 'Создать'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

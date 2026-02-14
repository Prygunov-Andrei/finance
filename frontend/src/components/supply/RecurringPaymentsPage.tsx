import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { RecurringPayment } from '../../types/supply';
import {
  Loader2, Plus, CalendarClock, Pencil, Trash2, Search,
} from 'lucide-react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';
import { Switch } from '../ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../ui/dialog';
import { toast } from 'sonner';
import { formatDate, formatAmount } from '../../lib/utils';
import { CONSTANTS } from '../../constants';

const FREQUENCY_LABELS: Record<string, string> = {
  monthly: 'Ежемесячно',
  quarterly: 'Ежеквартально',
  yearly: 'Ежегодно',
};

export function RecurringPaymentsPage() {
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    counterparty: '',
    category: '',
    account: '',
    legal_entity: '',
    amount: '',
    amount_is_fixed: true,
    frequency: 'monthly',
    day_of_month: '1',
    start_date: '',
    end_date: '',
    description: '',
    is_active: true,
  });

  const { data: response, isLoading } = useQuery({
    queryKey: ['recurring-payments', searchQuery],
    queryFn: () => (api as any).getRecurringPayments(searchQuery ? `search=${searchQuery}` : ''),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const payments: RecurringPayment[] = response?.results || [];

  const deleteMutation = useMutation({
    mutationFn: (id: number) => (api as any).deleteRecurringPayment(id),
    onSuccess: () => {
      toast.success('Периодический платёж удалён');
      queryClient.invalidateQueries({ queryKey: ['recurring-payments'] });
    },
    onError: () => toast.error('Ошибка при удалении'),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => (api as any).createRecurringPayment(data),
    onSuccess: () => {
      toast.success('Периодический платёж создан');
      setIsCreateOpen(false);
      handleResetForm();
      queryClient.invalidateQueries({ queryKey: ['recurring-payments'] });
    },
    onError: () => toast.error('Ошибка при создании'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      (api as any).updateRecurringPayment(id, data),
    onSuccess: () => {
      toast.success('Периодический платёж обновлён');
      setEditId(null);
      setIsCreateOpen(false);
      handleResetForm();
      queryClient.invalidateQueries({ queryKey: ['recurring-payments'] });
    },
    onError: () => toast.error('Ошибка при обновлении'),
  });

  const handleResetForm = () => {
    setFormData({
      name: '',
      counterparty: '',
      category: '',
      account: '',
      legal_entity: '',
      amount: '',
      amount_is_fixed: true,
      frequency: 'monthly',
      day_of_month: '1',
      start_date: '',
      end_date: '',
      description: '',
      is_active: true,
    });
  };

  const handleEdit = (p: RecurringPayment) => {
    setEditId(p.id);
    setFormData({
      name: p.name,
      counterparty: String(p.counterparty),
      category: String(p.category),
      account: String(p.account),
      legal_entity: String(p.legal_entity),
      amount: p.amount,
      amount_is_fixed: p.amount_is_fixed,
      frequency: p.frequency,
      day_of_month: String(p.day_of_month),
      start_date: p.start_date,
      end_date: p.end_date || '',
      description: p.description,
      is_active: p.is_active,
    });
    setIsCreateOpen(true);
  };

  const handleSubmit = () => {
    const payload = {
      name: formData.name,
      counterparty: parseInt(formData.counterparty),
      category: parseInt(formData.category),
      account: parseInt(formData.account),
      legal_entity: parseInt(formData.legal_entity),
      amount: formData.amount,
      amount_is_fixed: formData.amount_is_fixed,
      frequency: formData.frequency,
      day_of_month: parseInt(formData.day_of_month),
      start_date: formData.start_date,
      end_date: formData.end_date || null,
      description: formData.description,
      is_active: formData.is_active,
    };

    if (editId) {
      updateMutation.mutate({ id: editId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleConfirmDelete = (id: number, name: string) => {
    if (window.confirm(`Удалить периодический платёж "${name}"?`)) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Периодические платежи</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Аренда, подписки, коммунальные услуги и другие регулярные расходы
          </p>
        </div>
        <Button onClick={() => { handleResetForm(); setEditId(null); setIsCreateOpen(true); }} size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Новый платёж
        </Button>
      </div>

      {/* Search */}
      <Card className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по названию..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </Card>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : payments.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          <CalendarClock className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg font-medium">Периодических платежей нет</p>
          <p className="text-sm mt-1">Создайте первый периодический платёж</p>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Название</th>
                  <th className="text-left p-3 font-medium">Контрагент</th>
                  <th className="text-right p-3 font-medium">Сумма</th>
                  <th className="text-left p-3 font-medium">Частота</th>
                  <th className="text-left p-3 font-medium">День</th>
                  <th className="text-left p-3 font-medium">Следующий</th>
                  <th className="text-center p-3 font-medium">Активен</th>
                  <th className="text-center p-3 font-medium">Действия</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-medium">{p.name}</td>
                    <td className="p-3 text-muted-foreground">{p.counterparty_name || '—'}</td>
                    <td className="p-3 text-right font-medium whitespace-nowrap">
                      {formatAmount(p.amount)}
                      {!p.amount_is_fixed && (
                        <span className="text-xs text-muted-foreground ml-1">~</span>
                      )}
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-xs">
                        {FREQUENCY_LABELS[p.frequency] || p.frequency}
                      </Badge>
                    </td>
                    <td className="p-3 text-center">{p.day_of_month}</td>
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(p.next_generation_date)}
                    </td>
                    <td className="p-3 text-center">
                      <Badge className={p.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}>
                        {p.is_active ? 'Да' : 'Нет'}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleEdit(p)}
                          aria-label="Редактировать"
                          tabIndex={0}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-600 hover:text-red-700"
                          onClick={() => handleConfirmDelete(p.id, p.name)}
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
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={(open) => {
        if (!open) { setIsCreateOpen(false); setEditId(null); handleResetForm(); }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editId ? 'Редактировать' : 'Новый'} периодический платёж</DialogTitle>
            <DialogDescription>
              {editId ? 'Измените параметры платежа' : 'Заполните данные нового периодического платежа'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
            <div>
              <Label>Название *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                placeholder="Например: Аренда офиса"
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>ID контрагента *</Label>
                <Input
                  type="number"
                  value={formData.counterparty}
                  onChange={(e) => setFormData((p) => ({ ...p, counterparty: e.target.value }))}
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
                <Label>ID счёта оплаты *</Label>
                <Input
                  type="number"
                  value={formData.account}
                  onChange={(e) => setFormData((p) => ({ ...p, account: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>ID юрлица *</Label>
                <Input
                  type="number"
                  value={formData.legal_entity}
                  onChange={(e) => setFormData((p) => ({ ...p, legal_entity: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
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
              <div className="flex items-end gap-2 pb-1">
                <Switch
                  checked={formData.amount_is_fixed}
                  onCheckedChange={(v) => setFormData((p) => ({ ...p, amount_is_fixed: v }))}
                  id="amount-fixed"
                />
                <Label htmlFor="amount-fixed" className="text-sm">
                  Фиксированная сумма
                </Label>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Частота</Label>
                <Select
                  value={formData.frequency}
                  onValueChange={(v) => setFormData((p) => ({ ...p, frequency: v }))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Ежемесячно</SelectItem>
                    <SelectItem value="quarterly">Ежеквартально</SelectItem>
                    <SelectItem value="yearly">Ежегодно</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>День месяца</Label>
                <Input
                  type="number"
                  min="1"
                  max="28"
                  value={formData.day_of_month}
                  onChange={(e) => setFormData((p) => ({ ...p, day_of_month: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Дата начала *</Label>
                <Input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData((p) => ({ ...p, start_date: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Дата окончания</Label>
                <Input
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData((p) => ({ ...p, end_date: e.target.value }))}
                  className="mt-1"
                />
              </div>
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
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(v) => setFormData((p) => ({ ...p, is_active: v }))}
                id="is-active"
              />
              <Label htmlFor="is-active">Активен</Label>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => { setIsCreateOpen(false); setEditId(null); handleResetForm(); }}>
              Отмена
            </Button>
            <Button
              disabled={!formData.name || !formData.amount || !formData.start_date || createMutation.isPending || updateMutation.isPending}
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

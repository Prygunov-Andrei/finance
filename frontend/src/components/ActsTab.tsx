import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, Act, CreateActData } from '../lib/api';
import { formatDate, formatAmount, formatCurrency } from '../lib/utils';
import { CONSTANTS } from '../constants';
import { Loader2, Plus, FileText, MoreVertical, Pencil, Trash2, CheckCircle, Download } from 'lucide-react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { toast } from 'sonner';

interface ActsTabProps {
  contractId: number;
}

export function ActsTab({ contractId }: ActsTabProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAct, setEditingAct] = useState<Act | null>(null);
  const queryClient = useQueryClient();

  const { data: actsData, isLoading } = useQuery({
    queryKey: ['acts', contractId],
    queryFn: () => api.getActs(contractId),
    enabled: !!contractId,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  // Извлекаем массив из ответа API
  const acts = actsData?.results || actsData || [];

  const createMutation = useMutation({
    mutationFn: (data: CreateActData) => api.createAct(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['acts', contractId] });
      setIsDialogOpen(false);
      setEditingAct(null);
      toast.success('Акт создан');
    },
    onError: (error: any) => {
      toast.error(`Ошибка: ${error?.message || 'Не удалось создать акт'}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateActData> }) => 
      api.updateAct(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['acts', contractId] });
      setIsDialogOpen(false);
      setEditingAct(null);
      toast.success('Акт обновлен');
    },
    onError: (error: any) => {
      toast.error(`Ошибка: ${error?.message || 'Не удалось обновить акт'}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteAct(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['acts', contractId] });
      toast.success('Акт удален');
    },
    onError: (error: any) => {
      toast.error(`Ошибка: ${error?.message || 'Не удалось удалить акт'}`);
    },
  });

  const signMutation = useMutation({
    mutationFn: (id: number) => api.signAct(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['acts', contractId] });
      toast.success('Акт подписан');
    },
    onError: (error: any) => {
      toast.error(`Ошибка: ${error?.message || 'Не удалось подписать акт'}`);
    },
  });

  const handleDelete = (act: Act) => {
    if (confirm(`Удалить акт "${act.number}"?`)) {
      deleteMutation.mutate(act.id);
    }
  };

  const handleSign = (act: Act) => {
    if (confirm(`Подписать акт "${act.number}"?`)) {
      signMutation.mutate(act.id);
    }
  };

  const handleEdit = (act: Act) => {
    setEditingAct(act);
    setIsDialogOpen(true);
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft': return 'Черновик';
      case 'signed': return 'Подписан';
      case 'cancelled': return 'Отменен';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-700';
      case 'signed': return 'bg-green-100 text-green-700';
      case 'cancelled': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Акты выполненных работ</h3>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) setEditingAct(null);
        }}>
          <Button onClick={() => {
            setEditingAct(null);
            setIsDialogOpen(true);
          }} size="sm" className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" />
            Создать акт
          </Button>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingAct ? 'Редактировать акт' : 'Новый акт'}</DialogTitle>
              <DialogDescription>
                {editingAct ? 'Обновите информацию о существующем акте' : 'Введите данные для нового акта'}
              </DialogDescription>
            </DialogHeader>
            <ActForm
              contractId={contractId}
              act={editingAct}
              onSubmit={(data) => {
                if (editingAct) {
                  updateMutation.mutate({ id: editingAct.id, data });
                } else {
                  createMutation.mutate(data);
                }
              }}
              isLoading={createMutation.isPending || updateMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      {!acts || acts.length === 0 ? (
        <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-12 text-center">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">Нет актов</p>
          <Button onClick={() => setIsDialogOpen(true)} variant="outline">
            <Plus className="w-4 h-4 mr-2" />
            Создать первый акт
          </Button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Номер
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Дата
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Период работ
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Сумма с НДС
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Сумма без НДС
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    НДС
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Статус
                  </th>
                  {acts.some(act => act.unpaid_amount) && (
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Не оплачено
                    </th>
                  )}
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {acts.map((act) => (
                  <tr key={act.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="text-sm font-medium text-gray-900">{act.number}</div>
                      {act.description && (
                        <div className="text-xs text-gray-500 truncate max-w-xs">{act.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="text-xs text-gray-500">{formatDate(act.date)}</div>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {act.period_start && act.period_end ? (
                        <div className="text-xs text-gray-500">
                          {formatDate(act.period_start)} — {formatDate(act.period_end)}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{formatAmount(act.amount_gross)} ₽</div>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="text-sm text-gray-600">{formatAmount(act.amount_net)} ₽</div>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <div className="text-sm text-gray-600">{formatAmount(act.vat_amount)} ₽</div>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded ${getStatusColor(act.status)}`}>
                        {getStatusLabel(act.status)}
                      </span>
                    </td>
                    {acts.some(a => a.unpaid_amount) && (
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {act.unpaid_amount ? (
                          <div className="text-sm font-medium text-orange-600">
                            {formatAmount(act.unpaid_amount)} ₽
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-2.5">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          {act.status === 'draft' && (
                            <DropdownMenuItem onClick={() => handleSign(act)}>
                              <CheckCircle className="w-4 h-4 mr-2" />
                              Подписать
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleEdit(act)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Редактировать
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleDelete(act)}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Удалить
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

interface ActFormProps {
  contractId: number;
  act?: Act | null;
  onSubmit: (data: CreateActData) => void;
  isLoading: boolean;
}

function ActForm({ contractId, act, onSubmit, isLoading }: ActFormProps) {
  const [formData, setFormData] = useState<CreateActData>({
    contract: contractId,
    number: act?.number || '',
    date: act?.date || new Date().toISOString().split('T')[0],
    period_start: act?.period_start || '',
    period_end: act?.period_end || '',
    amount_gross: act?.amount_gross || '',
    amount_net: act?.amount_net || '',
    vat_amount: act?.vat_amount || '',
    description: act?.description || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.number || !formData.date || !formData.amount_gross) {
      toast.error('Заполните обязательные поля');
      return;
    }

    onSubmit(formData);
  };

  // Автоматический расчет НДС
  const calculateVAT = (gross: string) => {
    const grossAmount = parseFloat(gross);
    if (isNaN(grossAmount)) return;
    
    // Предполагаем НДС 20%
    const vatRate = 0.20;
    const netAmount = grossAmount / (1 + vatRate);
    const vatAmount = grossAmount - netAmount;
    
    setFormData({
      ...formData,
      amount_gross: gross,
      amount_net: netAmount.toFixed(2),
      vat_amount: vatAmount.toFixed(2),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="number">
            Номер акта <span className="text-red-500">*</span>
          </Label>
          <Input
            id="number"
            value={formData.number}
            onChange={(e) => setFormData({ ...formData, number: e.target.value })}
            placeholder="АВР-001"
            disabled={isLoading}
            className="mt-1.5"
            required
          />
        </div>

        <div>
          <Label htmlFor="date">
            Дата подписания <span className="text-red-500">*</span>
          </Label>
          <Input
            id="date"
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            disabled={isLoading}
            className="mt-1.5"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="period_start">Начало периода работ</Label>
          <Input
            id="period_start"
            type="date"
            value={formData.period_start}
            onChange={(e) => setFormData({ ...formData, period_start: e.target.value })}
            disabled={isLoading}
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="period_end">Окончание периода работ</Label>
          <Input
            id="period_end"
            type="date"
            value={formData.period_end}
            onChange={(e) => setFormData({ ...formData, period_end: e.target.value })}
            disabled={isLoading}
            className="mt-1.5"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="amount_gross">
          Сумма с НДС <span className="text-red-500">*</span>
        </Label>
        <Input
          id="amount_gross"
          type="number"
          step="0.01"
          value={formData.amount_gross}
          onChange={(e) => calculateVAT(e.target.value)}
          placeholder="0.00"
          disabled={isLoading}
          className="mt-1.5"
          required
        />
        <p className="text-xs text-gray-500 mt-1">Сумма без НДС и НДС рассчитаются автоматически</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="amount_net">Сумма без НДС</Label>
          <Input
            id="amount_net"
            type="number"
            step="0.01"
            value={formData.amount_net}
            onChange={(e) => setFormData({ ...formData, amount_net: e.target.value })}
            placeholder="0.00"
            disabled={isLoading}
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="vat_amount">Сумма НДС</Label>
          <Input
            id="vat_amount"
            type="number"
            step="0.01"
            value={formData.vat_amount}
            onChange={(e) => setFormData({ ...formData, vat_amount: e.target.value })}
            placeholder="0.00"
            disabled={isLoading}
            className="mt-1.5"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="description">Описание работ</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Опишите выполненные работы..."
          disabled={isLoading}
          className="mt-1.5"
          rows={3}
        />
      </div>

      <div className="flex gap-3 pt-4">
        <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {act ? 'Сохранение...' : 'Создание...'}
            </>
          ) : (
            act ? 'Сохранить изменения' : 'Создать акт'
          )}
        </Button>
      </div>
    </form>
  );
}
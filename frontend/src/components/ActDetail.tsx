import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, Link } from 'react-router';
import { api, Act } from '../lib/api';
import { formatDate, formatAmount, formatCurrency } from '../lib/utils';
import { CONSTANTS } from '../constants';
import { Loader2, ArrowLeft, FileText, Pencil, Trash2, CheckCircle, Download, DollarSign } from 'lucide-react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { toast } from 'sonner';
import { Progress } from './ui/progress';

export function ActDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const actId = parseInt(id || '0');
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const { data: act, isLoading, error } = useQuery({
    queryKey: ['act', actId],
    queryFn: () => api.getActDetail(actId),
    enabled: !!actId,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteAct(actId),
    onSuccess: () => {
      toast.success('Акт удален');
      navigate('/contracts/acts');
    },
    onError: (error: any) => {
      toast.error(`Ошибка удаления: ${error?.message || 'Неизвестная ошибка'}`);
    },
  });

  const signMutation = useMutation({
    mutationFn: () => api.signAct(actId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['act', actId] });
      toast.success('Акт подписан');
    },
    onError: (error: any) => {
      toast.error(`Ошибка подписания: ${error?.message || 'Неизвестная ошибка'}`);
    },
  });

  const handleDelete = () => {
    if (confirm(`Вы уверены, что хотите удалить акт "${act?.number}"?`)) {
      deleteMutation.mutate();
    }
  };

  const handleSign = () => {
    if (confirm(`Подписать акт "${act?.number}"?`)) {
      signMutation.mutate();
    }
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

  const isOverdue = () => {
    if (!act || !act.due_date || act.status !== 'signed') return false;
    const unpaid = parseFloat(act.unpaid_amount);
    if (unpaid <= 0) return false;
    
    const dueDate = new Date(act.due_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return dueDate < today;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error || !act) {
    return (
      <div className="p-8">
        <div className="bg-red-50 text-red-600 p-4 rounded-xl">
          Ошибка загрузки: {(error as Error)?.message || 'Акт не найден'}
        </div>
      </div>
    );
  }

  // Вычисление оплаченной суммы
  const totalAllocated = act.allocations?.reduce((sum, alloc) => sum + parseFloat(alloc.amount), 0) || 0;
  const totalAmount = parseFloat(act.amount_gross);
  const unpaidAmount = parseFloat(act.unpaid_amount || '0');
  const paidPercentage = totalAmount > 0 ? (totalAllocated / totalAmount) * 100 : 0;

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Назад
          </Button>
        </div>

        {/* Main Info Card */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-semibold">{act.number}</h1>
                <span className={`px-3 py-1 text-sm font-medium rounded ${getStatusColor(act.status)}`}>
                  {getStatusLabel(act.status)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <FileText className="w-4 h-4" />
                <Link to={`/contracts/${act.contract}`} className="hover:text-blue-600 hover:underline">
                  Договор: {act.contract_number}
                </Link>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500 mb-1">Сумма с НДС</div>
              <div className="text-2xl font-semibold text-gray-900">
                {formatAmount(act.amount_gross)} ₽
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
            {act.status === 'draft' && (
              <Button
                onClick={handleSign}
                className="bg-green-600 hover:bg-green-700"
                disabled={signMutation.isPending}
              >
                {signMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Подписание...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Подписать
                  </>
                )}
              </Button>
            )}
            <Button
              onClick={() => setIsEditDialogOpen(true)}
              variant="outline"
              size="sm"
            >
              <Pencil className="w-4 h-4 mr-2" />
              Редактировать
            </Button>
            <Button
              onClick={handleDelete}
              variant="outline"
              size="sm"
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Удалить
            </Button>
            {act.file && (
              <Button
                onClick={() => window.open(act.file || '', '_blank')}
                variant="outline"
                size="sm"
              >
                <Download className="w-4 h-4 mr-2" />
                Скачать файл
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Basic Information */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Основная информация</h3>
            <div className="space-y-3">
              <InfoField label="Дата подписания" value={formatDate(act.date)} />
              <InfoField 
                label="Срок оплаты" 
                value={act.due_date ? (
                  <div className="flex items-center gap-2">
                    <span className={isOverdue() ? 'text-red-600 font-semibold' : ''}>
                      {formatDate(act.due_date)}
                    </span>
                    {isOverdue() && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800 rounded">
                        Просрочен
                      </span>
                    )}
                  </div>
                ) : '—'} 
              />
              <InfoField 
                label="Период работ" 
                value={act.period_start && act.period_end 
                  ? `${formatDate(act.period_start)} — ${formatDate(act.period_end)}` 
                  : '—'
                } 
              />
            </div>
            
            {/* Предупреждение о просрочке */}
            {isOverdue() && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <span className="text-red-600 text-lg">⚠️</span>
                  <div>
                    <div className="text-sm font-semibold text-red-800">Срок оплаты просрочен</div>
                    <div className="text-xs text-red-600 mt-1">
                      Неоплаченная сумма: {formatAmount(act.unpaid_amount)} ₽
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Financial Information */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Финансовая информация</h3>
            <div className="space-y-3">
              <InfoField label="Сумма с НДС" value={`${formatAmount(act.amount_gross)} ₽`} className="font-semibold" />
              <InfoField label="Сумма без НДС" value={`${formatAmount(act.amount_net)} ₽`} />
              <InfoField label="НДС" value={`${formatAmount(act.vat_amount)} ₽`} />
              {unpaidAmount > 0 && (
                <InfoField 
                  label="Неоплаченная сумма" 
                  value={`${formatAmount(unpaidAmount)} ₽`}
                  className="text-orange-600 font-semibold"
                />
              )}
            </div>
          </Card>
        </div>

        {/* Description */}
        {act.description && (
          <Card className="p-6 mt-6">
            <h3 className="text-lg font-semibold mb-4">Описание работ</h3>
            <p className="text-gray-700 whitespace-pre-wrap">{act.description}</p>
          </Card>
        )}

        {/* Payment Allocations */}
        <Card className="p-6 mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Распределение платежей</h3>
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-500">
                Оплачено: <span className="font-semibold text-gray-900">{formatAmount(totalAllocated.toString())} ₽</span> из {formatAmount(act.amount_gross)} ₽
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mb-6">
            <Progress value={paidPercentage} className="h-2" />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>0%</span>
              <span className="font-semibold">{paidPercentage.toFixed(1)}%</span>
              <span>100%</span>
            </div>
          </div>

          {act.allocations && act.allocations.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Платеж
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Дата платежа
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Сумма покрытия
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {act.allocations.map((allocation) => (
                    <tr key={allocation.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <div className="text-sm text-gray-900">{allocation.payment_description}</div>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <div className="text-xs text-gray-500">{formatDate(allocation.payment_date)}</div>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <DollarSign className="w-4 h-4 text-green-600" />
                          <div className="text-sm font-medium text-gray-900">
                            {formatAmount(allocation.amount)} ₽
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-8 text-center">
              <DollarSign className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Платежи не распределены</p>
            </div>
          )}
        </Card>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Редактировать акт</DialogTitle>
            </DialogHeader>
            <ActEditForm
              act={act}
              onSuccess={() => {
                setIsEditDialogOpen(false);
                queryClient.invalidateQueries({ queryKey: ['act', actId] });
              }}
            />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

interface InfoFieldProps {
  label: string;
  value: string | React.ReactNode;
  className?: string;
}

function InfoField({ label, value, className = '' }: InfoFieldProps) {
  return (
    <div>
      <div className="text-sm text-gray-500 mb-1">{label}</div>
      <div className={`text-sm text-gray-900 ${className}`}>{value}</div>
    </div>
  );
}

interface ActEditFormProps {
  act: Act;
  onSuccess: () => void;
}

function ActEditForm({ act, onSuccess }: ActEditFormProps) {
  const [formData, setFormData] = useState({
    number: act.number,
    date: act.date,
    due_date: act.due_date || '',
    period_start: act.period_start || '',
    period_end: act.period_end || '',
    amount_gross: act.amount_gross,
    amount_net: act.amount_net,
    vat_amount: act.vat_amount,
    description: act.description || '',
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => api.updateAct(act.id, data),
    onSuccess: () => {
      toast.success('Акт обновлен');
      onSuccess();
    },
    onError: (error: any) => {
      toast.error(`Ошибка: ${error?.message || 'Не удалось обновить акт'}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  const calculateVAT = (gross: string) => {
    const grossAmount = parseFloat(gross);
    if (isNaN(grossAmount)) return;
    
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
          <Label htmlFor="number">Номер акта</Label>
          <Input
            id="number"
            value={formData.number}
            onChange={(e) => setFormData({ ...formData, number: e.target.value })}
            disabled={updateMutation.isPending}
            className="mt-1.5"
            required
          />
        </div>

        <div>
          <Label htmlFor="date">Дата подписания</Label>
          <Input
            id="date"
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            disabled={updateMutation.isPending}
            className="mt-1.5"
            required
          />
        </div>
      </div>

      <div>
        <Label htmlFor="due_date">Срок оплаты</Label>
        <Input
          id="due_date"
          type="date"
          value={formData.due_date}
          onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
          disabled={updateMutation.isPending}
          className="mt-1.5"
          min={formData.date}
        />
        <p className="text-xs text-gray-500 mt-1">Дата, до которой должен быть оплачен акт</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="period_start">Начало периода работ</Label>
          <Input
            id="period_start"
            type="date"
            value={formData.period_start}
            onChange={(e) => setFormData({ ...formData, period_start: e.target.value })}
            disabled={updateMutation.isPending}
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
            disabled={updateMutation.isPending}
            className="mt-1.5"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="amount_gross">Сумма с НДС</Label>
        <Input
          id="amount_gross"
          type="number"
          step="0.01"
          value={formData.amount_gross}
          onChange={(e) => calculateVAT(e.target.value)}
          disabled={updateMutation.isPending}
          className="mt-1.5"
          required
        />
      </div>

      <div>
        <Label htmlFor="description">Описание работ</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          disabled={updateMutation.isPending}
          className="mt-1.5"
          rows={3}
        />
      </div>

      <div className="flex gap-3 pt-4">
        <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={updateMutation.isPending}>
          {updateMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Сохранение...
            </>
          ) : (
            'Сохранить изменения'
          )}
        </Button>
      </div>
    </form>
  );
}
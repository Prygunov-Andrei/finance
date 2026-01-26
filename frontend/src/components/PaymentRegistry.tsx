import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, PaymentRegistryItem, ExpenseCategory, Account, ContractListItem, Act } from '../lib/api';
import { Loader2, Plus, CheckCircle, CreditCard, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from 'sonner';
import { useExpenseCategories, useAccounts } from '../hooks';
import { CONSTANTS } from '../constants';
import { formatDate, formatAmount } from '../lib/utils';

export function PaymentRegistry() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isPayDialogOpen, setIsPayDialogOpen] = useState(false);
  const [selectedPaymentId, setSelectedPaymentId] = useState<number | null>(null);
  const [selectedAccountForPay, setSelectedAccountForPay] = useState<number | null>(null);
  const [selectedContractId, setSelectedContractId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // Form state
  const [formData, setFormData] = useState({
    category_id: '',
    contract_id: '',
    act_id: '',
    account_id: '',
    planned_date: '',
    amount: '',
    comment: '',
  });

  const queryClient = useQueryClient();

  // Загрузка данных с пагинацией
  const { data: paymentsData, isLoading: paymentsLoading } = useQuery({
    queryKey: ['payment-registry', currentPage, statusFilter],
    queryFn: () => api.getPaymentRegistry(currentPage, statusFilter),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const payments = paymentsData?.results || [];
  const totalCount = paymentsData?.count || 0;
  const totalPages = Math.ceil(totalCount / 20); // API возвращает по 20 записей на странице

  // Справочники с кешированием
  const { data: categories } = useExpenseCategories();
  const { data: accounts } = useAccounts();

  const { data: contracts } = useQuery({
    queryKey: ['contracts'],
    queryFn: () => api.getContracts(),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const { data: acts } = useQuery({
    queryKey: ['acts', selectedContractId],
    queryFn: () => api.getActs(selectedContractId!),
    enabled: !!selectedContractId,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: api.createPaymentRegistryItem.bind(api),
    onSuccess: async (newItem) => {
      
      // Переходим на первую страницу и обновляем кэш
      setCurrentPage(1);
      await queryClient.refetchQueries({ queryKey: ['payment-registry'] });
      
      setIsCreateDialogOpen(false);
      // Сброс формы
      setFormData({
        category_id: '',
        contract_id: '',
        act_id: '',
        account_id: '',
        planned_date: '',
        amount: '',
        comment: '',
      });
      setSelectedContractId(null);
      toast.success('Заявка создана');
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const approveMutation = useMutation({
    mutationFn: api.approvePaymentRegistryItem.bind(api),
    onSuccess: (updatedItem) => {
      // Обновляем только текущую страницу
      queryClient.setQueryData(['payment-registry', currentPage], (oldData: any) => {
        if (!oldData || !oldData.results) return oldData;
        return {
          ...oldData,
          results: oldData.results.map((item: PaymentRegistryItem) => 
            item.id === updatedItem.id ? updatedItem : item
          ),
        };
      });
      toast.success('Заявка согласована');
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const payMutation = useMutation({
    mutationFn: (id: number) => api.payPaymentRegistryItem(id),
    onSuccess: (updatedItem) => {
      // Обновляем только текущую страницу
      queryClient.setQueryData(['payment-registry', currentPage], (oldData: any) => {
        if (!oldData || !oldData.results) return oldData;
        return {
          ...oldData,
          results: oldData.results.map((item: PaymentRegistryItem) => 
            item.id === updatedItem.id ? updatedItem : item
          ),
        };
      });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      setIsPayDialogOpen(false);
      setSelectedPaymentId(null);
      setSelectedAccountForPay(null);
      toast.success('Платёж проведён');
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) => 
      api.cancelPaymentRegistryItem(id, reason),
    onSuccess: (updatedItem) => {
      queryClient.setQueryData(['payment-registry', currentPage], (oldData: any) => {
        if (!oldData || !oldData.results) return oldData;
        return {
          ...oldData,
          results: oldData.results.map((item: PaymentRegistryItem) => 
            item.id === updatedItem.id ? updatedItem : item
          ),
        };
      });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      toast.success('Заявка отменена');
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const category_id = parseInt(formData.category_id);
    const contract_id = formData.contract_id ? parseInt(formData.contract_id) : undefined;
    const act_id = formData.act_id ? parseInt(formData.act_id) : undefined;
    const account_id = formData.account_id ? parseInt(formData.account_id) : undefined;
    const planned_date = formData.planned_date;
    const amount = formData.amount;
    const comment = formData.comment || undefined;

    createMutation.mutate({
      category_id,
      contract_id,
      act_id,
      account_id,
      planned_date,
      amount,
      comment,
    });
  };

  const handleApprove = (id: number) => {
    approveMutation.mutate(id);
  };

  const handlePayClick = (id: number) => {
    setSelectedPaymentId(id);
    setIsPayDialogOpen(true);
  };

  const handlePayConfirm = () => {
    if (selectedPaymentId) {
      if (confirm('Вы уверены, что хотите провести оплату?')) {
        payMutation.mutate(selectedPaymentId);
      }
    }
  };

  const handleCancel = (id: number) => {
    const reason = prompt('Укажите причину отмены (необязательно):');
    if (reason !== null) { // null means user clicked Cancel
      cancelMutation.mutate({ id, reason: reason || undefined });
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'planned': return 'Ожидает согласования';
      case 'approved': return 'Согласовано';
      case 'paid': return 'Оплачено';
      case 'cancelled': return 'Отменено';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'planned': return 'bg-yellow-100 text-yellow-700';
      case 'approved': return 'bg-blue-100 text-blue-700';
      case 'paid': return 'bg-green-100 text-green-700';
      case 'cancelled': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  if (paymentsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl mb-1">Реестр платежей</h1>
          <p className="text-gray-500 text-sm">Согласование расходов · Всего: {totalCount}</p>
        </div>
        {/* Кнопка "Создать" убрана - заявки создаются автоматически при создании expense платежей */}
      </div>

      <Card className="p-6">
        {/* Фильтр по статусу */}
        <div className="mb-6 flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-600 mr-2">Статус:</span>
          <button
            onClick={() => {
              setStatusFilter('all');
              setCurrentPage(1);
            }}
            className={`px-4 py-2 rounded-lg text-sm transition-all ${
              statusFilter === 'all'
                ? 'bg-blue-500 text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Все
          </button>
          <button
            onClick={() => {
              setStatusFilter('planned');
              setCurrentPage(1);
            }}
            className={`px-4 py-2 rounded-lg text-sm transition-all ${
              statusFilter === 'planned'
                ? 'bg-blue-500 text-white shadow-md'
                : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
            }`}
          >
            План
          </button>
          <button
            onClick={() => {
              setStatusFilter('approved');
              setCurrentPage(1);
            }}
            className={`px-4 py-2 rounded-lg text-sm transition-all ${
              statusFilter === 'approved'
                ? 'bg-green-500 text-white shadow-md'
                : 'bg-green-50 text-green-700 hover:bg-green-100'
            }`}
          >
            Согласовано
          </button>
          <button
            onClick={() => {
              setStatusFilter('paid');
              setCurrentPage(1);
            }}
            className={`px-4 py-2 rounded-lg text-sm transition-all ${
              statusFilter === 'paid'
                ? 'bg-gray-600 text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Оплачено
          </button>
        </div>

        {!payments || payments.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {statusFilter === 'all' 
              ? 'Платежных заявок пока нет. Создайте первую заявку.'
              : `Нет заявок со статусом "${getStatusLabel(statusFilter)}".`
            }
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Дата</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Договор</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Категория</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Сумма</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Статус</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Действия</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4 text-sm text-gray-600">{formatDate(payment.planned_date)}</td>
                    <td className="py-3 px-4 text-sm">
                      {payment.contract_name ? (
                        <div>
                          <div className="font-medium">{payment.contract_name}</div>
                          <div className="text-xs text-gray-500">{payment.contract_number}</div>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">{payment.category_name}</td>
                    <td className="py-3 px-4 text-sm font-medium">{formatAmount(payment.amount)} ₽</td>
                    <td className="py-3 px-4 text-sm">
                      <span className={`px-2 py-1 rounded text-xs ${getStatusColor(payment.status)}`}>
                        {getStatusLabel(payment.status)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm">
                      <div className="flex items-center gap-2">
                        {payment.status === 'planned' && (
                          <>
                            <button
                              onClick={() => handleApprove(payment.id)}
                              disabled={approveMutation.isPending}
                              className="flex items-center gap-2 text-green-600 hover:text-green-700 transition-colors disabled:opacity-50"
                              title="Согласовать"
                            >
                              <CheckCircle className="w-4 h-4" />
                              Согласовать
                            </button>
                            <button
                              onClick={() => handleCancel(payment.id)}
                              disabled={cancelMutation.isPending}
                              className="flex items-center gap-2 text-red-600 hover:text-red-700 transition-colors disabled:opacity-50"
                              title="Отменить"
                            >
                              Отменить
                            </button>
                          </>
                        )}
                        {payment.status === 'approved' && (
                          <>
                            <button
                              onClick={() => handlePayClick(payment.id)}
                              disabled={payMutation.isPending}
                              className="flex items-center gap-2 text-blue-600 hover:text-blue-700 transition-colors disabled:opacity-50"
                              title="Оплатить"
                            >
                              <CreditCard className="w-4 h-4" />
                              Оплатить
                            </button>
                            <button
                              onClick={() => handleCancel(payment.id)}
                              disabled={cancelMutation.isPending}
                              className="flex items-center gap-2 text-red-600 hover:text-red-700 transition-colors disabled:opacity-50"
                              title="Отменить"
                            >
                              Отменить
                            </button>
                          </>
                        )}
                        {(payment.status === 'paid' || payment.status === 'cancelled') && payment.payment_id && (
                          <button
                            onClick={() => window.location.href = `/payments`}
                            className="flex items-center gap-2 text-blue-600 hover:text-blue-700 transition-colors"
                            title="Открыть платёж"
                          >
                            Открыть платёж
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex items-center justify-between mt-4">
              <Button
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="flex items-center gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                Предыдущая
              </Button>
              <div className="text-gray-500">
                Страница {currentPage} из {totalPages}
              </div>
              <Button
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="flex items-center gap-2"
              >
                Следующая
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="bg-white rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold mb-4">Новый расход</DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              Заполните форму для создания новой платежно заявки.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="category_id">Категория расхода *</Label>
              <Select 
                value={formData.category_id} 
                onValueChange={(value) => setFormData({ ...formData, category_id: value })}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите категорию" />
                </SelectTrigger>
                <SelectContent>
                  {categories?.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id.toString()}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="contract_id">Договор (опционально)</Label>
              <Select
                value={formData.contract_id}
                onValueChange={(value) => {
                  setFormData({ ...formData, contract_id: value, act_id: '' });
                  setSelectedContractId(value ? parseInt(value) : null);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите договор" />
                </SelectTrigger>
                <SelectContent>
                  {contracts?.results?.map((contract) => (
                    <SelectItem key={contract.id} value={contract.id.toString()}>
                      {contract.number} - {contract.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedContractId && (
              <div>
                <Label htmlFor="act_id">Акт (опционально)</Label>
                <Select 
                  value={formData.act_id}
                  onValueChange={(value) => setFormData({ ...formData, act_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите акт" />
                  </SelectTrigger>
                  <SelectContent>
                    {acts?.map((act) => (
                      <SelectItem key={act.id} value={act.id.toString()}>
                        {act.number} от {formatDate(act.date)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label htmlFor="account_id">С какого счета платить (опционально)</Label>
              <Select 
                value={formData.account_id}
                onValueChange={(value) => setFormData({ ...formData, account_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите счет" />
                </SelectTrigger>
                <SelectContent>
                  {accounts?.map((account) => (
                    <SelectItem key={account.id} value={account.id.toString()}>
                      {account.name} ({formatAmount(account.current_balance || account.initial_balance || account.balance || '0')} {account.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="amount">Сумма *</Label>
              <Input
                id="amount"
                name="amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                required
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="planned_date">Плановая дата *</Label>
              <Input
                id="planned_date"
                name="planned_date"
                type="date"
                required
                value={formData.planned_date}
                onChange={(e) => setFormData({ ...formData, planned_date: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="comment">Комментарий (опционально)</Label>
              <Input
                id="comment"
                name="comment"
                placeholder="Описание платежа"
                value={formData.comment}
                onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="submit" disabled={createMutation.isPending} className="flex-1">
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Создание...
                  </>
                ) : (
                  'Создать'
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateDialogOpen(false)}
                className="flex-1"
              >
                Отмена
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Pay Dialog */}
      <Dialog open={isPayDialogOpen} onOpenChange={setIsPayDialogOpen}>
        <DialogContent className="bg-white rounded-xl p-6 w-full max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold mb-4">Оплата</DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              Выберите счет для списания средств.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-gray-500 text-sm">Выберите счет для списания средств:</p>

            <div>
              <Label htmlFor="pay_account_id">Счет списания *</Label>
              <Select onValueChange={(value) => setSelectedAccountForPay(parseInt(value))}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите счет" />
                </SelectTrigger>
                <SelectContent>
                  {accounts?.map((account) => (
                    <SelectItem key={account.id} value={account.id.toString()}>
                      {account.name} ({formatAmount(account.current_balance || account.initial_balance || account.balance || '0')} {account.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                onClick={handlePayConfirm}
                disabled={payMutation.isPending || !selectedAccountForPay}
                className="flex-1"
              >
                {payMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Оплата...
                  </>
                ) : (
                  'Оплатить'
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsPayDialogOpen(false);
                  setSelectedPaymentId(null);
                  setSelectedAccountForPay(null);
                }}
                className="flex-1"
              >
                Отмена
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
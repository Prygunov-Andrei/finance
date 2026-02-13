import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, BankAccount, BankTransaction } from '../lib/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Label } from './ui/label';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
  RefreshCw,
  Search,
  Link2,
  Check,
  Landmark,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatAmount } from '../lib/utils';

export const BankStatements = () => {
  // Radix SelectItem cannot have empty-string values, so we use a sentinel for "all".
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterReconciled, setFilterReconciled] = useState<string>('all');
  const [reconcileDialogTx, setReconcileDialogTx] = useState<BankTransaction | null>(null);
  const [reconcilePaymentId, setReconcilePaymentId] = useState('');
  const queryClient = useQueryClient();

  const { data: bankAccounts, isLoading: accountsLoading } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => api.getBankAccounts(),
  });

  const { data: transactionsData, isLoading: txLoading, refetch: refetchTx } = useQuery({
    queryKey: ['bank-transactions', selectedAccountId, searchQuery, filterType, filterReconciled],
    queryFn: () =>
      api.getBankTransactions({
        bank_account: selectedAccountId !== 'all' ? parseInt(selectedAccountId) : undefined,
        search: searchQuery || undefined,
        transaction_type: filterType !== 'all' ? filterType : undefined,
        reconciled: filterReconciled === 'true' ? true : filterReconciled === 'false' ? false : undefined,
      }),
    enabled: true,
  });

  const syncMutation = useMutation({
    mutationFn: (bankAccountId: number) => api.syncBankStatements(bankAccountId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
      toast.success(`Синхронизировано: ${data.new_transactions} новых транзакций`);
    },
    onError: (error: any) => {
      toast.error(`Ошибка синхронизации: ${error.message}`);
    },
  });

  const reconcileMutation = useMutation({
    mutationFn: ({ txId, paymentId }: { txId: number; paymentId: number }) =>
      api.reconcileBankTransaction(txId, paymentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
      setReconcileDialogTx(null);
      setReconcilePaymentId('');
      toast.success('Транзакция привязана к платежу');
    },
    onError: (error: any) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const transactions = transactionsData?.results || [];

  const handleSync = () => {
    if (selectedAccountId === 'all') {
      toast.error('Выберите банковский счёт');
      return;
    }
    syncMutation.mutate(parseInt(selectedAccountId));
  };

  const handleReconcile = () => {
    if (!reconcileDialogTx || !reconcilePaymentId) return;
    reconcileMutation.mutate({
      txId: reconcileDialogTx.id,
      paymentId: parseInt(reconcilePaymentId),
    });
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-semibold">Банковские выписки</h1>
          <Button
            onClick={handleSync}
            disabled={selectedAccountId === 'all' || syncMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {syncMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Синхронизировать
          </Button>
        </div>

        {/* Фильтры */}
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="w-64">
            <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Все счета" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все счета</SelectItem>
                {bankAccounts?.map((acc: BankAccount) => (
                  <SelectItem key={acc.id} value={acc.id.toString()}>
                    {acc.account_name} ({acc.account_number})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-48">
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger>
                <SelectValue placeholder="Все типы" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все типы</SelectItem>
                <SelectItem value="incoming">Входящие</SelectItem>
                <SelectItem value="outgoing">Исходящие</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="w-48">
            <Select value={filterReconciled} onValueChange={setFilterReconciled}>
              <SelectTrigger>
                <SelectValue placeholder="Все статусы" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="true">Сверено</SelectItem>
                <SelectItem value="false">Не сверено</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по контрагенту, ИНН, назначению..."
                className="pl-10"
              />
            </div>
          </div>
        </div>

        {/* Таблица транзакций */}
        {txLoading || accountsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-12 text-center">
            <Landmark className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 mb-2">Нет транзакций</p>
            <p className="text-sm text-gray-400">
              Выберите банковский счёт и нажмите "Синхронизировать"
            </p>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Дата</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Тип</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Сумма</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Контрагент</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Назначение</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Сверка</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {transactions.map((tx: BankTransaction) => (
                    <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        {new Date(tx.date).toLocaleDateString('ru-RU')}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {tx.transaction_type === 'incoming' ? (
                          <span className="flex items-center gap-1 text-green-600 text-sm">
                            <ArrowDownLeft className="w-4 h-4" />
                            Входящий
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-red-600 text-sm">
                            <ArrowUpRight className="w-4 h-4" />
                            Исходящий
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <span className={`font-bold text-sm ${
                          tx.transaction_type === 'incoming' ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {tx.transaction_type === 'incoming' ? '+' : '-'}
                          {formatAmount(tx.amount)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900 truncate max-w-[200px]">
                          {tx.counterparty_name || '—'}
                        </div>
                        {tx.counterparty_inn && (
                          <div className="text-xs text-gray-500 font-mono">
                            ИНН: {tx.counterparty_inn}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-gray-700 truncate max-w-[300px]" title={tx.purpose}>
                          {tx.purpose || '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {tx.reconciled ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                            <Check className="w-3 h-3 mr-1" />
                            Сверено
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                            Не сверено
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {!tx.reconciled && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setReconcileDialogTx(tx)}
                            title="Привязать к платежу"
                          >
                            <Link2 className="w-4 h-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-3 border-t border-gray-200 text-sm text-gray-500">
              Показано {transactions.length} из {transactionsData?.count || 0} транзакций
            </div>
          </div>
        )}

        {/* Диалог привязки к платежу */}
        <Dialog open={!!reconcileDialogTx} onOpenChange={(open) => !open && setReconcileDialogTx(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Привязать к платежу</DialogTitle>
              <DialogDescription>
                Укажите ID внутреннего платежа для сверки с банковской транзакцией
              </DialogDescription>
            </DialogHeader>
            {reconcileDialogTx && (
              <div className="space-y-4 mt-4">
                <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                  <div><span className="text-gray-500">Сумма:</span> {formatAmount(reconcileDialogTx.amount)}</div>
                  <div><span className="text-gray-500">Контрагент:</span> {reconcileDialogTx.counterparty_name}</div>
                  <div><span className="text-gray-500">Дата:</span> {new Date(reconcileDialogTx.date).toLocaleDateString('ru-RU')}</div>
                </div>
                <div>
                  <Label htmlFor="payment-id">ID платежа</Label>
                  <Input
                    id="payment-id"
                    type="number"
                    value={reconcilePaymentId}
                    onChange={(e) => setReconcilePaymentId(e.target.value)}
                    placeholder="Введите ID платежа"
                    className="mt-1.5"
                  />
                </div>
                <Button
                  onClick={handleReconcile}
                  disabled={!reconcilePaymentId || reconcileMutation.isPending}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  {reconcileMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Link2 className="w-4 h-4 mr-2" />
                  )}
                  Привязать
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

import { useParams, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api, Account, AccountBalance } from '../lib/api';
import { Button } from './ui/button';
import { ArrowLeft, Loader2, CreditCard, Building2, TrendingUp } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { formatDate, formatAmount, formatCurrency } from '../lib/utils';
import { CONSTANTS } from '../constants';

export function AccountDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const balancesSource = (new URLSearchParams(window.location.search).get('balance_source') as 'internal' | 'bank_tochka' | 'all') || 'internal';

  const { data: account, isLoading: accountLoading, error: accountError } = useQuery({
    queryKey: ['account', id],
    queryFn: () => api.getAccountById(parseInt(id!)),
    enabled: !!id,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const { data: balances, isLoading: balancesLoading } = useQuery({
    queryKey: ['account-balances', id, balancesSource],
    queryFn: () => api.getAccountBalancesHistory(parseInt(id!), balancesSource),
    enabled: !!id,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  // Преобразуем balances в массив, если это объект с пагинацией
  const balancesArray = Array.isArray(balances) 
    ? balances 
    : (balances && typeof balances === 'object' && 'results' in balances) 
      ? balances.results 
      : [];

  if (accountLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (accountError || !account) {
    return (
      <div className="p-8">
        <div className="bg-red-50 text-red-600 p-4 rounded-xl">
          Ошибка загрузки счёта: {(accountError as Error)?.message || 'Счёт не найден'}
        </div>
      </div>
    );
  }

  const formatBalance = (balance: string | undefined) => {
    const num = parseFloat(balance || '0');
    if (isNaN(num)) return '0.00';
    return formatAmount(num);
  };

  const getAccountTypeLabel = (type?: string) => {
    switch (type) {
      case 'bank_account': return 'Расчётный счёт';
      case 'cash': return 'Касса';
      case 'deposit': return 'Депозит';
      case 'currency_account': return 'Валютный счёт';
      default: return type || 'Не указан';
    }
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate('/settings')}
            className="mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Назад к настройкам
          </Button>
          
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-semibold mb-2">{account.name}</h1>
              <p className="text-gray-600">
                {account.account_number || account.number || 'Номер не указан'}
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500 mb-1">Текущий баланс</div>
              <div className="text-3xl font-bold text-gray-900">
                {formatBalance(account.current_balance || account.initial_balance)} {account.currency}
              </div>
              <div className="mt-2 text-sm text-gray-500">
                Банк: {formatBalance(account.bank_balance_latest || undefined)} {account.currency}
                {account.bank_delta ? (
                  <span className="ml-2">
                    Δ {formatBalance(account.bank_delta)} {account.currency}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* Info Panel */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                <Building2 className="w-4 h-4" />
                Юридическое лицо
              </div>
              <div className="font-medium text-gray-900">
                {account.legal_entity_name || 'Не указано'}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                <CreditCard className="w-4 h-4" />
                Тип счёта
              </div>
              <div className="font-medium text-gray-900">
                {getAccountTypeLabel(account.account_type)}
              </div>
            </div>

            <div>
              <div className="text-sm text-gray-500 mb-2">Валюта</div>
              <div className="font-medium text-gray-900">{account.currency}</div>
            </div>

            {account.bank_name && (
              <div>
                <div className="text-sm text-gray-500 mb-2">Банк</div>
                <div className="font-medium text-gray-900">{account.bank_name}</div>
              </div>
            )}

            {(account.bic || account.bik) && (
              <div>
                <div className="text-sm text-gray-500 mb-2">БИК</div>
                <div className="font-medium text-gray-900 font-mono">
                  {account.bic || account.bik}
                </div>
              </div>
            )}

            {account.location && (
              <div>
                <div className="text-sm text-gray-500 mb-2">Местоположение</div>
                <div className="font-medium text-gray-900">{account.location}</div>
              </div>
            )}
          </div>

          {account.description && (
            <div className="mt-6 pt-6 border-t border-gray-100">
              <div className="text-sm text-gray-500 mb-2">Описание</div>
              <div className="text-gray-900">{account.description}</div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="balances" className="w-full">
          <TabsList>
            <TabsTrigger value="balances" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              История остатков
            </TabsTrigger>
          </TabsList>

          <TabsContent value="balances" className="mt-6">
            <div className="mb-4 flex gap-2">
              <Button
                variant={balancesSource === 'internal' ? 'default' : 'outline'}
                onClick={() => navigate(`?balance_source=internal`, { replace: true })}
              >
                Внутренний
              </Button>
              <Button
                variant={balancesSource === 'bank_tochka' ? 'default' : 'outline'}
                onClick={() => navigate(`?balance_source=bank_tochka`, { replace: true })}
              >
                Банк (Точка)
              </Button>
              <Button
                variant={balancesSource === 'all' ? 'default' : 'outline'}
                onClick={() => navigate(`?balance_source=all`, { replace: true })}
              >
                Все
              </Button>
            </div>
            {balancesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              </div>
            ) : !balancesArray || balancesArray.length === 0 ? (
              <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-12 text-center">
                <TrendingUp className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">Нет данных об остатках</p>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Дата
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Остаток
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {balancesArray
                        .sort((a, b) => new Date(b.balance_date).getTime() - new Date(a.balance_date).getTime())
                        .map((balance: AccountBalance) => (
                          <tr key={balance.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-gray-900">
                                {formatDate(balance.balance_date)}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right">
                              <div className="text-sm font-bold text-gray-900">
                                {formatBalance(balance.balance)} {account.currency}
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, ContractListItem } from '../../lib/api';
import { CONSTANTS } from '../../constants';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import {
  Loader2,
  DollarSign,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Filter,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

type CashFlowTabProps = {
  objectId: number;
};

const formatCurrency = (value: number | string | undefined): string => {
  if (value === undefined || value === null) return '—';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '—';
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
};

export function CashFlowTab({ objectId }: CashFlowTabProps) {
  const [selectedContractId, setSelectedContractId] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [chartType, setChartType] = useState<'line' | 'bar'>('line');

  const { data: contractsData, isLoading: contractsLoading } = useQuery({
    queryKey: ['object-contracts', objectId],
    queryFn: () => api.getContracts({ object: objectId }),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const contracts: ContractListItem[] = useMemo(() => {
    if (!contractsData) return [];
    if (Array.isArray(contractsData)) return contractsData;
    if ('results' in contractsData) return contractsData.results;
    return [];
  }, [contractsData]);

  const { data: cashFlow, isLoading: cashFlowLoading } = useQuery({
    queryKey: ['object-cashflow', objectId, startDate, endDate],
    queryFn: () =>
      api.getObjectCashFlow(objectId, {
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      }),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const cashFlowData = Array.isArray(cashFlow) ? cashFlow : [];

  const totals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    for (const row of cashFlowData) {
      debit += Number(row.income ?? 0);
      credit += Number(row.expense ?? 0);
    }
    return { debit, credit, balance: debit - credit };
  }, [cashFlowData]);

  const isLoading = contractsLoading || cashFlowLoading;

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Заголовок + фильтр по договорам */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-gray-900">Финансовый дашборд объекта</h2>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <Select value={selectedContractId} onValueChange={setSelectedContractId}>
            <SelectTrigger className="w-[280px]" aria-label="Фильтр по договору">
              <SelectValue placeholder="Все договоры" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все договоры</SelectItem>
              {contracts.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.number} — {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Карточки: Дебет / Кредит / Сальдо */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-6 flex items-center gap-4">
          <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <ArrowDownRight className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Дебет (поступления)</p>
            <p className="text-2xl font-bold text-green-700">
              {cashFlowData.length > 0 ? formatCurrency(totals.debit) : '—'}
            </p>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6 flex items-center gap-4">
          <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <ArrowUpRight className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Кредит (расходы)</p>
            <p className="text-2xl font-bold text-red-700">
              {cashFlowData.length > 0 ? formatCurrency(totals.credit) : '—'}
            </p>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6 flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <DollarSign className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Сальдо</p>
            <p
              className={`text-2xl font-bold ${
                cashFlowData.length === 0
                  ? 'text-gray-300'
                  : totals.balance >= 0
                    ? 'text-blue-700'
                    : 'text-red-700'
              }`}
            >
              {cashFlowData.length > 0 ? formatCurrency(totals.balance) : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Таблица платежей «самолётик» — Дебет / Кредит */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">
          Таблица платежей
        </h3>

        {cashFlowData.length === 0 ? (
          <div className="border border-dashed border-gray-300 rounded-lg p-8 flex flex-col items-center justify-center">
            <DollarSign className="w-10 h-10 text-gray-300 mb-3" />
            <p className="text-sm text-gray-400">
              Нет данных для отображения. Привяжите договоры к объекту для формирования таблицы платежей.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-medium text-gray-500">Дата</th>
                  <th className="text-right py-3 px-4 font-medium text-green-600">
                    Дебет (приход)
                  </th>
                  <th className="text-right py-3 px-4 font-medium text-red-600">
                    Кредит (расход)
                  </th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500">Сальдо</th>
                </tr>
              </thead>
              <tbody>
                {cashFlowData.map((row: any, idx: number) => {
                  const income = Number(row.income ?? 0);
                  const expense = Number(row.expense ?? 0);
                  const net = Number(row.net ?? income - expense);
                  return (
                    <tr
                      key={idx}
                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      <td className="py-3 px-4 text-gray-700">{row.date}</td>
                      <td className="py-3 px-4 text-right font-medium text-green-700">
                        {income > 0 ? formatCurrency(income) : ''}
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-red-700">
                        {expense > 0 ? formatCurrency(expense) : ''}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-medium ${
                          net >= 0 ? 'text-blue-700' : 'text-red-700'
                        }`}
                      >
                        {formatCurrency(net)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                  <td className="py-3 px-4 text-gray-700">Итого</td>
                  <td className="py-3 px-4 text-right text-green-700">
                    {formatCurrency(totals.debit)}
                  </td>
                  <td className="py-3 px-4 text-right text-red-700">
                    {formatCurrency(totals.credit)}
                  </td>
                  <td
                    className={`py-3 px-4 text-right ${
                      totals.balance >= 0 ? 'text-blue-700' : 'text-red-700'
                    }`}
                  >
                    {formatCurrency(totals.balance)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Cash-flow график */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <h3 className="text-base font-semibold text-gray-900">Cash-flow</h3>
          <div className="flex items-center gap-2">
            <Button
              variant={chartType === 'line' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setChartType('line')}
              aria-label="Линейный график"
              tabIndex={0}
            >
              <TrendingUp className="w-4 h-4 mr-1.5" />
              График
            </Button>
            <Button
              variant={chartType === 'bar' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setChartType('bar')}
              aria-label="Столбчатая диаграмма"
              tabIndex={0}
            >
              <DollarSign className="w-4 h-4 mr-1.5" />
              Столбцы
            </Button>
          </div>
        </div>

        {/* Фильтры дат */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <Label htmlFor="cf-start-date">Дата начала</Label>
            <Input
              id="cf-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="cf-end-date">Дата окончания</Label>
            <Input
              id="cf-end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1.5"
            />
          </div>
        </div>

        {cashFlowData.length === 0 ? (
          <div className="border border-dashed border-gray-300 rounded-lg p-12 flex flex-col items-center justify-center">
            <TrendingUp className="w-10 h-10 text-gray-300 mb-3" />
            <p className="text-sm text-gray-400">Нет данных для отображения</p>
          </div>
        ) : (
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'line' ? (
                <LineChart data={cashFlowData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="income"
                    stroke="#10b981"
                    name="Приход"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="expense"
                    stroke="#ef4444"
                    name="Расход"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="net"
                    stroke="#3b82f6"
                    name="Чистый поток"
                    strokeWidth={2}
                  />
                </LineChart>
              ) : (
                <BarChart data={cashFlowData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="income" fill="#10b981" name="Приход" />
                  <Bar dataKey="expense" fill="#ef4444" name="Расход" />
                  <Bar dataKey="net" fill="#3b82f6" name="Чистый поток" />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 text-center">
        Данные формируются на основе платежей по договорам, привязанным к объекту.
        Используйте фильтр по договорам для детализации.
      </p>
    </div>
  );
}

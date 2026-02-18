import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Plus, AlertTriangle, FileText } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Skeleton } from '../ui/skeleton';
import { InvoiceCreateDialog } from './InvoiceCreateDialog';

const INVOICE_TYPE_LABELS: Record<string, string> = {
  supplier: 'От Поставщика',
  act_based: 'По Акту',
  household: 'Хоз. деятельность',
  warehouse: 'Склад',
  internal_transfer: 'Внутренний',
};

const STATUS_LABELS: Record<string, string> = {
  recognition: 'Распознаётся',
  review: 'На проверке',
  in_registry: 'В реестре',
  approved: 'Одобрен',
  sending: 'Отправляется',
  paid: 'Оплачен',
  cancelled: 'Отменён',
};

const STATUS_COLORS: Record<string, string> = {
  recognition: 'bg-purple-100 text-purple-800',
  review: 'bg-blue-100 text-blue-800',
  in_registry: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  sending: 'bg-orange-100 text-orange-800',
  paid: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-gray-100 text-gray-600',
};

const formatCurrency = (value: string | number | undefined | null): string => {
  if (value === null || value === undefined) return '—';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '—';
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 2,
  }).format(num);
};

const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('ru-RU');
};

const isOverdue = (dueDate: string | null | undefined, status: string): boolean => {
  if (!dueDate || status === 'paid' || status === 'cancelled') return false;
  return new Date(dueDate) < new Date();
};

export const InvoicesTab = () => {
  const navigate = useNavigate();
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (typeFilter !== 'all') params.append('invoice_type', typeFilter);
    if (statusFilter !== 'all') params.append('status', statusFilter);
    return params.toString();
  }, [typeFilter, statusFilter]);

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', queryParams],
    queryFn: () => (api as any).getInvoices(queryParams),
  });

  const invoices: any[] = data?.results ?? [];

  const summary = useMemo(() => {
    const totalCount = invoices.length;
    const totalAmount = invoices.reduce(
      (sum: number, inv: any) => sum + (parseFloat(inv.amount_gross) || 0),
      0
    );
    const overdueInvoices = invoices.filter((inv: any) => isOverdue(inv.due_date, inv.status));
    const overdueCount = overdueInvoices.length;
    const overdueAmount = overdueInvoices.reduce(
      (sum: number, inv: any) => sum + (parseFloat(inv.amount_gross) || 0),
      0
    );
    return { totalCount, totalAmount, overdueCount, overdueAmount };
  }, [invoices]);

  const handleInvoiceClick = (id: number) => {
    navigate(`/supply/invoices/${id}`);
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-gray-500">Всего счетов</p>
            <p className="text-2xl font-bold text-gray-900">{summary.totalCount}</p>
            <p className="text-sm text-gray-500 mt-1">{formatCurrency(summary.totalAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-gray-500">Просроченные</p>
            <p className="text-2xl font-bold text-red-600">{summary.overdueCount}</p>
            <p className="text-sm text-red-500 mt-1">{formatCurrency(summary.overdueAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center justify-center">
            <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Создать счёт
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[200px]" aria-label="Тип счёта">
            <SelectValue placeholder="Тип счёта" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все типы</SelectItem>
            {Object.entries(INVOICE_TYPE_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]" aria-label="Статус">
            <SelectValue placeholder="Статус" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg font-medium">Нет счетов</p>
          <p className="text-sm">Измените фильтры или создайте новый счёт</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Тип</th>
                <th className="text-left px-4 py-3 font-medium">Номер</th>
                <th className="text-left px-4 py-3 font-medium">Дата</th>
                <th className="text-left px-4 py-3 font-medium">Контрагент</th>
                <th className="text-left px-4 py-3 font-medium">Объект</th>
                <th className="text-right px-4 py-3 font-medium">Сумма</th>
                <th className="text-center px-4 py-3 font-medium">Статус</th>
                <th className="text-left px-4 py-3 font-medium">Срок оплаты</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {invoices.map((invoice: any) => {
                const overdue = isOverdue(invoice.due_date, invoice.status);
                const isDebt = invoice.is_debt;

                return (
                  <tr
                    key={invoice.id}
                    onClick={() => handleInvoiceClick(invoice.id)}
                    className={`cursor-pointer hover:bg-gray-50 transition-colors ${
                      overdue ? 'bg-red-50/50' : ''
                    } ${isDebt && !overdue ? 'border-l-2 border-l-amber-400' : ''}`}
                    tabIndex={0}
                    role="button"
                    aria-label={`Счёт ${invoice.number || invoice.id}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleInvoiceClick(invoice.id);
                    }}
                  >
                    <td className="px-4 py-3 text-gray-600">
                      {INVOICE_TYPE_LABELS[invoice.invoice_type] || invoice.invoice_type || '—'}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {invoice.number || `#${invoice.id}`}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {formatDate(invoice.created_at || invoice.date)}
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-[200px] truncate">
                      {invoice.counterparty_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-[180px] truncate">
                      {invoice.object_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {formatCurrency(invoice.amount_gross)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        variant="outline"
                        className={STATUS_COLORS[invoice.status] || 'bg-gray-100 text-gray-600'}
                      >
                        {STATUS_LABELS[invoice.status] || invoice.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <span className={overdue ? 'text-red-600 font-medium flex items-center gap-1' : ''}>
                        {overdue && <AlertTriangle className="h-3.5 w-3.5" />}
                        {formatDate(invoice.due_date)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <InvoiceCreateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </div>
  );
};

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useNavigate } from 'react-router';
import { CheckCircle2, XCircle, Clock, Loader2, Landmark, Banknote } from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';
import { Skeleton } from '../ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { Textarea } from '../ui/textarea';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

const STATUS_LABELS: Record<string, string> = {
  in_registry: 'В реестре',
  approved: 'Согласовано',
  sending: 'Отправляется',
  paid: 'Оплачен',
};

const STATUS_COLORS: Record<string, string> = {
  in_registry: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  sending: 'bg-orange-100 text-orange-800',
  paid: 'bg-emerald-100 text-emerald-800',
};

const FILTER_TABS = [
  { value: 'all', label: 'Все' },
  { value: 'in_registry', label: 'В реестре' },
  { value: 'approved', label: 'Согласовано' },
  { value: 'sending', label: 'Отправляется' },
  { value: 'paid', label: 'Оплачено' },
] as const;

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

const getDueDateHighlight = (dueDate: string | null | undefined, status: string): string => {
  if (!dueDate || status === 'paid') return '';
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(today);
  endOfWeek.setDate(today.getDate() + (7 - today.getDay()));

  if (due <= today) return 'bg-red-50';
  if (due <= endOfWeek) return 'bg-yellow-50';
  return '';
};

export const PaymentRegistryTab = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('all');
  const [actionDialog, setActionDialog] = useState<{
    type: 'reject' | 'reschedule' | null;
    invoiceId: number | null;
  }>({ type: null, invoiceId: null });
  const [actionComment, setActionComment] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState('');

  const registryStatuses = 'in_registry,approved,sending,paid';

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (statusFilter !== 'all') {
      params.append('status', statusFilter);
    } else {
      params.append('status__in', registryStatuses);
    }
    return params.toString();
  }, [statusFilter]);

  const { data: invoicesData, isLoading: invoicesLoading } = useQuery({
    queryKey: ['invoices-registry', queryParams],
    queryFn: () => (api as any).getInvoices(queryParams),
  });
  const invoices: any[] = invoicesData?.results ?? [];

  const { data: accountsData } = useQuery({
    queryKey: ['accounts-active'],
    queryFn: () => api.getAccounts({ is_active: true }),
  });
  const accounts: any[] = Array.isArray(accountsData)
    ? accountsData
    : (accountsData as any)?.results ?? [];

  const statusSummary = useMemo(() => {
    const summary: Record<string, { count: number; amount: number }> = {};
    for (const inv of invoices) {
      const s = inv.status;
      if (!summary[s]) summary[s] = { count: 0, amount: 0 };
      summary[s].count++;
      summary[s].amount += parseFloat(inv.amount_gross) || 0;
    }
    return summary;
  }, [invoices]);

  const approveMutation = useMutation({
    mutationFn: (id: number) => (api as any).approveInvoice(id),
    onSuccess: () => {
      toast.success('Счёт согласован');
      queryClient.invalidateQueries({ queryKey: ['invoices-registry'] });
    },
    onError: () => toast.error('Ошибка согласования'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, comment }: { id: number; comment: string }) =>
      (api as any).rejectInvoice(id, comment),
    onSuccess: () => {
      toast.success('Счёт отклонён');
      queryClient.invalidateQueries({ queryKey: ['invoices-registry'] });
      setActionDialog({ type: null, invoiceId: null });
      setActionComment('');
    },
    onError: () => toast.error('Ошибка отклонения'),
  });

  const rescheduleMutation = useMutation({
    mutationFn: ({ id, newDate, comment }: { id: number; newDate: string; comment: string }) =>
      (api as any).rescheduleInvoice(id, newDate, comment),
    onSuccess: () => {
      toast.success('Дата оплаты перенесена');
      queryClient.invalidateQueries({ queryKey: ['invoices-registry'] });
      setActionDialog({ type: null, invoiceId: null });
      setActionComment('');
      setRescheduleDate('');
    },
    onError: () => toast.error('Ошибка переноса'),
  });

  const handleApprove = (id: number) => {
    approveMutation.mutate(id);
  };

  const handleRejectSubmit = () => {
    if (!actionDialog.invoiceId || !actionComment.trim()) return;
    rejectMutation.mutate({ id: actionDialog.invoiceId, comment: actionComment });
  };

  const handleRescheduleSubmit = () => {
    if (!actionDialog.invoiceId || !rescheduleDate) return;
    rescheduleMutation.mutate({
      id: actionDialog.invoiceId,
      newDate: rescheduleDate,
      comment: actionComment,
    });
  };

  const handleInvoiceClick = (id: number) => {
    navigate(`/supply/invoices/${id}`);
  };

  return (
    <div className="space-y-4 mt-4">
      <div className="flex gap-3 overflow-x-auto pb-1">
        {accounts.map((acc: any) => {
          const bal = acc.current_balance || acc.balance || '0';
          const isCash = acc.account_type === 'cash';
          return (
            <div
              key={acc.id}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-white shrink-0"
            >
              {isCash ? (
                <Banknote className="h-4 w-4 text-green-600 shrink-0" />
              ) : (
                <Landmark className="h-4 w-4 text-blue-500 shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-xs text-gray-500 truncate max-w-[120px]">{acc.name}</p>
                <p className="text-sm font-semibold text-gray-900">{formatCurrency(bal)}</p>
              </div>
            </div>
          );
        })}
      </div>

      {Object.keys(statusSummary).length > 0 && (
        <div className="flex gap-3 flex-wrap">
          {Object.entries(statusSummary).map(([status, data]) => (
            <Card key={status} className="flex-1 min-w-[140px]">
              <CardContent className="pt-3 pb-3">
                <Badge variant="outline" className={STATUS_COLORS[status] || ''}>
                  {STATUS_LABELS[status] || status}
                </Badge>
                <p className="text-lg font-bold text-gray-900 mt-1">{data.count}</p>
                <p className="text-xs text-gray-500">{formatCurrency(data.amount)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {FILTER_TABS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setStatusFilter(value)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              statusFilter === value
                ? 'bg-white text-gray-900 shadow-sm font-medium'
                : 'text-gray-600 hover:text-gray-900'
            }`}
            aria-label={`Фильтр: ${label}`}
          >
            {label}
          </button>
        ))}
      </div>

      {invoicesLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg font-medium">Нет записей</p>
          <p className="text-sm">Счета с выбранным статусом не найдены</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Номер</th>
                <th className="text-left px-4 py-3 font-medium">Контрагент</th>
                <th className="text-left px-4 py-3 font-medium">Объект</th>
                <th className="text-right px-4 py-3 font-medium">Сумма</th>
                <th className="text-center px-4 py-3 font-medium">Статус</th>
                <th className="text-left px-4 py-3 font-medium">Срок оплаты</th>
                <th className="text-left px-4 py-3 font-medium">Согласование</th>
                <th className="text-right px-4 py-3 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {invoices.map((invoice: any) => {
                const highlight = getDueDateHighlight(invoice.due_date, invoice.status);

                return (
                  <tr
                    key={invoice.id}
                    className={`hover:bg-gray-50/50 transition-colors ${highlight}`}
                  >
                    <td
                      className="px-4 py-3 font-medium text-blue-600 cursor-pointer hover:underline"
                      onClick={() => handleInvoiceClick(invoice.id)}
                      role="button"
                      tabIndex={0}
                      aria-label={`Открыть счёт ${invoice.number || invoice.id}`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleInvoiceClick(invoice.id);
                      }}
                    >
                      {invoice.number || `#${invoice.id}`}
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-[180px] truncate">
                      {invoice.counterparty_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-[160px] truncate">
                      {invoice.object_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {formatCurrency(invoice.amount_gross)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        variant="outline"
                        className={STATUS_COLORS[invoice.status] || ''}
                      >
                        {STATUS_LABELS[invoice.status] || invoice.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {formatDate(invoice.due_date)}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {invoice.approved_by_name && (
                        <span>
                          {invoice.approved_by_name}
                          {invoice.approved_at && ` (${formatDate(invoice.approved_at)})`}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {invoice.status === 'in_registry' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-green-700 border-green-300 hover:bg-green-50"
                              onClick={() => handleApprove(invoice.id)}
                              disabled={approveMutation.isPending}
                              aria-label="Согласовать"
                            >
                              {approveMutation.isPending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-red-700 border-red-300 hover:bg-red-50"
                              onClick={() =>
                                setActionDialog({ type: 'reject', invoiceId: invoice.id })
                              }
                              aria-label="Отклонить"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        {(invoice.status === 'in_registry' || invoice.status === 'approved') && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-gray-600"
                            onClick={() =>
                              setActionDialog({ type: 'reschedule', invoiceId: invoice.id })
                            }
                            aria-label="Перенести дату"
                          >
                            <Clock className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {invoice.status === 'approved' && invoice.payment_method === 'cash' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                            onClick={() => handleApprove(invoice.id)}
                            aria-label="Отметить оплату"
                          >
                            Оплачен
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={actionDialog.type !== null}
        onOpenChange={(open) => {
          if (!open) {
            setActionDialog({ type: null, invoiceId: null });
            setActionComment('');
            setRescheduleDate('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {actionDialog.type === 'reject' ? 'Отклонение счёта' : 'Перенос даты оплаты'}
            </DialogTitle>
            <DialogDescription>
              {actionDialog.type === 'reject'
                ? 'Укажите причину отклонения'
                : 'Укажите новую дату и причину переноса'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            {actionDialog.type === 'reschedule' && (
              <div>
                <Label htmlFor="reschedule-date">Новая дата</Label>
                <Input
                  id="reschedule-date"
                  type="date"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="mt-1.5"
                  aria-label="Новая дата оплаты"
                />
              </div>
            )}
            <div>
              <Label htmlFor="action-comment">Комментарий</Label>
              <Textarea
                id="action-comment"
                value={actionComment}
                onChange={(e) => setActionComment(e.target.value)}
                placeholder={
                  actionDialog.type === 'reject'
                    ? 'Причина отклонения...'
                    : 'Причина переноса...'
                }
                rows={3}
                className="mt-1.5"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setActionDialog({ type: null, invoiceId: null });
                  setActionComment('');
                  setRescheduleDate('');
                }}
              >
                Отмена
              </Button>
              {actionDialog.type === 'reject' ? (
                <Button
                  variant="destructive"
                  onClick={handleRejectSubmit}
                  disabled={!actionComment.trim() || rejectMutation.isPending}
                >
                  {rejectMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Отклонить
                </Button>
              ) : (
                <Button
                  onClick={handleRescheduleSubmit}
                  disabled={!rescheduleDate || rescheduleMutation.isPending}
                >
                  {rescheduleMutation.isPending && (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  )}
                  Перенести
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

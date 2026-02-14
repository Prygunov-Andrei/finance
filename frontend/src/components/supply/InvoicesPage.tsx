import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api } from '../../lib/api';
import type { Invoice, InvoiceStatus } from '../../types/supply';
import {
  Loader2, Search, Filter, X, FileText, Check, XCircle,
  CalendarClock, Eye, ChevronLeft, ChevronRight, Plus,
} from 'lucide-react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { toast } from 'sonner';
import { formatDate, formatAmount } from '../../lib/utils';
import { CONSTANTS } from '../../constants';

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  recognition: 'Распознавание',
  review: 'На проверке',
  in_registry: 'В реестре',
  approved: 'Одобрен',
  sending: 'Отправка в банк',
  paid: 'Оплачен',
  cancelled: 'Отменён',
};

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  recognition: 'bg-purple-100 text-purple-800',
  review: 'bg-yellow-100 text-yellow-800',
  in_registry: 'bg-blue-100 text-blue-800',
  approved: 'bg-green-100 text-green-800',
  sending: 'bg-indigo-100 text-indigo-800',
  paid: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-red-100 text-red-800',
};

const SOURCE_LABELS: Record<string, string> = {
  bitrix: 'Битрикс24',
  manual: 'Вручную',
  recurring: 'Периодический',
};

export function InvoicesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(25);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    status: 'all',
    source: 'all',
  });

  // Action dialogs
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; invoiceId: number | null }>({ open: false, invoiceId: null });
  const [rejectComment, setRejectComment] = useState('');
  const [rescheduleDialog, setRescheduleDialog] = useState<{ open: boolean; invoiceId: number | null }>({ open: false, invoiceId: null });
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleComment, setRescheduleComment] = useState('');

  useEffect(() => {
    setCurrentPage(1);
  }, [filters, searchQuery]);

  // Build query params
  const buildParams = (): string => {
    const params = new URLSearchParams();
    params.set('page', String(currentPage));
    params.set('page_size', String(pageSize));
    if (searchQuery) params.set('search', searchQuery);
    if (filters.status !== 'all') params.set('status', filters.status);
    if (filters.source !== 'all') params.set('source', filters.source);
    return params.toString();
  };

  const { data: invoicesResponse, isLoading } = useQuery({
    queryKey: ['invoices', filters, searchQuery, currentPage, pageSize],
    queryFn: () => (api as any).getInvoices(buildParams()),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const invoices: Invoice[] = invoicesResponse?.results || [];
  const totalCount = invoicesResponse?.count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  // Mutations
  const submitToRegistryMutation = useMutation({
    mutationFn: (id: number) => (api as any).submitInvoiceToRegistry(id),
    onSuccess: () => {
      toast.success('Счёт отправлен в реестр');
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: () => toast.error('Ошибка при отправке в реестр'),
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => (api as any).approveInvoice(id),
    onSuccess: () => {
      toast.success('Счёт одобрен');
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: () => toast.error('Ошибка при одобрении'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, comment }: { id: number; comment: string }) =>
      (api as any).rejectInvoice(id, comment),
    onSuccess: () => {
      toast.success('Счёт отклонён');
      setRejectDialog({ open: false, invoiceId: null });
      setRejectComment('');
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: () => toast.error('Ошибка при отклонении'),
  });

  const rescheduleMutation = useMutation({
    mutationFn: ({ id, newDate, comment }: { id: number; newDate: string; comment: string }) =>
      (api as any).rescheduleInvoice(id, newDate, comment),
    onSuccess: () => {
      toast.success('Счёт перенесён');
      setRescheduleDialog({ open: false, invoiceId: null });
      setRescheduleDate('');
      setRescheduleComment('');
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: () => toast.error('Ошибка при переносе'),
  });

  const handleResetFilters = () => {
    setFilters({ status: 'all', source: 'all' });
    setSearchQuery('');
  };

  const hasActiveFilters = filters.status !== 'all' || filters.source !== 'all' || searchQuery !== '';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Счета на оплату</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Всего: {totalCount}
          </p>
        </div>
        <Button onClick={() => navigate('/supply/invoices/create')} size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Новый счёт
        </Button>
      </div>

      {/* Search & Filters */}
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по номеру, контрагенту, описанию..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button
            variant={showFilters ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="w-4 h-4 mr-2" />
            Фильтры
          </Button>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={handleResetFilters}>
              <X className="w-4 h-4 mr-2" />
              Сбросить
            </Button>
          )}
        </div>

        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t">
            <div>
              <Label className="text-xs">Статус</Label>
              <Select
                value={filters.status}
                onValueChange={(v) => setFilters((p) => ({ ...p, status: v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все статусы</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Источник</Label>
              <Select
                value={filters.source}
                onValueChange={(v) => setFilters((p) => ({ ...p, source: v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все источники</SelectItem>
                  {Object.entries(SOURCE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </Card>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : invoices.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg font-medium">Счета не найдены</p>
          <p className="text-sm mt-1">Попробуйте изменить фильтры или создайте новый счёт</p>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">№ счёта</th>
                  <th className="text-left p-3 font-medium">Контрагент</th>
                  <th className="text-left p-3 font-medium">Объект</th>
                  <th className="text-right p-3 font-medium">Сумма</th>
                  <th className="text-left p-3 font-medium">Статус</th>
                  <th className="text-left p-3 font-medium">Источник</th>
                  <th className="text-left p-3 font-medium">Дата</th>
                  <th className="text-left p-3 font-medium">Срок оплаты</th>
                  <th className="text-center p-3 font-medium">Действия</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => navigate(`/supply/invoices/${inv.id}`)}
                    tabIndex={0}
                    role="button"
                    aria-label={`Счёт ${inv.invoice_number}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') navigate(`/supply/invoices/${inv.id}`);
                    }}
                  >
                    <td className="p-3 font-mono text-xs">
                      {inv.invoice_number || '—'}
                    </td>
                    <td className="p-3 max-w-[200px] truncate">
                      {inv.counterparty_name || '—'}
                    </td>
                    <td className="p-3 max-w-[150px] truncate">
                      {inv.object_name || '—'}
                    </td>
                    <td className="p-3 text-right font-medium whitespace-nowrap">
                      {inv.amount_gross ? formatAmount(inv.amount_gross) : '—'}
                    </td>
                    <td className="p-3">
                      <Badge className={`${STATUS_COLORS[inv.status]} text-xs`}>
                        {STATUS_LABELS[inv.status]}
                      </Badge>
                      {inv.is_overdue && (
                        <Badge variant="destructive" className="ml-1 text-xs">
                          Просрочен
                        </Badge>
                      )}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {SOURCE_LABELS[inv.source] || inv.source}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(inv.invoice_date)}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                      {inv.due_date ? formatDate(inv.due_date) : '—'}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => navigate(`/supply/invoices/${inv.id}`)}
                          aria-label="Просмотр"
                          tabIndex={0}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        {inv.status === 'review' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-blue-600 hover:text-blue-700"
                            onClick={() => submitToRegistryMutation.mutate(inv.id)}
                            aria-label="В реестр"
                            tabIndex={0}
                          >
                            <FileText className="w-4 h-4" />
                          </Button>
                        )}
                        {inv.status === 'in_registry' && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-green-600 hover:text-green-700"
                              onClick={() => approveMutation.mutate(inv.id)}
                              aria-label="Одобрить"
                              tabIndex={0}
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-red-600 hover:text-red-700"
                              onClick={() => setRejectDialog({ open: true, invoiceId: inv.id })}
                              aria-label="Отклонить"
                              tabIndex={0}
                            >
                              <XCircle className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-amber-600 hover:text-amber-700"
                              onClick={() => setRescheduleDialog({ open: true, invoiceId: inv.id })}
                              aria-label="Перенести"
                              tabIndex={0}
                            >
                              <CalendarClock className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t">
              <p className="text-sm text-muted-foreground">
                Показано {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, totalCount)} из {totalCount}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm font-medium">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Reject Dialog */}
      <Dialog open={rejectDialog.open} onOpenChange={(open) => {
        if (!open) { setRejectDialog({ open: false, invoiceId: null }); setRejectComment(''); }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Отклонить счёт</DialogTitle>
            <DialogDescription>Укажите причину отклонения счёта</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              placeholder="Причина отклонения..."
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              rows={3}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejectDialog({ open: false, invoiceId: null })}>
                Отмена
              </Button>
              <Button
                variant="destructive"
                disabled={!rejectComment.trim() || rejectMutation.isPending}
                onClick={() => {
                  if (rejectDialog.invoiceId) {
                    rejectMutation.mutate({ id: rejectDialog.invoiceId, comment: rejectComment });
                  }
                }}
              >
                {rejectMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Отклонить
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reschedule Dialog */}
      <Dialog open={rescheduleDialog.open} onOpenChange={(open) => {
        if (!open) { setRescheduleDialog({ open: false, invoiceId: null }); setRescheduleDate(''); setRescheduleComment(''); }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Перенести оплату</DialogTitle>
            <DialogDescription>Укажите новую дату и причину переноса</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Новая дата оплаты</Label>
              <Input
                type="date"
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Комментарий</Label>
              <Textarea
                placeholder="Причина переноса..."
                value={rescheduleComment}
                onChange={(e) => setRescheduleComment(e.target.value)}
                rows={2}
                className="mt-1"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRescheduleDialog({ open: false, invoiceId: null })}>
                Отмена
              </Button>
              <Button
                disabled={!rescheduleDate || !rescheduleComment.trim() || rescheduleMutation.isPending}
                onClick={() => {
                  if (rescheduleDialog.invoiceId) {
                    rescheduleMutation.mutate({
                      id: rescheduleDialog.invoiceId,
                      newDate: rescheduleDate,
                      comment: rescheduleComment,
                    });
                  }
                }}
              >
                {rescheduleMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Перенести
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

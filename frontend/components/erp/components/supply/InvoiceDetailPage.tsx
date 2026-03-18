import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { Invoice, InvoiceItem, InvoiceEvent } from '../../types/supply';
import {
  Loader2, ArrowLeft, FileText, Check, XCircle, CalendarClock,
  ExternalLink, Clock, User, Download, Send, Trash2, Plus,
  AlertCircle, CheckCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Textarea } from '../ui/textarea';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Separator } from '../ui/separator';
import { toast } from 'sonner';
import { formatDate, formatAmount } from '../../lib/utils';
import { InvoiceFilePreview } from './InvoiceFilePreview';
import { InvoiceEditForm } from './InvoiceEditForm';
import { useBreadcrumb } from '../../hooks/useBreadcrumb';

const STATUS_LABELS: Record<string, string> = {
  recognition: 'Распознавание',
  review: 'На проверке',
  verified: 'Проверен',
  in_registry: 'В реестре',
  approved: 'Одобрен',
  sending: 'Отправка в банк',
  paid: 'Оплачен',
  cancelled: 'Отменён',
};

const STATUS_COLORS: Record<string, string> = {
  recognition: 'bg-purple-100 text-purple-800',
  review: 'bg-yellow-100 text-yellow-800',
  verified: 'bg-teal-100 text-teal-800',
  in_registry: 'bg-blue-100 text-blue-800',
  approved: 'bg-green-100 text-green-800',
  sending: 'bg-indigo-100 text-indigo-800',
  paid: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-red-100 text-red-800',
};

const EVENT_LABELS: Record<string, string> = {
  created: 'Создан',
  recognized: 'Распознан',
  reviewed: 'Подтверждён',
  sent_to_registry: 'В реестре',
  approved: 'Одобрен',
  rejected: 'Отклонён',
  rescheduled: 'Перенесён',
  sent_to_bank: 'Отправлен в банк',
  paid: 'Оплачен',
  cancelled: 'Отменён',
  comment: 'Комментарий',
};

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [rejectDialog, setRejectDialog] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [rescheduleDialog, setRescheduleDialog] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleComment, setRescheduleComment] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const location = useLocation();
  const isEstimateContext = location.pathname.startsWith('/estimates/invoices/');

  const { setDetailLabel, setParentCrumb } = useBreadcrumb();

  const { data: invoice, isLoading, error } = useQuery<Invoice>({
    queryKey: ['invoice', id],
    queryFn: () => (api as any).getInvoice(Number(id)),
    enabled: !!id,
  });

  // Breadcrumb: show real invoice number + dynamic parent for estimate context
  useEffect(() => {
    if (invoice) {
      setDetailLabel(`Счёт ${invoice.invoice_number || `№${invoice.id}`}`);
      if (isEstimateContext && invoice.estimate) {
        setParentCrumb({
          label: `Смета #${invoice.estimate}`,
          path: `/estimates/estimates/${invoice.estimate}?tab=supplier-invoices`,
        });
      }
    }
    return () => {
      setDetailLabel(null);
      setParentCrumb(null);
    };
  }, [invoice?.invoice_number, invoice?.id, invoice?.estimate, isEstimateContext, setDetailLabel, setParentCrumb]);

  const backUrl = invoice?.estimate
    ? `/estimates/estimates/${invoice.estimate}?tab=supplier-invoices`
    : '/finance/payments';

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['invoice', id] });
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
  };

  const submitMutation = useMutation({
    mutationFn: () => (api as any).submitInvoiceToRegistry(Number(id)),
    onSuccess: () => { toast.success('Счёт отправлен в реестр'); invalidate(); },
    onError: (err: any) => toast.error(err?.data?.error || 'Ошибка при отправке в реестр'),
  });

  const approveMutation = useMutation({
    mutationFn: () => (api as any).approveInvoice(Number(id)),
    onSuccess: () => { toast.success('Счёт одобрен'); invalidate(); },
    onError: () => toast.error('Ошибка при одобрении'),
  });

  const rejectMutation = useMutation({
    mutationFn: (comment: string) => (api as any).rejectInvoice(Number(id), comment),
    onSuccess: () => {
      toast.success('Счёт отклонён');
      setRejectDialog(false);
      setRejectComment('');
      invalidate();
    },
    onError: () => toast.error('Ошибка при отклонении'),
  });

  const rescheduleMutation = useMutation({
    mutationFn: ({ newDate, comment }: { newDate: string; comment: string }) =>
      (api as any).rescheduleInvoice(Number(id), newDate, comment),
    onSuccess: () => {
      toast.success('Оплата перенесена');
      setRescheduleDialog(false);
      setRescheduleDate('');
      setRescheduleComment('');
      invalidate();
    },
    onError: () => toast.error('Ошибка при переносе'),
  });

  const deleteInvoiceMutation = useMutation({
    mutationFn: () => (api as any).deleteInvoice(Number(id)),
    onSuccess: () => {
      toast.success('Счёт удалён');
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['estimate-invoices'] });
      navigate(backUrl);
    },
    onError: (err: any) => toast.error(err?.data?.detail || 'Ошибка при удалении'),
  });

  // ==================== Inline item editing ====================
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});

  const updateItemMutation = useMutation({
    mutationFn: ({ itemId, data }: { itemId: number; data: Record<string, any> }) =>
      (api as any).updateInvoiceItem(itemId, data),
    onError: () => toast.error('Ошибка при обновлении позиции'),
    onSuccess: () => invalidate(),
  });

  const deleteItemMutation = useMutation({
    mutationFn: (itemId: number) => (api as any).deleteInvoiceItem(itemId),
    onSuccess: () => { toast.success('Позиция удалена'); invalidate(); },
    onError: () => toast.error('Ошибка при удалении позиции'),
  });

  const createItemMutation = useMutation({
    mutationFn: () =>
      (api as any).createInvoiceItem({
        invoice: Number(id),
        raw_name: 'Новая позиция',
        quantity: '1',
        unit: 'шт',
        price_per_unit: '0.00',
        amount: '0.00',
      }),
    onSuccess: () => { toast.success('Позиция добавлена'); invalidate(); },
    onError: () => toast.error('Ошибка при добавлении позиции'),
  });

  const handleCellEdit = useCallback(
    (itemId: number, field: string, value: string) => {
      const timerKey = `${itemId}-${field}`;
      if (debounceTimers.current[timerKey]) {
        clearTimeout(debounceTimers.current[timerKey]);
      }
      debounceTimers.current[timerKey] = setTimeout(() => {
        const patch: Record<string, any> = { [field]: value };
        // Auto-recalculate amount when quantity or price changes
        if (field === 'quantity' || field === 'price_per_unit') {
          const item = invoice?.items?.find((i: InvoiceItem) => i.id === itemId);
          if (item) {
            const qty = parseFloat(field === 'quantity' ? value : item.quantity) || 0;
            const price = parseFloat(field === 'price_per_unit' ? value : item.price_per_unit) || 0;
            patch.amount = (qty * price).toFixed(2);
          }
        }
        updateItemMutation.mutate({ itemId, data: patch });
        delete debounceTimers.current[timerKey];
      }, 600);
    },
    [invoice?.items, updateItemMutation],
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Счёт не найден</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate(backUrl)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Назад к списку
        </Button>
      </div>
    );
  }

  const isReview = invoice.status === 'review';
  const isVerified = invoice.status === 'verified';
  const canDelete = isEstimateContext
    ? ['recognition', 'review', 'verified', 'cancelled'].includes(invoice.status)
    : ['recognition', 'review', 'cancelled'].includes(invoice.status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(backUrl)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold">
              Счёт {invoice.invoice_number || `#${invoice.id}`}
            </h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={`${STATUS_COLORS[invoice.status] || ''} text-xs`}>
                {STATUS_LABELS[invoice.status] || invoice.status}
              </Badge>
              {invoice.is_overdue && (
                <Badge variant="destructive" className="text-xs">Просрочен</Badge>
              )}
              <span className="text-sm text-muted-foreground">
                {invoice.source_display}
              </span>
            </div>
          </div>
        </div>

        {/* Actions by status */}
        <div className="flex items-center gap-2">
          {canDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setDeleteConfirm(true)}
            >
              <Trash2 className="w-5 h-5" />
            </Button>
          )}
          {isVerified && !isEstimateContext && (
            <Button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
            >
              {submitMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <Send className="w-4 h-4 mr-2" />
              В реестр
            </Button>
          )}
          {invoice.status === 'in_registry' && !isEstimateContext && (
            <>
              <Button
                variant="default"
                onClick={() => approveMutation.mutate()}
                disabled={approveMutation.isPending}
              >
                {approveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Check className="w-4 h-4 mr-2" />
                Одобрить
              </Button>
              <Button variant="destructive" onClick={() => setRejectDialog(true)}>
                <XCircle className="w-4 h-4 mr-2" />
                Отклонить
              </Button>
              <Button variant="outline" onClick={() => setRescheduleDialog(true)}>
                <CalendarClock className="w-4 h-4 mr-2" />
                Перенести
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ==================== REVIEW MODE: Split-view ==================== */}
      {isReview && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
          <InvoiceFilePreview url={invoice.invoice_file} />
          <InvoiceEditForm invoice={invoice} className="h-full" />
        </div>
      )}

      {/* ==================== OTHER STATUSES: Regular view ==================== */}
      {!isReview && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left — details */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Основная информация</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <InfoRow label="Номер счёта" value={invoice.invoice_number || '—'} />
                  <InfoRow label="Дата счёта" value={formatDate(invoice.invoice_date)} />
                  <InfoRow label="Срок оплаты" value={invoice.due_date ? formatDate(invoice.due_date) : '—'} />
                  <InfoRow label="Контрагент" value={invoice.counterparty_name || '—'} />
                  <InfoRow label="Объект" value={invoice.object_name || '—'} />
                  <InfoRow label="Договор" value={invoice.contract_number || '—'} />
                  <InfoRow label="Категория" value={invoice.category_name || '—'} />
                  <InfoRow label="Юрлицо" value={invoice.legal_entity_name || '—'} />
                  <InfoRow label="Счёт оплаты" value={invoice.account_name || '—'} />
                  <InfoRow
                    label="Уверенность распознавания"
                    value={
                      invoice.recognition_confidence !== null
                        ? `${(invoice.recognition_confidence * 100).toFixed(0)}%`
                        : '—'
                    }
                  />
                </div>
                {invoice.description && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm text-muted-foreground">Описание</p>
                    <p className="text-sm mt-1">{invoice.description}</p>
                  </div>
                )}
                {invoice.comment && (
                  <div className="mt-3">
                    <p className="text-sm text-muted-foreground">Комментарий</p>
                    <p className="text-sm mt-1">{invoice.comment}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* File preview for verified+ statuses */}
            {invoice.invoice_file && (
              <InvoiceFilePreview url={invoice.invoice_file} />
            )}
          </div>

          {/* Right Sidebar */}
          <div className="space-y-6">
            {/* Amounts */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Суммы</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Сумма с НДС</span>
                  <span className="font-bold text-lg">
                    {invoice.amount_gross ? formatAmount(invoice.amount_gross) : '—'}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Без НДС</span>
                  <span>{invoice.amount_net ? formatAmount(invoice.amount_net) : '—'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">НДС</span>
                  <span>{invoice.vat_amount ? formatAmount(invoice.vat_amount) : '—'}</span>
                </div>
              </CardContent>
            </Card>

            {/* Who */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Участники</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {invoice.created_by_name && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Создал</span>
                    <span>{invoice.created_by_name}</span>
                  </div>
                )}
                {invoice.reviewed_by_name && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Проверил</span>
                    <span>{invoice.reviewed_by_name}</span>
                  </div>
                )}
                {invoice.approved_by_name && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Одобрил</span>
                    <span>{invoice.approved_by_name}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Dates */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Даты</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Создан</span>
                  <span>{formatDate(invoice.created_at)}</span>
                </div>
                {invoice.reviewed_at && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Проверен</span>
                    <span>{formatDate(invoice.reviewed_at)}</span>
                  </div>
                )}
                {invoice.approved_at && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Одобрен</span>
                    <span>{formatDate(invoice.approved_at)}</span>
                  </div>
                )}
                {invoice.paid_at && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Оплачен</span>
                    <span>{formatDate(invoice.paid_at)}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Supply Request link */}
            {invoice.supply_request && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Запрос снабжения</CardTitle>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => navigate(`/supply/requests`)}
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Запрос #{invoice.supply_request}
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ==================== Items Table — ALWAYS full width ==================== */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">
            Позиции счёта ({invoice.items?.length || 0})
          </CardTitle>
          {isReview && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => createItemMutation.mutate()}
              disabled={createItemMutation.isPending}
            >
              {createItemMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-1" />
              )}
              Добавить
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {invoice.items && invoice.items.length > 0 ? (<>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium w-10">#</th>
                    <th className="text-left p-3 font-medium">Наименование</th>
                    {!isReview && <th className="text-left p-3 font-medium">Товар в каталоге</th>}
                    <th className="text-right p-3 font-medium w-24">Кол-во</th>
                    <th className="text-left p-3 font-medium w-20">Ед.</th>
                    <th className="text-right p-3 font-medium w-32">Цена</th>
                    <th className="text-right p-3 font-medium w-32">Сумма</th>
                    {isReview && <th className="p-3 w-10" />}
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item: InvoiceItem, idx: number) => (
                    <tr key={item.id} className="border-b">
                      <td className="p-3 text-muted-foreground">{idx + 1}</td>
                      {isReview ? (
                        <>
                          <td className="p-1">
                            <EditableCell
                              value={item.raw_name}
                              onChange={(v) => handleCellEdit(item.id, 'raw_name', v)}
                            />
                          </td>
                          <td className="p-1">
                            <EditableCell
                              value={item.quantity}
                              type="number"
                              className="text-right"
                              onChange={(v) => handleCellEdit(item.id, 'quantity', v)}
                            />
                          </td>
                          <td className="p-1">
                            <EditableCell
                              value={item.unit}
                              onChange={(v) => handleCellEdit(item.id, 'unit', v)}
                            />
                          </td>
                          <td className="p-1">
                            <EditableCell
                              value={item.price_per_unit}
                              type="number"
                              className="text-right"
                              onChange={(v) => handleCellEdit(item.id, 'price_per_unit', v)}
                            />
                          </td>
                          <td className="p-3 text-right font-medium text-muted-foreground">
                            {formatAmount(
                              ((parseFloat(item.quantity) || 0) * (parseFloat(item.price_per_unit) || 0)).toFixed(2)
                            )}
                          </td>
                          <td className="p-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => deleteItemMutation.mutate(item.id)}
                              disabled={deleteItemMutation.isPending}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="p-3">
                            <p className="break-words">{item.raw_name}</p>
                          </td>
                          <td className="p-3">
                            {item.product_name ? (
                              <Badge variant="outline" className="text-xs">
                                {item.product_name}
                              </Badge>
                            ) : (
                              <span className="text-xs text-amber-600">Не привязан</span>
                            )}
                          </td>
                          <td className="p-3 text-right">{item.quantity}</td>
                          <td className="p-3 text-muted-foreground">{item.unit}</td>
                          <td className="p-3 text-right">{formatAmount(item.price_per_unit)}</td>
                          <td className="p-3 text-right font-medium">{formatAmount(item.amount)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(() => {
              const itemsTotal = invoice.items.reduce((sum: number, item: InvoiceItem) => {
                return sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.price_per_unit) || 0);
              }, 0);
              const grossAmount = parseFloat(invoice.amount_gross) || 0;
              const diffPct = grossAmount > 0 ? Math.abs(itemsTotal - grossAmount) / grossAmount * 100 : 0;
              const isMatch = diffPct <= 5;

              return (
                <div className="px-6 pb-4 flex items-center justify-between border-t pt-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">Итого по позициям:</span>
                    <span className="text-sm font-bold">{formatAmount(itemsTotal.toFixed(2))}</span>
                    {grossAmount > 0 && (
                      isMatch ? (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5" /> совпадает с суммой счёта
                        </span>
                      ) : (
                        <span className="text-xs text-amber-600 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" />
                          расхождение с суммой счёта ({formatAmount(grossAmount.toFixed(2))}) на {diffPct.toFixed(1)}%
                        </span>
                      )
                    )}
                  </div>
                </div>
              );
            })()}
          </>
          ) : (
            <p className="p-6 text-sm text-muted-foreground text-center">
              Позиции отсутствуют
            </p>
          )}
        </CardContent>
      </Card>

      {/* ==================== Events Timeline ==================== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">История событий</CardTitle>
        </CardHeader>
        <CardContent>
          {invoice.events && invoice.events.length > 0 ? (
            <div className="space-y-3">
              {invoice.events.map((event: InvoiceEvent) => (
                <div key={event.id} className="flex gap-3 text-sm">
                  <div className="flex-shrink-0 mt-1">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {EVENT_LABELS[event.event_type] || event.event_type}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(event.created_at)}
                      </span>
                    </div>
                    {event.user_name && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                        <User className="w-3 h-3" />
                        {event.user_name}
                      </div>
                    )}
                    {event.comment && (
                      <p className="text-sm text-muted-foreground mt-1">{event.comment}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center">
              Нет событий
            </p>
          )}
        </CardContent>
      </Card>

      {/* Reject Dialog */}
      <Dialog open={rejectDialog} onOpenChange={(open) => {
        if (!open) { setRejectDialog(false); setRejectComment(''); }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Отклонить счёт</DialogTitle>
            <DialogDescription>Укажите причину отклонения</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              placeholder="Причина отклонения..."
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              rows={3}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejectDialog(false)}>Отмена</Button>
              <Button
                variant="destructive"
                disabled={!rejectComment.trim() || rejectMutation.isPending}
                onClick={() => rejectMutation.mutate(rejectComment)}
              >
                {rejectMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Отклонить
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reschedule Dialog */}
      <Dialog open={rescheduleDialog} onOpenChange={(open) => {
        if (!open) { setRescheduleDialog(false); setRescheduleDate(''); setRescheduleComment(''); }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Перенести оплату</DialogTitle>
            <DialogDescription>Укажите новую дату и причину переноса</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Новая дата</Label>
              <Input type="date" value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)} className="mt-1" />
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
              <Button variant="outline" onClick={() => setRescheduleDialog(false)}>Отмена</Button>
              <Button
                disabled={!rescheduleDate || !rescheduleComment.trim() || rescheduleMutation.isPending}
                onClick={() => rescheduleMutation.mutate({ newDate: rescheduleDate, comment: rescheduleComment })}
              >
                {rescheduleMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Перенести
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Удалить счёт?</DialogTitle>
            <DialogDescription>
              Счёт {invoice.invoice_number || `#${invoice.id}`} будет удалён без возможности восстановления.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeleteConfirm(false)}>Отмена</Button>
            <Button
              variant="destructive"
              disabled={deleteInvoiceMutation.isPending}
              onClick={() => deleteInvoiceMutation.mutate()}
            >
              {deleteInvoiceMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Удалить
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-medium mt-0.5">{value}</p>
    </div>
  );
}

function EditableCell({
  value,
  onChange,
  type = 'text',
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  type?: 'text' | 'number';
  className?: string;
}) {
  const [local, setLocal] = useState(value);
  const prevValue = useRef(value);

  // Sync from server when data refreshes
  useEffect(() => {
    if (value !== prevValue.current) {
      setLocal(value);
      prevValue.current = value;
    }
  }, [value]);

  return (
    <input
      type={type}
      step={type === 'number' ? '0.01' : undefined}
      className={`w-full px-2 py-1.5 text-sm border border-transparent rounded
        hover:border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500
        focus:outline-none bg-transparent ${className}`}
      value={local}
      onChange={(e) => {
        setLocal(e.target.value);
        onChange(e.target.value);
      }}
    />
  );
}

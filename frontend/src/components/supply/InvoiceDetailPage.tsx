import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { Invoice, InvoiceItem, InvoiceEvent } from '../../types/supply';
import {
  Loader2, ArrowLeft, FileText, Check, XCircle, CalendarClock,
  ExternalLink, Clock, User, Download,
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

const STATUS_LABELS: Record<string, string> = {
  recognition: 'Распознавание',
  review: 'На проверке',
  in_registry: 'В реестре',
  approved: 'Одобрен',
  sending: 'Отправка в банк',
  paid: 'Оплачен',
  cancelled: 'Отменён',
};

const STATUS_COLORS: Record<string, string> = {
  recognition: 'bg-purple-100 text-purple-800',
  review: 'bg-yellow-100 text-yellow-800',
  in_registry: 'bg-blue-100 text-blue-800',
  approved: 'bg-green-100 text-green-800',
  sending: 'bg-indigo-100 text-indigo-800',
  paid: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-red-100 text-red-800',
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

  const { data: invoice, isLoading, error } = useQuery<Invoice>({
    queryKey: ['invoice', id],
    queryFn: () => (api as any).getInvoice(Number(id)),
    enabled: !!id,
  });

  const submitMutation = useMutation({
    mutationFn: () => (api as any).submitInvoiceToRegistry(Number(id)),
    onSuccess: () => {
      toast.success('Счёт отправлен в реестр');
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: () => toast.error('Ошибка при отправке в реестр'),
  });

  const approveMutation = useMutation({
    mutationFn: () => (api as any).approveInvoice(Number(id)),
    onSuccess: () => {
      toast.success('Счёт одобрен');
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: () => toast.error('Ошибка при одобрении'),
  });

  const rejectMutation = useMutation({
    mutationFn: (comment: string) => (api as any).rejectInvoice(Number(id), comment),
    onSuccess: () => {
      toast.success('Счёт отклонён');
      setRejectDialog(false);
      setRejectComment('');
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
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
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: () => toast.error('Ошибка при переносе'),
  });

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
        <Button variant="outline" className="mt-4" onClick={() => navigate('/supply/invoices')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Назад к списку
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/supply/invoices')}>
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

        {/* Actions */}
        <div className="flex items-center gap-2">
          {invoice.status === 'review' && (
            <Button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
            >
              {submitMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <FileText className="w-4 h-4 mr-2" />
              В реестр
            </Button>
          )}
          {invoice.status === 'in_registry' && (
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
              <Button
                variant="destructive"
                onClick={() => setRejectDialog(true)}
              >
                <XCircle className="w-4 h-4 mr-2" />
                Отклонить
              </Button>
              <Button
                variant="outline"
                onClick={() => setRescheduleDialog(true)}
              >
                <CalendarClock className="w-4 h-4 mr-2" />
                Перенести
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Main Info */}
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

          {/* Items */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Позиции счёта ({invoice.items?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {invoice.items && invoice.items.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium">#</th>
                        <th className="text-left p-3 font-medium">Наименование</th>
                        <th className="text-left p-3 font-medium">Товар в каталоге</th>
                        <th className="text-right p-3 font-medium">Кол-во</th>
                        <th className="text-left p-3 font-medium">Ед.</th>
                        <th className="text-right p-3 font-medium">Цена</th>
                        <th className="text-right p-3 font-medium">Сумма</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.items.map((item: InvoiceItem, idx: number) => (
                        <tr key={item.id} className="border-b">
                          <td className="p-3 text-muted-foreground">{idx + 1}</td>
                          <td className="p-3 max-w-[250px]">
                            <p className="truncate">{item.raw_name}</p>
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
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="p-6 text-sm text-muted-foreground text-center">
                  Позиции отсутствуют
                </p>
              )}
            </CardContent>
          </Card>

          {/* Events Timeline */}
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
                          <span className="font-medium">{event.event_type}</span>
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

          {/* File */}
          {invoice.invoice_file && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Документ</CardTitle>
              </CardHeader>
              <CardContent>
                <a
                  href={invoice.invoice_file}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                >
                  <Download className="w-4 h-4" />
                  Скачать счёт (PDF)
                </a>
              </CardContent>
            </Card>
          )}

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

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  api,
  BankAccount,
  BankPaymentOrder,
  BankPaymentOrderEvent,
  CreateBankPaymentOrderData,
} from '../lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  Loader2,
  Plus,
  Send,
  Check,
  X,
  Clock,
  CalendarDays,
  ArrowRight,
  AlertTriangle,
  FileText,
  RefreshCw,
  History,
  Ban,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatAmount } from '../lib/utils';

// ─── Статус-бейджи ──────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: 'Черновик', color: 'bg-gray-100 text-gray-700', icon: FileText },
  pending_approval: { label: 'На согласовании', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  approved: { label: 'Одобрено', color: 'bg-green-100 text-green-700', icon: Check },
  sent_to_bank: { label: 'Отправлено в банк', color: 'bg-blue-100 text-blue-700', icon: Send },
  pending_sign: { label: 'Ожидает подписи', color: 'bg-purple-100 text-purple-700', icon: Clock },
  executed: { label: 'Исполнено', color: 'bg-emerald-100 text-emerald-700', icon: Check },
  rejected: { label: 'Отклонено', color: 'bg-red-100 text-red-700', icon: X },
  failed: { label: 'Ошибка', color: 'bg-red-100 text-red-700', icon: AlertTriangle },
};

const StatusBadge = ({ status }: { status: string }) => {
  const config = STATUS_CONFIG[status] || { label: status, color: 'bg-gray-100 text-gray-700', icon: FileText };
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={`${config.color} border-0`}>
      <Icon className="w-3 h-3 mr-1" />
      {config.label}
    </Badge>
  );
};

// ─── Список платёжных поручений ─────────────────────────────────

export const BankPaymentOrders = () => {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<BankPaymentOrder | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const queryClient = useQueryClient();

  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['bank-payment-orders', filterStatus],
    queryFn: () => api.getBankPaymentOrders({ status: filterStatus || undefined }),
  });

  const orders = ordersData?.results || [];

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-semibold">Платёжные поручения</h1>
          <Button onClick={() => setIsCreateOpen(true)} className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" />
            Создать поручение
          </Button>
        </div>

        {/* Фильтр по статусу */}
        <div className="flex gap-3 mb-6">
          <div className="w-56">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Все статусы" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Все статусы</SelectItem>
                <SelectItem value="draft">Черновик</SelectItem>
                <SelectItem value="pending_approval">На согласовании</SelectItem>
                <SelectItem value="approved">Одобрено</SelectItem>
                <SelectItem value="sent_to_bank">Отправлено в банк</SelectItem>
                <SelectItem value="pending_sign">Ожидает подписи</SelectItem>
                <SelectItem value="executed">Исполнено</SelectItem>
                <SelectItem value="rejected">Отклонено</SelectItem>
                <SelectItem value="failed">Ошибка</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Диалог создания */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Новое платёжное поручение</DialogTitle>
              <DialogDescription>Заполните реквизиты для создания платёжного поручения</DialogDescription>
            </DialogHeader>
            <CreatePaymentOrderForm
              onSuccess={() => {
                setIsCreateOpen(false);
                queryClient.invalidateQueries({ queryKey: ['bank-payment-orders'] });
              }}
            />
          </DialogContent>
        </Dialog>

        {/* Детальный просмотр */}
        <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
          <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Платёжное поручение #{selectedOrder?.id}</DialogTitle>
              <DialogDescription>Детали и история действий</DialogDescription>
            </DialogHeader>
            {selectedOrder && (
              <PaymentOrderDetail
                order={selectedOrder}
                onUpdate={(updated) => {
                  setSelectedOrder(updated);
                  queryClient.invalidateQueries({ queryKey: ['bank-payment-orders'] });
                }}
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Таблица */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-12 text-center">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 mb-2">Нет платёжных поручений</p>
            <Button onClick={() => setIsCreateOpen(true)} variant="outline">
              <Plus className="w-4 h-4 mr-2" />
              Создать первое поручение
            </Button>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Получатель</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Сумма</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Дата оплаты</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Статус</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Создал</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Одобрил</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {orders.map((order: BankPaymentOrder) => (
                    <tr
                      key={order.id}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => setSelectedOrder(order)}
                      tabIndex={0}
                      role="button"
                      aria-label={`Открыть поручение ${order.id}`}
                      onKeyDown={(e) => e.key === 'Enter' && setSelectedOrder(order)}
                    >
                      <td className="px-4 py-3 text-sm font-mono text-gray-500">{order.id}</td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900 truncate max-w-[200px]">
                          {order.recipient_name}
                        </div>
                        <div className="text-xs text-gray-500 font-mono">
                          ИНН: {order.recipient_inn}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-bold text-sm">{formatAmount(order.amount)}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm">
                          {new Date(order.payment_date).toLocaleDateString('ru-RU')}
                        </div>
                        {order.reschedule_count > 0 && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <Badge variant="outline" className="text-xs bg-orange-50 text-orange-600 border-orange-200">
                              <CalendarDays className="w-3 h-3 mr-0.5" />
                              перенесено {order.reschedule_count}x
                            </Badge>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={order.status} />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {order.created_by_username}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {order.approved_by_username || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Форма создания ─────────────────────────────────────────────

interface CreatePaymentOrderFormProps {
  onSuccess: () => void;
  initialData?: Partial<CreateBankPaymentOrderData>;
}

const CreatePaymentOrderForm = ({ onSuccess, initialData }: CreatePaymentOrderFormProps) => {
  const [formData, setFormData] = useState<CreateBankPaymentOrderData>({
    bank_account: initialData?.bank_account || 0,
    recipient_name: initialData?.recipient_name || '',
    recipient_inn: initialData?.recipient_inn || '',
    recipient_kpp: initialData?.recipient_kpp || '',
    recipient_account: initialData?.recipient_account || '',
    recipient_bank_name: initialData?.recipient_bank_name || '',
    recipient_bik: initialData?.recipient_bik || '',
    recipient_corr_account: initialData?.recipient_corr_account || '',
    amount: initialData?.amount || '',
    purpose: initialData?.purpose || '',
    vat_info: initialData?.vat_info || '',
    payment_date: initialData?.payment_date || new Date().toISOString().split('T')[0],
  });

  const { data: bankAccounts } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => api.getBankAccounts(),
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateBankPaymentOrderData) => api.createBankPaymentOrder(data),
    onSuccess: () => {
      toast.success('Платёжное поручение создано');
      onSuccess();
    },
    onError: (error: any) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.bank_account || !formData.recipient_name || !formData.amount) {
      toast.error('Заполните обязательные поля');
      return;
    }
    createMutation.mutate(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label>Счёт списания <span className="text-red-500">*</span></Label>
          <Select
            value={formData.bank_account ? formData.bank_account.toString() : ''}
            onValueChange={(v) => setFormData({ ...formData, bank_account: parseInt(v) })}
          >
            <SelectTrigger className="mt-1.5">
              <SelectValue placeholder="Выберите банковский счёт" />
            </SelectTrigger>
            <SelectContent>
              {bankAccounts?.map((acc: BankAccount) => (
                <SelectItem key={acc.id} value={acc.id.toString()}>
                  {acc.account_name} ({acc.account_number})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="col-span-2 pt-3 border-t border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Реквизиты получателя</h4>
        </div>

        <div className="col-span-2">
          <Label>Наименование получателя <span className="text-red-500">*</span></Label>
          <Input
            value={formData.recipient_name}
            onChange={(e) => setFormData({ ...formData, recipient_name: e.target.value })}
            placeholder='ООО "Ромашка"'
            className="mt-1.5"
            required
          />
        </div>

        <div>
          <Label>ИНН <span className="text-red-500">*</span></Label>
          <Input
            value={formData.recipient_inn}
            onChange={(e) => setFormData({ ...formData, recipient_inn: e.target.value })}
            placeholder="1234567890"
            className="mt-1.5"
            required
          />
        </div>
        <div>
          <Label>КПП</Label>
          <Input
            value={formData.recipient_kpp}
            onChange={(e) => setFormData({ ...formData, recipient_kpp: e.target.value })}
            placeholder="123456789"
            className="mt-1.5"
          />
        </div>

        <div className="col-span-2">
          <Label>Расчётный счёт <span className="text-red-500">*</span></Label>
          <Input
            value={formData.recipient_account}
            onChange={(e) => setFormData({ ...formData, recipient_account: e.target.value })}
            placeholder="40702810000000000000"
            className="mt-1.5"
            required
          />
        </div>

        <div>
          <Label>Банк получателя <span className="text-red-500">*</span></Label>
          <Input
            value={formData.recipient_bank_name}
            onChange={(e) => setFormData({ ...formData, recipient_bank_name: e.target.value })}
            placeholder="Сбербанк"
            className="mt-1.5"
            required
          />
        </div>
        <div>
          <Label>БИК <span className="text-red-500">*</span></Label>
          <Input
            value={formData.recipient_bik}
            onChange={(e) => setFormData({ ...formData, recipient_bik: e.target.value })}
            placeholder="044525225"
            className="mt-1.5"
            required
          />
        </div>

        <div className="col-span-2">
          <Label>Корр. счёт банка</Label>
          <Input
            value={formData.recipient_corr_account}
            onChange={(e) => setFormData({ ...formData, recipient_corr_account: e.target.value })}
            placeholder="30101810400000000225"
            className="mt-1.5"
          />
        </div>

        <div className="col-span-2 pt-3 border-t border-gray-200">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Сумма и назначение</h4>
        </div>

        <div>
          <Label>Сумма <span className="text-red-500">*</span></Label>
          <Input
            type="number"
            step="0.01"
            value={formData.amount}
            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
            placeholder="15000.00"
            className="mt-1.5"
            required
          />
        </div>
        <div>
          <Label>Дата оплаты <span className="text-red-500">*</span></Label>
          <Input
            type="date"
            value={formData.payment_date}
            onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
            className="mt-1.5"
            required
          />
        </div>

        <div className="col-span-2">
          <Label>Назначение платежа <span className="text-red-500">*</span></Label>
          <Textarea
            value={formData.purpose}
            onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
            placeholder="Оплата по счёту №123 от 01.01.2026 за..."
            className="mt-1.5"
            rows={3}
            required
          />
        </div>

        <div className="col-span-2">
          <Label>НДС</Label>
          <Input
            value={formData.vat_info}
            onChange={(e) => setFormData({ ...formData, vat_info: e.target.value })}
            placeholder='В т.ч. НДС 20% — 2500.00 руб. или "Без НДС"'
            className="mt-1.5"
          />
        </div>
      </div>

      <div className="flex gap-3 pt-4">
        <Button
          type="submit"
          className="flex-1 bg-blue-600 hover:bg-blue-700"
          disabled={createMutation.isPending}
        >
          {createMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Plus className="w-4 h-4 mr-2" />
          )}
          Создать
        </Button>
      </div>
    </form>
  );
};

// ─── Детальный просмотр с действиями ────────────────────────────

interface PaymentOrderDetailProps {
  order: BankPaymentOrder;
  onUpdate: (order: BankPaymentOrder) => void;
}

const PaymentOrderDetail = ({ order, onUpdate }: PaymentOrderDetailProps) => {
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleComment, setRescheduleComment] = useState('');
  const [approveComment, setApproveComment] = useState('');
  const [rejectComment, setRejectComment] = useState('');

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['bank-payment-order-events', order.id],
    queryFn: () => api.getBankPaymentOrderEvents(order.id),
  });

  const submitMutation = useMutation({
    mutationFn: () => api.submitBankPaymentOrder(order.id),
    onSuccess: (data) => { onUpdate(data); toast.success('Отправлено на согласование'); },
    onError: (e: any) => toast.error(e.message),
  });

  const approveMutation = useMutation({
    mutationFn: () => api.approveBankPaymentOrder(order.id, { comment: approveComment }),
    onSuccess: (data) => { onUpdate(data); toast.success('Платёж одобрен'); },
    onError: (e: any) => toast.error(e.message),
  });

  const rejectMutation = useMutation({
    mutationFn: () => api.rejectBankPaymentOrder(order.id, rejectComment),
    onSuccess: (data) => { onUpdate(data); toast.success('Платёж отклонён'); },
    onError: (e: any) => toast.error(e.message),
  });

  const executeMutation = useMutation({
    mutationFn: () => api.executeBankPaymentOrder(order.id),
    onSuccess: (data) => { onUpdate(data); toast.success('Отправлено в банк'); },
    onError: (e: any) => toast.error(e.message),
  });

  const rescheduleMutation = useMutation({
    mutationFn: () => api.rescheduleBankPaymentOrder(order.id, rescheduleDate, rescheduleComment),
    onSuccess: (data) => {
      onUpdate(data);
      setIsRescheduleOpen(false);
      setRescheduleDate('');
      setRescheduleComment('');
      toast.success('Дата оплаты перенесена');
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 mt-4">
      {/* Основная информация */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-gray-500">Получатель</span>
          <div className="font-medium">{order.recipient_name}</div>
          <div className="text-xs text-gray-500 font-mono">ИНН: {order.recipient_inn}</div>
        </div>
        <div>
          <span className="text-gray-500">Сумма</span>
          <div className="font-bold text-lg">{formatAmount(order.amount)}</div>
          {order.vat_info && <div className="text-xs text-gray-500">{order.vat_info}</div>}
        </div>
        <div>
          <span className="text-gray-500">Дата оплаты</span>
          <div className="font-medium">
            {new Date(order.payment_date).toLocaleDateString('ru-RU')}
          </div>
          {order.reschedule_count > 0 && (
            <div className="text-xs text-orange-600 mt-0.5">
              Перенесено {order.reschedule_count} раз (изначально: {new Date(order.original_payment_date).toLocaleDateString('ru-RU')})
            </div>
          )}
        </div>
        <div>
          <span className="text-gray-500">Статус</span>
          <div className="mt-1"><StatusBadge status={order.status} /></div>
        </div>
        <div className="col-span-2">
          <span className="text-gray-500">Назначение</span>
          <div className="font-medium mt-0.5">{order.purpose}</div>
        </div>
        {order.error_message && (
          <div className="col-span-2 bg-red-50 p-3 rounded-lg">
            <span className="text-red-600 font-medium text-xs">Ошибка:</span>
            <div className="text-red-700 text-sm mt-0.5">{order.error_message}</div>
          </div>
        )}
      </div>

      {/* Действия */}
      <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-200">
        {order.status === 'draft' && (
          <Button
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Send className="w-4 h-4 mr-2" />
            На согласование
          </Button>
        )}

        {order.status === 'pending_approval' && (
          <>
            <Button
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              <Check className="w-4 h-4 mr-2" />
              Одобрить
            </Button>
            <Button
              onClick={() => rejectMutation.mutate()}
              disabled={rejectMutation.isPending}
              variant="destructive"
            >
              <Ban className="w-4 h-4 mr-2" />
              Отклонить
            </Button>
          </>
        )}

        {order.status === 'approved' && (
          <>
            <Button
              onClick={() => executeMutation.mutate()}
              disabled={executeMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Send className="w-4 h-4 mr-2" />
              Отправить в банк
            </Button>
            <Button
              onClick={() => setIsRescheduleOpen(true)}
              variant="outline"
            >
              <CalendarDays className="w-4 h-4 mr-2" />
              Перенести дату
            </Button>
          </>
        )}
      </div>

      {/* Диалог переноса даты */}
      {isRescheduleOpen && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 space-y-3">
          <h4 className="font-medium text-orange-800 flex items-center gap-2">
            <CalendarDays className="w-4 h-4" />
            Перенос даты оплаты
          </h4>
          <div>
            <Label>Новая дата <span className="text-red-500">*</span></Label>
            <Input
              type="date"
              value={rescheduleDate}
              onChange={(e) => setRescheduleDate(e.target.value)}
              className="mt-1.5"
              min={new Date().toISOString().split('T')[0]}
            />
          </div>
          <div>
            <Label>Причина переноса <span className="text-red-500">*</span></Label>
            <Textarea
              value={rescheduleComment}
              onChange={(e) => setRescheduleComment(e.target.value)}
              placeholder="Укажите причину переноса даты оплаты"
              className="mt-1.5"
              rows={2}
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => rescheduleMutation.mutate()}
              disabled={!rescheduleDate || !rescheduleComment.trim() || rescheduleMutation.isPending}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {rescheduleMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CalendarDays className="w-4 h-4 mr-2" />
              )}
              Перенести
            </Button>
            <Button variant="ghost" onClick={() => setIsRescheduleOpen(false)}>
              Отмена
            </Button>
          </div>
        </div>
      )}

      {/* Аудит-лог / Таймлайн */}
      <div className="pt-3 border-t border-gray-200">
        <h4 className="font-medium text-gray-700 flex items-center gap-2 mb-4">
          <History className="w-4 h-4" />
          История действий
        </h4>

        {eventsLoading ? (
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        ) : !events || events.length === 0 ? (
          <p className="text-sm text-gray-500">Нет событий</p>
        ) : (
          <div className="relative pl-6">
            {/* Вертикальная линия */}
            <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-gray-200" />

            <div className="space-y-4">
              {events.map((event: BankPaymentOrderEvent) => (
                <div key={event.id} className="relative">
                  {/* Точка на линии */}
                  <div className={`absolute -left-4 top-1.5 w-3 h-3 rounded-full border-2 ${
                    event.event_type === 'executed' ? 'bg-green-500 border-green-500' :
                    event.event_type === 'rejected' || event.event_type === 'failed' ? 'bg-red-500 border-red-500' :
                    event.event_type === 'rescheduled' ? 'bg-orange-500 border-orange-500' :
                    event.event_type === 'approved' ? 'bg-green-400 border-green-400' :
                    'bg-blue-400 border-blue-400'
                  }`} />

                  <div className="text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{event.event_type_display}</span>
                      {event.username && (
                        <span className="text-gray-500">— {event.username}</span>
                      )}
                      <span className="text-xs text-gray-400">
                        {new Date(event.created_at).toLocaleString('ru-RU')}
                      </span>
                    </div>

                    {event.event_type === 'rescheduled' && event.old_value && event.new_value && (
                      <div className="flex items-center gap-2 mt-1 text-xs text-orange-700 bg-orange-50 px-2 py-1 rounded">
                        <CalendarDays className="w-3 h-3" />
                        {event.old_value.payment_date}
                        <ArrowRight className="w-3 h-3" />
                        {event.new_value.payment_date}
                      </div>
                    )}

                    {event.comment && (
                      <div className="mt-1 text-gray-600 bg-gray-50 px-2 py-1 rounded text-xs">
                        {event.comment}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

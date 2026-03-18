import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, Payment, CreatePaymentData, ParseInvoiceResponse, InvoiceItem } from '../lib/api';
import { Loader2, Plus, Download, Search, Filter, X, TrendingUp, TrendingDown, ArrowRightLeft, ArrowUpCircle, ArrowDownCircle, ExternalLink } from 'lucide-react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { toast } from 'sonner';
import { ExcelExport } from './ExcelExport';
import { InvoiceUploader } from './payments/InvoiceUploader';
import { InvoiceItemsTable } from './payments/InvoiceItemsTable';
import { CounterpartySelector } from './payments/CounterpartySelector';
import { PaymentCreateForm } from './payments/PaymentCreateForm';
import { useAccounts, useExpenseCategories, useLegalEntities } from '../hooks';
import { CONSTANTS } from '../constants';
import { formatDate, formatAmount, getPaymentTypeBadgeClass, getPaymentStatusBadgeClass, getStatusLabel, getTypeLabel } from '../lib/utils';

export function Payments() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [filters, setFilters] = useState({
    payment_type: 'all',
    contract: 'all',
    account: 'all',
    category: 'all',
    status: 'all',
    payment_date_from: '',
    payment_date_to: '',
    is_internal_transfer: 'all',
  });
  
  // Form state
  const [formData, setFormData] = useState({
    payment_type: 'income' as 'income' | 'expense',
    account: '',
    contract: '',
    category: '',
    payment_date: '',
    amount_gross: '',
    amount_net: '',
    vat_amount: '',
    description: '',
    scan_file: null as File | null,
    is_internal_transfer: false,
    internal_transfer_group: '',
  });

  const queryClient = useQueryClient();

  // Загрузка данных
  const { data: paymentsResponse, isLoading: paymentsLoading } = useQuery({
    queryKey: ['payments', filters, searchQuery, currentPage, pageSize],
    queryFn: () => api.getPayments({
      payment_type: filters.payment_type !== 'all' ? filters.payment_type as 'income' | 'expense' : undefined,
      contract: filters.contract !== 'all' ? parseInt(filters.contract) : undefined,
      account: filters.account !== 'all' ? parseInt(filters.account) : undefined,
      category: filters.category !== 'all' ? parseInt(filters.category) : undefined,
      status: filters.status !== 'all' ? filters.status : undefined,
      payment_date_from: filters.payment_date_from || undefined,
      payment_date_to: filters.payment_date_to || undefined,
      search: searchQuery || undefined,
      is_internal_transfer: filters.is_internal_transfer !== 'all' ? filters.is_internal_transfer === 'true' : undefined,
      page: currentPage,
      page_size: pageSize,
    }),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  // Извлекаем массив payments из ответа API
  const payments = paymentsResponse?.results || [];

  // Справочники с кешированием
  const { data: accounts } = useAccounts();
  const { data: categories } = useExpenseCategories();
  const { data: legalEntities } = useLegalEntities();

  const { data: contracts } = useQuery({
    queryKey: ['contracts'],
    queryFn: () => api.getContracts(),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  // Авторасчет НДС при изменении суммы с НДС
  useEffect(() => {
    if (formData.amount_gross && parseFloat(formData.amount_gross) > 0) {
      const gross = parseFloat(formData.amount_gross);
      const net = gross / 1.20;
      const vat = gross - net;
      
      setFormData(prev => ({
        ...prev,
        amount_net: net.toFixed(2),
        vat_amount: vat.toFixed(2),
      }));
    }
  }, [formData.amount_gross]);

  // Сбрасываем страницу на 1 при изменении фильтров или поиска
  useEffect(() => {
    setCurrentPage(1);
  }, [filters, searchQuery]);

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (!data.scan_file) {
        throw new Error('Документ обязателен для всех платежей');
      }

      const payload: CreatePaymentData = {
        payment_type: data.payment_type,
        account_id: parseInt(data.account),
        category_id: parseInt(data.category),
        payment_date: data.payment_date,
        amount_gross: data.amount_gross,
        amount_net: data.amount_net,
        vat_amount: data.vat_amount,
        contract_id: data.contract ? parseInt(data.contract) : undefined,
        description: data.description || undefined,
        scan_file: data.scan_file,
        is_internal_transfer: data.is_internal_transfer,
        internal_transfer_group: data.internal_transfer_group || undefined,
      };

      // Получаем legal_entity из выбранного аккаунта
      const selectedAccount = accounts?.find(acc => acc.id === parseInt(data.account));
      if (selectedAccount?.legal_entity) {
        payload.legal_entity_id = selectedAccount.legal_entity;
      }

      return api.createPayment(payload);
    },
    onSuccess: (newPayment) => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      setIsCreateDialogOpen(false);
      
      // Разные сообщения для income и expense
      if (newPayment.payment_type === 'income') {
        toast.success('Платёж успешно проведён');
      } else {
        toast.success('Платёж создан и отправлен на согласование', {
          description: newPayment.payment_registry 
            ? 'Перейдите в Реестр платежей для согласования' 
            : undefined,
        });
      }
      
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(`Ошибка создания платежа: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!formData.account || !formData.category || !formData.payment_date || !formData.amount_gross) {
      toast.error('Заполните все обязательные поля');
      return;
    }

    if (!formData.scan_file) {
      toast.error('Документ (PDF) обязателен для всех платежей');
      return;
    }

    // Проверка требования договора для категории
    const selectedCategory = categories?.find(cat => cat.id === parseInt(formData.category));
    if (selectedCategory?.requires_contract && !formData.contract) {
      toast.error('Для данной категории требуется указать договор');
      return;
    }

    createMutation.mutate(formData);
  };

  const resetForm = () => {
    setFormData({
      payment_type: 'income',
      account: '',
      contract: '',
      category: '',
      payment_date: '',
      amount_gross: '',
      amount_net: '',
      vat_amount: '',
      description: '',
      scan_file: null,
      is_internal_transfer: false,
      internal_transfer_group: '',
    });
  };

  const getPaymentTypeLabel = (type: string) => {
    return type === 'income' ? 'Приход' : 'Расход';
  };

  const getPaymentTypeBadge = (type: string) => {
    return type === 'income' 
      ? 'bg-green-100 text-green-700' 
      : 'bg-red-100 text-red-700';
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return 'Ожидает согласования';
      case 'paid': return 'Проведён';
      case 'cancelled': return 'Отменён';
      default: return status;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-700';
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
          <h1 className="text-2xl mb-1">Платежи</h1>
          <p className="text-gray-500 text-sm">
            Управление приходами и расходами · Всего: {paymentsResponse?.count || 0} · 
            Показано: {payments?.length || 0} (стр. {currentPage} из {Math.ceil((paymentsResponse?.count || 0) / pageSize)})
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ExcelExport
            data={(payments || []).map(p => ({
              'Дата': formatDate(p.payment_date),
              'Тип': getPaymentTypeLabel(p.payment_type),
              'Счёт': p.account_name,
              'Договор': p.contract_name || '',
              'Номер договора': p.contract_number || '',
              'Категория': p.category_name,
              'Сумма с НДС': p.amount_gross,
              'Сумма без НДС': p.amount_net,
              'НДС': p.vat_amount,
              'Статус': getStatusLabel(p.status),
              'Внутренний перевод': p.is_internal_transfer ? 'Да' : 'Нет',
            }))}
            filename="Платежи"
            sheetName="Платежи"
          />
          <Button 
            onClick={() => {
              resetForm();
              setIsCreateDialogOpen(true);
            }} 
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Создать платёж
          </Button>
        </div>
      </div>

      {/* Фильтры */}
      <Card className="p-6 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-gray-500" />
          <h3 className="text-sm">Фильтры</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <div>
            <Label className="text-xs text-gray-600">Тип</Label>
            <Select
              value={filters.payment_type}
              onValueChange={(value) => setFilters({ ...filters, payment_type: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Все" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="income">Приход</SelectItem>
                <SelectItem value="expense">Расход</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-gray-600">Счёт</Label>
            <Select
              value={filters.account}
              onValueChange={(value) => setFilters({ ...filters, account: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Все" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                {accounts?.map((account) => (
                  <SelectItem key={account.id} value={account.id.toString()}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-gray-600">Договор</Label>
            <Select
              value={filters.contract}
              onValueChange={(value) => setFilters({ ...filters, contract: value })}
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

          <div>
            <Label className="text-xs text-gray-600">Категория</Label>
            <Select
              value={filters.category}
              onValueChange={(value) => setFilters({ ...filters, category: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Все" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                {categories?.map((category) => (
                  <SelectItem key={category.id} value={category.id.toString()}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-gray-600">Статус</Label>
            <Select
              value={filters.status}
              onValueChange={(value) => setFilters({ ...filters, status: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Все" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="pending">Ожидает</SelectItem>
                <SelectItem value="paid">Проведён</SelectItem>
                <SelectItem value="cancelled">Отменён</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-gray-600">Внутренний перевод</Label>
            <Select
              value={filters.is_internal_transfer}
              onValueChange={(value) => setFilters({ ...filters, is_internal_transfer: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Все" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="true">Только переводы</SelectItem>
                <SelectItem value="false">Без переводов</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-gray-600">Дата от</Label>
            <Input
              type="date"
              value={filters.payment_date_from}
              onChange={(e) => setFilters({ ...filters, payment_date_from: e.target.value })}
            />
          </div>

          <div>
            <Label className="text-xs text-gray-600">Дата до</Label>
            <Input
              type="date"
              value={filters.payment_date_to}
              onChange={(e) => setFilters({ ...filters, payment_date_to: e.target.value })}
            />
          </div>

          <div>
            <Label className="text-xs text-gray-600">Поиск</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Поиск..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </div>

        {(filters.payment_type || filters.account || filters.contract || filters.category || filters.status || filters.payment_date_from || filters.payment_date_to || filters.is_internal_transfer || searchQuery) && (
          <div className="mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFilters({
                  payment_type: 'all',
                  contract: 'all',
                  account: 'all',
                  category: 'all',
                  status: 'all',
                  payment_date_from: '',
                  payment_date_to: '',
                  is_internal_transfer: 'all',
                });
                setSearchQuery('');
              }}
            >
              Сбросить фильтры
            </Button>
          </div>
        )}
      </Card>

      {/* Таблица */}
      <Card className="p-6">
        {!payments || payments.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            Платежей не найдено. Создайте первый платёж.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Дата</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Тип</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Счёт</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Договор</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Категория</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">Сумма (Gross)</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">НДС</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">Статус</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-600">Документ</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr 
                    key={payment.id} 
                    className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => setSelectedPayment(payment)}
                  >
                    <td className="py-3 px-4 text-sm text-gray-600">{formatDate(payment.payment_date)}</td>
                    <td className="py-3 px-4 text-sm">
                      <Badge className={getPaymentTypeBadge(payment.payment_type)}>
                        {payment.payment_type === 'income' ? (
                          <ArrowUpCircle className="w-3 h-3 mr-1 inline" />
                        ) : (
                          <ArrowDownCircle className="w-3 h-3 mr-1 inline" />
                        )}
                        {getPaymentTypeLabel(payment.payment_type)}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">{payment.account_name}</td>
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
                    <td className="py-3 px-4 text-sm text-right font-medium">{formatAmount(payment.amount_gross)} ₽</td>
                    <td className="py-3 px-4 text-sm text-right text-gray-600">{formatAmount(payment.vat_amount)} ₽</td>
                    <td className="py-3 px-4 text-sm">
                      <Badge className={getStatusBadge(payment.status)}>
                        {getStatusLabel(payment.status)}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-sm text-center">
                      <div className="flex items-center justify-center gap-2">
                        {payment.scan_file && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(payment.scan_file, '_blank');
                            }}
                            className="inline-flex items-center gap-1"
                          >
                            <Download className="w-4 h-4" />
                            PDF
                          </Button>
                        )}
                        {payment.payment_type === 'expense' && payment.status === 'pending' && payment.payment_registry && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.location.href = `/payment-registry`;
                            }}
                            className="inline-flex items-center gap-1 text-blue-600"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Реестр
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        
        {/* Pagination */}
        {paymentsResponse && paymentsResponse.count > 0 && (
          <div className="mt-6 flex items-center justify-between border-t pt-4">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-gray-600">Записей на странице:</Label>
              <Select
                value={pageSize.toString()}
                onValueChange={(value) => {
                  setPageSize(parseInt(value));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                Предыдущая
              </Button>
              
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.ceil(paymentsResponse.count / pageSize) }, (_, i) => i + 1)
                  .filter(page => {
                    const totalPages = Math.ceil(paymentsResponse.count / pageSize);
                    // Показываем первую, последнюю, текущую и соседние страницы
                    return (
                      page === 1 ||
                      page === totalPages ||
                      (page >= currentPage - 1 && page <= currentPage + 1)
                    );
                  })
                  .map((page, index, array) => {
                    // Добавляем троеточие между разрывами
                    const prevPage = array[index - 1];
                    const showEllipsis = prevPage && page - prevPage > 1;
                    
                    return (
                      <div key={page} className="flex items-center gap-1">
                        {showEllipsis && <span className="px-2 text-gray-400">...</span>}
                        <Button
                          variant={currentPage === page ? "default" : "outline"}
                          size="sm"
                          onClick={() => setCurrentPage(page)}
                          className="w-10"
                        >
                          {page}
                        </Button>
                      </div>
                    );
                  })}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(Math.ceil(paymentsResponse.count / pageSize), prev + 1))}
                disabled={currentPage >= Math.ceil(paymentsResponse.count / pageSize)}
              >
                Следующая
              </Button>
            </div>

            <div className="text-xs text-gray-500">
              Записи {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, paymentsResponse.count)} из {paymentsResponse.count}
            </div>
          </div>
        )}
      </Card>

      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="bg-gray-50 rounded-2xl p-8 w-[calc(100vw-4rem)] max-w-[1200px] max-h-[95vh] overflow-y-auto sm:max-w-[1200px]">
          <DialogHeader className="mb-6">
            <DialogTitle className="text-2xl">Новый платёж</DialogTitle>
            <DialogDescription className="text-sm text-gray-500 mt-2">
              Для расходных платежей PDF-счёт обрабатывается автоматически с помощью AI.
            </DialogDescription>
          </DialogHeader>

          <PaymentCreateForm
            onSuccess={() => setIsCreateDialogOpen(false)}
            onCancel={() => setIsCreateDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Payment Detail Dialog */}
      {selectedPayment && (
        <Dialog open={!!selectedPayment} onOpenChange={() => setSelectedPayment(null)}>
          <DialogContent className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold mb-4">
                Детали платежа
                {selectedPayment.is_internal_transfer && (
                  <Badge className="bg-blue-100 text-blue-700 ml-2">Внутренний перевод</Badge>
                )}
              </DialogTitle>
              <DialogDescription className="text-sm text-gray-500">
                Подробная информация о платеже и связанных документах
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500">Дата</p>
                  <p className="font-medium">{formatDate(selectedPayment.payment_date)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Тип</p>
                  <Badge className={getPaymentTypeBadge(selectedPayment.payment_type)}>
                    {getPaymentTypeLabel(selectedPayment.payment_type)}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Счёт</p>
                  <p className="font-medium">{selectedPayment.account_name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Статус</p>
                  <Badge className={getStatusBadge(selectedPayment.status)}>
                    {getStatusLabel(selectedPayment.status)}
                  </Badge>
                </div>
                {selectedPayment.contract_name && (
                  <>
                    <div>
                      <p className="text-xs text-gray-500">Договор</p>
                      <p className="font-medium">{selectedPayment.contract_name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Номер договора</p>
                      <p className="font-medium">{selectedPayment.contract_number}</p>
                    </div>
                  </>
                )}
                <div>
                  <p className="text-xs text-gray-500">Категория</p>
                  <p className="font-medium">{selectedPayment.category_name}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Юр. лицо</p>
                  <p className="font-medium">{selectedPayment.legal_entity_name}</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="text-sm font-medium mb-3">Суммы</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-gray-500">Сумма с НДС</p>
                    <p className="text-lg font-medium">{formatAmount(selectedPayment.amount_gross)} ₽</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Сумма без НДС</p>
                    <p className="text-lg font-medium">{formatAmount(selectedPayment.amount_net)} ₽</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">НДС</p>
                    <p className="text-lg font-medium">{formatAmount(selectedPayment.vat_amount)} ₽</p>
                  </div>
                </div>
              </div>

              {selectedPayment.description && (
                <div className="border-t pt-4">
                  <p className="text-xs text-gray-500 mb-1">Описание</p>
                  <p className="text-sm">{selectedPayment.description}</p>
                </div>
              )}

              {selectedPayment.is_internal_transfer && (
                <div className="border-t pt-4">
                  <div className="flex flex-col gap-2">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Группа перевода</p>
                      <p className="font-medium">{selectedPayment.internal_transfer_group || '—'}</p>
                    </div>
                    {selectedPayment.internal_transfer_group && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          // Открываем список платежей с фильтром по группе
                          setSelectedPayment(null);
                          setFilters(prev => ({
                            ...prev,
                            payment_type: '',
                            contract: '',
                            account: '',
                            category: '',
                            status: '',
                            payment_date_from: '',
                            payment_date_to: '',
                            is_internal_transfer: 'true',
                          }));
                          // Устанавливаем фильтр через API
                          queryClient.invalidateQueries({ 
                            queryKey: ['payments'],
                            refetchType: 'all'
                          });
                          setTimeout(() => {
                            queryClient.setQueryData(['payments', filters, searchQuery], () => 
                              api.getPayments({ internal_transfer_group: selectedPayment.internal_transfer_group! })
                            );
                          }, 100);
                        }}
                        className="flex items-center gap-2 w-fit"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Показать связанные переводы
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {selectedPayment.payment_registry && (
                <div className="border-t pt-4">
                  <p className="text-xs text-gray-500 mb-1">Создан из реестра</p>
                  <p className="text-sm font-medium">Реестр платежей #{selectedPayment.payment_registry}</p>
                </div>
              )}

              {selectedPayment.scan_file && (
                <div className="border-t pt-4">
                  <p className="text-xs text-gray-500 mb-2">Скан документа</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(selectedPayment.scan_file, '_blank')}
                    className="flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Скачать документ
                  </Button>
                </div>
              )}

              {selectedPayment.items && selectedPayment.items.length > 0 && (
                <div className="border-t pt-4">
                  <h4 className="text-sm font-medium mb-3">Позиции товаров ({selectedPayment.items_count || selectedPayment.items.length})</h4>
                  <InvoiceItemsTable 
                    items={selectedPayment.items.map(item => ({
                      raw_name: item.raw_name,
                      quantity: item.quantity,
                      unit: item.unit,
                      price_per_unit: item.price_per_unit,
                      amount: item.amount,
                    }))}
                    readonly={true}
                  />
                </div>
              )}

              <div className="border-t pt-4 text-xs text-gray-500">
                <p>Создан: {formatDate(selectedPayment.created_at)}</p>
                <p>Обновлён: {formatDate(selectedPayment.updated_at)}</p>
              </div>
            </div>

            <div className="flex justify-end mt-6">
              <Button variant="outline" onClick={() => setSelectedPayment(null)}>
                Закрыть
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
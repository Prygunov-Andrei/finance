import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, CreatePaymentData, ParseInvoiceResponse, InvoiceItem } from '../../lib/api';
import { formatAmount } from '../../lib/utils';
import { CONSTANTS } from '../../constants';
import { useAccounts, useExpenseCategories, useLegalEntities } from '../../hooks';
import { Loader2, AlertCircle, FileText, Building2, Calendar, DollarSign, Hash, Receipt, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';
import { Alert, AlertDescription } from '../ui/alert';
import { toast } from 'sonner';
import { InvoiceUploader } from './InvoiceUploader';
import { InvoiceItemsTable } from './InvoiceItemsTable';
import { CounterpartySelector } from './CounterpartySelector';

interface PaymentCreateFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function PaymentCreateForm({ onSuccess, onCancel }: PaymentCreateFormProps) {
  const queryClient = useQueryClient();

  // Form state
  const [formData, setFormData] = useState({
    payment_type: 'income' as 'income' | 'expense',
    counterparty: null as number | null,
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

  // Parse state
  const [parseData, setParseData] = useState<ParseInvoiceResponse | null>(null);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Data queries - используем хуки для справочных данных
  const { data: accounts, error: accountsError } = useAccounts();
  const { data: categories, error: categoriesError } = useExpenseCategories();
  const { data: legalEntities, error: legalEntitiesError } = useLegalEntities();

  const { data: contracts, error: contractsError } = useQuery({
    queryKey: ['contracts'],
    queryFn: () => api.getContracts(),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
    retry: false,
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

  // Обработчик успешного парсинга
  const handleParsed = (data: ParseInvoiceResponse) => {
    setParseData(data);

    if (!data.success || !data.data) return;

    // Предзаполняем форму
    const parsed = data.data;
    const matches = data.matches;

    // 1. Контрагент
    if (matches?.vendor.match_type === 'exact' && matches.vendor.counterparty_id) {
      setFormData(prev => ({ ...prev, counterparty: matches.vendor.counterparty_id }));
    }

    // 2. Наша компания (legal_entity через account)
    if (matches?.buyer.match_type === 'exact' && matches.buyer.legal_entity_id) {
      // Находим счет с этим legal_entity
      const matchedAccount = accounts?.find(acc => acc.legal_entity === matches.buyer.legal_entity_id);
      if (matchedAccount) {
        setFormData(prev => ({ ...prev, account: matchedAccount.id.toString() }));
      }
    } else if (matches?.buyer.match_type === 'not_found') {
      toast.error('Юридическое лицо не найдено в системе', {
        description: matches.buyer.error || 'Добавьте юрлицо в настройках',
      });
    }

    // 3. Суммы
    setFormData(prev => ({
      ...prev,
      amount_gross: parsed.totals.amount_gross,
      vat_amount: parsed.totals.vat_amount,
    }));

    // 4. Дата и номер счёта
    setFormData(prev => ({
      ...prev,
      payment_date: parsed.invoice.date,
      description: `Счёт №${parsed.invoice.number}`,
    }));

    // 5. Позиции товаров
    setInvoiceItems(parsed.items.map(item => ({
      raw_name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      price_per_unit: item.price_per_unit,
    })));

    // Проверка низкой уверенности
    if (parsed.confidence < 0.7) {
      toast.warning('⚠️ Низкая точность распознавания. Пожалуйста, проверьте все данные.');
    }
  };

  const handleParseError = (error: string) => {
    toast.error(error);
  };

  // Обработчик создания нового контрагента
  const handleCreateCounterparty = async (data: { name: string; inn: string; kpp?: string }) => {
    try {
      const counterpartyData: any = {
        name: data.name.trim(),
        inn: data.inn.trim(),
        legal_form: 'ooo', // Используем lowercase латиницу, как в основной форме
        type: 'vendor',
      };
      
      // Добавляем kpp только если оно не пустое
      if (data.kpp && data.kpp.trim()) {
        counterpartyData.kpp = data.kpp.trim();
      }
      
      const newCounterparty = await api.createCounterparty(counterpartyData);
      
      queryClient.invalidateQueries({ queryKey: ['counterparties'] });
      setFormData(prev => ({ ...prev, counterparty: newCounterparty.id }));
      toast.success('Контрагент успешно создан');
    } catch (error: any) {
      toast.error(`Ошибка создания контрагента: ${error.message}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
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

    setIsSubmitting(true);

    try {
      const payload: CreatePaymentData = {
        payment_type: formData.payment_type,
        account_id: parseInt(formData.account),
        category_id: parseInt(formData.category),
        payment_date: formData.payment_date,
        amount_gross: formData.amount_gross,
        amount_net: formData.amount_net,
        vat_amount: formData.vat_amount,
        contract_id: formData.contract ? parseInt(formData.contract) : undefined,
        description: formData.description || undefined,
        scan_file: formData.scan_file,
        is_internal_transfer: formData.is_internal_transfer,
        internal_transfer_group: formData.internal_transfer_group || undefined,
      };

      // Получаем legal_entity из выбранного аккаунта
      const selectedAccount = accounts?.find(acc => acc.id === parseInt(formData.account));
      if (selectedAccount?.legal_entity) {
        payload.legal_entity_id = selectedAccount.legal_entity;
      }

      // Добавляем позиции товаров для expense
      if (formData.payment_type === 'expense' && invoiceItems.length > 0) {
        payload.items_input = invoiceItems.map(item => ({
          raw_name: item.raw_name,
          quantity: item.quantity,
          unit: item.unit,
          price_per_unit: item.price_per_unit,
          vat_amount: item.vat_amount,
        }));
      }

      const newPayment = await api.createPayment(payload);

      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['accounts'] });

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

      onSuccess();
    } catch (error: any) {
      toast.error(`Ошибка создания платежа: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Тип платежа - минималистичный переключатель iOS */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <Label className="text-base">Тип платежа</Label>
              <p className="text-xs text-gray-500 mt-0.5">
                {formData.payment_type === 'income' 
                  ? 'Платёж будет проведён сразу' 
                  : 'Платёж будет отправлен на согласование в Реестр'}
              </p>
            </div>
          </div>
          
          {/* iOS-style Segmented Control */}
          <div className="relative bg-gray-100 rounded-xl p-1 flex">
            {/* Animated slider background */}
            <div 
              className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white rounded-lg shadow-sm transition-all duration-300 ease-out ${
                formData.payment_type === 'income' ? 'left-1' : 'left-[calc(50%+4px-1px)]'
              }`}
            />
            
            {/* Income button */}
            <button
              type="button"
              onClick={() => {
                setFormData({ ...formData, payment_type: 'income' });
                setParseData(null);
                setInvoiceItems([]);
              }}
              className="relative flex-1 py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 z-10"
            >
              <ArrowDownCircle className={`w-4 h-4 transition-colors duration-200 ${
                formData.payment_type === 'income' ? 'text-green-600' : 'text-gray-400'
              }`} />
              <span className={`text-sm transition-colors duration-200 ${
                formData.payment_type === 'income' ? 'text-gray-900' : 'text-gray-500'
              }`}>
                Приход
              </span>
            </button>
            
            {/* Expense button */}
            <button
              type="button"
              onClick={() => setFormData({ ...formData, payment_type: 'expense' })}
              className="relative flex-1 py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 z-10"
            >
              <ArrowUpCircle className={`w-4 h-4 transition-colors duration-200 ${
                formData.payment_type === 'expense' ? 'text-red-600' : 'text-gray-400'
              }`} />
              <span className={`text-sm transition-colors duration-200 ${
                formData.payment_type === 'expense' ? 'text-gray-900' : 'text-gray-500'
              }`}>
                Расход
              </span>
            </button>
          </div>
        </div>

        {/* Документ */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <Label className="text-base">Документ</Label>
          </div>
          
          <InvoiceUploader
            onParsed={handleParsed}
            onError={handleParseError}
            onFileSelected={(file) => setFormData({ ...formData, scan_file: file })}
            disabled={isSubmitting}
            enableParsing={formData.payment_type === 'expense'}
          />
          {formData.scan_file && !parseData && (
            <p className="text-xs text-gray-500 mt-2">
              Файл загружен: {formData.scan_file.name}
            </p>
          )}
        </div>

        {/* Информация о парсинге */}
        {parseData?.from_cache && (
          <Alert className="border-blue-200 bg-blue-50 rounded-2xl">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800 text-sm">
              Данные загружены из кеша (документ уже обрабатывался ранее)
            </AlertDescription>
          </Alert>
        )}

        {/* Контрагент для expense */}
        {formData.payment_type === 'expense' && parseData && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-purple-600" />
              </div>
              <Label className="text-base">Контрагент</Label>
            </div>
            <CounterpartySelector
              value={formData.counterparty}
              onChange={(id) => setFormData({ ...formData, counterparty: id })}
              suggestions={parseData.matches?.vendor.suggestions || []}
              parsedVendor={parseData.data?.vendor}
              onCreateNew={handleCreateCounterparty}
              disabled={isSubmitting}
            />
          </div>
        )}

        {/* Основная информация */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-indigo-600" />
            </div>
            <Label className="text-base">Основная информация</Label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="account" className="text-sm mb-2 block">Счёт *</Label>
              <Select 
                value={formData.account} 
                onValueChange={(value) => setFormData({ ...formData, account: value })}
                required
              >
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Выберите счёт" />
                </SelectTrigger>
                <SelectContent>
                  {accounts && Array.isArray(accounts) && accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id.toString()}>
                      {account.name} ({formatAmount(account.current_balance || account.initial_balance || account.balance || '0')} {account.currency})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="category" className="text-sm mb-2 block">Категория *</Label>
              <Select 
                value={formData.category}
                onValueChange={(value) => setFormData({ ...formData, category: value })}
                required
              >
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Выберите категорию" />
                </SelectTrigger>
                <SelectContent>
                  {categories && Array.isArray(categories) && categories.map((category) => (
                    <SelectItem key={category.id} value={category.id.toString()}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="contract" className="text-sm mb-2 block">Договор</Label>
              <Select 
                value={formData.contract}
                onValueChange={(value) => setFormData({ ...formData, contract: value })}
              >
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Выберите договор" />
                </SelectTrigger>
                <SelectContent>
                  {contracts && Array.isArray(contracts) && contracts.map((contract) => (
                    <SelectItem key={contract.id} value={contract.id.toString()}>
                      {contract.number} - {contract.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="payment_date" className="text-sm mb-2 block">Дата платежа *</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <Input
                  id="payment_date"
                  type="date"
                  value={formData.payment_date}
                  onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
                  required
                  className="h-12 pl-11"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Суммы */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-emerald-600" />
            </div>
            <Label className="text-base">Суммы</Label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <Label htmlFor="amount_gross" className="text-sm mb-2 block">Сумма с НДС *</Label>
              <Input
                id="amount_gross"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.amount_gross}
                onChange={(e) => setFormData({ ...formData, amount_gross: e.target.value })}
                required
                className="h-12"
              />
              <p className="text-xs text-gray-500 mt-1.5">НДС 20% рассчитывается автоматически</p>
            </div>

            <div>
              <Label htmlFor="amount_net" className="text-sm mb-2 block">Сумма без НДС</Label>
              <Input
                id="amount_net"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.amount_net}
                onChange={(e) => setFormData({ ...formData, amount_net: e.target.value })}
                readOnly
                className="h-12 bg-gray-50"
              />
            </div>

            <div>
              <Label htmlFor="vat_amount" className="text-sm mb-2 block">Сумма НДС</Label>
              <Input
                id="vat_amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.vat_amount}
                onChange={(e) => setFormData({ ...formData, vat_amount: e.target.value })}
                readOnly
                className="h-12 bg-gray-50"
              />
            </div>
          </div>
        </div>

        {/* Описание */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <Label htmlFor="description" className="text-sm mb-3 block">Описание</Label>
          <Textarea
            id="description"
            placeholder="Введите описание платежа..."
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={4}
            className="resize-none"
          />
        </div>

        {/* Отображение позиций товаров */}
        {invoiceItems.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                <Hash className="w-5 h-5 text-amber-600" />
              </div>
              <Label className="text-base">Позиции товаров</Label>
            </div>
            <InvoiceItemsTable items={invoiceItems} readonly />
          </div>
        )}

        {/* Внутренний перевод */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3 mb-4">
            <input
              id="is_internal_transfer"
              type="checkbox"
              checked={formData.is_internal_transfer}
              onChange={(e) => setFormData({ ...formData, is_internal_transfer: e.target.checked })}
              className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
            />
            <div>
              <Label htmlFor="is_internal_transfer" className="cursor-pointer text-sm">
                Внутренний перевод
              </Label>
              <p className="text-xs text-gray-500 mt-0.5">Перевод между своими счетами</p>
            </div>
          </div>

          {formData.is_internal_transfer && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <Label htmlFor="internal_transfer_group" className="text-sm mb-2 block">Группа перевода</Label>
              <Input
                id="internal_transfer_group"
                type="text"
                placeholder="transfer-2025-01-15"
                value={formData.internal_transfer_group}
                onChange={(e) => setFormData({ ...formData, internal_transfer_group: e.target.value })}
                className="h-12"
              />
              <p className="text-xs text-gray-500 mt-1.5">
                Укажите одинаковую группу для связанных переводов
              </p>
            </div>
          )}
        </div>

        {/* Кнопки */}
        <div className="flex gap-4 pt-2">
          <Button 
            type="submit" 
            disabled={isSubmitting} 
            className="flex-1 h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-xl"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Создание...
              </>
            ) : (
              'Создать платёж'
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="flex-1 h-12 rounded-xl border-gray-200 hover:bg-gray-50"
            disabled={isSubmitting}
          >
            Отмена
          </Button>
        </div>
      </form>
    </div>
  );
}
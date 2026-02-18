import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Truck,
  FileCheck,
  Building2,
  Package,
  ArrowLeftRight,
  Upload,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { api } from '../../lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';

const INVOICE_TYPES = [
  {
    value: 'supplier',
    title: 'От Поставщика',
    description: 'Внешний счёт от поставщика',
    icon: Truck,
  },
  {
    value: 'act_based',
    title: 'По Акту',
    description: 'Оплата по Акту выполненных работ',
    icon: FileCheck,
  },
  {
    value: 'household',
    title: 'Хозяйственная деятельность',
    description: 'Хозяйственные расходы',
    icon: Building2,
  },
  {
    value: 'warehouse',
    title: 'Закупка на склад',
    description: 'Закупка материалов на склад',
    icon: Package,
  },
  {
    value: 'internal_transfer',
    title: 'Внутренний перевод',
    description: 'Перевод между счетами / юр. лицами',
    icon: ArrowLeftRight,
  },
] as const;

type InvoiceType = (typeof INVOICE_TYPES)[number]['value'];

interface InvoiceCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

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

export const InvoiceCreateDialog = ({ open, onOpenChange }: InvoiceCreateDialogProps) => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<'type' | 'form'>('type');
  const [invoiceType, setInvoiceType] = useState<InvoiceType | null>(null);

  const [amountGross, setAmountGross] = useState('');
  const [vatAmount, setVatAmount] = useState('');
  const [vatManual, setVatManual] = useState(false);
  const [description, setDescription] = useState('');
  const [accountId, setAccountId] = useState('');
  const [legalEntityId, setLegalEntityId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [isDebt, setIsDebt] = useState(false);
  const [debtExplanation, setDebtExplanation] = useState('');
  const [skipRecognition, setSkipRecognition] = useState(false);

  const [objectId, setObjectId] = useState('');
  const [contractId, setContractId] = useState('');
  const [counterpartyId, setCounterpartyId] = useState('');
  const [actId, setActId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [targetCategoryId, setTargetCategoryId] = useState('');
  const [targetLegalEntityId, setTargetLegalEntityId] = useState('');

  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const [balanceWarning, setBalanceWarning] = useState<string | null>(null);
  const [balanceChecked, setBalanceChecked] = useState(false);

  const amountNet = (() => {
    const gross = parseFloat(amountGross) || 0;
    const vat = parseFloat(vatAmount) || 0;
    return (gross - vat).toFixed(2);
  })();

  useEffect(() => {
    if (vatManual) return;
    const gross = parseFloat(amountGross) || 0;
    setVatAmount((gross * 20 / 120).toFixed(2));
  }, [amountGross, vatManual]);

  useEffect(() => {
    setContractId('');
    setActId('');
  }, [objectId]);

  useEffect(() => {
    setActId('');
  }, [contractId]);

  const resetForm = useCallback(() => {
    setStep('type');
    setInvoiceType(null);
    setAmountGross('');
    setVatAmount('');
    setVatManual(false);
    setDescription('');
    setAccountId('');
    setLegalEntityId('');
    setDueDate('');
    setIsDebt(false);
    setDebtExplanation('');
    setSkipRecognition(false);
    setObjectId('');
    setContractId('');
    setCounterpartyId('');
    setActId('');
    setCategoryId('');
    setTargetCategoryId('');
    setTargetLegalEntityId('');
    setInvoiceFile(null);
    setBalanceWarning(null);
    setBalanceChecked(false);
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  };

  const { data: accountsData } = useQuery({
    queryKey: ['accounts-all'],
    queryFn: () => api.getAccounts(),
    enabled: step === 'form',
  });
  const accounts: any[] = Array.isArray(accountsData)
    ? accountsData
    : (accountsData as any)?.results ?? [];

  const { data: legalEntitiesData } = useQuery({
    queryKey: ['legal-entities'],
    queryFn: () => api.getLegalEntities(),
    enabled: step === 'form',
  });
  const legalEntities: any[] = Array.isArray(legalEntitiesData)
    ? legalEntitiesData
    : (legalEntitiesData as any)?.results ?? [];

  const { data: objectsData } = useQuery({
    queryKey: ['objects'],
    queryFn: () => api.getObjects(),
    enabled: step === 'form' && (invoiceType === 'supplier' || invoiceType === 'act_based'),
  });
  const objects: any[] = Array.isArray(objectsData)
    ? objectsData
    : (objectsData as any)?.results ?? [];

  const { data: contractsData } = useQuery({
    queryKey: ['contracts', objectId, invoiceType],
    queryFn: () =>
      api.getContracts({
        object: objectId ? Number(objectId) : undefined,
        contract_type: invoiceType === 'act_based' ? 'expense' : undefined,
      }),
    enabled:
      step === 'form' &&
      (invoiceType === 'supplier' || invoiceType === 'act_based') &&
      !!objectId,
  });
  const contracts: any[] = Array.isArray(contractsData)
    ? contractsData
    : (contractsData as any)?.results ?? [];

  const { data: counterpartiesData } = useQuery({
    queryKey: ['counterparties'],
    queryFn: () => api.getCounterparties(),
    enabled: step === 'form' && (invoiceType === 'supplier' || invoiceType === 'warehouse'),
  });
  const counterparties: any[] = Array.isArray(counterpartiesData)
    ? counterpartiesData
    : (counterpartiesData as any)?.results ?? [];

  const { data: actsData } = useQuery({
    queryKey: ['acts', contractId],
    queryFn: () => api.getActs(Number(contractId)),
    enabled: step === 'form' && invoiceType === 'act_based' && !!contractId,
  });
  const acts: any[] = Array.isArray(actsData) ? actsData : (actsData as any)?.results ?? [];

  const { data: categoriesData } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => api.getExpenseCategories(),
    enabled:
      step === 'form' &&
      (invoiceType === 'household' || invoiceType === 'internal_transfer'),
  });
  const categories: any[] = Array.isArray(categoriesData)
    ? categoriesData
    : (categoriesData as any)?.results ?? [];

  useEffect(() => {
    if (invoiceType !== 'act_based' || !actId) return;
    const selectedAct = acts.find((a: any) => String(a.id) === actId);
    if (selectedAct?.amount_gross) {
      setAmountGross(selectedAct.amount_gross);
    }
  }, [actId, acts, invoiceType]);

  const handleCheckBalance = async () => {
    if (!objectId || !amountGross) return;
    try {
      const result: any = await (api as any).request(
        `/invoices/check_balance/?object_id=${objectId}&amount=${amountGross}`
      );
      if (result && !result.sufficient) {
        setBalanceWarning(
          `Недостаточно средств на объекте. Доступно: ${formatCurrency(result.available)}, требуется: ${formatCurrency(amountGross)}`
        );
      } else {
        setBalanceWarning(null);
      }
      setBalanceChecked(true);
    } catch {
      setBalanceChecked(true);
    }
  };

  const createMutation = useMutation({
    mutationFn: (formData: FormData) => (api as any).createInvoice(formData),
    onSuccess: () => {
      toast.success('Счёт создан');
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      handleOpenChange(false);
    },
    onError: (error: any) => {
      toast.error('Ошибка создания счёта', {
        description: error?.message || 'Попробуйте ещё раз',
      });
    },
  });

  const handleSubmit = async () => {
    if ((invoiceType === 'supplier' || invoiceType === 'act_based') && objectId && !balanceChecked) {
      await handleCheckBalance();
    }

    const formData = new FormData();
    if (invoiceType) formData.append('invoice_type', invoiceType);
    if (amountGross) formData.append('amount_gross', amountGross);
    if (vatAmount) formData.append('vat_amount', vatAmount);
    if (description) formData.append('description', description);
    if (accountId) formData.append('account', accountId);
    if (legalEntityId) formData.append('legal_entity', legalEntityId);
    if (dueDate) formData.append('due_date', dueDate);
    formData.append('is_debt', String(isDebt));
    if (isDebt && debtExplanation) formData.append('debt_explanation', debtExplanation);
    if (invoiceType === 'supplier' && skipRecognition) {
      formData.append('skip_recognition', 'true');
    }

    if (objectId) formData.append('object', objectId);
    if (contractId) formData.append('contract', contractId);
    if (counterpartyId) formData.append('counterparty', counterpartyId);
    if (actId) formData.append('act', actId);
    if (categoryId) formData.append('category', categoryId);
    if (targetCategoryId) formData.append('target_internal_account', targetCategoryId);
    if (targetLegalEntityId) formData.append('target_legal_entity', targetLegalEntityId);
    if (invoiceFile) formData.append('invoice_file', invoiceFile);

    createMutation.mutate(formData);
  };

  const handleTypeSelect = (type: InvoiceType) => {
    setInvoiceType(type);
    setStep('form');
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) {
      setInvoiceFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setInvoiceFile(e.target.files[0]);
    }
  };

  const showObjectField = invoiceType === 'supplier' || invoiceType === 'act_based';
  const showContractField = invoiceType === 'supplier' || invoiceType === 'act_based';
  const showCounterpartyField = invoiceType === 'supplier' || invoiceType === 'warehouse';
  const showFileUpload = invoiceType === 'supplier' || invoiceType === 'warehouse';
  const showActField = invoiceType === 'act_based';
  const showCategoryField = invoiceType === 'household';
  const showInternalFields = invoiceType === 'internal_transfer';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={step === 'form' ? 'sm:max-w-2xl max-h-[90vh] overflow-y-auto' : 'sm:max-w-2xl'}>
        <DialogHeader>
          <DialogTitle>
            {step === 'type' ? 'Создание счёта' : `Новый счёт: ${INVOICE_TYPES.find((t) => t.value === invoiceType)?.title}`}
          </DialogTitle>
          <DialogDescription>
            {step === 'type'
              ? 'Выберите тип создаваемого счёта'
              : 'Заполните данные счёта'}
          </DialogDescription>
        </DialogHeader>

        {step === 'type' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            {INVOICE_TYPES.map(({ value, title, description: desc, icon: Icon }) => (
              <button
                key={value}
                onClick={() => handleTypeSelect(value)}
                className="flex items-start gap-3 p-4 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50/50 transition-colors text-left group"
                aria-label={title}
              >
                <div className="p-2 rounded-md bg-gray-100 group-hover:bg-blue-100 transition-colors shrink-0">
                  <Icon className="h-5 w-5 text-gray-600 group-hover:text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900 text-sm">{title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {step === 'form' && (
          <div className="space-y-5 pt-2">
            {showFileUpload && (
              <div>
                <Label>Файл счёта</Label>
                <div
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`mt-1.5 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                    dragActive
                      ? 'border-blue-400 bg-blue-50'
                      : invoiceFile
                        ? 'border-green-300 bg-green-50'
                        : 'border-gray-300 hover:border-gray-400'
                  }`}
                  role="button"
                  tabIndex={0}
                  aria-label="Загрузить файл счёта"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') fileInputRef.current?.click();
                  }}
                >
                  <Upload className="h-6 w-6 mx-auto mb-2 text-gray-400" />
                  {invoiceFile ? (
                    <p className="text-sm text-green-700">{invoiceFile.name}</p>
                  ) : (
                    <p className="text-sm text-gray-500">
                      Перетащите файл или нажмите для выбора
                    </p>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileChange}
                    accept=".pdf,.jpg,.jpeg,.png,.heic"
                  />
                </div>
              </div>
            )}

            {showObjectField && (
              <div>
                <Label htmlFor="object-select">Объект</Label>
                <Select value={objectId} onValueChange={setObjectId}>
                  <SelectTrigger id="object-select" className="mt-1.5" aria-label="Объект">
                    <SelectValue placeholder="Выберите объект" />
                  </SelectTrigger>
                  <SelectContent>
                    {objects.map((obj: any) => (
                      <SelectItem key={obj.id} value={String(obj.id)}>
                        {obj.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {showContractField && objectId && (
              <div>
                <Label htmlFor="contract-select">Договор</Label>
                <Select value={contractId} onValueChange={setContractId}>
                  <SelectTrigger id="contract-select" className="mt-1.5" aria-label="Договор">
                    <SelectValue placeholder="Выберите договор" />
                  </SelectTrigger>
                  <SelectContent>
                    {contracts.map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.number} — {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {showActField && contractId && (
              <div>
                <Label htmlFor="act-select">Акт</Label>
                <Select
                  value={actId}
                  onValueChange={setActId}
                >
                  <SelectTrigger id="act-select" className="mt-1.5" aria-label="Акт">
                    <SelectValue placeholder="Выберите акт" />
                  </SelectTrigger>
                  <SelectContent>
                    {acts.map((a: any) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        Акт {a.number} — {formatCurrency(a.amount_gross)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {showCounterpartyField && (
              <div>
                <Label htmlFor="counterparty-select">Контрагент</Label>
                <Select value={counterpartyId} onValueChange={setCounterpartyId}>
                  <SelectTrigger id="counterparty-select" className="mt-1.5" aria-label="Контрагент">
                    <SelectValue placeholder="Выберите контрагента" />
                  </SelectTrigger>
                  <SelectContent>
                    {counterparties.map((cp: any) => (
                      <SelectItem key={cp.id} value={String(cp.id)}>
                        {cp.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {showCategoryField && (
              <div>
                <Label htmlFor="category-select">Статья расходов</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger id="category-select" className="mt-1.5" aria-label="Статья расходов">
                    <SelectValue placeholder="Выберите статью" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories
                      .filter((c: any) => c.account_type === 'expense' || !c.account_type)
                      .map((c: any) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {showInternalFields && (
              <>
                <div>
                  <Label htmlFor="from-category-select">Со счёта (категория)</Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger id="from-category-select" className="mt-1.5" aria-label="Со счёта">
                      <SelectValue placeholder="Откуда" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c: any) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="to-category-select">На счёт (категория)</Label>
                  <Select value={targetCategoryId} onValueChange={setTargetCategoryId}>
                    <SelectTrigger id="to-category-select" className="mt-1.5" aria-label="На счёт">
                      <SelectValue placeholder="Куда" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c: any) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="target-le-select">Или: целевое юр. лицо</Label>
                  <Select value={targetLegalEntityId} onValueChange={setTargetLegalEntityId}>
                    <SelectTrigger id="target-le-select" className="mt-1.5" aria-label="Целевое юр. лицо">
                      <SelectValue placeholder="Юр. лицо получатель" />
                    </SelectTrigger>
                    <SelectContent>
                      {legalEntities.map((le: any) => (
                        <SelectItem key={le.id} value={String(le.id)}>
                          {le.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {invoiceType === 'warehouse' && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Распознавание товаров</AlertTitle>
                <AlertDescription>
                  Требуется распознавание товаров из загруженного файла
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="amount-gross">Сумма (с НДС)</Label>
                <Input
                  id="amount-gross"
                  type="number"
                  step="0.01"
                  value={amountGross}
                  onChange={(e) => setAmountGross(e.target.value)}
                  placeholder="0.00"
                  className="mt-1.5"
                  required
                  aria-label="Сумма с НДС"
                />
              </div>
              <div>
                <Label htmlFor="vat-amount">
                  НДС
                  <button
                    type="button"
                    onClick={() => setVatManual(!vatManual)}
                    className="ml-2 text-xs text-blue-600 hover:underline"
                  >
                    {vatManual ? 'авто' : 'вручную'}
                  </button>
                </Label>
                <Input
                  id="vat-amount"
                  type="number"
                  step="0.01"
                  value={vatAmount}
                  onChange={(e) => {
                    setVatManual(true);
                    setVatAmount(e.target.value);
                  }}
                  placeholder="0.00"
                  className="mt-1.5"
                  readOnly={!vatManual}
                  aria-label="Сумма НДС"
                />
              </div>
              <div>
                <Label>Без НДС</Label>
                <Input
                  value={amountNet}
                  readOnly
                  className="mt-1.5 bg-gray-50"
                  tabIndex={-1}
                  aria-label="Сумма без НДС"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="description">Описание</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Комментарий к счёту"
                rows={2}
                className="mt-1.5"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="account-select">Счёт для оплаты</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger id="account-select" className="mt-1.5" aria-label="Счёт для оплаты">
                    <SelectValue placeholder="Выберите счёт" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((acc: any) => (
                      <SelectItem key={acc.id} value={String(acc.id)}>
                        {acc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="le-select">Юр. лицо</Label>
                <Select value={legalEntityId} onValueChange={setLegalEntityId}>
                  <SelectTrigger id="le-select" className="mt-1.5" aria-label="Юридическое лицо">
                    <SelectValue placeholder="Выберите юр. лицо" />
                  </SelectTrigger>
                  <SelectContent>
                    {legalEntities.map((le: any) => (
                      <SelectItem key={le.id} value={String(le.id)}>
                        {le.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="due-date">Срок оплаты</Label>
              <Input
                id="due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1.5 w-48"
                aria-label="Срок оплаты"
              />
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  id="is-debt"
                  checked={isDebt}
                  onCheckedChange={setIsDebt}
                  aria-label="Долговой счёт"
                />
                <Label htmlFor="is-debt">Долговой счёт</Label>
              </div>
              {invoiceType === 'supplier' && (
                <div className="flex items-center gap-2">
                  <Switch
                    id="skip-recognition"
                    checked={skipRecognition}
                    onCheckedChange={setSkipRecognition}
                    aria-label="Пропустить распознавание"
                  />
                  <Label htmlFor="skip-recognition">Пропустить распознавание</Label>
                </div>
              )}
            </div>

            {isDebt && (
              <div>
                <Label htmlFor="debt-explanation">Пояснение к долгу</Label>
                <Textarea
                  id="debt-explanation"
                  value={debtExplanation}
                  onChange={(e) => setDebtExplanation(e.target.value)}
                  placeholder="Почему счёт долговой?"
                  rows={2}
                  className="mt-1.5"
                />
              </div>
            )}

            {balanceWarning && (
              <Alert className="border-yellow-300 bg-yellow-50">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <AlertTitle className="text-yellow-800">Внимание</AlertTitle>
                <AlertDescription className="text-yellow-700">
                  {balanceWarning}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex items-center justify-between pt-2 border-t">
              <Button variant="outline" onClick={() => setStep('type')}>
                Назад
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!amountGross || createMutation.isPending}
              >
                {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Создать счёт
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

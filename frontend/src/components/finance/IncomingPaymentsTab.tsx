import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plus,
  Upload,
  Loader2,
  FileText,
  Inbox,
  Banknote,
} from 'lucide-react';
import { api } from '../../lib/api';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';
import { Skeleton } from '../ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

const INCOME_TYPE_LABELS: Record<string, string> = {
  customer_act: 'Оплата по акту',
  advance: 'Аванс',
  warranty_return: 'Возврат гарантии',
  supplier_return: 'Возврат от поставщика',
  bank_interest: 'Банковский процент',
  other: 'Прочее',
};

const CUSTOMER_TYPES = ['customer_act', 'advance', 'warranty_return'];

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

export const IncomingPaymentsTab = () => {
  const queryClient = useQueryClient();
  const [sectionTab, setSectionTab] = useState('manual');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const [incomeType, setIncomeType] = useState('');
  const [objectId, setObjectId] = useState('');
  const [contractId, setContractId] = useState('');
  const [actId, setActId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [legalEntityId, setLegalEntityId] = useState('');
  const [counterpartyId, setCounterpartyId] = useState('');
  const [amount, setAmount] = useState('');
  const [incomeDate, setIncomeDate] = useState('');
  const [description, setDescription] = useState('');
  const [isCash, setIsCash] = useState(false);

  const isCustomerType = CUSTOMER_TYPES.includes(incomeType);

  const { data: recordsData, isLoading: recordsLoading } = useQuery({
    queryKey: ['income-records'],
    queryFn: () => (api as any).getIncomeRecords(),
  });
  const records: any[] = recordsData?.results ?? [];

  const { data: cashRecordsData } = useQuery({
    queryKey: ['income-records-cash'],
    queryFn: () => (api as any).getIncomeRecords('is_cash=true'),
  });
  const cashRecords: any[] = cashRecordsData?.results ?? [];

  const { data: accountsData } = useQuery({
    queryKey: ['accounts-all'],
    queryFn: () => api.getAccounts(),
    enabled: createDialogOpen,
  });
  const accounts: any[] = Array.isArray(accountsData)
    ? accountsData
    : (accountsData as any)?.results ?? [];

  const { data: legalEntitiesData } = useQuery({
    queryKey: ['legal-entities'],
    queryFn: () => api.getLegalEntities(),
    enabled: createDialogOpen,
  });
  const legalEntities: any[] = Array.isArray(legalEntitiesData)
    ? legalEntitiesData
    : (legalEntitiesData as any)?.results ?? [];

  const { data: objectsData } = useQuery({
    queryKey: ['objects'],
    queryFn: () => api.getObjects(),
    enabled: createDialogOpen && isCustomerType,
  });
  const objects: any[] = Array.isArray(objectsData)
    ? objectsData
    : (objectsData as any)?.results ?? [];

  const { data: contractsData } = useQuery({
    queryKey: ['contracts', objectId],
    queryFn: () => api.getContracts({ object: Number(objectId) }),
    enabled: createDialogOpen && isCustomerType && !!objectId,
  });
  const contracts: any[] = Array.isArray(contractsData)
    ? contractsData
    : (contractsData as any)?.results ?? [];

  const { data: actsData } = useQuery({
    queryKey: ['acts', contractId],
    queryFn: () => api.getActs(Number(contractId)),
    enabled: createDialogOpen && incomeType === 'customer_act' && !!contractId,
  });
  const acts: any[] = Array.isArray(actsData) ? actsData : (actsData as any)?.results ?? [];

  const { data: counterpartiesData } = useQuery({
    queryKey: ['counterparties'],
    queryFn: () => api.getCounterparties(),
    enabled: createDialogOpen,
  });
  const counterparties: any[] = Array.isArray(counterpartiesData)
    ? counterpartiesData
    : (counterpartiesData as any)?.results ?? [];

  const { data: categoriesData } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => api.getExpenseCategories(),
    enabled: createDialogOpen && !isCustomerType,
  });
  const categories: any[] = Array.isArray(categoriesData)
    ? categoriesData
    : (categoriesData as any)?.results ?? [];

  const resetForm = () => {
    setIncomeType('');
    setObjectId('');
    setContractId('');
    setActId('');
    setCategoryId('');
    setAccountId('');
    setLegalEntityId('');
    setCounterpartyId('');
    setAmount('');
    setIncomeDate('');
    setDescription('');
    setIsCash(false);
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => (api as any).createIncomeRecord(data),
    onSuccess: () => {
      toast.success('Входящий платёж создан');
      queryClient.invalidateQueries({ queryKey: ['income-records'] });
      queryClient.invalidateQueries({ queryKey: ['income-records-cash'] });
      setCreateDialogOpen(false);
      resetForm();
    },
    onError: (error: any) => {
      toast.error('Ошибка создания', {
        description: error?.message || 'Попробуйте ещё раз',
      });
    },
  });

  const handleCreateSubmit = () => {
    const data: any = {
      income_type: incomeType,
      amount,
      is_cash: isCash,
    };
    if (incomeDate) data.date = incomeDate;
    if (description) data.description = description;
    if (accountId) data.account = Number(accountId);
    if (legalEntityId) data.legal_entity = Number(legalEntityId);
    if (counterpartyId) data.counterparty = Number(counterpartyId);
    if (isCustomerType) {
      if (objectId) data.object = Number(objectId);
      if (contractId) data.contract = Number(contractId);
      if (actId) data.act = Number(actId);
    } else {
      if (categoryId) data.category = Number(categoryId);
    }
    createMutation.mutate(data);
  };

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) resetForm();
    setCreateDialogOpen(open);
  };

  const totalIncome = useMemo(
    () => records.reduce((sum: number, r: any) => sum + (parseFloat(r.amount) || 0), 0),
    [records]
  );

  return (
    <div className="space-y-4 mt-4">
      <Tabs value={sectionTab} onValueChange={setSectionTab}>
        <TabsList>
          <TabsTrigger value="manual" aria-label="Ручной ввод">Ручной ввод</TabsTrigger>
          <TabsTrigger value="bank" aria-label="Из банковской выписки">Из банковской выписки</TabsTrigger>
        </TabsList>

        <TabsContent value="manual">
          <div className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">
                  Всего записей: <span className="font-medium text-gray-900">{records.length}</span>
                  {' | '}
                  Сумма: <span className="font-medium text-gray-900">{formatCurrency(totalIncome)}</span>
                </p>
              </div>
              <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Создать запись
              </Button>
            </div>

            {recordsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : records.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Inbox className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-lg font-medium">Нет записей</p>
                <p className="text-sm">Создайте первую запись о входящем платеже</p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium">Тип</th>
                      <th className="text-left px-4 py-3 font-medium">Дата</th>
                      <th className="text-left px-4 py-3 font-medium">Контрагент</th>
                      <th className="text-right px-4 py-3 font-medium">Сумма</th>
                      <th className="text-left px-4 py-3 font-medium">Объект</th>
                      <th className="text-left px-4 py-3 font-medium">Описание</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {records.map((record: any) => (
                      <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <Badge variant="outline">
                            {INCOME_TYPE_LABELS[record.income_type] || record.income_type}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{formatDate(record.date)}</td>
                        <td className="px-4 py-3 text-gray-700 max-w-[180px] truncate">
                          {record.counterparty_name || '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">
                          {formatCurrency(record.amount)}
                        </td>
                        <td className="px-4 py-3 text-gray-700 max-w-[160px] truncate">
                          {record.object_name || '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">
                          {record.description || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="bank">
          <div className="mt-4">
            <Card>
              <CardContent className="pt-6 text-center space-y-3">
                <FileText className="h-12 w-12 mx-auto text-gray-300" />
                <div>
                  <p className="font-medium text-gray-700">Автоматический импорт из банковской выписки</p>
                  <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
                    При получении банковской выписки входящие платежи формируются автоматически.
                    LLM подбирает подходящий Объект и Договор из базы данных.
                    Оператор может скорректировать привязку.
                  </p>
                </div>
                <div className="border rounded-lg p-8 bg-gray-50 mt-4">
                  <Inbox className="h-10 w-10 mx-auto text-gray-300 mb-2" />
                  <p className="text-sm text-gray-400">Нет импортированных платежей</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {cashRecords.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center gap-2 mb-3">
            <Banknote className="h-5 w-5 text-green-600" />
            <h3 className="text-base font-semibold text-gray-900">Кассовый журнал</h3>
          </div>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Дата</th>
                  <th className="text-left px-4 py-3 font-medium">Тип</th>
                  <th className="text-left px-4 py-3 font-medium">Контрагент</th>
                  <th className="text-right px-4 py-3 font-medium">Сумма</th>
                  <th className="text-left px-4 py-3 font-medium">Описание</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {cashRecords.map((record: any) => (
                  <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-600">{formatDate(record.date)}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">
                        {INCOME_TYPE_LABELS[record.income_type] || record.income_type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-[180px] truncate">
                      {record.counterparty_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {formatCurrency(record.amount)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">
                      {record.description || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={createDialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Новый входящий платёж</DialogTitle>
            <DialogDescription>Заполните информацию о поступлении</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div>
              <Label htmlFor="income-type-select">Тип поступления</Label>
              <Select value={incomeType} onValueChange={(val) => { setIncomeType(val); setObjectId(''); setContractId(''); setActId(''); setCategoryId(''); }}>
                <SelectTrigger id="income-type-select" className="mt-1.5" aria-label="Тип поступления">
                  <SelectValue placeholder="Выберите тип" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(INCOME_TYPE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isCustomerType && (
              <>
                <div>
                  <Label htmlFor="inc-object-select">Объект</Label>
                  <Select value={objectId} onValueChange={(val) => { setObjectId(val); setContractId(''); setActId(''); }}>
                    <SelectTrigger id="inc-object-select" className="mt-1.5" aria-label="Объект">
                      <SelectValue placeholder="Выберите объект" />
                    </SelectTrigger>
                    <SelectContent>
                      {objects.map((obj: any) => (
                        <SelectItem key={obj.id} value={String(obj.id)}>{obj.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {objectId && (
                  <div>
                    <Label htmlFor="inc-contract-select">Договор</Label>
                    <Select value={contractId} onValueChange={(val) => { setContractId(val); setActId(''); }}>
                      <SelectTrigger id="inc-contract-select" className="mt-1.5" aria-label="Договор">
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
                {incomeType === 'customer_act' && contractId && (
                  <div>
                    <Label htmlFor="inc-act-select">Акт</Label>
                    <Select value={actId} onValueChange={setActId}>
                      <SelectTrigger id="inc-act-select" className="mt-1.5" aria-label="Акт">
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
              </>
            )}

            {incomeType && !isCustomerType && (
              <div>
                <Label htmlFor="inc-category-select">Категория (внутренний счёт)</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger id="inc-category-select" className="mt-1.5" aria-label="Категория">
                    <SelectValue placeholder="Выберите категорию" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c: any) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="inc-account-select">Счёт</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger id="inc-account-select" className="mt-1.5" aria-label="Счёт зачисления">
                    <SelectValue placeholder="Счёт" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((acc: any) => (
                      <SelectItem key={acc.id} value={String(acc.id)}>{acc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="inc-le-select">Юр. лицо</Label>
                <Select value={legalEntityId} onValueChange={setLegalEntityId}>
                  <SelectTrigger id="inc-le-select" className="mt-1.5" aria-label="Юридическое лицо">
                    <SelectValue placeholder="Юр. лицо" />
                  </SelectTrigger>
                  <SelectContent>
                    {legalEntities.map((le: any) => (
                      <SelectItem key={le.id} value={String(le.id)}>{le.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="inc-counterparty-select">Контрагент</Label>
              <Select value={counterpartyId} onValueChange={setCounterpartyId}>
                <SelectTrigger id="inc-counterparty-select" className="mt-1.5" aria-label="Контрагент">
                  <SelectValue placeholder="Выберите контрагента" />
                </SelectTrigger>
                <SelectContent>
                  {counterparties.map((cp: any) => (
                    <SelectItem key={cp.id} value={String(cp.id)}>{cp.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="inc-amount">Сумма</Label>
                <Input
                  id="inc-amount"
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="mt-1.5"
                  required
                  aria-label="Сумма поступления"
                />
              </div>
              <div>
                <Label htmlFor="inc-date">Дата</Label>
                <Input
                  id="inc-date"
                  type="date"
                  value={incomeDate}
                  onChange={(e) => setIncomeDate(e.target.value)}
                  className="mt-1.5"
                  aria-label="Дата поступления"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="inc-description">Описание</Label>
              <Textarea
                id="inc-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Комментарий к платежу"
                rows={2}
                className="mt-1.5"
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="inc-is-cash"
                checked={isCash}
                onCheckedChange={setIsCash}
                aria-label="Наличный платёж"
              />
              <Label htmlFor="inc-is-cash">Наличный платёж</Label>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => handleDialogOpenChange(false)}>
                Отмена
              </Button>
              <Button
                onClick={handleCreateSubmit}
                disabled={!incomeType || !amount || createMutation.isPending}
              >
                {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Создать
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

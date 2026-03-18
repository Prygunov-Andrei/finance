import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Save, CheckCircle, Plus, AlertCircle } from 'lucide-react';
import { api } from '../../lib/api';
import type { Invoice } from '../../types/supply';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { toast } from 'sonner';

const INVOICE_TYPE_LABELS: Record<string, string> = {
  supplier: 'От Поставщика',
  household: 'Хозяйственная деятельность',
  act_based: 'По Акту выполненных работ',
  warehouse: 'Закупка на склад',
  internal_transfer: 'Внутренний перевод',
};

interface InvoiceEditFormProps {
  invoice: Invoice;
  className?: string;
}

export function InvoiceEditForm({ invoice, className = '' }: InvoiceEditFormProps) {
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    invoice_type: invoice.invoice_type || 'supplier',
    counterparty: invoice.counterparty?.toString() || '',
    category: invoice.category?.toString() || '',
    object: invoice.object?.toString() || '',
    contract: invoice.contract?.toString() || '',
    legal_entity: invoice.legal_entity?.toString() || '',
    account: invoice.account?.toString() || '',
    invoice_number: invoice.invoice_number || '',
    invoice_date: invoice.invoice_date || '',
    due_date: invoice.due_date || '',
    amount_gross: invoice.amount_gross || '',
    amount_net: invoice.amount_net || '',
    vat_amount: invoice.vat_amount || '',
    description: invoice.description || '',
  });

  const [showCreateCounterparty, setShowCreateCounterparty] = useState(false);
  const parsedVendor = (invoice as any).parsed_vendor as { name?: string; inn?: string; kpp?: string } | null;
  const [cpForm, setCpForm] = useState({
    name: parsedVendor?.name || '',
    inn: parsedVendor?.inn || '',
    kpp: parsedVendor?.kpp || '',
  });

  useEffect(() => {
    setForm({
      invoice_type: invoice.invoice_type || 'supplier',
      counterparty: invoice.counterparty?.toString() || '',
      category: invoice.category?.toString() || '',
      object: invoice.object?.toString() || '',
      contract: invoice.contract?.toString() || '',
      legal_entity: invoice.legal_entity?.toString() || '',
      account: invoice.account?.toString() || '',
      invoice_number: invoice.invoice_number || '',
      invoice_date: invoice.invoice_date || '',
      due_date: invoice.due_date || '',
      amount_gross: invoice.amount_gross || '',
      amount_net: invoice.amount_net || '',
      vat_amount: invoice.vat_amount || '',
      description: invoice.description || '',
    });
  }, [invoice.id]);

  // В контексте сметы — тип всегда "от Поставщика"
  const isEstimateContext = !!invoice.estimate;

  // Derived flags
  const showObject = ['supplier', 'act_based'].includes(form.invoice_type);
  const showContract = showObject && !!form.object;
  const showCategory = form.invoice_type === 'household';
  const showCounterparty = form.invoice_type !== 'internal_transfer';

  // Load reference data
  const { data: counterparties } = useQuery({
    queryKey: ['counterparties'],
    queryFn: () => api.getCounterparties(),
  });

  const { data: categories } = useQuery({
    queryKey: ['expense-categories', 'expense-only'],
    queryFn: () => api.getExpenseCategories(false, 'expense'),
    enabled: showCategory,
  });

  const { data: objects } = useQuery({
    queryKey: ['objects'],
    queryFn: () => api.getObjects(),
  });

  const { data: contractsData } = useQuery({
    queryKey: ['contracts', { object: Number(form.object) }],
    queryFn: () => api.getContracts({ object: Number(form.object) }),
    enabled: showContract,
  });
  const contracts = contractsData?.results || [];

  const { data: legalEntities } = useQuery({
    queryKey: ['legal-entities'],
    queryFn: () => api.getLegalEntities(),
  });

  const { data: accounts } = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api.getAccounts({ is_active: true }),
  });

  const invalidateInvoice = () => {
    queryClient.invalidateQueries({ queryKey: ['invoice', invoice.id.toString()] });
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
  };

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, any>) =>
      (api as any).updateInvoice(invoice.id, data),
    onSuccess: () => {
      toast.success('Изменения сохранены');
      invalidateInvoice();
    },
    onError: () => toast.error('Ошибка при сохранении'),
  });

  const verifyMutation = useMutation({
    mutationFn: () => (api as any).verifyInvoice(invoice.id),
    onSuccess: () => {
      toast.success('Счёт подтверждён');
      invalidateInvoice();
    },
    onError: (err: any) => {
      const message = err?.data?.error || err?.message || 'Ошибка при подтверждении';
      toast.error(message);
    },
  });

  const createCounterpartyMutation = useMutation({
    mutationFn: (data: { name: string; inn: string; kpp: string }) =>
      api.createCounterparty({
        name: data.name,
        inn: data.inn,
        kpp: data.kpp,
        type: 'vendor',
        vendor_subtype: 'supplier',
        legal_form: data.inn.length === 12 ? 'ip' : 'ooo',
      }),
    onSuccess: (created: any) => {
      toast.success(`Контрагент "${created.name}" создан`);
      setShowCreateCounterparty(false);
      queryClient.invalidateQueries({ queryKey: ['counterparties'] });
      // Автоматически выбираем созданного контрагента
      setForm(prev => ({ ...prev, counterparty: created.id.toString() }));
    },
    onError: (err: any) => {
      const message = err?.data?.inn?.[0] || err?.data?.name?.[0] || err?.message || 'Ошибка создания';
      toast.error(message);
    },
  });

  const buildPatchData = () => {
    const data: Record<string, any> = {};
    data.invoice_type = form.invoice_type;
    if (form.counterparty) data.counterparty = Number(form.counterparty);
    else data.counterparty = null;
    if (form.category) data.category = Number(form.category);
    else data.category = null;
    if (form.object) data.object = Number(form.object);
    else data.object = null;
    if (form.contract) data.contract = Number(form.contract);
    else data.contract = null;
    if (form.legal_entity) data.legal_entity = Number(form.legal_entity);
    else data.legal_entity = null;
    if (form.account) data.account = Number(form.account);
    else data.account = null;
    data.invoice_number = form.invoice_number;
    data.invoice_date = form.invoice_date || null;
    data.due_date = form.due_date || null;
    data.amount_gross = form.amount_gross || null;
    data.amount_net = form.amount_net || null;
    data.vat_amount = form.vat_amount || null;
    data.description = form.description;
    return data;
  };

  const handleSave = () => {
    saveMutation.mutate(buildPatchData());
  };

  const handleVerify = async () => {
    try {
      await saveMutation.mutateAsync(buildPatchData());
      verifyMutation.mutate();
    } catch {
      // Save error already shown by mutation
    }
  };

  const update = (field: string, value: string) => {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      // Reset contract when object changes
      if (field === 'object') next.contract = '';
      // Reset dependent fields when type changes
      if (field === 'invoice_type') {
        next.category = '';
        next.object = '';
        next.contract = '';
      }
      return next;
    });
  };

  const handleAmountGrossChange = (value: string) => {
    update('amount_gross', value);
    const num = parseFloat(value);
    if (!isNaN(num) && num > 0) {
      const vat = num - num / 1.2;
      const net = num - vat;
      setForm(prev => ({
        ...prev,
        amount_gross: value,
        vat_amount: vat.toFixed(2),
        amount_net: net.toFixed(2),
      }));
    }
  };

  return (
    <>
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Проверка данных</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Invoice Type */}
          <div>
            <Label className="text-xs text-muted-foreground">Тип счёта</Label>
            {isEstimateContext ? (
              <p className="mt-1 text-sm font-medium">От Поставщика</p>
            ) : (
              <Select value={form.invoice_type} onValueChange={v => update('invoice_type', v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(INVOICE_TYPE_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Counterparty */}
          {showCounterparty && (
            <div>
              <Label className="text-xs text-muted-foreground">Контрагент</Label>
              <div className="flex gap-2 mt-1">
                <Select value={form.counterparty} onValueChange={v => update('counterparty', v)}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Выберите контрагента" />
                  </SelectTrigger>
                  <SelectContent>
                    {(counterparties || []).map((c: any) => (
                      <SelectItem key={c.id} value={c.id.toString()}>
                        {c.name} {c.inn ? `(ИНН: ${c.inn})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={() => {
                    setCpForm({
                      name: parsedVendor?.name || '',
                      inn: parsedVendor?.inn || '',
                      kpp: parsedVendor?.kpp || '',
                    });
                    setShowCreateCounterparty(true);
                  }}
                  title="Создать контрагента"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {/* Подсказка из LLM */}
              {parsedVendor && !form.counterparty && (
                <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-md">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                    <div className="text-xs text-amber-800">
                      <p className="font-medium">Распознан контрагент:</p>
                      <p>{parsedVendor.name}{parsedVendor.inn ? ` (ИНН: ${parsedVendor.inn})` : ''}</p>
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0 text-xs text-amber-700 underline"
                        onClick={() => {
                          setCpForm({
                            name: parsedVendor.name || '',
                            inn: parsedVendor.inn || '',
                            kpp: parsedVendor.kpp || '',
                          });
                          setShowCreateCounterparty(true);
                        }}
                      >
                        Создать в базе
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Object (for supplier / act_based) */}
          {showObject && (
            <div>
              <Label className="text-xs text-muted-foreground">Объект</Label>
              <Select value={form.object} onValueChange={v => update('object', v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Выберите объект" />
                </SelectTrigger>
                <SelectContent>
                  {(objects || []).map((o: any) => (
                    <SelectItem key={o.id} value={o.id.toString()}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Contract (cascade from Object) */}
          {showContract && (
            <div>
              <Label className="text-xs text-muted-foreground">Договор</Label>
              <Select value={form.contract} onValueChange={v => update('contract', v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Выберите договор" />
                </SelectTrigger>
                <SelectContent>
                  {contracts.map((c: any) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.number} — {c.name || c.contract_type_display}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Category (for household) */}
          {showCategory && (
            <div>
              <Label className="text-xs text-muted-foreground">Категория расходов</Label>
              <Select value={form.category} onValueChange={v => update('category', v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Выберите категорию" />
                </SelectTrigger>
                <SelectContent>
                  {(categories || []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id.toString()}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Legal Entity + Account */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Юрлицо</Label>
              <Select value={form.legal_entity} onValueChange={v => update('legal_entity', v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Юрлицо" />
                </SelectTrigger>
                <SelectContent>
                  {(legalEntities || []).map((le: any) => (
                    <SelectItem key={le.id} value={le.id.toString()}>
                      {le.short_name || le.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Счёт оплаты</Label>
              <Select value={form.account} onValueChange={v => update('account', v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Счёт" />
                </SelectTrigger>
                <SelectContent>
                  {(accounts || []).map((a: any) => (
                    <SelectItem key={a.id} value={a.id.toString()}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Invoice number + dates */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Номер счёта</Label>
              <Input
                className="mt-1"
                value={form.invoice_number}
                onChange={e => update('invoice_number', e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Дата счёта</Label>
              <Input
                type="date"
                className="mt-1"
                value={form.invoice_date}
                onChange={e => update('invoice_date', e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Срок оплаты</Label>
              <Input
                type="date"
                className="mt-1"
                value={form.due_date}
                onChange={e => update('due_date', e.target.value)}
              />
            </div>
          </div>

          {/* Amounts */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Сумма с НДС</Label>
              <Input
                type="number"
                step="0.01"
                className="mt-1"
                value={form.amount_gross}
                onChange={e => handleAmountGrossChange(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Без НДС</Label>
              <Input
                type="number"
                step="0.01"
                className="mt-1"
                value={form.amount_net}
                onChange={e => update('amount_net', e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">НДС</Label>
              <Input
                type="number"
                step="0.01"
                className="mt-1"
                value={form.vat_amount}
                onChange={e => update('vat_amount', e.target.value)}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <Label className="text-xs text-muted-foreground">Описание</Label>
            <Textarea
              className="mt-1"
              rows={2}
              value={form.description}
              onChange={e => update('description', e.target.value)}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="flex-1"
            >
              {saveMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Сохранить
            </Button>
            <Button
              onClick={handleVerify}
              disabled={saveMutation.isPending || verifyMutation.isPending}
              className="flex-1"
            >
              {verifyMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-2" />
              )}
              Подтвердить
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Диалог создания контрагента */}
      <Dialog open={showCreateCounterparty} onOpenChange={setShowCreateCounterparty}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Создать контрагента</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-xs text-muted-foreground">Название</Label>
              <Input
                className="mt-1"
                value={cpForm.name}
                onChange={e => setCpForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="ООО «Название»"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">ИНН</Label>
                <Input
                  className="mt-1"
                  value={cpForm.inn}
                  onChange={e => setCpForm(prev => ({ ...prev, inn: e.target.value }))}
                  placeholder="10 или 12 цифр"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">КПП</Label>
                <Input
                  className="mt-1"
                  value={cpForm.kpp}
                  onChange={e => setCpForm(prev => ({ ...prev, kpp: e.target.value }))}
                  placeholder="9 цифр"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowCreateCounterparty(false)}
              >
                Отмена
              </Button>
              <Button
                className="flex-1"
                disabled={!cpForm.name || !cpForm.inn || createCounterpartyMutation.isPending}
                onClick={() => createCounterpartyMutation.mutate(cpForm)}
              >
                {createCounterpartyMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                Создать
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

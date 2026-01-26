import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import { Card } from './ui/card';
import { Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useObjects, useCounterparties, useLegalEntities, useFrameworkContracts } from '../hooks';
import { CONSTANTS } from '../constants';

interface CreateContractDialogProps {
  contractId?: number;
  onSuccess: () => void;
}

export function CreateContractDialog({ contractId, onSuccess }: CreateContractDialogProps) {
  const isEditing = !!contractId;

  // Загрузка данных договора для редактирования
  const { data: existingContract } = useQuery({
    queryKey: ['contract', contractId],
    queryFn: () => api.getContractDetail(contractId!),
    enabled: isEditing,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  // Загрузка справочников с кешированием
  const { data: objects, isLoading: objectsLoading, error: objectsError } = useObjects();
  const { data: counterparties, isLoading: counterpartiesLoading, error: counterpartiesError } = useCounterparties();
  const { data: legalEntities, isLoading: legalEntitiesLoading, error: legalEntitiesError } = useLegalEntities();
  const { data: frameworkContracts } = useFrameworkContracts();

  const { data: technicalProposals } = useQuery({
    queryKey: ['technical-proposals', 'approved'],
    queryFn: () => api.getTechnicalProposals({ status: 'approved' }),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const { data: mountingProposals } = useQuery({
    queryKey: ['mounting-proposals', 'approved'],
    queryFn: () => api.getMountingProposals({ status: 'approved' }),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const { data: parentContracts } = useQuery({
    queryKey: ['contracts', 'income'],
    queryFn: () => api.getContracts(),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  // Form state
  const [formData, setFormData] = useState({
    object_id: '',
    number: '',
    name: '',
    contract_date: new Date().toISOString().split('T')[0],
    contract_type: 'income' as 'income' | 'expense',
    status: 'planned',
    legal_entity: '',
    counterparty: '',
    technical_proposal: '',
    mounting_proposal: '',
    parent_contract: '',
    framework_contract: '',
    responsible_manager: '',
    responsible_engineer: '',
    start_date: '',
    end_date: '',
    total_amount: '',
    currency: 'RUB',
    vat_rate: '20',
    vat_included: true,
    notes: '',
  });

  const [file, setFile] = useState<File | null>(null);

  // Заполнение формы при редактировании
  useEffect(() => {
    if (existingContract) {
      setFormData({
        object_id: existingContract.object_id?.toString() || '',
        number: existingContract.number || '',
        name: existingContract.name || '',
        contract_date: existingContract.contract_date || '',
        contract_type: existingContract.contract_type || 'income',
        status: existingContract.status || 'planned',
        legal_entity: existingContract.legal_entity?.toString() || '',
        counterparty: existingContract.counterparty?.toString() || '',
        technical_proposal: existingContract.commercial_proposal?.toString() || '',
        mounting_proposal: '',
        parent_contract: existingContract.parent_contract?.toString() || '',
        framework_contract: existingContract.framework_contract?.toString() || '',
        responsible_manager: existingContract.responsible_manager?.toString() || '',
        responsible_engineer: existingContract.responsible_engineer?.toString() || '',
        start_date: existingContract.start_date || '',
        end_date: existingContract.end_date || '',
        total_amount: existingContract.total_amount || '',
        currency: existingContract.currency || 'RUB',
        vat_rate: existingContract.vat_rate || '20',
        vat_included: existingContract.vat_included ?? true,
        notes: existingContract.notes || '',
      });
    }
  }, [existingContract]);

  const createMutation = useMutation({
    mutationFn: (data: any) => isEditing ? api.updateContract(contractId!, data) : api.createContract(data),
    onSuccess: () => {
      toast.success(isEditing ? 'Договор обновлен' : 'Договор создан');
      onSuccess();
    },
    onError: (error: any) => {
      toast.error(`Ошибка: ${error?.message || 'Не удалось сохранить договор'}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.object_id || !formData.number || !formData.name || !formData.contract_date || !formData.total_amount) {
      toast.error('Заполните все обязательные поля');
      return;
    }

    const dataToSubmit: any = {
      object_id: parseInt(formData.object_id),
      number: formData.number,
      name: formData.name,
      contract_date: formData.contract_date,
      contract_type: formData.contract_type,
      status: formData.status,
      total_amount: formData.total_amount,
      currency: formData.currency,
      vat_rate: formData.vat_rate,
      vat_included: formData.vat_included,
    };

    if (formData.legal_entity) dataToSubmit.legal_entity = parseInt(formData.legal_entity);
    if (formData.counterparty) dataToSubmit.counterparty = parseInt(formData.counterparty);
    if (formData.technical_proposal) dataToSubmit.technical_proposal = parseInt(formData.technical_proposal);
    if (formData.mounting_proposal) dataToSubmit.mounting_proposal = parseInt(formData.mounting_proposal);
    if (formData.parent_contract) dataToSubmit.parent_contract = parseInt(formData.parent_contract);
    if (formData.framework_contract) dataToSubmit.framework_contract = parseInt(formData.framework_contract);
    if (formData.responsible_manager) dataToSubmit.responsible_manager = parseInt(formData.responsible_manager);
    if (formData.responsible_engineer) dataToSubmit.responsible_engineer = parseInt(formData.responsible_engineer);
    if (formData.start_date) dataToSubmit.start_date = formData.start_date;
    if (formData.end_date) dataToSubmit.end_date = formData.end_date;
    if (formData.notes) dataToSubmit.notes = formData.notes;
    if (file) dataToSubmit.file = file;

    createMutation.mutate(dataToSubmit);
  };

  // Получить выбранный рамочный договор
  const selectedFrameworkContract = frameworkContracts?.results?.find(
    fc => fc.id.toString() === formData.framework_contract
  );

  // Фильтрация контрагентов на основе типа договора
  const filteredCounterparties = counterparties?.filter((cp) => {
    if (formData.contract_type === 'income') {
      return cp.type === 'customer' || cp.type === 'both';
    } else {
      return cp.type === 'vendor' || cp.type === 'both';
    }
  });

  // Фильтрация родительских договоров (только доходные)
  const allContracts = parentContracts?.results || parentContracts || [];
  const incomeContracts = allContracts.filter(c => c.contract_type === 'income');

  return (
    <form onSubmit={handleSubmit} className="space-y-6 mt-4">
      {/* Предупреждения об ошибках загрузки */}
      {(legalEntitiesError || objectsError || counterpartiesError) && (
        <Card className="p-4 bg-red-50 border-red-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
            <div className="text-sm text-red-800">
              <strong>Ошибка загрузки данных:</strong>
              <ul className="list-disc ml-5 mt-1">
                {legalEntitiesError && <li>Не удалось загрузить список юридических лиц (проблема на сервере)</li>}
                {objectsError && <li>Не удалось загрузить список объектов</li>}
                {counterpartiesError && <li>Не удалось загрузить список контрагентов</li>}
              </ul>
            </div>
          </div>
        </Card>
      )}

      {/* Секция 1: Основное */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold border-b pb-2">Основное</h3>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="object_id">
              Объект <span className="text-red-500">*</span>
            </Label>
            <Select 
              value={formData.object_id} 
              onValueChange={(value) => setFormData({ ...formData, object_id: value })}
              disabled={objectsLoading}
            >
              <SelectTrigger id="object_id" className="mt-1.5">
                <SelectValue placeholder={objectsLoading ? "Загрузка..." : "Выберите объект"} />
              </SelectTrigger>
              <SelectContent>
                {objects && objects.length > 0 ? (
                  objects.map((obj: any) => (
                    <SelectItem key={obj.id} value={obj.id.toString()}>
                      {obj.name}
                    </SelectItem>
                  ))
                ) : (
                  <div className="px-2 py-1.5 text-sm text-gray-500">Нет доступных объектов</div>
                )}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="number">
              Номер договора <span className="text-red-500">*</span>
            </Label>
            <Input
              id="number"
              value={formData.number}
              onChange={(e) => setFormData({ ...formData, number: e.target.value })}
              placeholder="Д-001"
              className="mt-1.5"
              required
            />
          </div>
        </div>

        <div>
          <Label htmlFor="name">
            Название/предмет договора <span className="text-red-500">*</span>
          </Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Введите название"
            className="mt-1.5"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="contract_date">
              Дата заключения <span className="text-red-500">*</span>
            </Label>
            <Input
              id="contract_date"
              type="date"
              value={formData.contract_date}
              onChange={(e) => setFormData({ ...formData, contract_date: e.target.value })}
              className="mt-1.5"
              required
            />
          </div>

          <div>
            <Label htmlFor="contract_type">
              Тип договора <span className="text-red-500">*</span>
            </Label>
            <Select 
              value={formData.contract_type} 
              onValueChange={(value: 'income' | 'expense') => setFormData({ 
                ...formData, 
                contract_type: value,
                // Сбрасываем несовместимые поля при смене типа
                technical_proposal: value === 'expense' ? '' : formData.technical_proposal,
                mounting_proposal: value === 'income' ? '' : formData.mounting_proposal,
                framework_contract: value === 'income' ? '' : formData.framework_contract,
              })}
            >
              <SelectTrigger id="contract_type" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="income">Доходный</SelectItem>
                <SelectItem value="expense">Расходный</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="status">Статус</Label>
          <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
            <SelectTrigger id="status" className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="planned">Планируется</SelectItem>
              <SelectItem value="active">В работе</SelectItem>
              <SelectItem value="completed">Завершён</SelectItem>
              <SelectItem value="suspended">Приостановлен</SelectItem>
              <SelectItem value="terminated">Расторгнут</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Секция 2: Стороны */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold border-b pb-2">Стороны</h3>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="legal_entity">Наша компания</Label>
            <Select 
              value={formData.legal_entity} 
              onValueChange={(value) => setFormData({ ...formData, legal_entity: value })}
              disabled={legalEntitiesLoading}
            >
              <SelectTrigger id="legal_entity" className="mt-1.5">
                <SelectValue placeholder={legalEntitiesLoading ? "Загрузка..." : "Выберите компанию"} />
              </SelectTrigger>
              <SelectContent>
                {legalEntities && legalEntities.length > 0 ? (
                  legalEntities.map((entity: any) => (
                    <SelectItem key={entity.id} value={entity.id.toString()}>
                      {entity.short_name || entity.name}
                    </SelectItem>
                  ))
                ) : (
                  <div className="px-2 py-1.5 text-sm text-gray-500">Нет доступных компаний</div>
                )}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="counterparty">Контрагент</Label>
            <Select 
              value={formData.counterparty} 
              onValueChange={(value) => setFormData({ ...formData, counterparty: value })}
              disabled={counterpartiesLoading}
            >
              <SelectTrigger id="counterparty" className="mt-1.5">
                <SelectValue placeholder={counterpartiesLoading ? "Загрузка..." : "Выберите контрагента"} />
              </SelectTrigger>
              <SelectContent>
                {filteredCounterparties && filteredCounterparties.length > 0 ? (
                  filteredCounterparties.map((cp: any) => (
                    <SelectItem key={cp.id} value={cp.id.toString()}>
                      {cp.short_name || cp.name}
                    </SelectItem>
                  ))
                ) : (
                  <div className="px-2 py-1.5 text-sm text-gray-500">
                    {formData.contract_type === 'income' ? 'Нет заказчиков' : 'Нет поставщиков'}
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Секция 3: Основания */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold border-b pb-2">Основания</h3>
        
        {formData.contract_type === 'income' && (
          <div>
            <Label htmlFor="technical_proposal">ТКП</Label>
            <Select value={formData.technical_proposal} onValueChange={(value) => setFormData({ ...formData, technical_proposal: value })}>
              <SelectTrigger id="technical_proposal" className="mt-1.5">
                <SelectValue placeholder="Выберите ТКП" />
              </SelectTrigger>
              <SelectContent>
                {technicalProposals?.results?.map((tp: any) => (
                  <SelectItem key={tp.id} value={tp.id.toString()}>
                    {tp.number} - {tp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {formData.contract_type === 'expense' && (
          <div>
            <Label htmlFor="mounting_proposal">МП</Label>
            <Select value={formData.mounting_proposal} onValueChange={(value) => setFormData({ ...formData, mounting_proposal: value })}>
              <SelectTrigger id="mounting_proposal" className="mt-1.5">
                <SelectValue placeholder="Выберите МП" />
              </SelectTrigger>
              <SelectContent>
                {mountingProposals?.results?.map((mp: any) => (
                  <SelectItem key={mp.id} value={mp.id.toString()}>
                    {mp.number} - {mp.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div>
          <Label htmlFor="parent_contract">Родительский договор</Label>
          <Select value={formData.parent_contract} onValueChange={(value) => setFormData({ ...formData, parent_contract: value })}>
            <SelectTrigger id="parent_contract" className="mt-1.5">
              <SelectValue placeholder="Выберите договор" />
            </SelectTrigger>
            <SelectContent>
              {incomeContracts?.map((c: any) => (
                <SelectItem key={c.id} value={c.id.toString()}>
                  {c.number} - {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Секция 4: Рамочный договор (только для расходных) */}
      {formData.contract_type === 'expense' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold border-b pb-2">Рамочный договор и ответственные</h3>
          
          <div>
            <Label htmlFor="framework_contract">Рамочный договор</Label>
            <Select value={formData.framework_contract} onValueChange={(value) => {
              const fc = frameworkContracts?.results?.find(f => f.id.toString() === value);
              setFormData({ 
                ...formData, 
                framework_contract: value,
                // Автоподстановка контрагента из рамочного договора
                counterparty: fc ? fc.counterparty.toString() : formData.counterparty,
              });
            }}>
              <SelectTrigger id="framework_contract" className="mt-1.5">
                <SelectValue placeholder="Выберите рамочный договор" />
              </SelectTrigger>
              <SelectContent>
                {frameworkContracts?.results?.map((fc: any) => (
                  <SelectItem key={fc.id} value={fc.id.toString()}>
                    {fc.number} - {fc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedFrameworkContract && (
            <Card className="p-4 bg-blue-50 border-blue-200">
              <div className="text-sm">
                <div className="font-semibold text-blue-900 mb-2">Информация о рамочном договоре</div>
                <div className="space-y-1 text-blue-800">
                  <div>Номер: {selectedFrameworkContract.number}</div>
                  <div>Исполнитель: {selectedFrameworkContract.counterparty_name}</div>
                  <div>Статус: {selectedFrameworkContract.status === 'active' ? 'Активный' : selectedFrameworkContract.status}</div>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Секция 5: Сроки */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold border-b pb-2">Сроки</h3>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="start_date">Дата начала работ</Label>
            <Input
              id="start_date"
              type="date"
              value={formData.start_date}
              onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
              className="mt-1.5"
            />
          </div>

          <div>
            <Label htmlFor="end_date">Плановая дата завершения</Label>
            <Input
              id="end_date"
              type="date"
              value={formData.end_date}
              onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
              className="mt-1.5"
            />
          </div>
        </div>
      </div>

      {/* Секция 6: Финансы */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold border-b pb-2">Финансы</h3>
        
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label htmlFor="total_amount">
              Сумма договора <span className="text-red-500">*</span>
            </Label>
            <Input
              id="total_amount"
              type="number"
              step="0.01"
              value={formData.total_amount}
              onChange={(e) => setFormData({ ...formData, total_amount: e.target.value })}
              placeholder="0.00"
              className="mt-1.5"
              required
            />
          </div>

          <div>
            <Label htmlFor="currency">Валюта</Label>
            <Select value={formData.currency} onValueChange={(value) => setFormData({ ...formData, currency: value })}>
              <SelectTrigger id="currency" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="RUB">RUB (₽)</SelectItem>
                <SelectItem value="USD">USD ($)</SelectItem>
                <SelectItem value="EUR">EUR (€)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="vat_rate">Ставка НДС, %</Label>
            <Select value={formData.vat_rate} onValueChange={(value) => setFormData({ ...formData, vat_rate: value })}>
              <SelectTrigger id="vat_rate" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">0%</SelectItem>
                <SelectItem value="10">10%</SelectItem>
                <SelectItem value="20">20%</SelectItem>
                <SelectItem value="no_vat">Без НДС</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="vat_included"
            checked={formData.vat_included}
            onCheckedChange={(checked) => setFormData({ ...formData, vat_included: checked as boolean })}
          />
          <Label htmlFor="vat_included" className="cursor-pointer">
            Сумма включает НДС
          </Label>
        </div>
      </div>

      {/* Секция 7: Файлы и примечания */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold border-b pb-2">Файлы и примечания</h3>
        
        <div>
          <Label htmlFor="file">Скан договора</Label>
          <Input
            id="file"
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            accept=".pdf,.jpg,.jpeg,.png"
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="notes">Примечания</Label>
          <Textarea
            id="notes"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Дополнительная информация..."
            className="mt-1.5"
            rows={4}
          />
        </div>
      </div>

      {/* Предупреждение */}
      {formData.status === 'active' && (
        <Card className="p-4 bg-yellow-50 border-yellow-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <strong>Внимание:</strong> При сохранении со статусом "В работе" требуется:
              <ul className="list-disc ml-5 mt-1">
                {formData.contract_type === 'income' && <li>ТКП со статусом "Утверждено"</li>}
                {formData.contract_type === 'expense' && <li>МП со статусом "Утверждено"</li>}
              </ul>
            </div>
          </div>
        </Card>
      )}

      {/* Кнопки */}
      <div className="flex gap-3 pt-4 border-t">
        <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={createMutation.isPending}>
          {createMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {isEditing ? 'Сохранение...' : 'Создание...'}
            </>
          ) : (
            isEditing ? 'Сохранить изменения' : 'Создать договор'
          )}
        </Button>
      </div>
    </form>
  );
}
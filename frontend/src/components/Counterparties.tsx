import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, Counterparty, CreateCounterpartyData } from '../lib/api';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Plus, Loader2, Users, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCounterparties } from '../hooks';

type CounterpartyFilter = 'all' | 'customer' | 'supplier' | 'executor';

export function Counterparties() {
  const [filter, setFilter] = useState<CounterpartyFilter>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingCounterparty, setEditingCounterparty] = useState<Counterparty | null>(null);
  const queryClient = useQueryClient();

  const { data: counterpartiesData, isLoading, error } = useCounterparties();

  // Извлекаем массив из ответа API (может быть массив или объект с results)
  const counterparties = counterpartiesData || [];

  const createMutation = useMutation({
    mutationFn: (data: CreateCounterpartyData) => api.createCounterparty(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['counterparties'] });
      setIsDialogOpen(false);
      toast.success('Контрагент успешно создан');
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateCounterpartyData> }) => 
      api.updateCounterparty(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['counterparties'] });
      setIsEditDialogOpen(false);
      setEditingCounterparty(null);
      toast.success('Контрагент успешно обновлен');
    },
    onError: (error: any) => {
      const errorMessage = error?.message || 'Неизвестная ошибка';
      toast.error(`Ошибка обновления контрагента: ${errorMessage}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteCounterparty(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['counterparties'] });
      toast.success('Контрагент успешно удален');
    },
    onError: (error: any) => {
      const errorMessage = error?.message || 'Неизвестная ошибка';
      toast.error(`Ошибка удаления контрагента: ${errorMessage}`);
    },
  });

  const handleEdit = (counterparty: Counterparty) => {
    setEditingCounterparty(counterparty);
    setIsEditDialogOpen(true);
  };

  const handleDelete = (counterparty: Counterparty) => {
    if (confirm(`Вы уверены, что хотите удалить контрагента "${counterparty.name}"?`)) {
      deleteMutation.mutate(counterparty.id);
    }
  };

  const filteredCounterparties = counterparties?.filter((cp) => {
    if (filter === 'all') return true;
    if (filter === 'customer') return cp.type === 'customer' || cp.type === 'both';
    if (filter === 'supplier') {
      return (cp.type === 'vendor' || cp.type === 'both') && 
             (cp.vendor_subtype === 'supplier' || cp.vendor_subtype === 'both');
    }
    if (filter === 'executor') {
      return (cp.type === 'vendor' || cp.type === 'both') && 
             (cp.vendor_subtype === 'executor' || cp.vendor_subtype === 'both');
    }
    return true;
  });

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'customer': return 'Заказчик';
      case 'vendor': return 'Исполнитель-Поставщик';
      case 'both': return 'Заказчик и Исполнитель-Поставщик';
      default: return type;
    }
  };

  const getVendorSubtypeLabel = (subtype?: string | null) => {
    if (!subtype) return '—';
    switch (subtype) {
      case 'supplier': return 'Поставщик';
      case 'executor': return 'Исполнитель';
      case 'both': return 'Исполнитель и Поставщик';
      default: return '—';
    }
  };

  const getLegalFormLabel = (form?: string) => {
    if (!form) return '—';
    switch (form) {
      case 'ooo': return 'ООО';
      case 'ip': return 'ИП';
      case 'fiz': return 'Физ.лицо';
      case 'self_employed': return 'Самозанятый';
      default: return form;
    }
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-semibold">Контрагенты</h1>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" />
                Добавить контрагента
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Новый контрагент</DialogTitle>
                <DialogDescription>Введите информацию о новом контрагенте</DialogDescription>
              </DialogHeader>
              <CreateCounterpartyForm 
                onSubmit={(data) => createMutation.mutate(data)}
                isLoading={createMutation.isPending}
              />
            </DialogContent>
          </Dialog>
        </div>

        {/* Filters */}
        <Tabs value={filter} onValueChange={(v) => setFilter(v as CounterpartyFilter)} className="mb-6">
          <TabsList>
            <TabsTrigger value="all">Все</TabsTrigger>
            <TabsTrigger value="customer">Заказчики</TabsTrigger>
            <TabsTrigger value="supplier">Поставщики</TabsTrigger>
            <TabsTrigger value="executor">Исполнители</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        ) : error ? (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl">
            Ошибка загрузки: {(error as Error).message}
          </div>
        ) : !filteredCounterparties || filteredCounterparties.length === 0 ? (
          <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-12 text-center">
            <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">
              {filter === 'all' ? 'Нет контрагентов' : 'Нет контрагентов в этой категории'}
            </p>
            <Button 
              onClick={() => setIsDialogOpen(true)}
              variant="outline"
            >
              <Plus className="w-4 h-4 mr-2" />
              Добавить первого контрагента
            </Button>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Название
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                      ИНН
                    </th>
                    {filter === 'all' && (
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-40">
                        Тип
                      </th>
                    )}
                    {(filter === 'all' || filter === 'supplier' || filter === 'executor') && (
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-36">
                        Подтип
                      </th>
                    )}
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                      Правовая форма
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Контакты
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
                      Действия
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredCounterparties.map((counterparty: Counterparty) => (
                    <tr key={counterparty.id} className="hover:bg-gray-50 transition-colors cursor-pointer">
                      <td className="px-4 py-2.5">
                        <div className="text-sm text-gray-900">{counterparty.name}</div>
                        {counterparty.short_name && (
                          <div className="text-xs text-gray-500">{counterparty.short_name}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <div className="text-xs font-mono text-gray-500">{counterparty.inn}</div>
                      </td>
                      {filter === 'all' && (
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                            counterparty.type === 'customer' 
                              ? 'bg-green-100 text-green-700'
                              : counterparty.type === 'vendor'
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {getTypeLabel(counterparty.type)}
                          </span>
                        </td>
                      )}
                      {(filter === 'all' || filter === 'supplier' || filter === 'executor') && (
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {(counterparty.type === 'vendor' || counterparty.type === 'both') ? (
                            <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                              counterparty.vendor_subtype === 'supplier'
                                ? 'bg-orange-100 text-orange-700'
                                : counterparty.vendor_subtype === 'executor'
                                ? 'bg-indigo-100 text-indigo-700'
                                : counterparty.vendor_subtype === 'both'
                                ? 'bg-cyan-100 text-cyan-700'
                                : 'bg-gray-100 text-gray-500'
                            }`}>
                              {getVendorSubtypeLabel(counterparty.vendor_subtype)}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <div className="text-xs text-gray-600">{getLegalFormLabel(counterparty.legal_form)}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="text-xs text-gray-500 max-w-xs truncate">
                          {counterparty.contact_info || '—'}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem onClick={() => handleEdit(counterparty)}>
                              <Pencil className="w-4 h-4 mr-2" />
                              Редактировать
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleDelete(counterparty)}
                              className="text-red-600 focus:text-red-600"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Удалить
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Диалог редактирования */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Редактировать контрагента</DialogTitle>
              <DialogDescription>Измените информацию о контрагенте</DialogDescription>
            </DialogHeader>
            {editingCounterparty && (
              <EditCounterpartyForm 
                counterparty={editingCounterparty}
                onSubmit={(data) => updateMutation.mutate({ id: editingCounterparty.id, data })}
                isLoading={updateMutation.isPending}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

interface CreateCounterpartyFormProps {
  onSubmit: (data: CreateCounterpartyData) => void;
  isLoading: boolean;
}

function CreateCounterpartyForm({ onSubmit, isLoading }: CreateCounterpartyFormProps) {
  const [formData, setFormData] = useState<CreateCounterpartyData>({
    name: '',
    short_name: '',
    inn: '',
    kpp: '',
    ogrn: '',
    type: 'customer',
    vendor_subtype: null,
    legal_form: 'ooo',
    contact_info: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Валидация
    if (!formData.name.trim() || !formData.inn.trim() || !formData.legal_form) {
      toast.error('Заполните обязательные поля');
      return;
    }

    // Проверка корректности vendor_subtype
    if (formData.vendor_subtype && formData.type === 'customer') {
      toast.error('Подтип можно указывать только для контрагентов типа "Исполнитель-Поставщик"');
      return;
    }

    // Подготовка данных для отправки
    const dataToSubmit: CreateCounterpartyData = {
      ...formData,
      short_name: formData.short_name?.trim() || undefined,
      kpp: formData.kpp?.trim() || undefined,
      ogrn: formData.ogrn?.trim() || undefined,
      contact_info: formData.contact_info?.trim() || undefined,
      vendor_subtype: (formData.type === 'vendor' || formData.type === 'both') ? formData.vendor_subtype : undefined,
    };

    onSubmit(dataToSubmit);
  };

  const showVendorSubtype = formData.type === 'vendor' || formData.type === 'both';

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div>
        <Label htmlFor="name">
          Название <span className="text-red-500">*</span>
        </Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="ООО Ромашка"
          disabled={isLoading}
          className="mt-1.5"
          required
        />
      </div>

      <div>
        <Label htmlFor="short_name">Краткое название</Label>
        <Input
          id="short_name"
          value={formData.short_name}
          onChange={(e) => setFormData({ ...formData, short_name: e.target.value })}
          placeholder="Ромашка"
          disabled={isLoading}
          className="mt-1.5"
        />
      </div>

      <div>
        <Label htmlFor="legal_form">
          Правовая форма <span className="text-red-500">*</span>
        </Label>
        <Select
          value={formData.legal_form}
          onValueChange={(value: any) => setFormData({ ...formData, legal_form: value })}
          disabled={isLoading}
        >
          <SelectTrigger className="mt-1.5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ooo">ООО</SelectItem>
            <SelectItem value="ip">ИП</SelectItem>
            <SelectItem value="fiz">Физ.лицо</SelectItem>
            <SelectItem value="self_employed">Самозанятый</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="inn">
          ИНН <span className="text-red-500">*</span>
        </Label>
        <Input
          id="inn"
          value={formData.inn}
          onChange={(e) => setFormData({ ...formData, inn: e.target.value })}
          placeholder="1234567890"
          disabled={isLoading}
          className="mt-1.5"
          required
        />
      </div>

      <div>
        <Label htmlFor="kpp">КПП</Label>
        <Input
          id="kpp"
          value={formData.kpp}
          onChange={(e) => setFormData({ ...formData, kpp: e.target.value })}
          placeholder="123456789"
          disabled={isLoading}
          className="mt-1.5"
        />
      </div>

      <div>
        <Label htmlFor="ogrn">ОГРН</Label>
        <Input
          id="ogrn"
          value={formData.ogrn}
          onChange={(e) => setFormData({ ...formData, ogrn: e.target.value })}
          placeholder="1234567890123"
          disabled={isLoading}
          className="mt-1.5"
        />
      </div>

      <div>
        <Label htmlFor="type">
          Тип <span className="text-red-500">*</span>
        </Label>
        <Select
          value={formData.type}
          onValueChange={(value: any) => {
            setFormData({ 
              ...formData, 
              type: value,
              // Сбросить vendor_subtype если выбрали "Заказчик"
              vendor_subtype: value === 'customer' ? null : formData.vendor_subtype
            });
          }}
          disabled={isLoading}
        >
          <SelectTrigger className="mt-1.5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="customer">Заказчик</SelectItem>
            <SelectItem value="vendor">Исполнитель-Поставщик</SelectItem>
            <SelectItem value="both">Заказчик и Исполнитель-Поставщик</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {showVendorSubtype && (
        <div>
          <Label htmlFor="vendor_subtype">Подтип</Label>
          <Select
            value={formData.vendor_subtype || 'null'}
            onValueChange={(value: any) => {
              setFormData({ 
                ...formData, 
                vendor_subtype: value === 'null' ? null : value 
              });
            }}
            disabled={isLoading}
          >
            <SelectTrigger className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="null">Не указано</SelectItem>
              <SelectItem value="supplier">Поставщик</SelectItem>
              <SelectItem value="executor">Исполнитель</SelectItem>
              <SelectItem value="both">Исполнитель и Поставщик</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div>
        <Label htmlFor="contact_info">Контакты</Label>
        <Textarea
          id="contact_info"
          value={formData.contact_info}
          onChange={(e) => setFormData({ ...formData, contact_info: e.target.value })}
          placeholder="Email, телефон, адрес..."
          disabled={isLoading}
          className="mt-1.5"
          rows={3}
        />
      </div>

      <div className="flex gap-3 pt-4">
        <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Создание...
            </>
          ) : (
            'Создать'
          )}
        </Button>
      </div>
    </form>
  );
}

interface EditCounterpartyFormProps {
  counterparty: Counterparty;
  onSubmit: (data: Partial<CreateCounterpartyData>) => void;
  isLoading: boolean;
}

function EditCounterpartyForm({ counterparty, onSubmit, isLoading }: EditCounterpartyFormProps) {
  const [formData, setFormData] = useState<Partial<CreateCounterpartyData>>({
    name: counterparty.name,
    short_name: counterparty.short_name,
    inn: counterparty.inn,
    kpp: counterparty.kpp,
    ogrn: counterparty.ogrn,
    type: counterparty.type,
    vendor_subtype: counterparty.vendor_subtype,
    legal_form: counterparty.legal_form,
    contact_info: counterparty.contact_info,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Валидация
    if (!formData.name?.trim() || !formData.inn?.trim() || !formData.legal_form) {
      toast.error('Заполните обязательные поля');
      return;
    }

    // Проверка корректности vendor_subtype
    if (formData.vendor_subtype && formData.type === 'customer') {
      toast.error('Подтип можно указывать только для контрагентов типа "Исполнитель-Поставщик"');
      return;
    }

    // Подготовка данных для отправки
    const dataToSubmit: Partial<CreateCounterpartyData> = {
      ...formData,
      short_name: formData.short_name?.trim() || undefined,
      kpp: formData.kpp?.trim() || undefined,
      ogrn: formData.ogrn?.trim() || undefined,
      contact_info: formData.contact_info?.trim() || undefined,
      vendor_subtype: (formData.type === 'vendor' || formData.type === 'both') ? formData.vendor_subtype : undefined,
    };

    onSubmit(dataToSubmit);
  };

  const showVendorSubtype = formData.type === 'vendor' || formData.type === 'both';

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div>
        <Label htmlFor="name">
          Название <span className="text-red-500">*</span>
        </Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="ООО Ромашка"
          disabled={isLoading}
          className="mt-1.5"
          required
        />
      </div>

      <div>
        <Label htmlFor="short_name">Краткое название</Label>
        <Input
          id="short_name"
          value={formData.short_name}
          onChange={(e) => setFormData({ ...formData, short_name: e.target.value })}
          placeholder="Ромашка"
          disabled={isLoading}
          className="mt-1.5"
        />
      </div>

      <div>
        <Label htmlFor="legal_form">
          Правовая форма <span className="text-red-500">*</span>
        </Label>
        <Select
          value={formData.legal_form}
          onValueChange={(value: any) => setFormData({ ...formData, legal_form: value })}
          disabled={isLoading}
        >
          <SelectTrigger className="mt-1.5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ooo">ООО</SelectItem>
            <SelectItem value="ip">ИП</SelectItem>
            <SelectItem value="fiz">Физ.лицо</SelectItem>
            <SelectItem value="self_employed">Самозанятый</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="inn">
          ИНН <span className="text-red-500">*</span>
        </Label>
        <Input
          id="inn"
          value={formData.inn}
          onChange={(e) => setFormData({ ...formData, inn: e.target.value })}
          placeholder="1234567890"
          disabled={isLoading}
          className="mt-1.5"
          required
        />
      </div>

      <div>
        <Label htmlFor="kpp">КПП</Label>
        <Input
          id="kpp"
          value={formData.kpp}
          onChange={(e) => setFormData({ ...formData, kpp: e.target.value })}
          placeholder="123456789"
          disabled={isLoading}
          className="mt-1.5"
        />
      </div>

      <div>
        <Label htmlFor="ogrn">ОГРН</Label>
        <Input
          id="ogrn"
          value={formData.ogrn}
          onChange={(e) => setFormData({ ...formData, ogrn: e.target.value })}
          placeholder="1234567890123"
          disabled={isLoading}
          className="mt-1.5"
        />
      </div>

      <div>
        <Label htmlFor="type">
          Тип <span className="text-red-500">*</span>
        </Label>
        <Select
          value={formData.type}
          onValueChange={(value: any) => {
            setFormData({ 
              ...formData, 
              type: value,
              // Сбросить vendor_subtype если выбрали "Заказчик"
              vendor_subtype: value === 'customer' ? null : formData.vendor_subtype
            });
          }}
          disabled={isLoading}
        >
          <SelectTrigger className="mt-1.5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="customer">Заказчик</SelectItem>
            <SelectItem value="vendor">Исполнитель-Поставщик</SelectItem>
            <SelectItem value="both">Заказчик и Исполнитель-Поставщик</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {showVendorSubtype && (
        <div>
          <Label htmlFor="vendor_subtype">Подтип</Label>
          <Select
            value={formData.vendor_subtype || 'null'}
            onValueChange={(value: any) => {
              setFormData({ 
                ...formData, 
                vendor_subtype: value === 'null' ? null : value 
              });
            }}
            disabled={isLoading}
          >
            <SelectTrigger className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="null">Не указано</SelectItem>
              <SelectItem value="supplier">Поставщик</SelectItem>
              <SelectItem value="executor">Исполнитель</SelectItem>
              <SelectItem value="both">Исполнитель и Поставщик</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div>
        <Label htmlFor="contact_info">Контакты</Label>
        <Textarea
          id="contact_info"
          value={formData.contact_info}
          onChange={(e) => setFormData({ ...formData, contact_info: e.target.value })}
          placeholder="Email, телефон, адрес..."
          disabled={isLoading}
          className="mt-1.5"
          rows={3}
        />
      </div>

      <div className="flex gap-3 pt-4">
        <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Обновление...
            </>
          ) : (
            'Обновить'
          )}
        </Button>
      </div>
    </form>
  );
}
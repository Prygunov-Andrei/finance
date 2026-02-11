import { useState, useEffect, useRef, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api, Counterparty, CreateCounterpartyData, FNSSuggestResult, FNSQuickCheckResponse, FNSEnrichResponse } from '../lib/api';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Plus, Loader2, Users, MoreVertical, Pencil, Trash2, Search, Database, Globe, ShieldCheck, ShieldAlert, ShieldX, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useCounterparties } from '../hooks';

type CounterpartyFilter = 'all' | 'customer' | 'supplier' | 'executor';

export function Counterparties() {
  const [filter, setFilter] = useState<CounterpartyFilter>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingCounterparty, setEditingCounterparty] = useState<Counterparty | null>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: counterpartiesData, isLoading, error } = useCounterparties();
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
      toast.error(`Ошибка обновления контрагента: ${error?.message || 'Неизвестная ошибка'}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteCounterparty(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['counterparties'] });
      toast.success('Контрагент успешно удален');
    },
    onError: (error: any) => {
      toast.error(`Ошибка удаления контрагента: ${error?.message || 'Неизвестная ошибка'}`);
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

  const handleRowClick = (counterparty: Counterparty) => {
    navigate(`/counterparties/${counterparty.id}`);
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
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Новый контрагент</DialogTitle>
                <DialogDescription>Введите ИНН или название — данные заполнятся автоматически</DialogDescription>
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
            <Button onClick={() => setIsDialogOpen(true)} variant="outline">
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
                    <tr
                      key={counterparty.id}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => handleRowClick(counterparty)}
                      tabIndex={0}
                      role="button"
                      aria-label={`Открыть карточку ${counterparty.name}`}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRowClick(counterparty); }}
                    >
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
                      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
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
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
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

// ─── Хук для debounced поиска ФНС ──────────────────────────────

const useDebounce = (value: string, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
};

// ─── Компонент подсказок ФНС ────────────────────────────────────

interface FNSSuggestDropdownProps {
  query: string;
  onSelect: (result: FNSSuggestResult) => void;
  isVisible: boolean;
  onClose: () => void;
}

function FNSSuggestDropdown({ query, onSelect, isVisible, onClose }: FNSSuggestDropdownProps) {
  const debouncedQuery = useDebounce(query, 400);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['fns-suggest', debouncedQuery],
    queryFn: () => api.fnsSuggest(debouncedQuery),
    enabled: isVisible && debouncedQuery.length >= 3,
    staleTime: 60_000,
  });

  // Закрытие при клике вне
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isVisible, onClose]);

  if (!isVisible || debouncedQuery.length < 3) return null;

  return (
    <div
      ref={dropdownRef}
      className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto"
    >
      {isLoading ? (
        <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500">
          <Loader2 className="w-3 h-3 animate-spin" />
          Поиск...
        </div>
      ) : data?.results && data.results.length > 0 ? (
        <>
          <div className="px-3 py-1.5 text-xs text-gray-400 border-b bg-gray-50 flex items-center gap-1">
            {data.source === 'local' ? (
              <><Database className="w-3 h-3" /> Из нашей базы</>
            ) : (
              <><Globe className="w-3 h-3" /> Из ФНС</>
            )}
            <span className="ml-auto">{data.total} результат(ов)</span>
          </div>
          {data.results.map((result, idx) => (
            <button
              key={`${result.inn}-${idx}`}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors border-b last:border-b-0"
              onClick={() => {
                onSelect(result);
                onClose();
              }}
            >
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{result.name}</div>
                  <div className="text-xs text-gray-500 flex items-center gap-2">
                    <span className="font-mono">ИНН: {result.inn}</span>
                    {result.kpp && <span className="font-mono">КПП: {result.kpp}</span>}
                  </div>
                  {result.address && (
                    <div className="text-xs text-gray-400 truncate">{result.address}</div>
                  )}
                </div>
                {result.is_local && (
                  <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium bg-green-100 text-green-700 rounded">
                    В базе
                  </span>
                )}
              </div>
            </button>
          ))}
        </>
      ) : debouncedQuery.length >= 3 ? (
        <div className="px-3 py-2 text-sm text-gray-500">Ничего не найдено</div>
      ) : null}
    </div>
  );
}

// ─── Компонент быстрой проверки ФНС ────────────────────────────

interface QuickCheckResultProps {
  data: FNSQuickCheckResponse | null;
  isLoading: boolean;
}

function QuickCheckResult({ data, isLoading }: QuickCheckResultProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        Проверка в ФНС...
      </div>
    );
  }

  if (!data) return null;

  const { summary } = data;
  const RiskIcon = summary.risk_level === 'low' ? ShieldCheck 
    : summary.risk_level === 'medium' ? ShieldAlert 
    : summary.risk_level === 'high' ? ShieldX 
    : AlertTriangle;

  const riskColor = summary.risk_level === 'low' ? 'text-green-600 bg-green-50 border-green-200'
    : summary.risk_level === 'medium' ? 'text-yellow-600 bg-yellow-50 border-yellow-200'
    : summary.risk_level === 'high' ? 'text-red-600 bg-red-50 border-red-200'
    : 'text-gray-600 bg-gray-50 border-gray-200';

  const riskLabel = summary.risk_level === 'low' ? 'Низкий риск'
    : summary.risk_level === 'medium' ? 'Средний риск'
    : summary.risk_level === 'high' ? 'Высокий риск'
    : 'Нет данных';

  return (
    <div className={`p-3 rounded-lg border ${riskColor}`}>
      <div className="flex items-center gap-2 mb-2">
        <RiskIcon className="w-4 h-4" />
        <span className="text-sm font-medium">{riskLabel}</span>
        <span className="text-xs ml-auto">
          +{summary.positive_count} / -{summary.negative_count}
        </span>
      </div>
      {summary.negative.length > 0 && (
        <div className="space-y-0.5">
          {summary.negative.slice(0, 3).map((item, i) => (
            <div key={i} className="text-xs">- {item}</div>
          ))}
          {summary.negative.length > 3 && (
            <div className="text-xs opacity-70">...и ещё {summary.negative.length - 3}</div>
          )}
        </div>
      )}
      {summary.positive.length > 0 && summary.negative.length === 0 && (
        <div className="text-xs">Негативных факторов не обнаружено</div>
      )}
    </div>
  );
}

// ─── Форма создания контрагента ─────────────────────────────────

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
    address: '',
    contact_info: '',
  });

  const [showInnSuggestions, setShowInnSuggestions] = useState(false);
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  const [quickCheck, setQuickCheck] = useState<FNSQuickCheckResponse | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const innFieldRef = useRef<HTMLDivElement>(null);
  const nameFieldRef = useRef<HTMLDivElement>(null);

  const [isEnriching, setIsEnriching] = useState(false);

  const handleSuggestSelect = useCallback(async (result: FNSSuggestResult) => {
    if (result.is_local) {
      toast.info(`Контрагент "${result.name}" уже есть в базе`);
    }
    // Сначала заполняем данными из suggest
    setFormData((prev) => ({
      ...prev,
      name: result.name || prev.name,
      short_name: result.short_name || prev.short_name || '',
      inn: result.inn || prev.inn,
      kpp: result.kpp || prev.kpp || '',
      ogrn: result.ogrn || prev.ogrn || '',
      legal_form: result.legal_form || prev.legal_form,
      address: result.address || prev.address || '',
    }));
    setShowInnSuggestions(false);
    setShowNameSuggestions(false);

    // Если есть ИНН и результат из ФНС — обогащаем через EGR для КПП, адреса и пр.
    const inn = result.inn || '';
    if (inn && inn.match(/^\d{10,12}$/) && !result.is_local) {
      setIsEnriching(true);
      try {
        const enriched: FNSEnrichResponse = await api.fnsEnrich(inn);
        setFormData((prev) => ({
          ...prev,
          name: enriched.name || prev.name,
          short_name: enriched.short_name || prev.short_name || '',
          inn: enriched.inn || prev.inn,
          kpp: enriched.kpp || prev.kpp || '',
          ogrn: enriched.ogrn || prev.ogrn || '',
          legal_form: enriched.legal_form || prev.legal_form,
          address: enriched.address || prev.address || '',
        }));
        toast.success('Реквизиты загружены из ЕГРЮЛ/ЕГРИП');
      } catch {
        // Тихо — данные из suggest уже заполнены
      } finally {
        setIsEnriching(false);
      }
    }
  }, []);

  const handleQuickCheck = async () => {
    const inn = formData.inn.trim();
    if (!inn || !inn.match(/^\d{10,12}$/)) {
      toast.error('Укажите корректный ИНН (10 или 12 цифр)');
      return;
    }
    setIsChecking(true);
    setQuickCheck(null);
    try {
      const result = await api.fnsQuickCheck(inn);
      setQuickCheck(result);
    } catch (e: any) {
      toast.error(`Ошибка проверки: ${e?.message || 'Неизвестная ошибка'}`);
    } finally {
      setIsChecking(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.inn.trim() || !formData.legal_form) {
      toast.error('Заполните обязательные поля');
      return;
    }
    if (formData.vendor_subtype && formData.type === 'customer') {
      toast.error('Подтип можно указывать только для контрагентов типа "Исполнитель-Поставщик"');
      return;
    }
    const dataToSubmit: CreateCounterpartyData = {
      ...formData,
      short_name: formData.short_name?.trim() || undefined,
      kpp: formData.kpp?.trim() || undefined,
      ogrn: formData.ogrn?.trim() || undefined,
      address: formData.address?.trim() || undefined,
      contact_info: formData.contact_info?.trim() || undefined,
      vendor_subtype: (formData.type === 'vendor' || formData.type === 'both') ? formData.vendor_subtype : undefined,
    };
    onSubmit(dataToSubmit);
  };

  const showVendorSubtype = formData.type === 'vendor' || formData.type === 'both';

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      {/* ИНН с автозаполнением */}
      <div ref={innFieldRef} className="relative">
        <Label htmlFor="create-inn">
          ИНН <span className="text-red-500">*</span>
        </Label>
        <div className="flex gap-2 mt-1.5">
          <Input
            id="create-inn"
            value={formData.inn}
            onChange={(e) => {
              setFormData({ ...formData, inn: e.target.value });
              if (e.target.value.length >= 3) {
                setShowInnSuggestions(true);
              }
              setQuickCheck(null);
            }}
            onFocus={() => {
              if (formData.inn.length >= 3) setShowInnSuggestions(true);
            }}
            placeholder="Введите ИНН для автозаполнения"
            disabled={isLoading}
            required
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleQuickCheck}
            disabled={isLoading || isChecking || !formData.inn.trim()}
            className="shrink-0 text-xs"
            title="Проверить контрагента в ФНС"
          >
            {isChecking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
            <span className="ml-1">Проверить</span>
          </Button>
        </div>
        <FNSSuggestDropdown
          query={formData.inn}
          onSelect={handleSuggestSelect}
          isVisible={showInnSuggestions}
          onClose={() => setShowInnSuggestions(false)}
        />
      </div>

      {/* Результат быстрой проверки */}
      <QuickCheckResult data={quickCheck} isLoading={isChecking} />

      {/* Индикатор обогащения данных */}
      {isEnriching && (
        <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg text-sm text-blue-600">
          <Loader2 className="w-3 h-3 animate-spin" />
          Загрузка реквизитов из ЕГРЮЛ/ЕГРИП...
        </div>
      )}

      {/* Название с автозаполнением */}
      <div ref={nameFieldRef} className="relative">
        <Label htmlFor="create-name">
          Название <span className="text-red-500">*</span>
        </Label>
        <Input
          id="create-name"
          value={formData.name}
          onChange={(e) => {
            setFormData({ ...formData, name: e.target.value });
            if (e.target.value.length >= 3 && !e.target.value.match(/^\d+$/)) {
              setShowNameSuggestions(true);
            }
          }}
          onFocus={() => {
            if (formData.name.length >= 3 && !formData.name.match(/^\d+$/)) {
              setShowNameSuggestions(true);
            }
          }}
          placeholder="Введите название для поиска"
          disabled={isLoading}
          className="mt-1.5"
          required
        />
        <FNSSuggestDropdown
          query={formData.name}
          onSelect={handleSuggestSelect}
          isVisible={showNameSuggestions}
          onClose={() => setShowNameSuggestions(false)}
        />
      </div>

      <div>
        <Label htmlFor="create-short_name">Краткое название</Label>
        <Input
          id="create-short_name"
          value={formData.short_name}
          onChange={(e) => setFormData({ ...formData, short_name: e.target.value })}
          placeholder="Ромашка"
          disabled={isLoading}
          className="mt-1.5"
        />
      </div>

      <div>
        <Label htmlFor="create-legal_form">
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

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="create-kpp">КПП</Label>
          <Input
            id="create-kpp"
            value={formData.kpp}
            onChange={(e) => setFormData({ ...formData, kpp: e.target.value })}
            placeholder="123456789"
            disabled={isLoading}
            className="mt-1.5"
          />
        </div>
        <div>
          <Label htmlFor="create-ogrn">ОГРН</Label>
          <Input
            id="create-ogrn"
            value={formData.ogrn}
            onChange={(e) => setFormData({ ...formData, ogrn: e.target.value })}
            placeholder="1234567890123"
            disabled={isLoading}
            className="mt-1.5"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="create-address">Юридический адрес</Label>
        <Input
          id="create-address"
          value={formData.address}
          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          placeholder="Заполнится автоматически из ФНС"
          disabled={isLoading}
          className="mt-1.5"
        />
      </div>

      <div>
        <Label htmlFor="create-type">
          Тип <span className="text-red-500">*</span>
        </Label>
        <Select
          value={formData.type}
          onValueChange={(value: any) => {
            setFormData({ 
              ...formData, 
              type: value,
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
          <Label htmlFor="create-vendor_subtype">Подтип</Label>
          <Select
            value={formData.vendor_subtype || 'null'}
            onValueChange={(value: any) => {
              setFormData({ ...formData, vendor_subtype: value === 'null' ? null : value });
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
        <Label htmlFor="create-contact_info">Контакты</Label>
        <Textarea
          id="create-contact_info"
          value={formData.contact_info}
          onChange={(e) => setFormData({ ...formData, contact_info: e.target.value })}
          placeholder="Email, телефон..."
          disabled={isLoading}
          className="mt-1.5"
          rows={2}
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

// ─── Форма редактирования контрагента ───────────────────────────

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
    address: counterparty.address || '',
    contact_info: counterparty.contact_info,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim() || !formData.inn?.trim() || !formData.legal_form) {
      toast.error('Заполните обязательные поля');
      return;
    }
    if (formData.vendor_subtype && formData.type === 'customer') {
      toast.error('Подтип можно указывать только для контрагентов типа "Исполнитель-Поставщик"');
      return;
    }
    const dataToSubmit: Partial<CreateCounterpartyData> = {
      ...formData,
      short_name: formData.short_name?.trim() || undefined,
      kpp: formData.kpp?.trim() || undefined,
      ogrn: formData.ogrn?.trim() || undefined,
      address: formData.address?.trim() || undefined,
      contact_info: formData.contact_info?.trim() || undefined,
      vendor_subtype: (formData.type === 'vendor' || formData.type === 'both') ? formData.vendor_subtype : undefined,
    };
    onSubmit(dataToSubmit);
  };

  const showVendorSubtype = formData.type === 'vendor' || formData.type === 'both';

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div>
        <Label htmlFor="edit-name">Название <span className="text-red-500">*</span></Label>
        <Input id="edit-name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} disabled={isLoading} className="mt-1.5" required />
      </div>
      <div>
        <Label htmlFor="edit-short_name">Краткое название</Label>
        <Input id="edit-short_name" value={formData.short_name} onChange={(e) => setFormData({ ...formData, short_name: e.target.value })} disabled={isLoading} className="mt-1.5" />
      </div>
      <div>
        <Label htmlFor="edit-legal_form">Правовая форма <span className="text-red-500">*</span></Label>
        <Select value={formData.legal_form} onValueChange={(value: any) => setFormData({ ...formData, legal_form: value })} disabled={isLoading}>
          <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ooo">ООО</SelectItem>
            <SelectItem value="ip">ИП</SelectItem>
            <SelectItem value="fiz">Физ.лицо</SelectItem>
            <SelectItem value="self_employed">Самозанятый</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="edit-inn">ИНН <span className="text-red-500">*</span></Label>
        <Input id="edit-inn" value={formData.inn} onChange={(e) => setFormData({ ...formData, inn: e.target.value })} disabled={isLoading} className="mt-1.5" required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="edit-kpp">КПП</Label>
          <Input id="edit-kpp" value={formData.kpp} onChange={(e) => setFormData({ ...formData, kpp: e.target.value })} disabled={isLoading} className="mt-1.5" />
        </div>
        <div>
          <Label htmlFor="edit-ogrn">ОГРН</Label>
          <Input id="edit-ogrn" value={formData.ogrn} onChange={(e) => setFormData({ ...formData, ogrn: e.target.value })} disabled={isLoading} className="mt-1.5" />
        </div>
      </div>
      <div>
        <Label htmlFor="edit-address">Юридический адрес</Label>
        <Input id="edit-address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} disabled={isLoading} className="mt-1.5" />
      </div>
      <div>
        <Label htmlFor="edit-type">Тип <span className="text-red-500">*</span></Label>
        <Select value={formData.type} onValueChange={(value: any) => { setFormData({ ...formData, type: value, vendor_subtype: value === 'customer' ? null : formData.vendor_subtype }); }} disabled={isLoading}>
          <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="customer">Заказчик</SelectItem>
            <SelectItem value="vendor">Исполнитель-Поставщик</SelectItem>
            <SelectItem value="both">Заказчик и Исполнитель-Поставщик</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {showVendorSubtype && (
        <div>
          <Label htmlFor="edit-vendor_subtype">Подтип</Label>
          <Select value={formData.vendor_subtype || 'null'} onValueChange={(value: any) => { setFormData({ ...formData, vendor_subtype: value === 'null' ? null : value }); }} disabled={isLoading}>
            <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
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
        <Label htmlFor="edit-contact_info">Контакты</Label>
        <Textarea id="edit-contact_info" value={formData.contact_info} onChange={(e) => setFormData({ ...formData, contact_info: e.target.value })} disabled={isLoading} className="mt-1.5" rows={2} />
      </div>
      <div className="flex gap-3 pt-4">
        <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={isLoading}>
          {isLoading ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Обновление...</>) : 'Обновить'}
        </Button>
      </div>
    </form>
  );
}

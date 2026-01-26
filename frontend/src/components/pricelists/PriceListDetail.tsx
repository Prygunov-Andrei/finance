import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, PriceListItem, UpdatePriceListItemData, CreatePriceListAgreementData, CreatePriceListData } from '../../lib/api';
import { formatDate, formatCurrency } from '../../lib/utils';
import { CONSTANTS } from '../../constants';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Checkbox } from '../ui/checkbox';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { ArrowLeft, Loader2, MoreVertical, Calendar, FileText, Users, Trash2, Edit2, Info, Download, Settings, Copy } from 'lucide-react';
import { toast } from 'sonner';

type Tab = 'items' | 'agreements' | 'info';

export function PriceListDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('items');
  const [editingItem, setEditingItem] = useState<PriceListItem | null>(null);
  const [isEditDialogOpen, setEditDialogOpen] = useState(false);
  const [isEditPriceListDialogOpen, setEditPriceListDialogOpen] = useState(false);
  const [isAgreementDialogOpen, setAgreementDialogOpen] = useState(false);
  const [isCreateVersionDialogOpen, setCreateVersionDialogOpen] = useState(false);
  const [deletingAgreementId, setDeletingAgreementId] = useState<number | null>(null);

  const [itemFormData, setItemFormData] = useState<UpdatePriceListItemData>({
    hours_override: null,
    coefficient_override: null,
    grade_override: null,
    is_included: true,
  });

  const [priceListFormData, setPriceListFormData] = useState<Partial<CreatePriceListData>>({
    number: '',
    name: '',
    date: '',
    status: 'draft',
    grade_1_rate: '',
    grade_2_rate: '',
    grade_3_rate: '',
    grade_4_rate: '',
    grade_5_rate: '',
  });

  const [agreementFormData, setAgreementFormData] = useState<CreatePriceListAgreementData>({
    price_list: Number(id),
    counterparty: 0,
    agreed_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const { data: priceList, isLoading, error } = useQuery({
    queryKey: ['price-list', id],
    queryFn: () => api.getPriceListDetail(Number(id)),
    enabled: !!id,
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const { data: counterparties } = useQuery({
    queryKey: ['counterparties-vendors'],
    queryFn: () => api.getCounterparties().then((c) => c.filter((x) => x.type === 'vendor' || x.type === 'both')),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ itemId, data }: { itemId: number; data: UpdatePriceListItemData }) =>
      api.updatePriceListItem(itemId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-list', id] });
      setEditDialogOpen(false);
      setEditingItem(null);
      toast.success('Позиция обновлена');
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const createAgreementMutation = useMutation({
    mutationFn: (data: CreatePriceListAgreementData) => api.createPriceListAgreement(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-list', id] });
      setAgreementDialogOpen(false);
      resetAgreementForm();
      toast.success('Согласование добавлено');
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const updatePriceListMutation = useMutation({
    mutationFn: (data: Partial<CreatePriceListData>) => api.updatePriceList(Number(id), data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-list', id] });
      queryClient.invalidateQueries({ queryKey: ['price-lists'] });
      setEditPriceListDialogOpen(false);
      toast.success('Прайс-лист обновлен');
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const deleteAgreementMutation = useMutation({
    mutationFn: (agreementId: number) => api.deletePriceListAgreement(agreementId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-list', id] });
      setDeletingAgreementId(null);
      toast.success('Согласование удалено');
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
      setDeletingAgreementId(null);
    },
  });

  const createVersionMutation = useMutation({
    mutationFn: () => api.createPriceListVersion(Number(id)),
    onSuccess: (newVersion) => {
      queryClient.invalidateQueries({ queryKey: ['price-lists'] });
      setCreateVersionDialogOpen(false);
      toast.success('Версия успешно создана');
      // Перенаправляем на страницу новой версии
      navigate(`/price-lists/${newVersion.id}`);
    },
    onError: (error: Error) => {
      toast.error(`Ошибка: ${error.message}`);
    },
  });

  const resetAgreementForm = () => {
    setAgreementFormData({
      price_list: Number(id),
      counterparty: 0,
      agreed_date: new Date().toISOString().split('T')[0],
      notes: '',
    });
  };

  const handleEditItem = (item: PriceListItem) => {
    setEditingItem(item);
    setItemFormData({
      hours_override: item.hours_override,
      coefficient_override: item.coefficient_override,
      grade_override: item.grade_override,
      is_included: item.is_included,
    });
    setEditDialogOpen(true);
  };

  const handleUpdateItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingItem) {
      updateItemMutation.mutate({ itemId: editingItem.id, data: itemFormData });
    }
  };

  const handleCreateAgreement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreementFormData.counterparty) {
      toast.error('Выберите контрагента');
      return;
    }
    createAgreementMutation.mutate(agreementFormData);
  };

  const getStatusBadge = (status: string, statusDisplay: string) => {
    const badges = {
      draft: 'bg-gray-100 text-gray-700',
      active: 'bg-green-100 text-green-700',
      archived: 'bg-gray-100 text-gray-500',
    };
    return (
      <span className={`inline-flex px-3 py-1.5 text-sm font-medium rounded-lg ${badges[status as keyof typeof badges] || badges.draft}`}>
        {statusDisplay}
      </span>
    );
  };

  const getTotalIncluded = () => {
    if (!priceList) return '0.00';
    const total = priceList.items
      .filter((item) => item.is_included)
      .reduce((sum, item) => sum + parseFloat(item.calculated_cost), 0);
    return total.toFixed(2);
  };

  const getGradeRate = (grade: number) => {
    if (!priceList) return '—';
    return formatCurrency(priceList[`grade_${grade}_rate` as keyof typeof priceList] as string);
  };

  // Форматирование разряда (с поддержкой дробных значений)
  const formatGrade = (gradeValue: string): string => {
    const gradeNum = parseFloat(gradeValue);
    if (isNaN(gradeNum)) {
      return '-';
    }
    
    // Если целое число, показываем без десятичных
    if (Number.isInteger(gradeNum)) {
      return gradeNum.toString();
    }
    
    // ля дробных - показываем с нужной точностью
    // Убираем лишние нули справа (2.50 → 2.5, 3.65 → 3.65)
    return gradeNum.toFixed(2).replace(/\.?0+$/, '');
  };

  // Получение подсказки для дробного разряда
  const getGradeTooltip = (gradeValue: string): string | null => {
    const gradeNum = parseFloat(gradeValue);
    if (gradeNum % 1 === 0) return null; // Целый разряд - без подсказки

    const lowerGrade = Math.floor(gradeNum);
    const upperGrade = Math.ceil(gradeNum);
    const weight = gradeNum - lowerGrade;

    if (weight === 0.5) {
      return `Средний разряд между ${lowerGrade} и ${upperGrade}`;
    }

    return `Взвешенный разряд: ${lowerGrade} (${((1 - weight) * 100).toFixed(0)}%) + ${upperGrade} (${(weight * 100).toFixed(0)}%)`; 
  };

  // Экспорт прайс-листа в Excel
  const handleExport = async () => {
    if (!priceList) return;

    try {
      toast.info('Экспорт начат...');
      const blob = await api.exportPriceList(Number(id));
      
      // Формируем имя файла: pricelist_{number}_{date}.xlsx
      const date = priceList.date.replace(/-/g, '');
      const filename = `pricelist_${priceList.number.replace(/[\/\\]/g, '_')}_${date}.xlsx`;
      
      // Создаем ссылку для скачивания
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success('Файл успешно скачан');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка при экспорте');
    }
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !priceList) {
    return (
      <div className="p-8">
        <div className="text-center py-12">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Прайс-лист не найден</p>
          <Button variant="outline" onClick={() => navigate('/price-lists')} className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Вернуться к списку
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/price-lists')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Назад
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-gray-900">{priceList.number}</h1>
              {getStatusBadge(priceList.status, priceList.status_display)}
              <span className="text-sm text-gray-500">v{priceList.version_number}</span>
            </div>
            {priceList.name && (
              <p className="text-sm text-gray-500 mt-1">{priceList.name}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button variant="outline">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => {
                setPriceListFormData({
                  number: priceList.number,
                  name: priceList.name || '',
                  date: priceList.date,
                  status: priceList.status,
                  grade_1_rate: priceList.grade_1_rate,
                  grade_2_rate: priceList.grade_2_rate,
                  grade_3_rate: priceList.grade_3_rate,
                  grade_4_rate: priceList.grade_4_rate,
                  grade_5_rate: priceList.grade_5_rate,
                });
                setEditPriceListDialogOpen(true);
              }}>
                <Settings className="w-4 h-4 mr-2" />
                Редактировать прайс-лист
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCreateVersionDialogOpen(true)}>
                <Copy className="w-4 h-4 mr-2" />
                Создать версию
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExport}>
                <Download className="w-4 h-4 mr-2" />
                Экспорт в Excel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-6">
          <button
            onClick={() => setActiveTab('items')}
            className={`pb-3 px-1 border-b-2 transition-colors ${
              activeTab === 'items'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              <span>Позиции</span>
              <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">
                {priceList.items.length}
              </span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('agreements')}
            className={`pb-3 px-1 border-b-2 transition-colors ${
              activeTab === 'agreements'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              <span>Согласования</span>
              <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs">
                {priceList.agreements.length}
              </span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('info')}
            className={`pb-3 px-1 border-b-2 transition-colors ${
              activeTab === 'info'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span>Информация</span>
            </div>
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'items' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Артикул
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Раздел
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Наименование
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Ед.изм.
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Часы
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Разряд
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Коэфф.
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Стоимость
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Включена
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Действия
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {priceList.items.length > 0 ? (
                    priceList.items.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <span className="text-xs font-mono text-gray-700">
                            {item.work_item_detail.article}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-900">
                            {item.work_item_detail.section_name}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-900">
                            {item.work_item_detail.name}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-600">
                            {item.work_item_detail.unit}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-900">
                            {item.effective_hours}
                            {item.hours_override && (
                              <span className="text-xs text-blue-600 ml-1">*</span>
                            )}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <TooltipProvider>
                            {getGradeTooltip(item.effective_grade) ? (
                              <Tooltip>
                                <TooltipTrigger className="cursor-help">
                                  <span className="text-sm text-gray-900 inline-flex items-center gap-1">
                                    {formatGrade(item.effective_grade)}
                                    {item.grade_override && (
                                      <span className="text-xs text-blue-600">*</span>
                                    )}
                                    <Info className="w-3 h-3 text-gray-400" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="text-xs">{getGradeTooltip(item.effective_grade)}</p>
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="text-sm text-gray-900">
                                {formatGrade(item.effective_grade)}
                                {item.grade_override && (
                                  <span className="text-xs text-blue-600 ml-1">*</span>
                                )}
                              </span>
                            )}
                          </TooltipProvider>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-900">
                            {item.effective_coefficient}
                            {item.coefficient_override && (
                              <span className="text-xs text-blue-600 ml-1">*</span>
                            )}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm font-medium text-gray-900">
                            {formatCurrency(item.calculated_cost)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {item.is_included ? (
                            <span className="inline-flex px-2 py-1 text-xs font-medium rounded-md bg-green-100 text-green-700">
                              Да
                            </span>
                          ) : (
                            <span className="inline-flex px-2 py-1 text-xs font-medium rounded-md bg-gray-100 text-gray-700">
                              Нет
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditItem(item)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={10} className="px-6 py-12 text-center text-gray-500">
                        Нет позиций в прайс-листе
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Total */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold text-gray-900">Итого (включенные позиции):</span>
              <span className="text-2xl font-semibold text-gray-900">
                {formatCurrency(getTotalIncluded())}
              </span>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'agreements' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button
              onClick={() => setAgreementDialogOpen(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Добавить согласование
            </Button>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Контрагент
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    ИНН
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Дата согласования
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Примечания
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {priceList.agreements.length > 0 ? (
                  priceList.agreements.map((agreement) => (
                    <tr key={agreement.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <span className="font-medium text-gray-900">
                          {agreement.counterparty_detail.name}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-600">
                          {agreement.counterparty_detail.inn}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-900">
                          {formatDate(agreement.agreed_date)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-600">{agreement.notes || '—'}</span>
                      </td>
                      <td className="px-6 py-4">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (window.confirm('Вы уверены, что хотите удалить это согласование?')) {
                              deleteAgreementMutation.mutate(agreement.id);
                            }
                          }}
                          disabled={deleteAgreementMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                      Нет согласований
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'info' && (
        <div className="space-y-6">
          {/* General Info */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Общая информация</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-gray-500">Номер</div>
                <div className="font-medium text-gray-900">{priceList.number}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Название</div>
                <div className="font-medium text-gray-900">{priceList.name || '—'}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Дата</div>
                <div className="font-medium text-gray-900">{formatDate(priceList.date)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Статус</div>
                <div>{getStatusBadge(priceList.status, priceList.status_display)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Версия</div>
                <div className="font-medium text-gray-900">v{priceList.version_number}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Создан</div>
                <div className="font-medium text-gray-900">{formatDate(priceList.created_at)}</div>
              </div>
            </div>
          </div>

          {/* Rates */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Ставки по разрядам</h3>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {[1, 2, 3, 4, 5].map((grade) => (
                <div key={grade}>
                  <div className="text-sm text-gray-500">Разряд {grade}</div>
                  <div className="font-medium text-gray-900">{getGradeRate(grade)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Edit Item Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Редактировать позицию</DialogTitle>
            <DialogDescription>
              Измените параметры позиции прайс-листа. Поля с переопределением опциональны.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUpdateItem} className="space-y-4">
            {editingItem && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-700">
                  <strong>{editingItem.work_item_detail.name}</strong>
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Базовые значения: Часы = {editingItem.work_item_detail.hours}, Разряд = {editingItem.work_item_detail.grade}, Коэфф. ={' '}\n                  {editingItem.work_item_detail.coefficient}
                </p>
              </div>
            )}

            <div>
              <Label htmlFor="hours_override">Часы (переопределение)</Label>
              <Input
                id="hours_override"
                type="number"
                step="0.01"
                value={itemFormData.hours_override || ''}
                onChange={(e) =>
                  setItemFormData({
                    ...itemFormData,
                    hours_override: e.target.value || null,
                  })
                }
                placeholder="Оставьте пустым для использования базового значения"
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="coefficient_override">Коэффициент (переопределение)</Label>
              <Input
                id="coefficient_override"
                type="number"
                step="0.01"
                value={itemFormData.coefficient_override || ''}
                onChange={(e) =>
                  setItemFormData({
                    ...itemFormData,
                    coefficient_override: e.target.value || null,
                  })
                }
                placeholder="Оставьте пустым для использования базового значения"
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="grade_override" className="flex items-center gap-2">
                Переопределить разряд
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger type="button">
                      <Info className="w-3.5 h-3.5 text-gray-400" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">
                        Можно указать дробное значение (например, 2.5, 3.65) для работ, выполняемых несколькими
                        монтажниками с разными разрядами. Оставьте пустым для использования разряда из работы.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <Input
                id="grade_override"
                type="number"
                step="0.01"
                min="1.00"
                max="5.00"
                value={itemFormData.grade_override || ''}
                onChange={(e) => {
                  const value = e.target.value;
                  // Валидация: если заполнено, проверяем диапазон
                  if (value && (parseFloat(value) < 1 || parseFloat(value) > 5)) {
                    toast.error('Разряд должен быть от 1.00 до 5.00');
                    return;
                  }
                  setItemFormData({
                    ...itemFormData,
                    grade_override: value || null,
                  });
                }}
                placeholder="2.5, 3.65, 4.2"
                className="mt-1.5"
              />
              <p className="text-xs text-gray-500 mt-1.5">
                Примеры: 2.5 (средний между 2 и 3), 3.65 (взвешенный 3 и 4)
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="is_included"
                checked={itemFormData.is_included}
                onCheckedChange={(checked) =>
                  setItemFormData({ ...itemFormData, is_included: checked as boolean })
                }
              />
              <Label htmlFor="is_included" className="cursor-pointer">
                Включена в прайс-лист
              </Label>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditDialogOpen(false)}
                disabled={updateItemMutation.isPending}
              >
                Отмена
              </Button>
              <Button
                type="submit"
                disabled={updateItemMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {updateItemMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Сохранение...
                  </>
                ) : (
                  'Сохранить'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create Agreement Dialog */}
      <Dialog open={isAgreementDialogOpen} onOpenChange={setAgreementDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Добавить согласование</DialogTitle>
            <DialogDescription>
              Добавьте информацию о согласовании прайс-листа с контрагентом.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateAgreement} className="space-y-4">
            <div>
              <Label htmlFor="counterparty">Контрагент *</Label>
              <select
                id="counterparty"
                value={agreementFormData.counterparty}
                onChange={(e) =>
                  setAgreementFormData({
                    ...agreementFormData,
                    counterparty: Number(e.target.value),
                  })
                }
                className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value={0}>Выберите контрагента</option>
                {counterparties?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.inn})
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1.5">
                Только контрагенты типа "Поставщик" или "Исполнитель"
              </p>
            </div>

            <div>
              <Label htmlFor="agreed_date">Дата согласования *</Label>
              <Input
                id="agreed_date"
                type="date"
                value={agreementFormData.agreed_date}
                onChange={(e) =>
                  setAgreementFormData({ ...agreementFormData, agreed_date: e.target.value })
                }
                required
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="notes">Примечания</Label>
              <textarea
                id="notes"
                value={agreementFormData.notes}
                onChange={(e) =>
                  setAgreementFormData({ ...agreementFormData, notes: e.target.value })
                }
                placeholder="Дополнительная информация о согласовании"
                rows={3}
                className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setAgreementDialogOpen(false);
                  resetAgreementForm();
                }}
                disabled={createAgreementMutation.isPending}
              >
                Отмена
              </Button>
              <Button
                type="submit"
                disabled={createAgreementMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {createAgreementMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Создание...
                  </>
                ) : (
                  'Создать'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Price List Dialog */}
      <Dialog open={isEditPriceListDialogOpen} onOpenChange={setEditPriceListDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Редактировать прайс-лист</DialogTitle>
            <DialogDescription>
              Измените основные параметры прайс-листа (номер, название, дату, статус, ставки разрядов).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={(e) => {
            e.preventDefault();
            updatePriceListMutation.mutate(priceListFormData);
          }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="pl_number">Номер *</Label>
                <Input
                  id="pl_number"
                  value={priceListFormData.number}
                  onChange={(e) => setPriceListFormData({ ...priceListFormData, number: e.target.value })}
                  required
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label htmlFor="pl_date">Дата *</Label>
                <Input
                  id="pl_date"
                  type="date"
                  value={priceListFormData.date}
                  onChange={(e) => setPriceListFormData({ ...priceListFormData, date: e.target.value })}
                  required
                  className="mt-1.5"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="pl_name">Название</Label>
              <Input
                id="pl_name"
                value={priceListFormData.name}
                onChange={(e) => setPriceListFormData({ ...priceListFormData, name: e.target.value })}
                placeholder="Опциональное описание прайс-листа"
                className="mt-1.5"
              />
            </div>

            <div>
              <Label htmlFor="pl_status">Статус *</Label>
              <select
                id="pl_status"
                value={priceListFormData.status}
                onChange={(e) => setPriceListFormData({ ...priceListFormData, status: e.target.value as 'draft' | 'active' | 'archived' })}
                className="mt-1.5 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="draft">Черновик</option>
                <option value="active">Активный</option>
                <option value="archived">Архивный</option>
              </select>
              <p className="text-xs text-gray-500 mt-1.5">
                Черновик — редактируемый, Активный — используется в работе, Архивный — не используется
              </p>
            </div>

            <div>
              <h4 className="font-medium text-gray-900 mb-3">Часовые ставки по разрядам</h4>
              <div className="grid grid-cols-5 gap-3">
                {[1, 2, 3, 4, 5].map((grade) => (
                  <div key={grade}>
                    <Label htmlFor={`grade_${grade}_rate`} className="text-xs">
                      Разряд {grade}
                    </Label>
                    <Input
                      id={`grade_${grade}_rate`}
                      type="number"
                      step="0.01"
                      value={priceListFormData[`grade_${grade}_rate` as keyof typeof priceListFormData] as string}
                      onChange={(e) =>
                        setPriceListFormData({
                          ...priceListFormData,
                          [`grade_${grade}_rate`]: e.target.value,
                        })
                      }
                      required
                      className="mt-1.5"
                      placeholder="₽/ч"
                    />
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditPriceListDialogOpen(false)}
                disabled={updatePriceListMutation.isPending}
              >
                Отмена
              </Button>
              <Button
                type="submit"
                disabled={updatePriceListMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {updatePriceListMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Сохранение...
                  </>
                ) : (
                  'Сохранить'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create Version Dialog */}
      <Dialog open={isCreateVersionDialogOpen} onOpenChange={setCreateVersionDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Создать новую версию прайс-листа</DialogTitle>
            <DialogDescription>
              Создание новой версии прайс-листа
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800 mb-2">
                <strong>Новая версия наследует все данные:</strong>
              </p>
              <ul className="list-disc list-inside text-sm text-blue-800 space-y-1">
                <li>Все ставки по разрядам</li>
                <li>Все позиции прайс-листа</li>
              </ul>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm text-amber-800 mb-2">
                <strong>Изменения:</strong>
              </p>
              <ul className="list-disc list-inside text-sm text-amber-800 space-y-1">
                <li>Текущая версия будет переведена в статус "Архивный"</li>
                <li>Новая версия получит статус "Черновик"</li>
                <li>Номер новой версии: {priceList?.number}-v{(priceList?.version_number || 0) + 1}</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateVersionDialogOpen(false)}
              disabled={createVersionMutation.isPending}
            >
              Отмена
            </Button>
            <Button
              onClick={() => createVersionMutation.mutate()}
              disabled={createVersionMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {createVersionMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Создание...
                </>
              ) : (
                'Создать версию'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
import { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, EstimateSection, EstimateSubsection, EstimateCharacteristic } from '../../lib/api';
import { formatDate, formatCurrency } from '../../lib/utils';
import { CONSTANTS } from '../../constants';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { ArrowLeft, Loader2, FileText, Plus, Edit2, Trash2, Info, DollarSign, History, FileSpreadsheet, Table2, Receipt, RefreshCw, Download } from 'lucide-react';
import { toast } from 'sonner';
import { EstimateItemsEditor } from './EstimateItemsEditor';
import { EstimateSupplierInvoices } from './EstimateSupplierInvoices';
import { ColumnConfigDialog } from './ColumnConfigDialog';
import { type ColumnDef as ColumnDefAPI, DEFAULT_COLUMN_CONFIG } from '../../lib/api';

const STATUS_MAP = {
  draft: 'Черновик',
  in_progress: 'В работе',
  checking: 'На проверке',
  approved: 'Утверждена',
  sent: 'Отправлена Заказчику',
  agreed: 'Согласована Заказчиком',
  rejected: 'Отклонена',
};

export function EstimateDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'info';
  const queryClient = useQueryClient();

  const [isSectionDialogOpen, setSectionDialogOpen] = useState(false);
  const [isSubsectionDialogOpen, setSubsectionDialogOpen] = useState(false);
  const [isCharacteristicDialogOpen, setCharacteristicDialogOpen] = useState(false);
  const [isVersionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<EstimateSection | null>(null);
  const [editingSubsection, setEditingSubsection] = useState<EstimateSubsection | null>(null);
  const [editingCharacteristic, setEditingCharacteristic] = useState<EstimateCharacteristic | null>(null);
  const [currentSectionId, setCurrentSectionId] = useState<number | null>(null);

  const [deleteSectionTarget, setDeleteSectionTarget] = useState<number | null>(null);
  const [deleteSubsectionTarget, setDeleteSubsectionTarget] = useState<number | null>(null);
  const [autoCharWarning, setAutoCharWarning] = useState<EstimateCharacteristic | null>(null);
  const [deleteCharTarget, setDeleteCharTarget] = useState<number | null>(null);
  const [isVersionDialogOpen, setIsVersionDialogOpen] = useState(false);
  const [isMountingDialogOpen, setIsMountingDialogOpen] = useState(false);
  const [deleteEstimateOpen, setDeleteEstimateOpen] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [isColumnConfigOpen, setColumnConfigOpen] = useState(false);

  const [sectionForm, setSectionForm] = useState({ name: '', sort_order: 0 });
  const [subsectionForm, setSubsectionForm] = useState({
    name: '',
    materials_sale: '0.00',
    works_sale: '0.00',
    materials_purchase: '0.00',
    works_purchase: '0.00',
    sort_order: 0,
  });
  const [characteristicForm, setCharacteristicForm] = useState({
    name: '',
    purchase_amount: '0.00',
    sale_amount: '0.00',
  });

  const { data: estimate, isLoading } = useQuery({
    queryKey: ['estimate', id],
    queryFn: () => api.getEstimateDetail(Number(id)),
    enabled: !!id,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const { data: versions } = useQuery({
    queryKey: ['estimate-versions', id],
    queryFn: () => api.getEstimateVersions(Number(id)),
    enabled: !!id && isVersionHistoryOpen,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const { data: priceLists } = useQuery({
    queryKey: ['price-lists'],
    queryFn: () => api.getPriceLists(),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  // Inline-edit mutation for estimate fields
  const updateFieldMutation = useMutation({
    mutationFn: (data: Record<string, any>) => api.updateEstimate(Number(id), data as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimate', id] });
      toast.success('Сохранено');
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const deleteEstimateMutation = useMutation({
    mutationFn: () => api.deleteEstimate(Number(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] });
      toast.success('Смета удалена');
      navigate('/estimates/estimates');
    },
    onError: (error) => {
      toast.error(`Ошибка удаления: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  // Подбор курсов ЦБ РФ
  const fetchCBRMutation = useMutation({
    mutationFn: async () => {
      const rates = await api.getCBRRates();
      await api.updateEstimate(Number(id), {
        usd_rate: rates.usd,
        eur_rate: rates.eur,
        cny_rate: rates.cny,
      } as any);
      return rates;
    },
    onSuccess: (rates) => {
      queryClient.invalidateQueries({ queryKey: ['estimate', id] });
      toast.success(`Курсы ЦБ на ${rates.date} загружены`);
    },
    onError: (error) => {
      toast.error(`Ошибка загрузки курсов: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  // Section mutations
  const createSectionMutation = useMutation({
    mutationFn: (data: { estimate: number; name: string; sort_order?: number }) =>
      api.createEstimateSection(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimate', id] });
      setSectionDialogOpen(false);
      setSectionForm({ name: '', sort_order: 0 });
      toast.success('Раздел создан');
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const updateSectionMutation = useMutation({
    mutationFn: ({ sectionId, data }: { sectionId: number; data: Partial<EstimateSection> }) =>
      api.updateEstimateSection(sectionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimate', id] });
      setSectionDialogOpen(false);
      setEditingSection(null);
      setSectionForm({ name: '', sort_order: 0 });
      toast.success('Раздел обновлен');
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const deleteSectionMutation = useMutation({
    mutationFn: (sectionId: number) => api.deleteEstimateSection(sectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimate', id] });
      toast.success('Раздел удален');
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  // Subsection mutations
  const createSubsectionMutation = useMutation({
    mutationFn: (data: any) => api.createEstimateSubsection(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimate', id] });
      setSubsectionDialogOpen(false);
      setSubsectionForm({
        name: '',
        materials_sale: '0.00',
        works_sale: '0.00',
        materials_purchase: '0.00',
        works_purchase: '0.00',
        sort_order: 0,
      });
      toast.success('Подраздел создан');
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const updateSubsectionMutation = useMutation({
    mutationFn: ({ subsectionId, data }: { subsectionId: number; data: Partial<EstimateSubsection> }) =>
      api.updateEstimateSubsection(subsectionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimate', id] });
      setSubsectionDialogOpen(false);
      setEditingSubsection(null);
      setSubsectionForm({
        name: '',
        materials_sale: '0.00',
        works_sale: '0.00',
        materials_purchase: '0.00',
        works_purchase: '0.00',
        sort_order: 0,
      });
      toast.success('Подраздел обновлен');
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const deleteSubsectionMutation = useMutation({
    mutationFn: (subsectionId: number) => api.deleteEstimateSubsection(subsectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimate', id] });
      toast.success('Подраздел удален');
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  // Characteristic mutations
  const createCharacteristicMutation = useMutation({
    mutationFn: (data: any) => api.createEstimateCharacteristic(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimate', id] });
      setCharacteristicDialogOpen(false);
      setCharacteristicForm({ name: '', purchase_amount: '0.00', sale_amount: '0.00' });
      toast.success('Характеристика создана');
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const updateCharacteristicMutation = useMutation({
    mutationFn: ({ charId, data }: { charId: number; data: Partial<EstimateCharacteristic> }) =>
      api.updateEstimateCharacteristic(charId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimate', id] });
      setCharacteristicDialogOpen(false);
      setEditingCharacteristic(null);
      setCharacteristicForm({ name: '', purchase_amount: '0.00', sale_amount: '0.00' });
      toast.success('Характеристика обновлена');
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const deleteCharacteristicMutation = useMutation({
    mutationFn: (charId: number) => api.deleteEstimateCharacteristic(charId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimate', id] });
      toast.success('Характеристика удалена');
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const createVersionMutation = useMutation({
    mutationFn: () => api.createEstimateVersion(Number(id)),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] });
      toast.success('Новая версия создана');
      navigate(`/estimates/estimates/${data.id}`);
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const createMountingEstimateMutation = useMutation({
    mutationFn: () => api.createMountingEstimateFromEstimate(Number(id)),
    onSuccess: (data) => {
      toast.success('Монтажная смета создана');
      navigate(`/estimates/mounting-estimates/${data.id}`);
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: string) => api.updateEstimate(Number(id), { status } as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimate', id] });
      toast.success('Статус обновлен');
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const handleSectionSubmit = () => {
    if (!sectionForm.name.trim()) {
      toast.error('Введите название раздела');
      return;
    }

    if (editingSection) {
      updateSectionMutation.mutate({
        sectionId: editingSection.id,
        data: { name: sectionForm.name, sort_order: sectionForm.sort_order },
      });
    } else {
      createSectionMutation.mutate({
        estimate: Number(id),
        name: sectionForm.name,
        sort_order: sectionForm.sort_order,
      });
    }
  };

  const handleSubsectionSubmit = () => {
    if (!subsectionForm.name.trim()) {
      toast.error('Введите название подраздела');
      return;
    }

    if (!currentSectionId && !editingSubsection) {
      toast.error('Выберите раздел');
      return;
    }

    if (editingSubsection) {
      updateSubsectionMutation.mutate({
        subsectionId: editingSubsection.id,
        data: subsectionForm,
      });
    } else {
      createSubsectionMutation.mutate({
        section: currentSectionId,
        ...subsectionForm,
      });
    }
  };

  const handleCharacteristicSubmit = () => {
    if (!characteristicForm.name.trim()) {
      toast.error('Введите название характеристики');
      return;
    }

    if (editingCharacteristic) {
      updateCharacteristicMutation.mutate({
        charId: editingCharacteristic.id,
        data: {
          name: characteristicForm.name,
          purchase_amount: characteristicForm.purchase_amount,
          sale_amount: characteristicForm.sale_amount,
        },
      });
    } else {
      createCharacteristicMutation.mutate({
        estimate: Number(id),
        name: characteristicForm.name,
        purchase_amount: characteristicForm.purchase_amount,
        sale_amount: characteristicForm.sale_amount,
        source_type: 'manual',
      });
    }
  };

  const handleEditSection = (section: EstimateSection) => {
    setEditingSection(section);
    setSectionForm({ name: section.name, sort_order: section.sort_order });
    setSectionDialogOpen(true);
  };

  const handleDeleteSection = (sectionId: number) => {
    setDeleteSectionTarget(sectionId);
  };

  const handleAddSubsection = (sectionId: number) => {
    setCurrentSectionId(sectionId);
    setEditingSubsection(null);
    setSubsectionForm({
      name: '',
      materials_sale: '0.00',
      works_sale: '0.00',
      materials_purchase: '0.00',
      works_purchase: '0.00',
      sort_order: 0,
    });
    setSubsectionDialogOpen(true);
  };

  const handleEditSubsection = (subsection: EstimateSubsection) => {
    setEditingSubsection(subsection);
    setSubsectionForm({
      name: subsection.name,
      materials_sale: subsection.materials_sale,
      works_sale: subsection.works_sale,
      materials_purchase: subsection.materials_purchase,
      works_purchase: subsection.works_purchase,
      sort_order: subsection.sort_order,
    });
    setSubsectionDialogOpen(true);
  };

  const handleDeleteSubsection = (subsectionId: number) => {
    setDeleteSubsectionTarget(subsectionId);
  };

  const handleEditCharacteristic = (char: EstimateCharacteristic) => {
    if (char.is_auto_calculated) {
      setAutoCharWarning(char);
    } else {
      setEditingCharacteristic(char);
      setCharacteristicForm({
        name: char.name,
        purchase_amount: char.purchase_amount,
        sale_amount: char.sale_amount,
      });
      setCharacteristicDialogOpen(true);
    }
  };

  const handleDeleteCharacteristic = (charId: number, isAuto: boolean) => {
    if (isAuto) {
      toast.error('Автоматические характеристики нельзя удалить');
      return;
    }
    setDeleteCharTarget(charId);
  };

  const handleCreateVersion = () => {
    setIsVersionDialogOpen(true);
  };

  const handleCreateMountingEstimate = () => {
    setIsMountingDialogOpen(true);
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

  if (!estimate) {
    return (
      <div className="p-8">
        <div className="text-center py-12">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Смета не найдена</p>
          <Button variant="outline" onClick={() => navigate('/estimates/estimates')} className="mt-4">
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
          <Button variant="ghost" size="sm" onClick={() => navigate('/estimates/estimates')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Назад
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-gray-900">{estimate.number}</h1>
              <span className="text-sm text-gray-500">v{estimate.version_number}</span>
            </div>
            <p className="text-sm text-gray-500 mt-1">{estimate.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setVersionHistoryOpen(true)}>
            <History className="w-4 h-4 mr-2" />
            История версий
          </Button>
          <Button variant="outline" onClick={handleCreateVersion}>
            <Plus className="w-4 h-4 mr-2" />
            Новая версия
          </Button>
          <Button variant="outline" onClick={handleCreateMountingEstimate}>
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Создать монтажную смету
          </Button>
          <Button variant="outline" onClick={async () => {
            try {
              const blob = await api.exportEstimate(Number(id));
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `Смета_${estimate?.number || id}.xlsx`;
              a.click();
              URL.revokeObjectURL(url);
            } catch (e) {
              toast.error('Ошибка экспорта');
            }
          }}>
            <Download className="w-4 h-4 mr-2" />
            Экспорт в Excel
          </Button>
          <Button
            variant="outline"
            className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
            onClick={() => { setDeleteConfirmName(''); setDeleteEstimateOpen(true); }}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Удалить
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(val) => setSearchParams({ tab: val }, { replace: true })} className="space-y-6">
        <TabsList>
          <TabsTrigger value="info">
            <Info className="w-4 h-4 mr-2" />
            Информация
          </TabsTrigger>
          <TabsTrigger value="sections">
            <FileText className="w-4 h-4 mr-2" />
            Разделы
          </TabsTrigger>
          <TabsTrigger value="items">
            <Table2 className="w-4 h-4 mr-2" />
            Строки сметы
          </TabsTrigger>
          <TabsTrigger value="characteristics">
            <DollarSign className="w-4 h-4 mr-2" />
            Характеристики
          </TabsTrigger>
          <TabsTrigger value="totals">
            <DollarSign className="w-4 h-4 mr-2" />
            Итоги
          </TabsTrigger>
          <TabsTrigger value="supplier-invoices">
            <Receipt className="w-4 h-4 mr-2" />
            Счета поставщиков
          </TabsTrigger>
        </TabsList>

        {/* Info Tab */}
        <TabsContent value="info" className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Основная информация</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-gray-500">Номер</div>
                <div className="font-medium text-gray-900">{estimate.number}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Название</div>
                <div className="font-medium text-gray-900">{estimate.name}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Объект</div>
                <div className="font-medium text-gray-900">{estimate.object_name}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Компания</div>
                <div className="font-medium text-gray-900">{estimate.legal_entity_name}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Статус</div>
                <div>
                  <select
                    value={estimate.status}
                    onChange={(e) => updateStatusMutation.mutate(e.target.value)}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {Object.entries(STATUS_MAP).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">С НДС</div>
                <div className="font-medium text-gray-900">
                  {estimate.with_vat ? `Да (${estimate.vat_rate}%)` : 'Нет'}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Создал</div>
                <div className="font-medium text-gray-900">{estimate.created_by_username}</div>
              </div>
            </div>

            {estimate.projects.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <div className="text-sm text-gray-500 mb-2">Проекты-основания</div>
                <div className="space-y-1">
                  {estimate.projects.map((project: any) => (
                    <div key={project.id} className="text-sm">
                      {project.file ? (
                        <a
                          href={project.file}
                          download
                          className="text-blue-600 hover:underline inline-flex items-center gap-1"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          {project.cipher} - {project.name}
                        </a>
                      ) : (
                        <span className="text-gray-500">
                          {project.cipher} - {project.name} (файл отсутствует)
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Editable parameters */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6" key={estimate.updated_at}>
            <h3 className="font-semibold text-gray-900 mb-4">Параметры сметы</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="detail-man-hours" className="text-sm text-gray-500">Человеко-часы</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    id="detail-man-hours"
                    type="number"
                    step="0.01"
                    defaultValue={estimate.man_hours}
                    onBlur={(e) => {
                      if (e.target.value !== estimate.man_hours) {
                        updateFieldMutation.mutate({ man_hours: e.target.value });
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                    className="max-w-[200px]"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="detail-price-list" className="text-sm text-gray-500">Прайс-лист для расчёта</Label>
                <select
                  id="detail-price-list"
                  defaultValue={estimate.price_list || ''}
                  onChange={(e) => {
                    const value = e.target.value ? Number(e.target.value) : null;
                    updateFieldMutation.mutate({ price_list: value });
                  }}
                  className="mt-1 w-full max-w-[300px] px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="">Не выбрано</option>
                  {priceLists?.map((pl) => (
                    <option key={pl.id} value={pl.id}>{pl.number} - {pl.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center gap-2">
                <Label className="text-sm text-gray-500">Курсы валют</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs gap-1"
                  onClick={() => fetchCBRMutation.mutate()}
                  disabled={fetchCBRMutation.isPending}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${fetchCBRMutation.isPending ? 'animate-spin' : ''}`} />
                  {fetchCBRMutation.isPending ? 'Загрузка...' : 'Курсы ЦБ'}
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-1 max-w-[500px]">
                <div>
                  <Label htmlFor="detail-usd" className="text-xs text-gray-400">USD</Label>
                  <Input
                    id="detail-usd"
                    type="number"
                    step="0.01"
                    placeholder="—"
                    defaultValue={estimate.usd_rate || ''}
                    onBlur={(e) => {
                      const newVal = e.target.value || undefined;
                      if (newVal !== (estimate.usd_rate || undefined)) {
                        updateFieldMutation.mutate({ usd_rate: newVal || null });
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="detail-eur" className="text-xs text-gray-400">EUR</Label>
                  <Input
                    id="detail-eur"
                    type="number"
                    step="0.01"
                    placeholder="—"
                    defaultValue={estimate.eur_rate || ''}
                    onBlur={(e) => {
                      const newVal = e.target.value || undefined;
                      if (newVal !== (estimate.eur_rate || undefined)) {
                        updateFieldMutation.mutate({ eur_rate: newVal || null });
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="detail-cny" className="text-xs text-gray-400">CNY</Label>
                  <Input
                    id="detail-cny"
                    type="number"
                    step="0.01"
                    placeholder="—"
                    defaultValue={estimate.cny_rate || ''}
                    onBlur={(e) => {
                      const newVal = e.target.value || undefined;
                      if (newVal !== (estimate.cny_rate || undefined)) {
                        updateFieldMutation.mutate({ cny_rate: newVal || null });
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Sections Tab */}
        <TabsContent value="sections" className="space-y-6">
          <div className="flex justify-end">
            <Button onClick={() => {
              setEditingSection(null);
              setSectionForm({ name: '', sort_order: 0 });
              setSectionDialogOpen(true);
            }} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              Добавить раздел
            </Button>
          </div>

          {estimate.sections.length > 0 ? (
            <Accordion type="multiple" className="space-y-4">
              {estimate.sections.map((section) => (
                <AccordionItem key={section.id} value={`section-${section.id}`} className="bg-white rounded-xl shadow-sm border border-gray-200">
                  <AccordionTrigger className="px-6 py-4 hover:no-underline">
                    <div className="flex items-center justify-between w-full pr-4">
                      <div className="flex items-center gap-4">
                        <span className="font-semibold text-gray-900">{section.name}</span>
                      </div>
                      <div className="flex items-center gap-6 text-sm">
                        <div className="text-right">
                          <div className="text-gray-500">Продажа</div>
                          <div className="font-medium text-gray-900">{formatCurrency(section.total_sale)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-gray-500">Закупка</div>
                          <div className="font-medium text-gray-900">{formatCurrency(section.total_purchase)}</div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditSection(section);
                            }}
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSection(section.id);
                            }}
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-6 pb-4">
                    <div className="space-y-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddSubsection(section.id)}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Добавить подраздел
                      </Button>

                      {section.subsections.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead className="bg-gray-50 border-b">
                              <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Название</th>
                                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Материалы (продажа)</th>
                                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Работы (продажа)</th>
                                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Материалы (закупка)</th>
                                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Работы (закупка)</th>
                                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Итого продажа</th>
                                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Итого закупка</th>
                                <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">Действия</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {section.subsections.map((subsection) => (
                                <tr key={subsection.id} className="hover:bg-gray-50">
                                  <td className="px-4 py-3 text-sm text-gray-900">{subsection.name}</td>
                                  <td className="px-4 py-3 text-sm text-right text-gray-700">{formatCurrency(subsection.materials_sale)}</td>
                                  <td className="px-4 py-3 text-sm text-right text-gray-700">{formatCurrency(subsection.works_sale)}</td>
                                  <td className="px-4 py-3 text-sm text-right text-gray-700">{formatCurrency(subsection.materials_purchase)}</td>
                                  <td className="px-4 py-3 text-sm text-right text-gray-700">{formatCurrency(subsection.works_purchase)}</td>
                                  <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">{formatCurrency(subsection.total_sale)}</td>
                                  <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">{formatCurrency(subsection.total_purchase)}</td>
                                  <td className="px-4 py-3 text-center">
                                    <div className="flex justify-center gap-2">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleEditSubsection(subsection)}
                                      >
                                        <Edit2 className="w-4 h-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleDeleteSubsection(subsection.id)}
                                      >
                                        <Trash2 className="w-4 h-4 text-red-600" />
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-center text-gray-500 py-4 text-sm">Нет подразделов</p>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Нет разделов</p>
            </div>
          )}
        </TabsContent>

        {/* Items Tab */}
        <TabsContent value="items" className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <EstimateItemsEditor
              estimateId={Number(id)}
              readOnly={estimate?.status === 'approved' || estimate?.status === 'agreed'}
              columnConfig={estimate?.column_config}
              onOpenColumnConfig={() => setColumnConfigOpen(true)}
            />
          </div>
        </TabsContent>

        {/* Characteristics Tab */}
        <TabsContent value="characteristics" className="space-y-6">
          <div className="flex justify-end">
            <Button onClick={() => {
              setEditingCharacteristic(null);
              setCharacteristicForm({ name: '', purchase_amount: '0.00', sale_amount: '0.00' });
              setCharacteristicDialogOpen(true);
            }} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" />
              Добавить характеристику
            </Button>
          </div>

          {estimate.characteristics.length > 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Название</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Закупка</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Продажа</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Источник</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {estimate.characteristics.map((char) => (
                    <tr key={char.id} className={char.is_auto_calculated ? 'bg-green-50' : ''}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{char.name}</span>
                          {char.is_auto_calculated && (
                            <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-md bg-green-100 text-green-700">
                              Авто
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-gray-900">{formatCurrency(char.purchase_amount)}</td>
                      <td className="px-6 py-4 text-right font-medium text-gray-900">{formatCurrency(char.sale_amount)}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{char.source_type_display}</td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex justify-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditCharacteristic(char)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          {!char.is_auto_calculated && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteCharacteristic(char.id, char.is_auto_calculated)}
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Нет характеристик</p>
            </div>
          )}
        </TabsContent>

        {/* Totals Tab */}
        <TabsContent value="totals" className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-6">Итоги по смете</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center py-3 border-b">
                <span className="text-gray-600">Материалы (продажа)</span>
                <span className="font-medium text-gray-900">{formatCurrency(estimate.total_materials_sale)}</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b">
                <span className="text-gray-600">Работы (продажа)</span>
                <span className="font-medium text-gray-900">{formatCurrency(estimate.total_works_sale)}</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-gray-300">
                <span className="text-lg font-semibold text-gray-900">Итого продажа</span>
                <span className="text-lg font-semibold text-gray-900">{formatCurrency(estimate.total_sale)}</span>
              </div>
              
              <div className="flex justify-between items-center py-3 border-b">
                <span className="text-gray-600">Материалы (закупка)</span>
                <span className="font-medium text-gray-900">{formatCurrency(estimate.total_materials_purchase)}</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b">
                <span className="text-gray-600">Работы (закупка)</span>
                <span className="font-medium text-gray-900">{formatCurrency(estimate.total_works_purchase)}</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-gray-300">
                <span className="text-lg font-semibold text-gray-900">Итого закупка</span>
                <span className="text-lg font-semibold text-gray-900">{formatCurrency(estimate.total_purchase)}</span>
              </div>

              <div className="flex justify-between items-center py-3 border-b">
                <span className="text-lg font-semibold text-gray-900">Прибыль</span>
                <div className="text-right">
                  <span className={`text-lg font-semibold ${parseFloat(estimate.profit_amount) > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(estimate.profit_amount)}
                  </span>
                  <span className="text-sm text-gray-500 ml-2">({estimate.profit_percent}%)</span>
                </div>
              </div>

              {estimate.with_vat && (
                <>
                  <div className="flex justify-between items-center py-3 border-b">
                    <span className="text-gray-600">НДС ({estimate.vat_rate}%)</span>
                    <span className="font-medium text-gray-900">{formatCurrency(estimate.vat_amount)}</span>
                  </div>
                  <div className="flex justify-between items-center py-4 bg-blue-50 rounded-lg px-4">
                    <span className="text-xl font-semibold text-gray-900">Итого с НДС</span>
                    <span className="text-xl font-semibold text-blue-600">{formatCurrency(estimate.total_with_vat)}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Supplier Invoices Tab */}
        <TabsContent value="supplier-invoices" className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <EstimateSupplierInvoices estimateId={Number(id)} />
          </div>
        </TabsContent>
      </Tabs>

      {/* Section Dialog */}
      <Dialog open={isSectionDialogOpen} onOpenChange={setSectionDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingSection ? 'Редактировать раздел' : 'Создать раздел'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="section_name">Название раздела *</Label>
              <Input
                id="section_name"
                value={sectionForm.name}
                onChange={(e) => setSectionForm({ ...sectionForm, name: e.target.value })}
                placeholder="Введите название"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="section_sort">Порядок сортировки</Label>
              <Input
                id="section_sort"
                type="number"
                value={sectionForm.sort_order}
                onChange={(e) => setSectionForm({ ...sectionForm, sort_order: Number(e.target.value) })}
                className="mt-1.5"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSectionDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleSectionSubmit} className="bg-blue-600 hover:bg-blue-700">
              {editingSection ? 'Сохранить' : 'Создать'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Subsection Dialog */}
      <Dialog open={isSubsectionDialogOpen} onOpenChange={setSubsectionDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{editingSubsection ? 'Редактировать подраздел' : 'Создать подраздел'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="subsection_name">Название подраздела *</Label>
              <Input
                id="subsection_name"
                value={subsectionForm.name}
                onChange={(e) => setSubsectionForm({ ...subsectionForm, name: e.target.value })}
                placeholder="Введите название"
                className="mt-1.5"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="materials_sale">Материалы — продажа *</Label>
                <Input
                  id="materials_sale"
                  type="number"
                  step="0.01"
                  value={subsectionForm.materials_sale}
                  onChange={(e) => setSubsectionForm({ ...subsectionForm, materials_sale: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="works_sale">Работы — продажа *</Label>
                <Input
                  id="works_sale"
                  type="number"
                  step="0.01"
                  value={subsectionForm.works_sale}
                  onChange={(e) => setSubsectionForm({ ...subsectionForm, works_sale: e.target.value })}
                  className="mt-1.5"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="materials_purchase">Материалы — закупка *</Label>
                <Input
                  id="materials_purchase"
                  type="number"
                  step="0.01"
                  value={subsectionForm.materials_purchase}
                  onChange={(e) => setSubsectionForm({ ...subsectionForm, materials_purchase: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="works_purchase">Работы — закупка *</Label>
                <Input
                  id="works_purchase"
                  type="number"
                  step="0.01"
                  value={subsectionForm.works_purchase}
                  onChange={(e) => setSubsectionForm({ ...subsectionForm, works_purchase: e.target.value })}
                  className="mt-1.5"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="subsection_sort">Порядок сортировки</Label>
              <Input
                id="subsection_sort"
                type="number"
                value={subsectionForm.sort_order}
                onChange={(e) => setSubsectionForm({ ...subsectionForm, sort_order: Number(e.target.value) })}
                className="mt-1.5"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSubsectionDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleSubsectionSubmit} className="bg-blue-600 hover:bg-blue-700">
              {editingSubsection ? 'Сохранить' : 'Создать'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Characteristic Dialog */}
      <Dialog open={isCharacteristicDialogOpen} onOpenChange={setCharacteristicDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingCharacteristic ? 'Редактировать характеристику' : 'Создать характеристику'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="char_name">Название *</Label>
              <Input
                id="char_name"
                value={characteristicForm.name}
                onChange={(e) => setCharacteristicForm({ ...characteristicForm, name: e.target.value })}
                placeholder="Введите название"
                className="mt-1.5"
                disabled={editingCharacteristic?.is_auto_calculated}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="char_purchase">Сумма закупки *</Label>
                <Input
                  id="char_purchase"
                  type="number"
                  step="0.01"
                  value={characteristicForm.purchase_amount}
                  onChange={(e) => setCharacteristicForm({ ...characteristicForm, purchase_amount: e.target.value })}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="char_sale">Сумма продажи *</Label>
                <Input
                  id="char_sale"
                  type="number"
                  step="0.01"
                  value={characteristicForm.sale_amount}
                  onChange={(e) => setCharacteristicForm({ ...characteristicForm, sale_amount: e.target.value })}
                  className="mt-1.5"
                />
              </div>
            </div>

            {editingCharacteristic?.is_auto_calculated && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
                ⚠️ При редактировании автоматической характеристики она станет ручной и больше не будет обновляться автоматически.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCharacteristicDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleCharacteristicSubmit} className="bg-blue-600 hover:bg-blue-700">
              {editingCharacteristic ? 'Сохранить' : 'Создать'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Section AlertDialog */}
      <AlertDialog open={deleteSectionTarget !== null} onOpenChange={(open) => { if (!open) setDeleteSectionTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить раздел</AlertDialogTitle>
            <AlertDialogDescription>
              Удалить этот раздел? Все подразделы также будут удалены.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (deleteSectionTarget !== null) {
                  deleteSectionMutation.mutate(deleteSectionTarget);
                  setDeleteSectionTarget(null);
                }
              }}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Subsection AlertDialog */}
      <AlertDialog open={deleteSubsectionTarget !== null} onOpenChange={(open) => { if (!open) setDeleteSubsectionTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить подраздел</AlertDialogTitle>
            <AlertDialogDescription>
              Удалить этот подраздел?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (deleteSubsectionTarget !== null) {
                  deleteSubsectionMutation.mutate(deleteSubsectionTarget);
                  setDeleteSubsectionTarget(null);
                }
              }}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Auto Characteristic Warning AlertDialog */}
      <AlertDialog open={autoCharWarning !== null} onOpenChange={(open) => { if (!open) setAutoCharWarning(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Редактирование автоматической характеристики</AlertDialogTitle>
            <AlertDialogDescription>
              Эта характеристика рассчитывается автоматически. При редактировании она станет ручной. Продолжить?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (autoCharWarning) {
                  setEditingCharacteristic(autoCharWarning);
                  setCharacteristicForm({
                    name: autoCharWarning.name,
                    purchase_amount: autoCharWarning.purchase_amount,
                    sale_amount: autoCharWarning.sale_amount,
                  });
                  setCharacteristicDialogOpen(true);
                  setAutoCharWarning(null);
                }
              }}
            >
              Продолжить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Characteristic AlertDialog */}
      <AlertDialog open={deleteCharTarget !== null} onOpenChange={(open) => { if (!open) setDeleteCharTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить характеристику</AlertDialogTitle>
            <AlertDialogDescription>
              Удалить эту характеристику?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (deleteCharTarget !== null) {
                  deleteCharacteristicMutation.mutate(deleteCharTarget);
                  setDeleteCharTarget(null);
                }
              }}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Version AlertDialog */}
      <AlertDialog open={isVersionDialogOpen} onOpenChange={setIsVersionDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Новая версия сметы</AlertDialogTitle>
            <AlertDialogDescription>
              Создать новую версию сметы? Текущая версия будет помечена как неактуальная.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={() => { createVersionMutation.mutate(); setIsVersionDialogOpen(false); }}>
              Создать
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Mounting Estimate AlertDialog */}
      <AlertDialog open={isMountingDialogOpen} onOpenChange={setIsMountingDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Создать монтажную смету</AlertDialogTitle>
            <AlertDialogDescription>
              Создать монтажную смету на основе этой сметы?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={() => { createMountingEstimateMutation.mutate(); setIsMountingDialogOpen(false); }}>
              Создать
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Version History Dialog */}
      <Dialog open={isVersionHistoryOpen} onOpenChange={setVersionHistoryOpen}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>История версий</DialogTitle>
            <DialogDescription>
              Все версии сметы {estimate.number}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {versions && versions.length > 0 ? (
              versions.map((version) => (
                <div
                  key={version.id}
                  onClick={() => {
                    setVersionHistoryOpen(false);
                    navigate(`/estimates/estimates/${version.id}`);
                  }}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{version.number}</span>
                      <span className="text-sm text-gray-500">v{version.version_number}</span>
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      {version.name}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm">
                    Открыть
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-center text-gray-500 py-8">Нет других версий</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Estimate Dialog */}
      <Dialog open={deleteEstimateOpen} onOpenChange={setDeleteEstimateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600">Удаление сметы</DialogTitle>
            <DialogDescription>
              Это действие необратимо. Все строки, разделы и характеристики сметы будут удалены.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm text-gray-600">
                Для подтверждения введите название сметы: <span className="font-semibold text-gray-900">{estimate?.name}</span>
              </Label>
              <Input
                className="mt-2"
                placeholder="Введите название сметы"
                value={deleteConfirmName}
                onChange={(e) => setDeleteConfirmName(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteEstimateOpen(false)}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              disabled={deleteConfirmName !== estimate?.name || deleteEstimateMutation.isPending}
              onClick={() => deleteEstimateMutation.mutate()}
            >
              {deleteEstimateMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Удаление...</>
              ) : (
                <><Trash2 className="w-4 h-4 mr-2" />Удалить смету</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Column Config Dialog */}
      <ColumnConfigDialog
        open={isColumnConfigOpen}
        onOpenChange={setColumnConfigOpen}
        estimateId={Number(id)}
        currentConfig={estimate?.column_config || DEFAULT_COLUMN_CONFIG}
        onSave={(config: ColumnDefAPI[]) => {
          updateFieldMutation.mutate({ column_config: config });
        }}
      />
    </div>
  );
}
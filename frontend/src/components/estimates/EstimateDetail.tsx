import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
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
import { ArrowLeft, Loader2, FileText, Plus, Edit2, Trash2, Info, DollarSign, History, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';

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
  const queryClient = useQueryClient();

  const [isSectionDialogOpen, setSectionDialogOpen] = useState(false);
  const [isSubsectionDialogOpen, setSubsectionDialogOpen] = useState(false);
  const [isCharacteristicDialogOpen, setCharacteristicDialogOpen] = useState(false);
  const [isVersionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<EstimateSection | null>(null);
  const [editingSubsection, setEditingSubsection] = useState<EstimateSubsection | null>(null);
  const [editingCharacteristic, setEditingCharacteristic] = useState<EstimateCharacteristic | null>(null);
  const [currentSectionId, setCurrentSectionId] = useState<number | null>(null);

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
    if (window.confirm('Удалить этот раздел? Все подразделы также будут удалены.')) {
      deleteSectionMutation.mutate(sectionId);
    }
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
    if (window.confirm('Удалить этот подраздел?')) {
      deleteSubsectionMutation.mutate(subsectionId);
    }
  };

  const handleEditCharacteristic = (char: EstimateCharacteristic) => {
    if (char.is_auto_calculated) {
      if (window.confirm('Эта характеристика рассчитывается автоматически. При редактировании она станет ручной. Продолжить?')) {
        setEditingCharacteristic(char);
        setCharacteristicForm({
          name: char.name,
          purchase_amount: char.purchase_amount,
          sale_amount: char.sale_amount,
        });
        setCharacteristicDialogOpen(true);
      }
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
    if (window.confirm('Удалить эту характеристику?')) {
      deleteCharacteristicMutation.mutate(charId);
    }
  };

  const handleCreateVersion = () => {
    if (window.confirm('Создать новую версию сметы? Текущая версия будет помечена как неактуальная.')) {
      createVersionMutation.mutate();
    }
  };

  const handleCreateMountingEstimate = () => {
    if (window.confirm('Создать монтажную смету на основе этой сметы?')) {
      createMountingEstimateMutation.mutate();
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
        </div>
      </div>

      <Tabs defaultValue="info" className="space-y-6">
        <TabsList>
          <TabsTrigger value="info">
            <Info className="w-4 h-4 mr-2" />
            Информация
          </TabsTrigger>
          <TabsTrigger value="sections">
            <FileText className="w-4 h-4 mr-2" />
            Разделы
          </TabsTrigger>
          <TabsTrigger value="characteristics">
            <DollarSign className="w-4 h-4 mr-2" />
            Характеристики
          </TabsTrigger>
          <TabsTrigger value="totals">
            <DollarSign className="w-4 h-4 mr-2" />
            Итоги
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
                <div className="text-sm text-gray-500">Человеко-часы</div>
                <div className="font-medium text-gray-900">{estimate.man_hours}</div>
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
                  {estimate.projects.map((project) => (
                    <div key={project.id} className="text-sm">
                      <button
                        onClick={() => navigate(`/estimates/projects/${project.id}`)}
                        className="text-blue-600 hover:underline"
                      >
                        {project.cipher} - {project.name}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {estimate.price_list_name && (
              <div className="mt-4 pt-4 border-t">
                <div className="text-sm text-gray-500">Прайс-лист</div>
                <div className="font-medium text-gray-900">{estimate.price_list_name}</div>
              </div>
            )}
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
    </div>
  );
}
import { useState, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from '@/hooks/erp-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, EstimateSection, EstimateSubsection, EstimateCharacteristic, EstimateCreateRequest} from '@/lib/api';
import { CONSTANTS } from '@/constants';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Loader2, FileText, Plus, Info, DollarSign, History, FileSpreadsheet, Table2, Receipt, Trash2, Download, ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { EstimateItemsEditor } from '../EstimateItemsEditor';
import { EstimateSupplierInvoices } from '../EstimateSupplierInvoices';
import { ColumnConfigDialog } from '../ColumnConfigDialog';
import { type ColumnDef as ColumnDefAPI, DEFAULT_COLUMN_CONFIG } from '@/lib/api';

import { EstimateInfoTab } from './EstimateInfoTab';
import { EstimateSectionsTab } from './EstimateSectionsTab';
import { EstimateCharacteristicsTab } from './EstimateCharacteristicsTab';
import { EstimateTotalsTab } from './EstimateTotalsTab';
import {
  SectionDialog,
  SubsectionDialog,
  CharacteristicDialog,
  DeleteConfirmDialog,
  AutoCharWarningDialog,
  ConfirmActionDialog,
  VersionHistoryDialog,
  DeleteEstimateDialog,
} from './EstimateDialogs';

export function EstimateDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'info';
  const queryClient = useQueryClient();

  // Dialog states
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

  // Form states
  const [sectionForm, setSectionForm] = useState({ name: '', sort_order: 0 });
  const [subsectionForm, setSubsectionForm] = useState({
    name: '', materials_sale: '0.00', works_sale: '0.00',
    materials_purchase: '0.00', works_purchase: '0.00', sort_order: 0,
  });
  const [characteristicForm, setCharacteristicForm] = useState({
    name: '', purchase_amount: '0.00', sale_amount: '0.00',
  });

  // Queries
  const { data: estimate, isLoading } = useQuery({
    queryKey: ['estimate', id],
    queryFn: () => api.estimates.getEstimateDetail(Number(id)),
    enabled: !!id,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const { data: versions } = useQuery({
    queryKey: ['estimate-versions', id],
    queryFn: () => api.estimates.getEstimateVersions(Number(id)),
    enabled: !!id && isVersionHistoryOpen,
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
  });

  const { data: priceLists } = useQuery({
    queryKey: ['price-lists'],
    queryFn: () => api.pricelists.getPriceLists(),
    staleTime: CONSTANTS.REFERENCE_STALE_TIME_MS,
  });

  // Файлы проектов для импорта в редакторе строк
  const allProjectFiles = useMemo(() => {
    if (!estimate?.projects) return [];
    return estimate.projects.flatMap((project) =>
      (project.project_files || []).map((pf) => ({
        ...pf,
        projectCipher: project.cipher,
      }))
    );
  }, [estimate?.projects]);

  // Mutations
  const updateFieldMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.estimates.updateEstimate(Number(id), data as Partial<EstimateCreateRequest>),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['estimate', id] }); toast.success('Сохранено'); },
    onError: (error) => { toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`); },
  });

  // Тихое сохранение ширин столбцов (без toast)
  const silentUpdateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.estimates.updateEstimate(Number(id), data as Partial<EstimateCreateRequest>),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['estimate', id] }); },
  });

  const columnResizeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleColumnResize = useCallback((sizing: Record<string, number>) => {
    if (columnResizeTimerRef.current) clearTimeout(columnResizeTimerRef.current);
    columnResizeTimerRef.current = setTimeout(() => {
      if (!estimate?.column_config) return;
      const updated = estimate.column_config.map((col: ColumnDefAPI) => {
        const newWidth = sizing[col.key];
        return newWidth != null ? { ...col, width: Math.round(newWidth) } : col;
      });
      silentUpdateMutation.mutate({ column_config: updated });
    }, 1000);
  }, [estimate?.column_config, silentUpdateMutation]);

  const initialColumnSizing = useMemo(() => {
    if (!estimate?.column_config) return undefined;
    const sizing: Record<string, number> = {};
    for (const col of estimate.column_config) {
      if (col.width) sizing[col.key] = col.width;
    }
    return sizing;
  }, [estimate?.column_config]);

  const deleteEstimateMutation = useMutation({
    mutationFn: () => api.estimates.deleteEstimate(Number(id)),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['estimates'] }); toast.success('Смета удалена'); navigate('/estimates/estimates'); },
    onError: (error) => { toast.error(`Ошибка удаления: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`); },
  });

  const fetchCBRMutation = useMutation({
    mutationFn: async () => {
      const rates = await api.core.getCBRRates();
      await api.estimates.updateEstimate(Number(id), { usd_rate: rates.usd, eur_rate: rates.eur, cny_rate: rates.cny } as Partial<EstimateCreateRequest>);
      return rates;
    },
    onSuccess: (rates) => { queryClient.invalidateQueries({ queryKey: ['estimate', id] }); toast.success(`Курсы ЦБ на ${rates.date} загружены`); },
    onError: (error) => { toast.error(`Ошибка загрузки курсов: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`); },
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: string) => api.estimates.updateEstimate(Number(id), { status } as Partial<EstimateCreateRequest>),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['estimate', id] }); toast.success('Статус обновлен'); },
    onError: (error) => { toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`); },
  });

  // Section mutations
  const createSectionMutation = useMutation({
    mutationFn: (data: { estimate: number; name: string; sort_order?: number }) => api.estimates.createEstimateSection(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['estimate', id] }); setSectionDialogOpen(false); setSectionForm({ name: '', sort_order: 0 }); toast.success('Раздел создан'); },
    onError: (error) => { toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`); },
  });
  const updateSectionMutation = useMutation({
    mutationFn: ({ sectionId, data }: { sectionId: number; data: Partial<EstimateSection> }) => api.estimates.updateEstimateSection(sectionId, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['estimate', id] }); setSectionDialogOpen(false); setEditingSection(null); setSectionForm({ name: '', sort_order: 0 }); toast.success('Раздел обновлен'); },
    onError: (error) => { toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`); },
  });
  const deleteSectionMutation = useMutation({
    mutationFn: (sectionId: number) => api.estimates.deleteEstimateSection(sectionId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['estimate', id] }); toast.success('Раздел удален'); },
    onError: (error) => { toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`); },
  });

  // Subsection mutations
  const createSubsectionMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.estimates.createEstimateSubsection(data as Parameters<typeof api.estimates.createEstimateSubsection>[0]),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['estimate', id] }); setSubsectionDialogOpen(false); setSubsectionForm({ name: '', materials_sale: '0.00', works_sale: '0.00', materials_purchase: '0.00', works_purchase: '0.00', sort_order: 0 }); toast.success('Подраздел создан'); },
    onError: (error) => { toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`); },
  });
  const updateSubsectionMutation = useMutation({
    mutationFn: ({ subsectionId, data }: { subsectionId: number; data: Partial<EstimateSubsection> }) => api.estimates.updateEstimateSubsection(subsectionId, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['estimate', id] }); setSubsectionDialogOpen(false); setEditingSubsection(null); setSubsectionForm({ name: '', materials_sale: '0.00', works_sale: '0.00', materials_purchase: '0.00', works_purchase: '0.00', sort_order: 0 }); toast.success('Подраздел обновлен'); },
    onError: (error) => { toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`); },
  });
  const deleteSubsectionMutation = useMutation({
    mutationFn: (subsectionId: number) => api.estimates.deleteEstimateSubsection(subsectionId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['estimate', id] }); toast.success('Подраздел удален'); },
    onError: (error) => { toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`); },
  });

  // Characteristic mutations
  const createCharacteristicMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.estimates.createEstimateCharacteristic(data as Parameters<typeof api.estimates.createEstimateCharacteristic>[0]),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['estimate', id] }); setCharacteristicDialogOpen(false); setCharacteristicForm({ name: '', purchase_amount: '0.00', sale_amount: '0.00' }); toast.success('Характеристика создана'); },
    onError: (error) => { toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`); },
  });
  const updateCharacteristicMutation = useMutation({
    mutationFn: ({ charId, data }: { charId: number; data: Partial<EstimateCharacteristic> }) => api.estimates.updateEstimateCharacteristic(charId, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['estimate', id] }); setCharacteristicDialogOpen(false); setEditingCharacteristic(null); setCharacteristicForm({ name: '', purchase_amount: '0.00', sale_amount: '0.00' }); toast.success('Характеристика обновлена'); },
    onError: (error) => { toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`); },
  });
  const deleteCharacteristicMutation = useMutation({
    mutationFn: (charId: number) => api.estimates.deleteEstimateCharacteristic(charId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['estimate', id] }); toast.success('Характеристика удалена'); },
    onError: (error) => { toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`); },
  });

  const createVersionMutation = useMutation({
    mutationFn: () => api.estimates.createEstimateVersion(Number(id)),
    onSuccess: (data) => { queryClient.invalidateQueries({ queryKey: ['estimates'] }); toast.success('Новая версия создана'); navigate(`/estimates/estimates/${data.id}`); },
    onError: (error) => { toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`); },
  });
  const createMountingEstimateMutation = useMutation({
    mutationFn: () => api.estimates.createMountingEstimateFromEstimate(Number(id)),
    onSuccess: (data) => { toast.success('Монтажная смета создана'); navigate(`/estimates/mounting-estimates/${data.id}`); },
    onError: (error) => { toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`); },
  });

  // Handlers
  const handleSectionSubmit = () => {
    if (!sectionForm.name.trim()) { toast.error('Введите название раздела'); return; }
    if (editingSection) {
      updateSectionMutation.mutate({ sectionId: editingSection.id, data: { name: sectionForm.name, sort_order: sectionForm.sort_order } });
    } else {
      createSectionMutation.mutate({ estimate: Number(id), name: sectionForm.name, sort_order: sectionForm.sort_order });
    }
  };

  const handleSubsectionSubmit = () => {
    if (!subsectionForm.name.trim()) { toast.error('Введите название подраздела'); return; }
    if (!currentSectionId && !editingSubsection) { toast.error('Выберите раздел'); return; }
    if (editingSubsection) {
      updateSubsectionMutation.mutate({ subsectionId: editingSubsection.id, data: subsectionForm });
    } else {
      createSubsectionMutation.mutate({ section: currentSectionId, ...subsectionForm });
    }
  };

  const handleCharacteristicSubmit = () => {
    if (!characteristicForm.name.trim()) { toast.error('Введите название характеристики'); return; }
    if (editingCharacteristic) {
      updateCharacteristicMutation.mutate({ charId: editingCharacteristic.id, data: { name: characteristicForm.name, purchase_amount: characteristicForm.purchase_amount, sale_amount: characteristicForm.sale_amount } });
    } else {
      createCharacteristicMutation.mutate({ estimate: Number(id), name: characteristicForm.name, purchase_amount: characteristicForm.purchase_amount, sale_amount: characteristicForm.sale_amount, source_type: 'manual' });
    }
  };

  const handleEditCharacteristic = (char: EstimateCharacteristic) => {
    if (char.is_auto_calculated) { setAutoCharWarning(char); } else {
      setEditingCharacteristic(char);
      setCharacteristicForm({ name: char.name, purchase_amount: char.purchase_amount, sale_amount: char.sale_amount });
      setCharacteristicDialogOpen(true);
    }
  };

  const handleDeleteCharacteristic = (charId: number, isAuto: boolean) => {
    if (isAuto) { toast.error('Автоматические характеристики нельзя удалить'); return; }
    setDeleteCharTarget(charId);
  };

  if (isLoading) {
    return (<div className="p-8"><div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 text-muted-foreground animate-spin" /></div></div>);
  }

  if (!estimate) {
    return (
      <div className="p-8"><div className="text-center py-12">
        <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">Смета не найдена</p>
        <Button variant="outline" onClick={() => navigate('/estimates/estimates')} className="mt-4"><ArrowLeft className="w-4 h-4 mr-2" />Вернуться к списку</Button>
      </div></div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/estimates/estimates')}><ArrowLeft className="w-4 h-4 mr-2" />Назад</Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-foreground">{estimate.number}</h1>
              <span className="text-sm text-muted-foreground">v{estimate.version_number}</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{estimate.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setVersionHistoryOpen(true)}><History className="w-4 h-4 mr-2" />История версий</Button>
          <Button variant="outline" onClick={() => setIsVersionDialogOpen(true)}><Plus className="w-4 h-4 mr-2" />Новая версия</Button>
          <Button variant="outline" onClick={() => setIsMountingDialogOpen(true)}><FileSpreadsheet className="w-4 h-4 mr-2" />Создать монтажную смету</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline"><Download className="w-4 h-4 mr-2" />Экспорт в Excel<ChevronDown className="w-4 h-4 ml-1" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={async () => {
                try {
                  const blob = await api.estimates.exportEstimate(Number(id), 'internal');
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url; a.download = `Смета_${estimate?.number || id}_внутр.xlsx`; a.click(); URL.revokeObjectURL(url);
                } catch { toast.error('Ошибка экспорта'); }
              }}>Экспорт (внутренний)</DropdownMenuItem>
              <DropdownMenuItem onClick={async () => {
                try {
                  const blob = await api.estimates.exportEstimate(Number(id), 'external');
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url; a.download = `Смета_${estimate?.number || id}_клиент.xlsx`; a.click(); URL.revokeObjectURL(url);
                } catch { toast.error('Ошибка экспорта'); }
              }}>Экспорт (для заказчика)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 border-red-200 dark:border-red-800" onClick={() => { setDeleteConfirmName(''); setDeleteEstimateOpen(true); }}><Trash2 className="w-4 h-4 mr-2" />Удалить</Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(val) => setSearchParams({ tab: val }, { replace: true })} className="space-y-6">
        <TabsList>
          <TabsTrigger value="info"><Info className="w-4 h-4 mr-2" />Информация</TabsTrigger>
          <TabsTrigger value="sections"><FileText className="w-4 h-4 mr-2" />Разделы</TabsTrigger>
          <TabsTrigger value="items"><Table2 className="w-4 h-4 mr-2" />Строки сметы</TabsTrigger>
          <TabsTrigger value="characteristics"><DollarSign className="w-4 h-4 mr-2" />Характеристики</TabsTrigger>
          <TabsTrigger value="totals"><DollarSign className="w-4 h-4 mr-2" />Итоги</TabsTrigger>
          <TabsTrigger value="supplier-invoices"><Receipt className="w-4 h-4 mr-2" />Счета поставщиков</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="space-y-6">
          <EstimateInfoTab estimate={estimate} priceLists={priceLists} updateFieldMutation={updateFieldMutation} updateStatusMutation={updateStatusMutation} fetchCBRMutation={fetchCBRMutation} />
        </TabsContent>

        <TabsContent value="sections" className="space-y-6">
          <EstimateSectionsTab
            sections={estimate.sections}
            onAddSection={() => { setEditingSection(null); setSectionForm({ name: '', sort_order: 0 }); setSectionDialogOpen(true); }}
            onEditSection={(section) => { setEditingSection(section); setSectionForm({ name: section.name, sort_order: section.sort_order }); setSectionDialogOpen(true); }}
            onDeleteSection={(sectionId) => setDeleteSectionTarget(sectionId)}
            onAddSubsection={(sectionId) => { setCurrentSectionId(sectionId); setEditingSubsection(null); setSubsectionForm({ name: '', materials_sale: '0.00', works_sale: '0.00', materials_purchase: '0.00', works_purchase: '0.00', sort_order: 0 }); setSubsectionDialogOpen(true); }}
            onEditSubsection={(subsection) => { setEditingSubsection(subsection); setSubsectionForm({ name: subsection.name, materials_sale: subsection.materials_sale, works_sale: subsection.works_sale, materials_purchase: subsection.materials_purchase, works_purchase: subsection.works_purchase, sort_order: subsection.sort_order }); setSubsectionDialogOpen(true); }}
            onDeleteSubsection={(subsectionId) => setDeleteSubsectionTarget(subsectionId)}
            onUpdateSectionMarkup={(sectionId, data) => updateSectionMutation.mutate({ sectionId, data })}
          />
        </TabsContent>

        <TabsContent value="items" className="space-y-6">
          <div className="bg-card rounded-xl shadow-sm border border-border p-6">
            <EstimateItemsEditor estimateId={Number(id)} readOnly={estimate?.status === 'approved' || estimate?.status === 'agreed'} columnConfig={estimate?.column_config} onOpenColumnConfig={() => setColumnConfigOpen(true)} projectFiles={allProjectFiles} onColumnResize={handleColumnResize} initialColumnSizing={initialColumnSizing} />
          </div>
        </TabsContent>

        <TabsContent value="characteristics" className="space-y-6">
          <EstimateCharacteristicsTab
            characteristics={estimate.characteristics}
            onAdd={() => { setEditingCharacteristic(null); setCharacteristicForm({ name: '', purchase_amount: '0.00', sale_amount: '0.00' }); setCharacteristicDialogOpen(true); }}
            onEdit={handleEditCharacteristic}
            onDelete={handleDeleteCharacteristic}
          />
        </TabsContent>

        <TabsContent value="totals" className="space-y-6">
          <EstimateTotalsTab estimate={estimate} />
        </TabsContent>

        <TabsContent value="supplier-invoices" className="space-y-6">
          <div className="bg-card rounded-xl shadow-sm border border-border p-6">
            <EstimateSupplierInvoices estimateId={Number(id)} />
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <SectionDialog open={isSectionDialogOpen} onOpenChange={setSectionDialogOpen} editing={editingSection} form={sectionForm} onFormChange={setSectionForm} onSubmit={handleSectionSubmit} />
      <SubsectionDialog open={isSubsectionDialogOpen} onOpenChange={setSubsectionDialogOpen} editing={editingSubsection} form={subsectionForm} onFormChange={setSubsectionForm} onSubmit={handleSubsectionSubmit} />
      <CharacteristicDialog open={isCharacteristicDialogOpen} onOpenChange={setCharacteristicDialogOpen} editing={editingCharacteristic} form={characteristicForm} onFormChange={setCharacteristicForm} onSubmit={handleCharacteristicSubmit} />

      <DeleteConfirmDialog open={deleteSectionTarget !== null} onOpenChange={(open) => { if (!open) setDeleteSectionTarget(null); }} title="Удалить раздел" description="Удалить этот раздел? Все подразделы также будут удалены." onConfirm={() => { if (deleteSectionTarget !== null) { deleteSectionMutation.mutate(deleteSectionTarget); setDeleteSectionTarget(null); } }} />
      <DeleteConfirmDialog open={deleteSubsectionTarget !== null} onOpenChange={(open) => { if (!open) setDeleteSubsectionTarget(null); }} title="Удалить подраздел" description="Удалить этот подраздел?" onConfirm={() => { if (deleteSubsectionTarget !== null) { deleteSubsectionMutation.mutate(deleteSubsectionTarget); setDeleteSubsectionTarget(null); } }} />
      <DeleteConfirmDialog open={deleteCharTarget !== null} onOpenChange={(open) => { if (!open) setDeleteCharTarget(null); }} title="Удалить характеристику" description="Удалить эту характеристику?" onConfirm={() => { if (deleteCharTarget !== null) { deleteCharacteristicMutation.mutate(deleteCharTarget); setDeleteCharTarget(null); } }} />

      <AutoCharWarningDialog open={autoCharWarning !== null} onOpenChange={(open) => { if (!open) setAutoCharWarning(null); }} onConfirm={() => { if (autoCharWarning) { setEditingCharacteristic(autoCharWarning); setCharacteristicForm({ name: autoCharWarning.name, purchase_amount: autoCharWarning.purchase_amount, sale_amount: autoCharWarning.sale_amount }); setCharacteristicDialogOpen(true); setAutoCharWarning(null); } }} />

      <ConfirmActionDialog open={isVersionDialogOpen} onOpenChange={setIsVersionDialogOpen} title="Новая версия сметы" description="Создать новую версию сметы? Текущая версия будет помечена как неактуальная." onConfirm={() => { createVersionMutation.mutate(); setIsVersionDialogOpen(false); }} />
      <ConfirmActionDialog open={isMountingDialogOpen} onOpenChange={setIsMountingDialogOpen} title="Создать монтажную смету" description="Создать монтажную смету на основе этой сметы?" onConfirm={() => { createMountingEstimateMutation.mutate(); setIsMountingDialogOpen(false); }} />

      <VersionHistoryDialog open={isVersionHistoryOpen} onOpenChange={setVersionHistoryOpen} versions={versions} estimateNumber={estimate.number} onSelectVersion={(versionId) => { setVersionHistoryOpen(false); navigate(`/estimates/estimates/${versionId}`); }} />
      <DeleteEstimateDialog open={deleteEstimateOpen} onOpenChange={setDeleteEstimateOpen} estimateName={estimate?.name || ''} confirmName={deleteConfirmName} onConfirmNameChange={setDeleteConfirmName} onDelete={() => deleteEstimateMutation.mutate()} isPending={deleteEstimateMutation.isPending} />

      <ColumnConfigDialog open={isColumnConfigOpen} onOpenChange={setColumnConfigOpen} estimateId={Number(id)} currentConfig={estimate?.column_config || DEFAULT_COLUMN_CONFIG} onSave={(config: ColumnDefAPI[]) => { updateFieldMutation.mutate({ column_config: config }); }} />
    </div>
  );
}

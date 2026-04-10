import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { type RowSelectionState } from '@tanstack/react-table';
import {
  api,
  type CreateEstimateItemData,
  type EstimateItem,
  type ColumnDef as ColumnDefAPI,
  DEFAULT_COLUMN_CONFIG,
} from '@/lib/api';
import { useEstimateApi } from '@/lib/api/estimate-api-context';
import { CONSTANTS } from '@/constants';
import { toast } from 'sonner';
import { type TableRow, makeSectionRow } from './types';

const DEBOUNCE_MS = 600;

export function useEstimateItems(estimateId: number, readOnly: boolean, columnConfig?: ColumnDefAPI[]) {
  const estimateApi = useEstimateApi();
  const queryClient = useQueryClient();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [globalFilter, setGlobalFilter] = useState('');
  const [isAddDialogOpen, setAddDialogOpen] = useState(false);
  const [isPasteDialogOpen, setPasteDialogOpen] = useState(false);
  const [isImportDialogOpen, setImportDialogOpen] = useState(false);
  const [isAutoMatchOpen, setAutoMatchOpen] = useState(false);
  const [isWorkMatchingOpen, setWorkMatchingOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [moveTargetPosition, setMoveTargetPosition] = useState('');
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const displayRowsRef = useRef<TableRow[]>([]);
  const itemsRef = useRef<EstimateItem[]>([]);

  // Cleanup debounce timers on unmount
  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach(clearTimeout);
    };
  }, []);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['estimate-items', estimateId],
    queryFn: () => estimateApi.getEstimateItems(estimateId),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  const { data: sections = [] } = useQuery({
    queryKey: ['estimate-sections', estimateId],
    queryFn: () => estimateApi.getEstimateSections(estimateId),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  const effectiveConfig = useMemo<ColumnDefAPI[]>(() => {
    if (!columnConfig || columnConfig.length === 0) return DEFAULT_COLUMN_CONFIG;
    // Добавить недостающие builtin-колонки из DEFAULT (скрытыми)
    const existingKeys = new Set(columnConfig.map((c) => c.key));
    const missing = DEFAULT_COLUMN_CONFIG.filter(
      (c) => c.type === 'builtin' && !existingKeys.has(c.key),
    ).map((c) => ({ ...c, visible: false }));
    return missing.length > 0 ? [...columnConfig, ...missing] : columnConfig;
  }, [columnConfig]);

  const [newItemForm, setNewItemForm] = useState<Partial<CreateEstimateItemData>>({
    estimate: estimateId,
    section: undefined,
    name: '',
    unit: 'шт',
    quantity: '1',
    material_unit_price: '0',
    work_unit_price: '0',
  });

  useEffect(() => {
    if (sections.length > 0) {
      setNewItemForm((f) => {
        const currentValid = f.section && sections.some((s) => s.id === f.section);
        if (!currentValid) {
          return { ...f, section: sections[0].id };
        }
        return f;
      });
    }
  }, [sections]);

  // Build mixed display rows
  const displayRows = useMemo<TableRow[]>(() => {
    const rows: TableRow[] = [];
    const sortedSections = [...sections].sort((a, b) => a.sort_order - b.sort_order);
    const showHeaders = sortedSections.length >= 1;

    for (const section of sortedSections) {
      const sectionItems = items
        .filter((i) => i.section === section.id)
        .sort((a, b) => a.sort_order - b.sort_order || a.item_number - b.item_number);
      if (showHeaders) {
        rows.push(makeSectionRow(section));
      }
      rows.push(...sectionItems);
    }
    const sectionIds = new Set(sections.map((s) => s.id));
    const orphans = items.filter((i) => !sectionIds.has(i.section));
    if (orphans.length > 0) {
      rows.push(...orphans);
    }
    return rows;
  }, [sections, items]);

  // Keep refs in sync for stable callbacks
  displayRowsRef.current = displayRows;
  itemsRef.current = items;

  // Mutations
  const updateItemMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateEstimateItemData> & { custom_data?: Record<string, string> } }) =>
      estimateApi.updateEstimateItem(id, data as Partial<CreateEstimateItemData>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimate-items', estimateId] });
    },
    onError: (error) => {
      toast.error(`Ошибка обновления: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const createItemMutation = useMutation({
    mutationFn: (data: CreateEstimateItemData) => estimateApi.createEstimateItem(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimate-items', estimateId] });
      setAddDialogOpen(false);
      setNewItemForm({
        estimate: estimateId,
        section: sections[0]?.id,
        name: '',
        unit: 'шт',
        quantity: '1',
        material_unit_price: '0',
        work_unit_price: '0',
      });
      toast.success('Строка добавлена');
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: (id: number) => estimateApi.deleteEstimateItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimate-items', estimateId] });
      toast.success('Строка удалена');
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const bulkCreateMutation = useMutation({
    mutationFn: (newItems: CreateEstimateItemData[]) => estimateApi.bulkCreateEstimateItems(newItems),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['estimate-items', estimateId] });
      setPasteDialogOpen(false);
      setPasteText('');
      toast.success(`Создано ${Array.isArray(created) ? created.length : 0} строк`);
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const bulkMoveMutation = useMutation({
    mutationFn: ({ itemIds, targetPosition }: { itemIds: number[]; targetPosition: number }) =>
      estimateApi.bulkMoveEstimateItems(itemIds, targetPosition),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['estimate-items', estimateId] });
      setMoveTargetPosition('');
      setRowSelection({});
      toast.success(`Перемещено ${result.moved} строк`);
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const mergeItemsMutation = useMutation({
    mutationFn: (itemIds: number[]) => estimateApi.mergeEstimateItems(itemIds),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['estimate-items', estimateId] });
      setRowSelection({});
      toast.success(`Объединено ${result.deleted_ids.length + 1} строк в одну`);
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['estimate-items', estimateId] });
    queryClient.invalidateQueries({ queryKey: ['estimate-sections', estimateId] });
    queryClient.invalidateQueries({ queryKey: ['estimate', String(estimateId)] });
  }, [queryClient, estimateId]);

  const promoteMutation = useMutation({
    mutationFn: (itemId: number) => estimateApi.promoteItemToSection(itemId),
    onSuccess: () => { invalidateAll(); toast.success('Строка назначена разделом'); },
    onError: () => { toast.error('Ошибка назначения раздела'); },
  });

  const demoteMutation = useMutation({
    mutationFn: (sectionId: number) => estimateApi.demoteSectionToItem(sectionId),
    onSuccess: () => { invalidateAll(); toast.success('Раздел снят'); },
    onError: () => { toast.error('Ошибка снятия раздела'); },
  });

  const moveMutation = useMutation({
    mutationFn: ({ itemId, direction }: { itemId: number; direction: 'up' | 'down' }) =>
      estimateApi.moveEstimateItem(itemId, { direction }),
    onMutate: async ({ itemId, direction }) => {
      await queryClient.cancelQueries({ queryKey: ['estimate-items', estimateId] });
      const previousItems = queryClient.getQueryData<EstimateItem[]>(['estimate-items', estimateId]);

      queryClient.setQueryData<EstimateItem[]>(['estimate-items', estimateId], (old) => {
        if (!old) return old;
        const item = old.find((i) => i.id === itemId);
        if (!item) return old;

        const sectionItems = old
          .filter((i) => i.section === item.section)
          .sort((a, b) => a.sort_order - b.sort_order || a.item_number - b.item_number);
        const idx = sectionItems.findIndex((i) => i.id === itemId);
        const neighborIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (neighborIdx < 0 || neighborIdx >= sectionItems.length) return old;

        const neighbor = sectionItems[neighborIdx];
        return old.map((i) => {
          if (i.id === itemId) return { ...i, sort_order: neighbor.sort_order, item_number: neighbor.item_number };
          if (i.id === neighbor.id) return { ...i, sort_order: item.sort_order, item_number: item.item_number };
          return i;
        });
      });

      return { previousItems };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousItems) {
        queryClient.setQueryData(['estimate-items', estimateId], context.previousItems);
      }
      toast.error('Ошибка перемещения');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['estimate-items', estimateId] });
    },
  });

  const moveToSectionMutation = useMutation({
    mutationFn: ({ itemId, targetSectionId }: { itemId: number; targetSectionId: number }) =>
      estimateApi.moveEstimateItem(itemId, { target_section_id: targetSectionId }),
    onSuccess: () => { invalidateAll(); toast.success('Строка перемещена в другой раздел'); },
    onError: () => { toast.error('Ошибка перемещения'); },
  });

  // Stable refs for mutations used in callbacks
  const updateItemMutationRef = useRef(updateItemMutation);
  updateItemMutationRef.current = updateItemMutation;

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; itemId: number; sectionId: number;
  } | null>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [contextMenu]);

  const handleCellEdit = useCallback(
    (rowIndex: number, columnId: string, value: unknown) => {
      if (readOnly) return;
      const row = displayRowsRef.current[rowIndex];
      if (!row || row._isSection) return;

      const key = `${row.id}-${columnId}`;
      if (debounceTimers.current[key]) {
        clearTimeout(debounceTimers.current[key]);
      }

      debounceTimers.current[key] = setTimeout(() => {
        const colDef = effectiveConfig.find((c) => c.key === columnId);
        if (colDef && colDef.type.startsWith('custom_')) {
          const existingCustomData = row.custom_data || {};
          updateItemMutationRef.current.mutate({
            id: row.id,
            data: { custom_data: { ...existingCustomData, [columnId]: String(value ?? '') } },
          });
        } else {
          updateItemMutationRef.current.mutate({
            id: row.id,
            data: { [columnId]: value },
          });
        }
        delete debounceTimers.current[key];
      }, DEBOUNCE_MS);
    },
    [readOnly, effectiveConfig],
  );

  const handleDeleteSelected = useCallback(() => {
    const selectedIds = Object.keys(rowSelection)
      .filter((key) => rowSelection[key])
      .map((key) => Number(key))
      .filter((id) => id > 0);

    if (selectedIds.length === 0) return;

    estimateApi.bulkDeleteEstimateItems(selectedIds).then((result) => {
      queryClient.invalidateQueries({ queryKey: ['estimate-items', estimateId] });
      queryClient.invalidateQueries({ queryKey: ['estimate', String(estimateId)] });
      setRowSelection({});
      toast.success(`Удалено ${result.deleted} строк`);
    }).catch((err) => {
      toast.error(`Ошибка удаления: ${err instanceof Error ? err.message : 'Неизвестная ошибка'}`);
    });
  }, [rowSelection, queryClient, estimateId]);

  const handleMoveSelected = useCallback(() => {
    const pos = parseInt(moveTargetPosition, 10);
    if (!pos || pos < 1) {
      toast.error('Введите корректный номер позиции');
      return;
    }
    const selectedIds = Object.keys(rowSelection)
      .filter((key) => rowSelection[key])
      .map((key) => Number(key))
      .filter((id) => id > 0);

    if (selectedIds.length === 0) return;

    bulkMoveMutation.mutate({ itemIds: selectedIds, targetPosition: pos });
  }, [rowSelection, moveTargetPosition, bulkMoveMutation]);

  const handleMergeSelected = useCallback(() => {
    const selectedIds = Object.keys(rowSelection)
      .filter((key) => rowSelection[key])
      .map((key) => Number(key))
      .filter((id) => id > 0);

    if (selectedIds.length < 2) {
      toast.error('Выберите минимум 2 строки для объединения');
      return;
    }

    const selectedItems = items.filter((item) => selectedIds.includes(item.id));
    const sectionSet = new Set(selectedItems.map((item) => item.section));
    if (sectionSet.size > 1) {
      toast.error('Все строки должны быть в одном разделе');
      return;
    }

    const sortedIds = selectedItems
      .sort((a, b) => a.sort_order - b.sort_order || a.item_number - b.item_number)
      .map((item) => item.id);

    mergeItemsMutation.mutate(sortedIds);
  }, [rowSelection, items, mergeItemsMutation]);

  const handlePasteFromExcel = useCallback(() => {
    if (!pasteText.trim()) return;
    const lines = pasteText.trim().split('\n');
    const newItems: CreateEstimateItemData[] = lines
      .map((line): CreateEstimateItemData | null => {
        const cols = line.split('\t');
        if (cols.length < 2) return null;
        return {
          estimate: estimateId,
          section: sections[0]?.id ?? 0,
          name: cols[0]?.trim() || '',
          model_name: cols[1]?.trim() || '',
          unit: cols[2]?.trim() || 'шт',
          quantity: cols[3]?.trim() || '1',
          material_unit_price: cols[4]?.trim() || '0',
          work_unit_price: cols[5]?.trim() || '0',
        };
      })
      .filter((x): x is CreateEstimateItemData => x !== null && x.name !== '');

    if (newItems.length === 0) {
      toast.error('Не удалось распознать строки');
      return;
    }

    bulkCreateMutation.mutate(newItems);
  }, [pasteText, estimateId, sections, bulkCreateMutation]);

  const handleAddItem = useCallback(async () => {
    if (!newItemForm.name?.trim()) {
      toast.error('Введите наименование');
      return;
    }

    let sectionId = newItemForm.section || sections[0]?.id;

    // Если разделов нет — автоматически создаём «Основной раздел»
    if (!sectionId) {
      try {
        const newSection = await estimateApi.createEstimateSection({
          estimate: estimateId,
          name: 'Основной раздел',
          sort_order: 0,
        });
        sectionId = newSection.id;
        queryClient.invalidateQueries({ queryKey: ['estimate-sections', estimateId] });
      } catch (err) {
        toast.error('Не удалось создать раздел');
        return;
      }
    }

    createItemMutation.mutate({
      estimate: estimateId,
      section: sectionId,
      name: newItemForm.name,
      model_name: newItemForm.model_name,
      unit: newItemForm.unit || 'шт',
      quantity: newItemForm.quantity || '1',
      material_unit_price: newItemForm.material_unit_price || '0',
      work_unit_price: newItemForm.work_unit_price || '0',
    });
  }, [newItemForm, estimateId, sections, createItemMutation, queryClient]);

  const totals = useMemo(() => {
    const aggCols = effectiveConfig.filter((c) => c.aggregatable && c.visible);
    const sums: Record<string, number> = {};
    for (const col of aggCols) sums[col.key] = 0;

    items.forEach((item) => {
      for (const col of aggCols) {
        let val: number | undefined;
        if (col.type === 'builtin' && col.builtin_field) {
          val = parseFloat((item as unknown as Record<string, string>)[col.builtin_field!]) || 0;
        } else if (col.type === 'formula') {
          const sv = item.computed_values?.[col.key];
          val = sv != null ? parseFloat(sv) : 0;
        } else if (col.type === 'custom_number') {
          val = parseFloat(item.custom_data?.[col.key] || '0') || 0;
        }
        if (val != null) sums[col.key] += val;
      }
    });
    return { aggCols, sums };
  }, [items, effectiveConfig]);

  const selectedCount = Object.values(rowSelection).filter(Boolean).length;

  return {
    items,
    sections,
    isLoading,
    effectiveConfig,
    displayRows,
    rowSelection,
    setRowSelection,
    globalFilter,
    setGlobalFilter,
    isAddDialogOpen,
    setAddDialogOpen,
    isPasteDialogOpen,
    setPasteDialogOpen,
    isImportDialogOpen,
    setImportDialogOpen,
    isAutoMatchOpen,
    setAutoMatchOpen,
    isWorkMatchingOpen,
    setWorkMatchingOpen,
    pasteText,
    setPasteText,
    moveTargetPosition,
    setMoveTargetPosition,
    newItemForm,
    setNewItemForm,
    contextMenu,
    setContextMenu,
    // mutations
    updateItemMutation,
    createItemMutation,
    deleteItemMutation,
    bulkCreateMutation,
    bulkMoveMutation,
    mergeItemsMutation,
    promoteMutation,
    demoteMutation,
    moveMutation,
    moveToSectionMutation,
    // handlers
    handleCellEdit,
    handleDeleteSelected,
    handleMoveSelected,
    handleMergeSelected,
    handlePasteFromExcel,
    handleAddItem,
    // computed
    totals,
    selectedCount,
  };
}

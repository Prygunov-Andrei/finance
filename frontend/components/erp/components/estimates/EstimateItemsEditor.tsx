import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { type ColumnDef, type RowSelectionState } from '@tanstack/react-table';
import {
  api,
  type EstimateItem,
  type CreateEstimateItemData,
  type EstimateSection,
  type ColumnDef as ColumnDefAPI,
  DEFAULT_COLUMN_CONFIG,
} from '../../lib/api';
import { formatCurrency } from '../../lib/utils';
import { computeAllFormulas } from '../../lib/formula-engine';
import { CONSTANTS } from '../../constants';
import { DataTable, createSelectColumn } from '../ui/data-table';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Plus, Trash2, ClipboardPaste, Loader2, Upload, Wand2, Hammer, FolderOpen, ChevronUp, ChevronDown, ArrowRightFromLine, ArrowDownToLine, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { EstimateImportDialog } from './EstimateImportDialog';
import { AutoMatchDialog } from './AutoMatchDialog';
import { AutoMatchWorksDialog } from './AutoMatchWorksDialog';

type EstimateItemsEditorProps = {
  estimateId: number;
  readOnly?: boolean;
  columnConfig?: ColumnDefAPI[];
  onOpenColumnConfig?: () => void;
};

// Union type for mixed table rows (sections as virtual header rows + real items)
type TableRow = EstimateItem & {
  _isSection?: boolean;
  _sectionId?: number;
};

const DEBOUNCE_MS = 600;

// Empty section row factory
function makeSectionRow(section: EstimateSection): TableRow {
  return {
    id: -(section.id),
    estimate: section.estimate,
    section: 0,
    subsection: null,
    sort_order: section.sort_order,
    item_number: 0,
    name: section.name,
    model_name: '',
    unit: '',
    quantity: '',
    material_unit_price: '',
    work_unit_price: '',
    material_total: '',
    work_total: '',
    line_total: '',
    product: null,
    work_item: null,
    is_analog: false,
    analog_reason: '',
    original_name: '',
    source_price_history: null,
    created_at: '',
    updated_at: '',
    _isSection: true,
    _sectionId: section.id,
  };
}

export const EstimateItemsEditor: React.FC<EstimateItemsEditorProps> = ({
  estimateId,
  readOnly = false,
  columnConfig,
  onOpenColumnConfig,
}) => {
  const queryClient = useQueryClient();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [globalFilter, setGlobalFilter] = useState('');
  const [isAddDialogOpen, setAddDialogOpen] = useState(false);
  const [isPasteDialogOpen, setPasteDialogOpen] = useState(false);
  const [isImportDialogOpen, setImportDialogOpen] = useState(false);
  const [isAutoMatchOpen, setAutoMatchOpen] = useState(false);
  const [isAutoMatchWorksOpen, setAutoMatchWorksOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [moveTargetPosition, setMoveTargetPosition] = useState('');
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['estimate-items', estimateId],
    queryFn: () => api.getEstimateItems(estimateId),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  // Fetch sections internally so promote/demote updates are reflected
  const { data: sections = [] } = useQuery({
    queryKey: ['estimate-sections', estimateId],
    queryFn: () => api.getEstimateSections(estimateId),
    staleTime: CONSTANTS.QUERY_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  // Effective column config: use provided or default
  const effectiveConfig = useMemo<ColumnDefAPI[]>(
    () => (columnConfig && columnConfig.length > 0 ? columnConfig : DEFAULT_COLUMN_CONFIG),
    [columnConfig],
  );

  const [newItemForm, setNewItemForm] = useState<Partial<CreateEstimateItemData>>({
    estimate: estimateId,
    section: sections[0]?.id,
    name: '',
    unit: 'шт',
    quantity: '1',
    material_unit_price: '0',
    work_unit_price: '0',
  });

  // Sync section in form when sections change (e.g. after promote/demote)
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

  // Build mixed display rows: section headers (if 2+ sections exist) + items
  const displayRows = useMemo<TableRow[]>(() => {
    const rows: TableRow[] = [];
    const sortedSections = [...sections].sort((a, b) => a.sort_order - b.sort_order);
    // Show headers when there is at least one section
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
    // Items without a section (orphans)
    const sectionIds = new Set(sections.map((s) => s.id));
    const orphans = items.filter((i) => !sectionIds.has(i.section));
    if (orphans.length > 0) {
      rows.push(...orphans);
    }
    return rows;
  }, [sections, items]);

  const updateItemMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateEstimateItemData> }) =>
      api.updateEstimateItem(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimate-items', estimateId] });
    },
    onError: (error) => {
      toast.error(`Ошибка обновления: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const createItemMutation = useMutation({
    mutationFn: (data: CreateEstimateItemData) => api.createEstimateItem(data),
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
    mutationFn: (id: number) => api.deleteEstimateItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estimate-items', estimateId] });
      toast.success('Строка удалена');
    },
    onError: (error) => {
      toast.error(`Ошибка: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
    },
  });

  const bulkCreateMutation = useMutation({
    mutationFn: (items: CreateEstimateItemData[]) => api.bulkCreateEstimateItems(items),
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
      api.bulkMoveEstimateItems(itemIds, targetPosition),
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

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['estimate-items', estimateId] });
    queryClient.invalidateQueries({ queryKey: ['estimate-sections', estimateId] });
    // Also invalidate parent's estimate query so sections stay in sync
    queryClient.invalidateQueries({ queryKey: ['estimate', String(estimateId)] });
  }, [queryClient, estimateId]);

  // Promote item → section
  const promoteMutation = useMutation({
    mutationFn: (itemId: number) => api.promoteItemToSection(itemId),
    onSuccess: () => {
      invalidateAll();
      toast.success('Строка назначена разделом');
    },
    onError: () => {
      toast.error('Ошибка назначения раздела');
    },
  });

  // Demote section → item
  const demoteMutation = useMutation({
    mutationFn: (sectionId: number) => api.demoteSectionToItem(sectionId),
    onSuccess: () => {
      invalidateAll();
      toast.success('Раздел снят');
    },
    onError: () => {
      toast.error('Ошибка снятия раздела');
    },
  });

  // Move item up/down
  const moveMutation = useMutation({
    mutationFn: ({ itemId, direction }: { itemId: number; direction: 'up' | 'down' }) =>
      api.moveEstimateItem(itemId, { direction }),
    onSuccess: () => {
      invalidateAll();
    },
    onError: () => {
      toast.error('Ошибка перемещения');
    },
  });

  // Move item to another section
  const moveToSectionMutation = useMutation({
    mutationFn: ({ itemId, targetSectionId }: { itemId: number; targetSectionId: number }) =>
      api.moveEstimateItem(itemId, { target_section_id: targetSectionId }),
    onSuccess: () => {
      invalidateAll();
      toast.success('Строка перемещена в другой раздел');
    },
    onError: () => {
      toast.error('Ошибка перемещения');
    },
  });

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    itemId: number;
    sectionId: number;
  } | null>(null);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [contextMenu]);

  const handleCellEdit = useCallback(
    (rowIndex: number, columnId: string, value: unknown) => {
      if (readOnly) return;
      const row = displayRows[rowIndex];
      if (!row || row._isSection) return;

      const key = `${row.id}-${columnId}`;
      if (debounceTimers.current[key]) {
        clearTimeout(debounceTimers.current[key]);
      }

      debounceTimers.current[key] = setTimeout(() => {
        // Check if this is a custom column (not a builtin model field)
        const colDef = effectiveConfig.find((c) => c.key === columnId);
        if (colDef && colDef.type.startsWith('custom_')) {
          // Update custom_data
          const existingCustomData = row.custom_data || {};
          updateItemMutation.mutate({
            id: row.id,
            data: { custom_data: { ...existingCustomData, [columnId]: String(value ?? '') } } as any,
          });
        } else {
          updateItemMutation.mutate({
            id: row.id,
            data: { [columnId]: value },
          });
        }
        delete debounceTimers.current[key];
      }, DEBOUNCE_MS);
    },
    [displayRows, readOnly, updateItemMutation, effectiveConfig],
  );

  const handleDeleteSelected = useCallback(() => {
    const selectedIds = Object.keys(rowSelection)
      .filter((key) => rowSelection[key])
      .map((key) => Number(key))
      .filter((id) => id > 0); // exclude virtual section rows (negative IDs)

    if (selectedIds.length === 0) return;

    Promise.all(selectedIds.map((id) => api.deleteEstimateItem(id))).then(() => {
      queryClient.invalidateQueries({ queryKey: ['estimate-items', estimateId] });
      setRowSelection({});
      toast.success(`Удалено ${selectedIds.length} строк`);
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

  const handlePasteFromExcel = useCallback(() => {
    if (!pasteText.trim()) return;
    const lines = pasteText.trim().split('\n');
    const newItems: CreateEstimateItemData[] = lines
      .map((line) => {
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
        } satisfies CreateEstimateItemData;
      })
      .filter((x): x is CreateEstimateItemData => x !== null && x.name !== '');

    if (newItems.length === 0) {
      toast.error('Не удалось распознать строки');
      return;
    }

    bulkCreateMutation.mutate(newItems);
  }, [pasteText, estimateId, sections, bulkCreateMutation]);

  const handleAddItem = useCallback(() => {
    if (!newItemForm.name?.trim()) {
      toast.error('Введите наименование');
      return;
    }
    createItemMutation.mutate({
      estimate: estimateId,
      section: newItemForm.section || sections[0]?.id || 0,
      name: newItemForm.name,
      model_name: newItemForm.model_name,
      unit: newItemForm.unit || 'шт',
      quantity: newItemForm.quantity || '1',
      material_unit_price: newItemForm.material_unit_price || '0',
      work_unit_price: newItemForm.work_unit_price || '0',
    });
  }, [newItemForm, estimateId, sections, createItemMutation]);

  const columns = useMemo<ColumnDef<TableRow, any>[]>(() => {
    const cols: ColumnDef<TableRow, any>[] = [];

    if (!readOnly) {
      cols.push(createSelectColumn<TableRow>());

      // Section toggle column (promote/demote)
      cols.push({
        id: 'section_toggle',
        header: '',
        size: 36,
        enableResizing: false,
        cell: ({ row }) => {
          const isSection = row.original._isSection;
          const sectionId = row.original._sectionId;

          if (isSection) {
            return (
              <button
                onClick={() => demoteMutation.mutate(sectionId!)}
                className="p-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                title="Снять раздел"
                disabled={demoteMutation.isPending}
              >
                <FolderOpen className="h-4 w-4" />
              </button>
            );
          }

          return (
            <button
              onClick={() => promoteMutation.mutate(row.original.id)}
              className="p-1 rounded text-gray-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              title="Назначить разделом"
              disabled={promoteMutation.isPending}
            >
              <FolderOpen className="h-4 w-4" />
            </button>
          );
        },
      });

      // Move up/down column
      cols.push({
        id: 'move_order',
        header: '',
        size: 44,
        enableResizing: false,
        cell: ({ row }) => {
          if (row.original._isSection) return null;

          const itemId = row.original.id;
          const sectionId = row.original.section;

          // Determine if first/last in section
          const sectionItems = items
            .filter((i) => i.section === sectionId)
            .sort((a, b) => a.sort_order - b.sort_order || a.item_number - b.item_number);
          const idx = sectionItems.findIndex((i) => i.id === itemId);
          const isFirst = idx === 0;
          const isLast = idx === sectionItems.length - 1;

          return (
            <div className="flex flex-col gap-0">
              <button
                onClick={() => moveMutation.mutate({ itemId, direction: 'up' })}
                className="p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-20 disabled:cursor-default"
                title="Переместить вверх"
                disabled={isFirst || moveMutation.isPending}
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => moveMutation.mutate({ itemId, direction: 'down' })}
                className="p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-20 disabled:cursor-default"
                title="Переместить вниз"
                disabled={isLast || moveMutation.isPending}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        },
      });
    }

    // Dynamic data columns from effectiveConfig
    for (const colDef of effectiveConfig) {
      if (!colDef.visible) continue;

      if (colDef.type === 'builtin') {
        const field = colDef.builtin_field || colDef.key;
        const isNumber = ['quantity', 'material_unit_price', 'work_unit_price'].includes(field);
        const isCurrency = ['material_unit_price', 'work_unit_price', 'material_total', 'work_total', 'line_total'].includes(field);
        const isTotal = ['material_total', 'work_total', 'line_total'].includes(field);
        const isEditable = colDef.editable && !readOnly;

        cols.push({
          accessorKey: field,
          id: colDef.key,
          header: colDef.label,
          size: colDef.width,
          enableSorting: field === 'item_number' || isTotal,
          meta: isEditable ? { editable: true, type: (isNumber ? 'number' : 'text') as 'number' | 'text' } : undefined,
          cell: ({ row, getValue }) => {
            if (row.original._isSection) {
              // Section row: show label for 'name' column, null for the rest
              if (field === 'name') {
                return (
                  <span className="font-semibold text-blue-700 text-sm">
                    {getValue() as string}
                  </span>
                );
              }
              return null;
            }
            const v = getValue();
            if (isCurrency) return field === 'line_total'
              ? <span className="font-medium">{formatCurrency(v as string)}</span>
              : formatCurrency(v as string);
            if (field === 'quantity' && typeof v === 'string') {
              return parseFloat(v).toLocaleString('ru-RU');
            }
            return v as string;
          },
        });
      } else if (colDef.type === 'formula') {
        // Formula columns — read-only, computed on client or from server
        cols.push({
          id: colDef.key,
          header: colDef.label,
          size: colDef.width,
          accessorFn: (row: TableRow) => {
            if (row._isSection) return null;
            // Prefer server-computed value if available
            const serverVal = row.computed_values?.[colDef.key];
            if (serverVal != null) return serverVal;
            // Fallback: compute on client
            try {
              const builtinVars: Record<string, number> = {
                item_number: row.item_number || 0,
                quantity: parseFloat(row.quantity) || 0,
                material_unit_price: parseFloat(row.material_unit_price) || 0,
                work_unit_price: parseFloat(row.work_unit_price) || 0,
                material_total: parseFloat(row.material_total) || 0,
                work_total: parseFloat(row.work_total) || 0,
                line_total: parseFloat(row.line_total) || 0,
              };
              const result = computeAllFormulas(effectiveConfig, builtinVars, row.custom_data || {});
              const val = result[colDef.key];
              return val != null ? String(val) : null;
            } catch {
              return null;
            }
          },
          cell: ({ row, getValue }) => {
            if (row.original._isSection) return null;
            const v = getValue();
            if (v == null) return <span className="text-muted-foreground">—</span>;
            return formatCurrency(String(v));
          },
        });
      } else if (colDef.type === 'custom_number') {
        cols.push({
          id: colDef.key,
          header: colDef.label,
          size: colDef.width,
          accessorFn: (row: TableRow) => row.custom_data?.[colDef.key] ?? '',
          meta: !readOnly && colDef.editable ? { editable: true, type: 'number' as const } : undefined,
          cell: ({ row, getValue }) => {
            if (row.original._isSection) return null;
            const v = getValue() as string;
            if (!v) return '';
            return colDef.decimal_places != null ? formatCurrency(v) : parseFloat(v).toLocaleString('ru-RU');
          },
        });
      } else if (colDef.type === 'custom_text') {
        cols.push({
          id: colDef.key,
          header: colDef.label,
          size: colDef.width,
          accessorFn: (row: TableRow) => row.custom_data?.[colDef.key] ?? '',
          meta: !readOnly && colDef.editable ? { editable: true, type: 'text' as const } : undefined,
          cell: ({ row, getValue }) => {
            if (row.original._isSection) return null;
            return getValue() as string;
          },
        });
      } else if (colDef.type === 'custom_date') {
        cols.push({
          id: colDef.key,
          header: colDef.label,
          size: colDef.width,
          accessorFn: (row: TableRow) => row.custom_data?.[colDef.key] ?? '',
          meta: !readOnly && colDef.editable ? { editable: true, type: 'text' as const } : undefined,
          cell: ({ row, getValue }) => {
            if (row.original._isSection) return null;
            const v = getValue() as string;
            if (!v) return '';
            try { return new Date(v).toLocaleDateString('ru-RU'); } catch { return v; }
          },
        });
      } else if (colDef.type === 'custom_select') {
        cols.push({
          id: colDef.key,
          header: colDef.label,
          size: colDef.width,
          accessorFn: (row: TableRow) => row.custom_data?.[colDef.key] ?? '',
          meta: !readOnly && colDef.editable
            ? { editable: true, type: 'text' as const, selectOptions: colDef.options }
            : undefined,
          cell: ({ row, getValue }) => {
            if (row.original._isSection) return null;
            return getValue() as string;
          },
        });
      } else if (colDef.type === 'custom_checkbox') {
        cols.push({
          id: colDef.key,
          header: colDef.label,
          size: colDef.width,
          accessorFn: (row: TableRow) => row.custom_data?.[colDef.key] === 'true',
          cell: ({ row, getValue }) => {
            if (row.original._isSection) return null;
            const checked = !!getValue();
            if (readOnly || !colDef.editable) return checked ? '✓' : '';
            return (
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => {
                  const idx = displayRows.findIndex((r) => r.id === row.original.id);
                  if (idx >= 0) handleCellEdit(idx, colDef.key, e.target.checked ? 'true' : 'false');
                }}
                className="h-4 w-4"
              />
            );
          },
        });
      }
    }

    if (!readOnly) {
      cols.push({
        id: 'actions',
        header: '',
        size: 40,
        enableResizing: false,
        cell: ({ row }) => {
          if (row.original._isSection) return null;
          return (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => deleteItemMutation.mutate(row.original.id)}
              aria-label="Удалить строку"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          );
        },
      });
    }

    return cols;
  }, [readOnly, effectiveConfig, deleteItemMutation, promoteMutation, demoteMutation, displayRows, handleCellEdit]);

  const totals = useMemo(() => {
    const aggCols = effectiveConfig.filter((c) => c.aggregatable && c.visible);
    const sums: Record<string, number> = {};
    for (const col of aggCols) sums[col.key] = 0;

    items.forEach((item) => {
      for (const col of aggCols) {
        let val: number | undefined;
        if (col.type === 'builtin' && col.builtin_field) {
          val = parseFloat((item as any)[col.builtin_field]) || 0;
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!readOnly && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Строка
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPasteDialogOpen(true)}>
            <ClipboardPaste className="h-4 w-4 mr-1" />
            Вставить из Excel
          </Button>
          <Button size="sm" variant="outline" onClick={() => setImportDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-1" />
            Импорт файла
          </Button>
          {items.length > 0 && (
            <>
              <Button size="sm" variant="outline" onClick={() => setAutoMatchOpen(true)}>
                <Wand2 className="h-4 w-4 mr-1" />
                Подобрать цены
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAutoMatchWorksOpen(true)}>
                <Hammer className="h-4 w-4 mr-1" />
                Подобрать работы
              </Button>
            </>
          )}
          {selectedCount > 0 && (
            <>
              <div className="flex items-center gap-1">
                <ArrowDownToLine className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  min={1}
                  max={items.length}
                  value={moveTargetPosition}
                  onChange={(e) => setMoveTargetPosition(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleMoveSelected();
                  }}
                  placeholder={`Позиция 1–${items.length}`}
                  className="h-8 w-36 text-sm"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleMoveSelected}
                  disabled={bulkMoveMutation.isPending || !moveTargetPosition}
                >
                  {bulkMoveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : `Перенести (${selectedCount})`}
                </Button>
              </div>
              <Button size="sm" variant="destructive" onClick={handleDeleteSelected}>
                <Trash2 className="h-4 w-4 mr-1" />
                Удалить ({selectedCount})
              </Button>
            </>
          )}
          <div className="ml-auto flex items-center gap-3">
            {onOpenColumnConfig && (
              <Button size="sm" variant="outline" onClick={onOpenColumnConfig} title="Настройка столбцов">
                <Settings2 className="h-4 w-4" />
              </Button>
            )}
            <Badge variant="secondary">{items.length} строк</Badge>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        data={displayRows}
        enableSorting
        enableFiltering
        enableRowSelection={!readOnly}
        enableVirtualization
        enableColumnResizing
        globalFilter={globalFilter}
        onGlobalFilterChange={setGlobalFilter}
        onRowSelectionChange={setRowSelection}
        onCellEdit={handleCellEdit}
        getRowId={(row) => String((row as TableRow).id)}
        rowClassName={(row) => {
          const original = row.original as TableRow;
          if (original._isSection) {
            return 'bg-blue-50 font-semibold';
          }
          return original.is_analog ? 'bg-amber-50' : undefined;
        }}
        estimatedRowHeight={40}
        footerContent={
          <div className="flex items-center gap-6 py-2 font-medium">
            {totals.aggCols.map((col) => (
              <span key={col.key}>
                {col.label}: {formatCurrency(totals.sums[col.key])}
              </span>
            ))}
          </div>
        }
        onRowContextMenu={!readOnly && sections.length > 1 ? (e, row) => {
          const original = row.original as TableRow;
          if (original._isSection) return;
          e.preventDefault();
          setContextMenu({
            x: e.clientX,
            y: e.clientY,
            itemId: original.id,
            sectionId: original.section,
          });
        } : undefined}
        emptyMessage="Нет строк сметы. Добавьте строки вручную или импортируйте из Excel/PDF."
      />

      {/* Context menu: move to section */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-48 rounded-md border bg-popover p-1 shadow-md"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseLeave={() => setContextMenu(null)}
        >
          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
            Переместить в раздел
          </div>
          {sections
            .filter((s) => s.id !== contextMenu.sectionId)
            .map((s) => (
              <button
                key={s.id}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
                onClick={() => {
                  moveToSectionMutation.mutate({
                    itemId: contextMenu.itemId,
                    targetSectionId: s.id,
                  });
                  setContextMenu(null);
                }}
              >
                <ArrowRightFromLine className="h-3.5 w-3.5" />
                {s.name}
              </button>
            ))}
        </div>
      )}

      {/* Add Item Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Добавить строку сметы</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Раздел</Label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={newItemForm.section || ''}
                onChange={(e) =>
                  setNewItemForm((f) => ({ ...f, section: Number(e.target.value) }))
                }
              >
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Наименование *</Label>
              <Input
                value={newItemForm.name || ''}
                onChange={(e) => setNewItemForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Кабель ВВГнг 3x1.5"
              />
            </div>
            <div>
              <Label>Модель</Label>
              <Input
                value={newItemForm.model_name || ''}
                onChange={(e) => setNewItemForm((f) => ({ ...f, model_name: e.target.value }))}
                placeholder="NYM 3x1.5"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Ед. изм.</Label>
                <Input
                  value={newItemForm.unit || 'шт'}
                  onChange={(e) => setNewItemForm((f) => ({ ...f, unit: e.target.value }))}
                />
              </div>
              <div>
                <Label>Кол-во</Label>
                <Input
                  type="number"
                  value={newItemForm.quantity || '1'}
                  onChange={(e) => setNewItemForm((f) => ({ ...f, quantity: e.target.value }))}
                />
              </div>
              <div>
                <Label>Цена мат.</Label>
                <Input
                  type="number"
                  value={newItemForm.material_unit_price || '0'}
                  onChange={(e) =>
                    setNewItemForm((f) => ({ ...f, material_unit_price: e.target.value }))
                  }
                />
              </div>
            </div>
            <div>
              <Label>Цена работы</Label>
              <Input
                type="number"
                value={newItemForm.work_unit_price || '0'}
                onChange={(e) =>
                  setNewItemForm((f) => ({ ...f, work_unit_price: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleAddItem} disabled={createItemMutation.isPending}>
              {createItemMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Добавить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AutoMatch Dialog */}
      <AutoMatchDialog
        open={isAutoMatchOpen}
        onOpenChange={setAutoMatchOpen}
        estimateId={estimateId}
      />

      {/* AutoMatch Works Dialog */}
      <AutoMatchWorksDialog
        open={isAutoMatchWorksOpen}
        onOpenChange={setAutoMatchWorksOpen}
        estimateId={estimateId}
      />

      {/* Import from file Dialog */}
      <EstimateImportDialog
        open={isImportDialogOpen}
        onOpenChange={setImportDialogOpen}
        estimateId={estimateId}
      />

      {/* Paste from Excel Dialog */}
      <Dialog open={isPasteDialogOpen} onOpenChange={setPasteDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Вставить из Excel</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Скопируйте строки из Excel (формат: Наименование, Модель, Ед.изм., Кол-во, Цена мат., Цена раб.)
              и вставьте в поле ниже.
            </p>
            <textarea
              className="w-full h-48 border rounded-md p-3 text-sm font-mono bg-background resize-none"
              placeholder="Наименование&#9;Модель&#9;шт&#9;10&#9;500&#9;200"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
            />
            {pasteText.trim() && (
              <p className="text-sm text-muted-foreground">
                Распознано строк: {pasteText.trim().split('\n').filter((l) => l.split('\t').length >= 2 && l.split('\t')[0]?.trim()).length}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasteDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handlePasteFromExcel} disabled={bulkCreateMutation.isPending}>
              {bulkCreateMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Импортировать
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};
